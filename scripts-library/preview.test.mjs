// preview.test.mjs — the human prune gate must actually SHOW the designs.
//
// Two defects with one cause: the gate's entire purpose is a person judging
// designs, and the artifact it handed them showed none.
//
//   1. contact-sheet.mjs rendered `thumbnail.artifact` — but the pipeline emits
//      `kind: "stub-svg"` placeholders and the pack has no screenshotter, so the
//      sheet was a grid of placeholder marks with the real renders one click
//      away. The sheet now embeds each candidate LIVE.
//   2. Live embeds (and the candidates' own local artwork, allowed since #4) are
//      restricted under `file://`. So the sheet is served over loopback and the
//      gate hands over a URL.
//
// The server tests drive the ACTUAL shipped body, spawn a real detached process,
// and make real requests — including the ones that must be refused.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { buildContactSheet } from "./contact-sheet.mjs";

// buildContactSheet WRITES the sheet and returns its ref; the assertions here
// are about the emitted markup, so read what actually landed on disk.
const sheetHtml = (candidates, outDir) =>
  readFileSync(buildContactSheet(candidates, outDir).contact_sheet.artifact, "utf8");

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n) => join(HERE, "..", "fixtures", n);

function bodyRunner(yamlName) {
  const raw = readFileSync(join(HERE, yamlName), "utf8");
  const lines = raw.split("\n");
  const i = lines.findIndex((l) => /^\s*body:\s*\|\s*$/.test(l));
  assert.ok(i >= 0, `no 'body: |' block in ${yamlName}`);
  const indent = lines[i].match(/^(\s*)/)[1].length + 2;
  const out = [];
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() === "") { out.push(""); continue; }
    if (l.match(/^(\s*)/)[1].length < indent) break;
    out.push(l.slice(indent));
  }
  const file = join(mkdtempSync(join(tmpdir(), "pv-")), yamlName.replace(/\.yaml$/, ".js"));
  writeFileSync(file, out.join("\n"));
  return file;
}

// ---------------------------------------------------------------------------
// 1. The sheet embeds the real candidate, not a placeholder
// ---------------------------------------------------------------------------
const CANDS = [
  { id: "c-0", name: "c-0 · G=2.10", G: 2.1, fit: { score: 0.67 },
    artifact: fx("distinctive-01-editorial-serif.html"),
    thumbnail: { artifact: fx("distinctive-02-brutalist.html") } },
  { id: "c-1", name: "c-1 · G=1.86", G: 1.86, fit: { score: 0.67 },
    artifact: fx("distinctive-03-swiss-mono.html"),
    thumbnail: { artifact: fx("generic-01-saas-dark.html") } },
];

test("each cell embeds the candidate's OWN render, live", () => {
  const outDir = mkdtempSync(join(tmpdir(), "pv-sheet-"));
  const html = sheetHtml(CANDS, outDir);
  assert.match(html, /<iframe class="thumb-frame"/);
  assert.equal((html.match(/class="thumb-frame"/g) || []).length, 2, "one live frame per candidate");
});

test("the live frame points at the full render, not the stub thumbnail", () => {
  const outDir = mkdtempSync(join(tmpdir(), "pv-sheet2-"));
  const html = sheetHtml(CANDS, outDir);
  assert.match(html, /src="[^"]*distinctive-01-editorial-serif\.html"[^>]*title="live preview/s);
  assert.doesNotMatch(
    html,
    /<img class="thumb"/,
    "a stub-svg placeholder must not stand in for a candidate that has a real render",
  );
});

// The fallback still matters: a candidate whose render went missing should show
// whatever it has rather than an empty cell.
test("a candidate with no render falls back to its thumbnail", () => {
  const outDir = mkdtempSync(join(tmpdir(), "pv-sheet3-"));
  const html = sheetHtml(
    [{ id: "c-x", name: "c-x", G: 1, fit: { score: 1 }, thumbnail: { artifact: fx("generic-02-saas-light.html") } }],
    outDir,
  );
  assert.match(html, /<img class="thumb"/);
  assert.doesNotMatch(html, /<iframe class="thumb-frame"/);
});

test("a candidate with neither says so rather than rendering an empty cell", () => {
  const outDir = mkdtempSync(join(tmpdir(), "pv-sheet4-"));
  const html = sheetHtml([{ id: "c-y", name: "c-y", G: 1, fit: { score: 1 } }], outDir);
  assert.match(html, /no preview/);
});

// ---------------------------------------------------------------------------
// 2. The loopback preview server
// ---------------------------------------------------------------------------
const SERVE = bodyRunner("run.serve-preview.yaml");
const started = [];

function serve(outDir) {
  const out = JSON.parse(execFileSync("node", [SERVE, outDir], { encoding: "utf8" }));
  if (out.pid) started.push(out.pid);
  return out;
}
async function get(url) {
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
}

after(() => {
  for (const pid of started) {
    try { process.kill(pid); } catch { /* already gone */ }
  }
});

test("serving a directory returns a loopback URL and actually answers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pv-serve-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>sheet</title>the sheet");
  const out = serve(dir);
  assert.match(out.preview_url, /^http:\/\/127\.0\.0\.1:\d+\/$/, "loopback only, never 0.0.0.0");
  const res = await get(out.preview_url);
  assert.equal(res.status, 200);
  assert.match(res.body, /the sheet/);
});

test("a second call REUSES the live server instead of stacking another", () => {
  const dir = mkdtempSync(join(tmpdir(), "pv-reuse-"));
  writeFileSync(join(dir, "index.html"), "x");
  const first = serve(dir);
  const second = serve(dir);
  assert.equal(second.port, first.port);
  assert.equal(second.reused, true);
});

test("path traversal is refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pv-trav-"));
  writeFileSync(join(dir, "index.html"), "x");
  const out = serve(dir);
  const res = await get(`${out.preview_url}../../etc/passwd`);
  assert.ok(res.status === 403 || res.status === 404, `expected refusal, got ${res.status}`);
});

test("a missing file is a 404, not a crash that takes the server down", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pv-404-"));
  writeFileSync(join(dir, "index.html"), "x");
  const out = serve(dir);
  assert.equal((await get(`${out.preview_url}nope.html`)).status, 404);
  assert.equal((await get(out.preview_url)).status, 200, "server survives the 404");
});

// A preview is a convenience wrapped around a human decision. If it cannot be
// provided, the human must still be able to decide — so this degrades, never
// throws.
test("an absent directory degrades to PREVIEW_UNAVAILABLE, exit 0", () => {
  const out = JSON.parse(
    execFileSync("node", [SERVE, join(tmpdir(), "definitely-not-here-", String(process.pid))], { encoding: "utf8" }),
  );
  assert.equal(out.preview_url, "");
  assert.equal(out.reason, "PREVIEW_UNAVAILABLE");
});
