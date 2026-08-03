// severity.test.mjs — atomic red-first contracts for the SEVERITY-SPLIT floor
// (Increment I-e). The usability floor gates on BLOCKING findings only
// (error/critical); `warning`/`info`/`notice` are carried through as visible
// quality-flags the human sees + the refine loop can act on. So a
// warnings-only candidate is `usable:true` / `antipattern_count:0` and its
// warnings ride along in the record, while an error-severity finding blocks.
//
// assert-don't-derive: these run the ACTUAL inline node bodies shipped in
// verify.antipatterns.yaml + inspect.collect-candidate.yaml (extracted from the
// YAML block scalar), pinned against the real primitives — not re-implementations.
// verify.antipatterns wraps `npx impeccable detect`; we MOCK THE TRANSPORT (a
// fake `npx` on PATH that echoes canned findings) so the full body — parse +
// severity split + output shape — is exercised offline, nothing skipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));

// Extract the `body: |` block scalar from a script YAML and materialise it as a
// runnable .js file, so the test drives the exact shipped code.
function bodyRunner(yamlName) {
  const raw = readFileSync(join(HERE, yamlName), "utf8");
  const lines = raw.split("\n");
  const i = lines.findIndex((l) => /^\s*body:\s*\|\s*$/.test(l));
  assert.ok(i >= 0, `no 'body: |' block in ${yamlName}`);
  const indent = lines[i].match(/^(\s*)/)[1].length + 2; // block content indent
  const out = [];
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() === "") { out.push(""); continue; }
    if (l.match(/^(\s*)/)[1].length < indent) break;
    out.push(l.slice(indent));
  }
  const file = join(mkdtempSync(join(tmpdir(), "sev-")), yamlName.replace(/\.yaml$/, ".js"));
  writeFileSync(file, out.join("\n"));
  return file;
}

// ---------------------------------------------------------------------------
// verify.antipatterns — severity split. MOCK the `npx impeccable detect`
// transport: a fake `npx` on PATH prints the findings JSON from a file it is
// pointed at via FF_FILE, so the real body parses + splits real findings.
// ---------------------------------------------------------------------------
const DETECT = bodyRunner("verify.antipatterns.yaml");
const FAKE_BIN = mkdtempSync(join(tmpdir(), "sev-bin-"));
const NPX = join(FAKE_BIN, "npx");
writeFileSync(
  NPX,
  "#!/usr/bin/env node\nconst fs=require('fs');process.stdout.write(fs.readFileSync(process.env.FF_FILE,'utf8'));\n",
);
chmodSync(NPX, 0o755);

