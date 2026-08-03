// calibrate.mjs — compute the generic-corpus centroid and the separating
// threshold τ from the labeled golden fixture set. Shared by score.mjs (to
// place a candidate's G) and by the golden-set test (to assert separation).
//
// Fail-fast: if the metric cannot separate the golden set
// (max generic G >= min distinctive G), calibration is UNCALIBRATED — no
// fabricated τ, no confident score. That negative result is itself the finding.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFeatures, euclid, centroid } from "./features.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(HERE, "..", "fixtures");

export function loadLabels(fixturesDir = FIXTURES_DIR) {
  const manifest = JSON.parse(readFileSync(join(fixturesDir, "labels.json"), "utf8"));
  return manifest.fixtures.map((f) => ({ ...f, path: join(fixturesDir, f.file) }));
}

// Extract features for every labeled fixture (runs impeccable detect per file).
export function extractGolden(fixturesDir = FIXTURES_DIR) {
  return loadLabels(fixturesDir).map((f) => ({ label: f.label, ...extractFeatures(f.path) }));
}

// Build the calibration from pre-extracted golden entries.
export function calibrate(golden) {
  const generic = golden.filter((g) => g.label === "generic");
  const distinctive = golden.filter((g) => g.label === "distinctive");
  if (generic.length === 0 || distinctive.length === 0) {
    throw new Error("SCORE_UNCALIBRATED: golden set needs both generic and distinctive fixtures");
  }
  const genCentroid = centroid(generic.map((g) => g.vector));

  const scored = golden.map((g) => ({
    file: g.file,
    label: g.label,
    G: euclid(g.vector, genCentroid),
  }));

  const genG = scored.filter((s) => s.label === "generic").map((s) => s.G);
  const distG = scored.filter((s) => s.label === "distinctive").map((s) => s.G);
  const maxGeneric = Math.max(...genG);
  const minDistinctive = Math.min(...distG);

  const separates = minDistinctive > maxGeneric;
  const margin = minDistinctive - maxGeneric;
  const tau = separates ? (maxGeneric + minDistinctive) / 2 : null;

  return {
    genCentroid,
    scored,
    maxGeneric,
    minDistinctive,
    margin,
    separates,
    tau,
    status: separates ? "CALIBRATED" : "SCORE_UNCALIBRATED",
  };
}

export function calibrateFromFixtures(fixturesDir = FIXTURES_DIR) {
  return calibrate(extractGolden(fixturesDir));
}
