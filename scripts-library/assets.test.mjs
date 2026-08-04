// assets.test.mjs — a referenced asset must actually be there, and must be local.
//
// #4 made local assets legal and the pack could check neither of the two rules
// that came with them. Both failed live:
//
//   * The brief that named the artwork lost its filename list to a copy/paste
//     slip. The generator invented plausible names from the story titles
//     (`art/dragon-under-stairs.png`) and wrote eight <img> tags pointing at
//     nothing. The candidate parsed, passed verify.candidate-renderable, scored,
//     and was on its way to a human as a legitimate direction. Four generations
//     went by; a person looking at the pixels caught it, not the pipeline.
//
//   * "Renders with the network unplugged" is stated in both prompt layers and
//     verified nowhere. A CDN font would look perfect on the machine that made
//     it and degrade silently everywhere else.
//
// Same discipline the pack already applies to writes: the claim is not trusted,
// deterministic code re-opens the artifact, and a described-but-absent thing is
// a failure rather than a shrug.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));

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
  const file = join(mkdtempSync(join(tmpdir(), "as-")), yamlName.replace(/\.yaml$/, ".js"));
  writeFileSync(file, out.join("\n"));
  return file;
}

const CHECK = bodyRunner("verify.assets-resolve.yaml");

// Build a candidate directory with a real art/ folder, then check some markup.
function check(bodyHtml, { assets = ["art/plate-one.png"] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "as-run-"));
  for (const a of assets) {
    mkdirSync(join(dir, dirname(a)), { recursive: true });
    writeFileSync(join(dir, a), "PNGDATA");
  }
  const artifact = join(dir, "candidate-c1.html");
  writeFileSync(artifact, `<!doctype html><html><body>${bodyHtml}</body></html>`);
  return JSON.parse(execFileSync("node", [CHECK, artifact], { encoding: "utf8" }));
}

// --- the happy path ---------------------------------------------------------

test("a candidate referencing files that exist passes", () => {
  const out = check(`<img src="art/plate-one.png" alt="a plate">`);
  assert.equal(out.assets_ok, true);
  assert.equal(out.checked, 1);
});

test("CSS url() references are checked too, not just markup", () => {
  const out = check(`<div style="background-image:url('art/plate-one.png')"></div>`);
  assert.equal(out.assets_ok, true);
  assert.equal(out.checked, 1);
});

test("srcset candidates are split off their descriptors before resolving", () => {
  const out = check(
    `<img srcset="art/plate-one.png 1x, art/plate-two.png 2x" src="art/plate-one.png">`,
    { assets: ["art/plate-one.png", "art/plate-two.png"] },
  );
  assert.equal(out.assets_ok, true);
});

test("a query string or fragment does not make a real file look missing", () => {
  const out = check(`<img src="art/plate-one.png?v=2"><img src="art/plate-one.png#frag">`);
  assert.equal(out.assets_ok, true);
});

// --- the failure observed live ---------------------------------------------

test("invented filenames are BROKEN_ASSET_REFERENCE", () => {
  const out = check(`
    <img src="art/dragon-under-stairs.png" alt="the dragon">
    <img src="art/gran-1953.png" alt="gran">
    <img src="art/plate-one.png" alt="a real one">`);
  assert.equal(out.assets_ok, false);
  assert.equal(out.reason, "BROKEN_ASSET_REFERENCE");
  assert.equal(out.missing_count, 2);
  assert.ok(out.missing.includes("art/dragon-under-stairs.png"));
  assert.ok(!out.missing.includes("art/plate-one.png"), "the file that exists is not reported");
});

test("a root-relative path is broken — a self-contained page has no document root", () => {
  const out = check(`<img src="/art/plate-one.png">`);
  assert.equal(out.assets_ok, false);
  assert.equal(out.reason, "BROKEN_ASSET_REFERENCE");
});

// --- the network rule, finally enforced -------------------------------------

test("a CDN stylesheet is NETWORK_ASSET_REFERENCE", () => {
  const out = check(`<link rel="stylesheet" href="https://cdn.example.com/x.css">`);
  assert.equal(out.assets_ok, false);
  assert.equal(out.reason, "NETWORK_ASSET_REFERENCE");
  assert.equal(out.network_count, 1);
});

test("a protocol-relative URL is a network reference too", () => {
  const out = check(`<img src="//images.example.com/hero.png">`);
  assert.equal(out.assets_ok, false);
  assert.equal(out.reason, "NETWORK_ASSET_REFERENCE");
});

test("a remote webfont in CSS is caught", () => {
  const out = check(`<style>@font-face{font-family:X;src:url("https://fonts.example.com/x.woff2")}</style>`);
  assert.equal(out.assets_ok, false);
  assert.equal(out.network_count, 1);
});

