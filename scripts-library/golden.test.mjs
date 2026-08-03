// golden.test.mjs — the calibration acceptance test.
//
// The riskiest claim in the spec: "distinctive vs cookie-cutter" is measurable
// DETERMINISTICALLY. This test asserts the structural-signature metric G ranks
// EVERY distinctive golden fixture above EVERY generic one, that a separating
// threshold tau exists, and that the metric fails-fast (SCORE_UNCALIBRATED)
// rather than fabricating a score when a corpus cannot be separated.
//
// Atomic + declarative: one contract per test. Ground truth = fixtures/labels.json;
// the test asserts the ranking, it does not derive the labels from the metric.
//
// Red-first baseline (documented, not asserted here): the naive "just reuse
// impeccable detect" vector (no_overused_font alone) does NOT separate the set
// (margin 0.000) — see docs / the ablation. The passing metric below required
// the structural CSS-parse axes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractGolden, calibrate } from "./calibrate.mjs";
import { extractFeatures } from "./features.mjs";
import { seedAdherence, fitScore } from "./score.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, "..", "fixtures");

// Extract once (each fixture runs `impeccable detect`); reuse across tests.
const golden = extractGolden();
const cal = calibrate(golden);
const genG = cal.scored.filter((s) => s.label === "generic").map((s) => s.G);
const distG = cal.scored.filter((s) => s.label === "distinctive").map((s) => s.G);

test("golden set has both generic and distinctive fixtures", () => {
  assert.ok(genG.length >= 4 && distG.length >= 4);
});

test("CONTRACT: the metric separates the golden set (calibration succeeds)", () => {
  assert.equal(cal.status, "CALIBRATED");
});

test("CONTRACT: min distinctive G ranks strictly above max generic G", () => {
  assert.ok(cal.minDistinctive > cal.maxGeneric,
    `min distinctive G ${cal.minDistinctive} must exceed max generic G ${cal.maxGeneric}`);
});

test("CONTRACT: a separating threshold tau exists and lies between the classes", () => {
  assert.ok(cal.tau !== null);
  assert.ok(cal.maxGeneric < cal.tau && cal.tau < cal.minDistinctive);
});

test("CONTRACT: every distinctive fixture scores above tau", () => {
  for (const s of cal.scored.filter((x) => x.label === "distinctive")) {
    assert.ok(s.G > cal.tau, `${s.file} G=${s.G} must exceed tau=${cal.tau}`);
  }
});

test("CONTRACT: every generic fixture scores below tau", () => {
  for (const s of cal.scored.filter((x) => x.label === "generic")) {
    assert.ok(s.G < cal.tau, `${s.file} G=${s.G} must be below tau=${cal.tau}`);
  }
});

test("CONTRACT: separation margin is positive and non-trivial", () => {
  assert.ok(cal.margin > 0.1, `margin ${cal.margin} should be comfortably positive`);
});

// ---- fail-fast contract ----------------------------------------------------
test("CONTRACT: fail-fast — an unseparable corpus yields SCORE_UNCALIBRATED, not a fake tau", () => {
  const overlapping = [
    { label: "generic", vector: [0, 0, 0.5, 0, 0, 0, 0, 0, 0.5] },
    { label: "generic", vector: [0, 0, 0.5, 0, 0, 0, 0, 0, 0.5] },
    { label: "distinctive", vector: [0, 0, 0.5, 0, 0, 0, 0, 0, 0.5] }, // identical → cannot separate
    { label: "distinctive", vector: [0, 0, 0.5, 0, 0, 0, 0, 0, 0.5] },
  ];
  const bad = calibrate(overlapping);
  assert.equal(bad.status, "SCORE_UNCALIBRATED");
  assert.equal(bad.tau, null);
  assert.equal(bad.separates, false);
});

// ---- seed-adherence contract ----------------------------------------------
test("CONTRACT: seed-adherence passes on a fixture that satisfies the seed", () => {
  const fx = extractFeatures(join(FX, "distinctive-01-editorial-serif.html"));
  const sa = seedAdherence(fx.features, fx.detect,
    { corners: "square", type: "serif", grid: "asymmetric" });
  assert.equal(sa.ok, true);
});

test("CONTRACT: seed-adherence fails (and names the failed constraint) on a violating fixture", () => {
  const fx = extractFeatures(join(FX, "generic-01-saas-dark.html")); // sans, rounded, symmetric
  const sa = seedAdherence(fx.features, fx.detect,
    { corners: "square", type: "serif", grid: "asymmetric" });
  assert.equal(sa.ok, false);
  assert.ok(sa.failed.includes("type"));
  assert.ok(sa.failed.includes("grid"));
});

// ---- fit contract (honest scope) ------------------------------------------
test("CONTRACT: fit checklist scores assessable needs and excludes ones with no structural proxy", () => {
  const fx = extractFeatures(join(FX, "distinctive-03-swiss-mono.html"));
  const fit = fitScore(fx.features, { app: "dashboard", needs: ["density", "hierarchy", "trust"] });
  assert.equal(fit.assessable, 2); // density + hierarchy assessable
  assert.deepEqual(fit.unassessable, ["trust"]); // no faked signal for "trust"
  assert.ok(fit.score >= 0 && fit.score <= 1);
});
