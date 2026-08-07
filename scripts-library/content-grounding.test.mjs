// content-grounding.test.mjs — contracts for the three "a stated input was
// silently ignored" defects found driving a real annealing run.
//
// The pack is rigorous about a described-but-UNWRITTEN candidate (requires_file_write
// plus a deterministic re-open: "never a stub, never a fabricated pass"). These
// tests extend the same discipline to the inputs:
//
//   1. verify.content-source — a described-but-UNREAD content source must FAIL,
//      never degrade to invented copy that passes every downstream check.
//   2. seedAdherence         — keys the PIPELINE ITSELF writes onto a seed are
//      metadata, not constraints, and must not report as failures.
//   3. verify.antipatterns   — the pack REQUIRES self-contained candidates with no
//      external images, so inline <svg> is the only way to show artwork; flagging
//      that as a blocking fault silently removed a candidate from the set the
//      human prunes from. Exempted by identity, so genericness findings at the
//      same severity keep their teeth.
//
// assert-don't-derive: the YAML-embedded bodies are extracted and executed as
// shipped, so these pin the real primitives.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { seedAdherence } from "./score.mjs";

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
  const file = join(mkdtempSync(join(tmpdir(), "cg-")), yamlName.replace(/\.yaml$/, ".js"));
  writeFileSync(file, out.join("\n"));
  return file;
}

// ---------------------------------------------------------------------------
// 1. verify.content-source
// ---------------------------------------------------------------------------
const CHECK = bodyRunner("verify.content-source.yaml");

function checkContent(contentPath, { write } = {}) {
  const outDir = mkdtempSync(join(tmpdir(), "cg-out-"));
  if (write) for (const [name, body] of Object.entries(write)) writeFileSync(join(outDir, name), body);
  const stdout = execFileSync("node", [CHECK, outDir, contentPath], { encoding: "utf8" });
  return { ...JSON.parse(stdout), outDir };
}

test("a readable relative content source resolves and passes", () => {
  const out = checkContent("copy.md", { write: { "copy.md": "# Hello, Rosa\nreal copy" } });
  assert.equal(out.content_ok, true);
  assert.equal(out.content_rel, "copy.md");
  assert.equal(out.reason, "");
});

test("NO content source named is legitimate — representative copy is a valid mode", () => {
  const out = checkContent("");
  assert.equal(out.content_ok, true);
  assert.equal(out.content_rel, "");
});

