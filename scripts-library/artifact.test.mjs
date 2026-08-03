// artifact.test.mjs — the calibration-ARTIFACT contract + score.mjs wiring.
//
// Calibration is now DATA-DRIVEN: `node calibrate.mjs` writes a calibration
// artifact (centroid + τ + provenance + margin) and score.mjs LOADS it rather
// than recomputing from the toy fixtures. These contracts pin that seam:
//   - the artifact round-trips (write → load) preserving centroid + τ;
//   - score() reads a CALIBRATED artifact and places a candidate against it;
//   - score() FAIL-FASTS (SCORE_UNCALIBRATED) on an unseparable artifact and on
//     a missing artifact — never a fabricated score, no fallback.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calibrateFromFixtures,
  toArtifact,
  writeCalibration,
  loadCalibration,
} from "./calibrate.mjs";
import { score } from "./score.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, "..", "fixtures");
const tmp = mkdtempSync(join(tmpdir(), "design-cal-"));

// A CALIBRATED artifact from the toy golden set (which DOES separate cleanly) —
// used to exercise the load + score path deterministically without a network render.
const calibratedArtifactPath = join(tmp, "calibrated.json");
const cal = calibrateFromFixtures();
writeCalibration(toArtifact(cal, { source: "golden", provenance: { manifest: "fixtures/labels.json" } }), calibratedArtifactPath);

test("CONTRACT: calibration artifact round-trips (write → load) preserving centroid + τ", () => {
  const art = loadCalibration(calibratedArtifactPath);
  assert.equal(art.status, "CALIBRATED");
  assert.equal(art.source, "golden");
  assert.ok(Array.isArray(art.genCentroid) && art.genCentroid.length === art.featureKeys.length);
  assert.ok(art.tau > 0);
  assert.ok(art.margin > 0);
  assert.ok(Math.abs(art.tau - cal.tau) < 1e-12);
});

test("CONTRACT: score() LOADS the artifact for centroid + τ and places a candidate", () => {
  const r = score(join(FX, "distinctive-01-editorial-serif.html"), { calibrationFile: calibratedArtifactPath });
  assert.ok(r.G > 0);
  assert.equal(r.tau_suggested, cal.tau);
  assert.equal(r.calibration_source, "golden");
  assert.equal(r.distinctive, r.G > cal.tau);
});

test("CONTRACT: score() default (no --calibration) uses the committed CANDIDATE/golden regime and scores", () => {
  // Pins that the committed default artifact is a CALIBRATED candidate-regime one —
  // if the default were the real-corpus SCORE_UNCALIBRATED artifact, this throws;
  // if the default silently scored real designs with a golden τ, calibration_source
  // would still read "golden" here (correct) but the regime doc makes that explicit.
  const r = score(join(FX, "distinctive-01-editorial-serif.html"));
  assert.equal(r.calibration_source, "golden");
  assert.ok(r.G > 0);
  assert.equal(typeof r.distinctive, "boolean");
});

test("CONTRACT: score() fail-fasts SCORE_UNCALIBRATED on an unseparable artifact (no fabricated score)", () => {
  const badPath = join(tmp, "uncalibrated.json");
  writeFileSync(
    badPath,
    JSON.stringify({ status: "SCORE_UNCALIBRATED", source: "corpus", separates: false, tau: null, margin: -0.5, genCentroid: [0], featureKeys: ["x"] })
  );
  assert.throws(
    () => score(join(FX, "distinctive-01-editorial-serif.html"), { calibrationFile: badPath }),
    (err) => err.code === "SCORE_UNCALIBRATED"
  );
});

test("CONTRACT: score() fail-fasts SCORE_UNCALIBRATED when the artifact is missing (no fallback)", () => {
  assert.throws(
    () => score(join(FX, "distinctive-01-editorial-serif.html"), { calibrationFile: join(tmp, "does-not-exist.json") }),
    (err) => err.code === "SCORE_UNCALIBRATED"
  );
});
