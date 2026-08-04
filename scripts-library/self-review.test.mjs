// self-review.test.mjs — the deterministic guard around visual self-review.
//
// Letting the generator look at its own page and rewrite the file is the single
// largest quality lever available (every candidate so far was designed blind).
// It is also the point where a model is most likely to "improve" the WORDS —
// and the content source is the one thing held constant so that DESIGN is the
// only variable between candidates. A revision that edits copy has changed the
// experiment, not the design.
//
// So the boundary is deterministic, not an instruction the model is trusted to
// follow. These tests pin it: what a design change may do (reorder, restyle,
// re-mark-up, swap classes, change images) and what it may not (add, drop or
// reword a single visible word) — plus the rollback that keeps a rejected
// revision from costing the human a candidate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
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
  const file = join(mkdtempSync(join(tmpdir(), "sr-")), yamlName.replace(/\.yaml$/, ".js"));
  writeFileSync(file, out.join("\n"));
  return file;
}

const COPY = bodyRunner("verify.copy-preserved.yaml");
const SNAP = bodyRunner("run.snapshot-candidate.yaml");
const RESTORE = bodyRunner("run.restore-candidate.yaml");

function checkCopy(beforeHtml, afterHtml) {
  const dir = mkdtempSync(join(tmpdir(), "sr-copy-"));
  const b = join(dir, "before.html");
  const a = join(dir, "after.html");
  writeFileSync(b, beforeHtml);
  writeFileSync(a, afterHtml);
  return JSON.parse(execFileSync("node", [COPY, b, a], { encoding: "utf8" }));
}

const PAGE = `<!doctype html><html><head><style>.x{color:red}</style></head><body>
  <h1 class="hero">Hello, Rosa</h1>
  <p>A couple of things first, and then you can make a story.</p>
  <img src="art/plate-growth-field.png" alt="a field">
  <!-- a comment -->
  <script>console.log("not copy")</script>
</body></html>`;

// --- what a DESIGN change is allowed to do ---------------------------------

test("restyling only is preserved — CSS is not copy", () => {
  const after = PAGE.replace(".x{color:red}", ".x{color:blue;font-size:2rem}");
  assert.equal(checkCopy(PAGE, after).copy_preserved, true);
});

test("re-marking-up and re-ordering is preserved — that IS layout", () => {
  const after = `<!doctype html><html><body>
    <section><p>A couple of things first, and then you can make a story.</p></section>
    <header><h1>Hello, Rosa</h1></header>
    <figure><img src="art/plate-growth-field.png" alt="a field"></figure>
  </body></html>`;
  assert.equal(checkCopy(PAGE, after).copy_preserved, true);
});

test("swapping classes and image paths is preserved — attributes are not copy", () => {
  const after = PAGE
    .replace('class="hero"', 'class="masthead display"')
    .replace("art/plate-growth-field.png", "art/plate-adventure-dragon.png");
  assert.equal(checkCopy(PAGE, after).copy_preserved, true);
});

test("changing script contents is preserved — script bodies are not copy", () => {
  const after = PAGE.replace('console.log("not copy")', 'document.title = "anything at all"');
  assert.equal(checkCopy(PAGE, after).copy_preserved, true);
});

// --- what it is NOT allowed to do ------------------------------------------

test("adding a caption the layout 'wants' is REVISION_ALTERED_COPY", () => {
  const after = PAGE.replace("</body>", "<figcaption>The summer the tent leaked</figcaption></body>");
  const out = checkCopy(PAGE, after);
  assert.equal(out.copy_preserved, false);
  assert.equal(out.reason, "REVISION_ALTERED_COPY");
  assert.ok(out.added.includes("tent"), `expected the invented words to be reported, got ${out.added}`);
});

test("rewording a heading for 'clarity' is caught", () => {
  const after = PAGE.replace("Hello, Rosa", "Welcome back, Rosa");
  const out = checkCopy(PAGE, after);
  assert.equal(out.copy_preserved, false);
  assert.ok(out.added.includes("Welcome"));
  assert.ok(out.removed.includes("Hello"));
});

test("quietly dropping copy that did not fit the new layout is caught", () => {
  const after = PAGE.replace("<p>A couple of things first, and then you can make a story.</p>", "");
  const out = checkCopy(PAGE, after);
  assert.equal(out.copy_preserved, false);
  assert.ok(out.removed.length > 0);
  assert.equal(out.added.length, 0, "a pure deletion adds nothing");
});

test("a wholesale rewrite reports bounded lists but exact counts", () => {
  const after = "<!doctype html><html><body><h1>Something else entirely</h1></body></html>";
  const out = checkCopy(PAGE, after);
  assert.equal(out.copy_preserved, false);
  assert.ok(out.removed.length <= 40, "the report must not dump the whole page into the run context");
  assert.ok(out.removed_count >= out.removed.length, "the count stays exact even when the list is capped");
});

// --- snapshot and rollback --------------------------------------------------

test("snapshot copies the candidate aside and names both paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "sr-snap-"));
  writeFileSync(join(dir, "candidate-c1.html"), PAGE);
  const out = JSON.parse(execFileSync("node", [SNAP, dir, "c1"], { encoding: "utf8" }));
  assert.ok(existsSync(out.snapshot));
  assert.equal(readFileSync(out.snapshot, "utf8"), PAGE);
  assert.match(out.candidate, /candidate-c1\.html$/);
});

test("snapshotting a candidate that does not exist fails loudly", () => {
  const dir = mkdtempSync(join(tmpdir(), "sr-snap2-"));
  assert.throws(() => execFileSync("node", [SNAP, dir, "missing"], { encoding: "utf8", stdio: "pipe" }));
});

test("restore puts the pre-review file back over a bad revision", () => {
  const dir = mkdtempSync(join(tmpdir(), "sr-rest-"));
  const cand = join(dir, "candidate-c1.html");
  writeFileSync(cand, PAGE);
  const snap = JSON.parse(execFileSync("node", [SNAP, dir, "c1"], { encoding: "utf8" })).snapshot;
  writeFileSync(cand, "<!doctype html><body>ruined</body>");
  const out = JSON.parse(execFileSync("node", [RESTORE, snap, cand], { encoding: "utf8" }));
  assert.equal(out.restored, true);
  assert.equal(readFileSync(cand, "utf8"), PAGE, "the human's candidate is intact");
});

// Restore runs on a path that is ALREADY a failure. If it threw, a discarded
// revision would become a lost candidate.
test("restore degrades instead of throwing when there is no snapshot", () => {
  const dir = mkdtempSync(join(tmpdir(), "sr-rest2-"));
  const out = JSON.parse(
    execFileSync("node", [RESTORE, join(dir, "nope.html"), join(dir, "candidate-c1.html")], { encoding: "utf8" }),
  );
  assert.equal(out.restored, false);
  assert.match(out.message, /no snapshot/);
});