// The observed production failure: an absolute path outside out_dir. The agent's
// file host is rooted at out_dir, so it CANNOT read the file — but its prompt's
// fallback ("if empty, use representative content") gave it no way to tell
// unreadable from absent, so it invented copy and the run went green.
test("a content source OUTSIDE the agent's file host fails CONTENT_UNREADABLE", () => {
  const elsewhere = mkdtempSync(join(tmpdir(), "cg-elsewhere-"));
  const abs = join(elsewhere, "copy.md");
  writeFileSync(abs, "real copy the agent will never see");
  const out = checkContent(abs);
  assert.equal(out.content_ok, false);
  assert.equal(out.reason, "CONTENT_UNREADABLE");
  assert.match(out.message, /outside the generation agent's file host/);
});

test("a named-but-missing content source fails rather than falling back", () => {
  const out = checkContent("copy.md");
  assert.equal(out.content_ok, false);
  assert.equal(out.reason, "CONTENT_UNREADABLE");
});

test("an EMPTY content file fails — it grounds nothing, exactly like a missing one", () => {
  const out = checkContent("copy.md", { write: { "copy.md": "   \n\n" } });
  assert.equal(out.content_ok, false);
  assert.equal(out.reason, "CONTENT_UNREADABLE");
});

test("a path escaping out_dir via .. is refused", () => {
  const out = checkContent("../escape.md");
  assert.equal(out.content_ok, false);
  assert.equal(out.reason, "CONTENT_UNREADABLE");
});

// ---------------------------------------------------------------------------
// 2. seedAdherence — reserved keys
// ---------------------------------------------------------------------------
const FEATURES = { square_corners: 1, intentional_asymmetry: 1, not_centered: 1, bold_palette: 0.9,
                   no_gradient_bg: 1, heavy_rules: 0.9 };
const DETECT_FX = { font_class: "display" };

test("a seed carrying the steer metadata run.set-seeds writes still reports adherent", () => {
  // This is the shape the pack ITSELF produces from the first refine round on.
  const out = seedAdherence(FEATURES, DETECT_FX, {
    corners: "square",
    type: "display",
    notes: "amplify: layout→icons; on color, go toward: neutral chrome",
    steer: { amplify: [{ axis: "layout", toward: "icons" }], avoid: [] },
  });
  assert.equal(out.ok, true, "the pack's own metadata keys must not score as failed constraints");
  assert.deepEqual(out.failed, []);
});

test("a genuinely unknown constraint key is still reported — the fail-safe is intact", () => {
  const out = seedAdherence(FEATURES, DETECT_FX, { corners: "square", bogus: "whatever" });
  assert.equal(out.ok, false);
  assert.deepEqual(out.failed, ["bogus"]);
});

// ---------------------------------------------------------------------------
// 3. verify.antipatterns — `advisory` severity
// ---------------------------------------------------------------------------
const DETECT_BODY = bodyRunner("verify.antipatterns.yaml");
const FAKE_BIN = mkdtempSync(join(tmpdir(), "cg-bin-"));
const NPX = join(FAKE_BIN, "npx");
writeFileSync(
  NPX,
  "#!/usr/bin/env node\nconst fs=require('fs');process.stdout.write(fs.readFileSync(process.env.FF_FILE,'utf8'));\n",
);
chmodSync(NPX, 0o755);

function detect(findings) {
  const dir = mkdtempSync(join(tmpdir(), "cg-run-"));
  const ff = join(dir, "findings.json");
  writeFileSync(ff, JSON.stringify(findings));
  const artifact = join(dir, "candidate.html");
  writeFileSync(artifact, "<!doctype html><title>x</title>");
  const stdout = execFileSync("node", [DETECT_BODY, artifact], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${FAKE_BIN}:${process.env.PATH}`, FF_FILE: ff },
  });
  return JSON.parse(stdout);
}

// Observed live: impeccable emits `advisory` for "Shape-assembled illustration —
// inline <svg> scene", the fail-safe escalated it to blocking, and a candidate
// the human went on to rank best never reached the prune gate. It also scales
// with effort — the richer the placeholder plates, the likelier the drop.
test("inline-SVG placeholder artwork does not block — the pack requires inline art", () => {
  const out = detect([
    { antipattern: "shape-assembled-illustration", name: "Shape-assembled illustration",
      severity: "advisory", snippet: "inline <svg> scene: 12 primitive shapes" },
  ]);
  assert.equal(out.antipattern_count, 0);
  assert.equal(out.usable, true);
  assert.equal(out.warning_count, 1, "it is still surfaced to the human, just not gating");
});

// The exemption is by IDENTITY, not severity: impeccable's genericness detectors
// share the `advisory` severity and the floor legitimately gates on them — the
// pack's own DIVERGENCE_COLLAPSED drive depends on it.
test("a genericness finding at the SAME severity still blocks", () => {
  const out = detect([
    { antipattern: "gpt-thin-border-wide-shadow", name: "Thin border + wide shadow",
      severity: "advisory", snippet: "1px border + 60px shadow blur" },
  ]);
  assert.equal(out.antipattern_count, 1);
  assert.equal(out.usable, false);
});

test("an unknown severity STILL blocks — the fail-safe is not weakened", () => {
  const out = detect([
    { antipattern: "something-new", name: "Something new", severity: "catastrophic", snippet: "x" },
  ]);
  assert.equal(out.antipattern_count, 1);
  assert.equal(out.usable, false);
});

test("error severity still blocks", () => {
  const out = detect([
    { antipattern: "unreadable", name: "Unreadable", severity: "error", snippet: "x" },
  ]);
  assert.equal(out.usable, false);
});