// Network is the stricter rule and the one that fails on someone else's
// machine, so it names the reason when both are present.
test("network takes precedence over broken when both are present", () => {
  const out = check(`<img src="https://x.example/a.png"><img src="art/nope.png">`);
  assert.equal(out.reason, "NETWORK_ASSET_REFERENCE");
  assert.equal(out.missing_count, 1, "the broken one is still reported");
  assert.equal(out.network_count, 1);
});

// --- things that are not file references at all ------------------------------

test("data: URIs, anchors and mailto are ignored, not resolved", () => {
  const out = check(`
    <img src="data:image/png;base64,iVBORw0KGgo=">
    <a href="#main">skip</a>
    <a href="mailto:someone@example.com">mail</a>`);
  assert.equal(out.assets_ok, true);
  assert.equal(out.checked, 0, "none of these are files to look for");
});

test("an inline <svg> needs no assets and passes cleanly", () => {
  const out = check(`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>`);
  assert.equal(out.assets_ok, true);
});

test("an unreadable artifact is a hard error, not a silent pass", () => {
  assert.throws(() =>
    execFileSync("node", [CHECK, join(tmpdir(), "no-such-candidate.html")], { encoding: "utf8", stdio: "pipe" }),
  );
});

// ---------------------------------------------------------------------------
// RETENTION — the second argument. Added after a visual reviewer, shown a page
// of broken-image icons, deleted all eight of them and passed every gate as a
// successful revision. "Every reference resolves" is trivially satisfied by a
// page with no references at all.
// ---------------------------------------------------------------------------

// Build a before/after pair in ONE directory, so both resolve against the same
// art/ folder exactly as a candidate and its pre-review snapshot do.
function checkRetention(beforeHtml, afterHtml, { assets = ["art/plate-one.png"] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "as-ret-"));
  for (const a of assets) {
    mkdirSync(join(dir, dirname(a)), { recursive: true });
    writeFileSync(join(dir, a), "PNGDATA");
  }
  const before = join(dir, "candidate-c1.pre-review.html");
  const after = join(dir, "candidate-c1.html");
  writeFileSync(before, `<!doctype html><html><body>${beforeHtml}</body></html>`);
  writeFileSync(after, `<!doctype html><html><body>${afterHtml}</body></html>`);
  return JSON.parse(execFileSync("node", [CHECK, after, before], { encoding: "utf8" }));
}

test("a revision that deletes ALL imagery is REVISION_STRIPPED_ASSETS", () => {
  const out = checkRetention(
    `<img src="art/plate-one.png"><img src="art/plate-two.png">`,
    `<section><h1>Hello, Rosa</h1></section>`,
    { assets: ["art/plate-one.png", "art/plate-two.png"] },
  );
  assert.equal(out.assets_ok, false);
  assert.equal(out.reason, "REVISION_STRIPPED_ASSETS");
  assert.equal(out.had_assets, 2);
  assert.equal(out.has_assets, 0);
});

// Deliberately narrow. Consolidating five plates into four is a design
// judgement and none of a validator's business; a rule that misfires on
// legitimate work gets turned off.
test("using FEWER images is a design judgement, not a violation", () => {
  const out = checkRetention(
    `<img src="art/plate-one.png"><img src="art/plate-two.png">`,
    `<img src="art/plate-one.png">`,
    { assets: ["art/plate-one.png", "art/plate-two.png"] },
  );
  assert.equal(out.assets_ok, true);
});

test("swapping which plate is used is fine", () => {
  const out = checkRetention(
    `<img src="art/plate-one.png">`,
    `<img src="art/plate-two.png">`,
    { assets: ["art/plate-one.png", "art/plate-two.png"] },
  );
  assert.equal(out.assets_ok, true);
});

test("a page that never had imagery is not forced to acquire some", () => {
  const out = checkRetention(`<h1>words only</h1>`, `<h1>words only, restyled</h1>`);
  assert.equal(out.assets_ok, true);
});

test("moving artwork from <img> into a CSS background still counts as retained", () => {
  const out = checkRetention(
    `<img src="art/plate-one.png">`,
    `<div style="background-image:url('art/plate-one.png')"></div>`,
  );
  assert.equal(out.assets_ok, true);
});

// A broken page is already failing for a better reason; retention must not
// mask BROKEN_ASSET_REFERENCE.
test("a broken reference still reports as broken, not as stripped", () => {
  const out = checkRetention(`<img src="art/plate-one.png">`, `<img src="art/invented.png">`);
  assert.equal(out.assets_ok, false);
  assert.equal(out.reason, "BROKEN_ASSET_REFERENCE");
});

test("with no baseline argument, retention is not checked at all", () => {
  const out = check(`<h1>no images here</h1>`);
  assert.equal(out.assets_ok, true, "single-argument behaviour is unchanged");
});
