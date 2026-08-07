// preview.test.mjs — the human prune gate must actually SHOW the designs.
//
// The gate's entire purpose is a person judging designs, so the artifact it
// hands them must BE the designs, not placeholders. contact-sheet.mjs once
// rendered `thumbnail.artifact` — but the pipeline emits `kind: "stub-svg"`
// placeholders and the pack has no screenshotter, so the sheet was a grid of
// placeholder marks with the real renders one click away.
//
// The sheet now embeds each candidate LIVE as a self-contained `data:` URI
// iframe. Because the render is inlined (not a path the browser must fetch),
// the sheet opens straight off disk under file:// — no loopback server, no
// remote round-trip. The thumbnail stays as the fallback for a candidate whose
// render went missing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContactSheet } from "./contact-sheet.mjs";

// buildContactSheet WRITES the sheet and returns its ref; the assertions here
// are about the emitted markup, so read what actually landed on disk.
const sheetHtml = (candidates, outDir) =>
  readFileSync(buildContactSheet(candidates, outDir).contact_sheet.artifact, "utf8");

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n) => join(HERE, "..", "fixtures", n);

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
  assert.match(html, /<iframe class="live"/);
  assert.equal(
    (html.match(/<iframe class="live"/g) || []).length,
    2,
    "one live frame per candidate",
  );
});

test("the live frame embeds the render inline as a self-contained data: URI", () => {
  const outDir = mkdtempSync(join(tmpdir(), "pv-sheet2-"));
  const html = sheetHtml(CANDS, outDir);
  // The embed IS the render, inlined — not a served URL, not a path the browser
  // must fetch. That is exactly what lets the sheet open under file:// with no
  // loopback server in the loop.
  assert.match(html, /<iframe class="live" src="data:text\/html;base64,[^"]+"/);
  assert.doesNotMatch(html, /src="http:\/\/127\.0\.0\.1/, "no loopback server URL");
  // The full render stays reachable for opening at real size (overlay + link),
  // by a path relative to the sheet — still no server required.
  assert.match(html, /distinctive-01-editorial-serif\.html/);
  assert.doesNotMatch(
    html,
    /<img class="thumb" src="[^"]*distinctive-01/,
    "a candidate with a real render embeds it live, not as a stub thumbnail",
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
  assert.doesNotMatch(html, /<iframe class="live"/);
});

test("a candidate with neither says so rather than rendering an empty cell", () => {
  const outDir = mkdtempSync(join(tmpdir(), "pv-sheet4-"));
  const html = sheetHtml([{ id: "c-y", name: "c-y", G: 1, fit: { score: 1 } }], outDir);
  assert.match(html, /no preview/);
});