function detect(findings) {
  const dir = mkdtempSync(join(tmpdir(), "sev-run-"));
  const ff = join(dir, "findings.json");
  writeFileSync(ff, JSON.stringify(findings));
  const artifact = join(dir, "candidate.html"); // body existsSync-guards the artifact
  writeFileSync(artifact, "<!doctype html><title>x</title>");
  const stdout = execFileSync("node", [DETECT, artifact], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${FAKE_BIN}:${process.env.PATH}`, FF_FILE: ff },
  });
  return JSON.parse(stdout);
}

test("warnings-only findings ⇒ usable:true, antipattern_count:0 (floor is blocking-only)", () => {
  const out = detect([
    { antipattern: "cramped-padding", name: "Cramped padding", severity: "warning", snippet: "p{padding:2px}" },
    { antipattern: "cramped-padding", name: "Cramped padding", severity: "warning", snippet: "h2{padding:2px}" },
    { antipattern: "wide-tracking", name: "Wide tracking", severity: "warning", snippet: "h1{letter-spacing:9px}" },
  ]);
  assert.equal(out.antipattern_count, 0);
  assert.equal(out.usable, true);
});

test("warnings-only findings are CARRIED as reduced {antipattern,name,severity,snippet}", () => {
  const out = detect([
    { antipattern: "wide-tracking", name: "Wide tracking", severity: "warning", snippet: "h1{letter-spacing:9px}", extra: "dropped" },
  ]);
  assert.equal(out.warning_count, 1);
  assert.deepEqual(out.warnings, [
    { antipattern: "wide-tracking", name: "Wide tracking", severity: "warning", snippet: "h1{letter-spacing:9px}" },
  ]);
  // The full findings array is still returned unreduced under `detect`.
  assert.equal(out.detect.length, 1);
  assert.equal(out.detect[0].extra, "dropped");
});

test("an error-severity finding ⇒ antipattern_count>=1, usable:false", () => {
  const out = detect([
    { antipattern: "contrast-fail", name: "Contrast fail", severity: "error", snippet: "a{color:#eee;background:#fff}" },
  ]);
  assert.ok(out.antipattern_count >= 1, `expected blocking count>=1, got ${out.antipattern_count}`);
  assert.equal(out.usable, false);
  assert.equal(out.warning_count, 0);
});

test("mixed severities: only error/critical count toward the floor; warnings ride along", () => {
  const out = detect([
    { antipattern: "contrast-fail", name: "Contrast fail", severity: "error", snippet: "x" },
    { antipattern: "overlap", name: "Overlap", severity: "critical", snippet: "y" },
    { antipattern: "cramped-padding", name: "Cramped padding", severity: "warning", snippet: "z" },
  ]);
  assert.equal(out.antipattern_count, 2);
  assert.equal(out.usable, false);
  assert.equal(out.warning_count, 1);
});

test("FAIL SAFE: an unknown/missing severity is treated as BLOCKING (never a silent pass)", () => {
  const outUnknown = detect([{ antipattern: "mystery", name: "Mystery", severity: "showstopper", snippet: "q" }]);
  assert.equal(outUnknown.antipattern_count, 1);
  assert.equal(outUnknown.usable, false);
  const outMissing = detect([{ antipattern: "nosev", name: "No severity", snippet: "r" }]);
  assert.equal(outMissing.antipattern_count, 1);
  assert.equal(outMissing.usable, false);
});

test("info/notice are non-blocking (carried as warnings, not gated)", () => {
  const out = detect([
    { antipattern: "hint-a", name: "Hint A", severity: "info", snippet: "a" },
    { antipattern: "hint-b", name: "Hint B", severity: "notice", snippet: "b" },
  ]);
  assert.equal(out.antipattern_count, 0);
  assert.equal(out.usable, true);
  assert.equal(out.warning_count, 2);
});

// ---------------------------------------------------------------------------
// inspect.collect-candidate — warnings carried into the record; eligibility
// keys off the blocking-only antipattern_count (a warnings-only candidate that
// clears G+fit is ELIGIBLE).
// ---------------------------------------------------------------------------
const COLLECT = bodyRunner("inspect.collect-candidate.yaml");
function collect({ tau, fitFloor, G, fit, antipatternCount, candidate, thumbnail, eligibleIn, scoredIn, warnings }) {
  const args = [
    String(tau), String(fitFloor), String(G),
    JSON.stringify(fit), String(antipatternCount),
    JSON.stringify(candidate), JSON.stringify(thumbnail),
    JSON.stringify(eligibleIn), JSON.stringify(scoredIn),
    JSON.stringify(warnings),
  ];
  return JSON.parse(execFileSync("node", [COLLECT, ...args], { encoding: "utf8" }));
}

const WARNS = [
  { antipattern: "cramped-padding", name: "Cramped padding", severity: "warning", snippet: "p{padding:2px}" },
];

test("collect: a warnings-only candidate (blocking count 0) that clears G+fit is ELIGIBLE", () => {
  const out = collect({
    tau: 1.5, fitFloor: 1.0, G: 2.0, fit: { score: 1 },
    antipatternCount: 0, candidate: { id: "c1", artifact: "/tmp/c1.html" },
    thumbnail: {}, eligibleIn: [], scoredIn: [], warnings: WARNS,
  });
  assert.equal(out.eligible_this, true);
  assert.equal(out.eligible_count, 1);
});

test("collect: the record CARRIES warnings + warning_count", () => {
  const out = collect({
    tau: 1.5, fitFloor: 1.0, G: 2.0, fit: { score: 1 },
    antipatternCount: 0, candidate: { id: "c1", artifact: "/tmp/c1.html" },
    thumbnail: {}, eligibleIn: [], scoredIn: [], warnings: WARNS,
  });
  assert.deepEqual(out.eligible[0].warnings, WARNS);
  assert.equal(out.eligible[0].warning_count, 1);
  assert.deepEqual(out.scored[0].warnings, WARNS);
  assert.equal(out.scored[0].warning_count, 1);
});

test("collect: a blocking finding (antipattern_count>=1) is NOT eligible even with warnings carried", () => {
  const out = collect({
    tau: 1.5, fitFloor: 1.0, G: 2.0, fit: { score: 1 },
    antipatternCount: 1, candidate: { id: "c2", artifact: "/tmp/c2.html" },
    thumbnail: {}, eligibleIn: [], scoredIn: [], warnings: WARNS,
  });
  assert.equal(out.eligible_this, false);
  assert.equal(out.eligible_count, 0);
  // Still SCORED (with why.usable=false) and warnings still recorded on the ledger.
  assert.equal(out.scored[0].why.usable, false);
  assert.deepEqual(out.scored[0].warnings, WARNS);
});

test("collect: no warnings ⇒ empty array + warning_count 0 (back-compat default)", () => {
  const out = collect({
    tau: 1.5, fitFloor: 1.0, G: 2.0, fit: { score: 1 },
    antipatternCount: 0, candidate: { id: "c3", artifact: "/tmp/c3.html" },
    thumbnail: {}, eligibleIn: [], scoredIn: [], warnings: [],
  });
  assert.deepEqual(out.eligible[0].warnings, []);
  assert.equal(out.eligible[0].warning_count, 0);
});
