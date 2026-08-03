// calibrate.mjs — DATA-DRIVEN calibration of the genericness axis G and its
// threshold τ from a LABELED corpus (generic vs distinctive).
//
// It ingests a corpus, extracts each item's structural feature vector (via
// features.mjs / impeccable detect), computes the GENERIC-corpus centroid, and
// derives τ as the threshold that maximally separates generic from distinctive —
// reporting the MARGIN. The result is written as a calibration ARTIFACT
// (fixtures/calibration.json: centroid + τ + provenance/counts + margin) that
// score.mjs LOADS, so calibration scales to any corpus instead of being baked
// into the toy fixtures.
//
// Fail-fast: if the corpus cannot separate (margin <= 0), calibration is
// SCORE_UNCALIBRATED — it REFUSES to write a usable τ/centroid. That negative
// result is itself the finding; there is no fabricated threshold, no fallback.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFeatures, euclid, centroid, FEATURE_KEYS } from "./features.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(HERE, "..", "fixtures");
export const CORPUS_DIR = join(FIXTURES_DIR, "corpus");
// Two REGIMES, two artifacts — never conflated into one file:
//   golden  = the CANDIDATE regime (self-contained generated designs, which the
//             toy golden set calibrates cleanly). This is score.mjs's default.
//   corpus  = the REAL-SITE regime (live production pages). Structural-G does NOT
//             separate these yet (SCORE_UNCALIBRATED — see corpus.test.mjs), so
//             scoring a real site must pass --calibration <CORPUS_CALIBRATION_FILE>
//             and will honestly fail-fast until the deferred image-embedding G.
export const GOLDEN_CALIBRATION_FILE = join(FIXTURES_DIR, "calibration.golden.json");
export const CORPUS_CALIBRATION_FILE = join(FIXTURES_DIR, "calibration.corpus.json");
export const CALIBRATION_FILE = GOLDEN_CALIBRATION_FILE;

// ---- toy golden set (n=8) --------------------------------------------------
export function loadLabels(fixturesDir = FIXTURES_DIR) {
  const manifest = JSON.parse(readFileSync(join(fixturesDir, "labels.json"), "utf8"));
  return manifest.fixtures.map((f) => ({ ...f, path: join(fixturesDir, f.file), source: f.file }));
}

export function extractGolden(fixturesDir = FIXTURES_DIR) {
  return loadLabels(fixturesDir).map((f) => ({ label: f.label, source: f.source, ...extractFeatures(f.path) }));
}

// ---- real corpus (fixtures/corpus/manifest.json) ---------------------------
export function loadCorpus(corpusDir = CORPUS_DIR) {
  const manifest = JSON.parse(readFileSync(join(corpusDir, "manifest.json"), "utf8"));
  return manifest.items.map((it) => ({ ...it, path: join(corpusDir, it.file) }));
}

export function extractCorpus(corpusDir = CORPUS_DIR) {
  return loadCorpus(corpusDir).map((it) => ({ label: it.label, source: it.source, ...extractFeatures(it.path) }));
}

// ---- core: centroid + τ + margin from labeled feature vectors --------------
// `golden` is any array of { label: "generic"|"distinctive", vector, file?, source? }.
export function calibrate(golden) {
  const generic = golden.filter((g) => g.label === "generic");
  const distinctive = golden.filter((g) => g.label === "distinctive");
  if (generic.length === 0 || distinctive.length === 0) {
    throw new Error("SCORE_UNCALIBRATED: corpus needs both generic and distinctive items");
  }
  const genCentroid = centroid(generic.map((g) => g.vector));

  const scored = golden.map((g) => ({
    file: g.file || g.source || null,
    source: g.source || null,
    label: g.label,
    G: euclid(g.vector, genCentroid),
  }));

  const genG = scored.filter((s) => s.label === "generic").map((s) => s.G);
  const distG = scored.filter((s) => s.label === "distinctive").map((s) => s.G);
  const maxGeneric = Math.max(...genG);
  const minDistinctive = Math.min(...distG);

  // τ = threshold that maximally separates the two classes. When they separate
  // cleanly it is the midpoint of the gap; the margin is the width of that gap.
  const separates = minDistinctive > maxGeneric;
  const margin = minDistinctive - maxGeneric;
  const tau = separates ? (maxGeneric + minDistinctive) / 2 : null;

  return {
    genCentroid,
    scored,
    counts: { generic: generic.length, distinctive: distinctive.length },
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

export function calibrateFromCorpus(corpusDir = CORPUS_DIR) {
  return calibrate(extractCorpus(corpusDir));
}

// ---- calibration ARTIFACT (the thing score.mjs loads) ----------------------
export function toArtifact(cal, { source, provenance = {} } = {}) {
  return {
    status: cal.status,
    generatedAt: new Date().toISOString(),
    source, // "corpus" | "golden"
    provenance: { ...provenance, counts: cal.counts },
    featureKeys: FEATURE_KEYS,
    genCentroid: cal.genCentroid,
    tau: cal.tau,
    margin: cal.margin,
    maxGeneric: cal.maxGeneric,
    minDistinctive: cal.minDistinctive,
    separates: cal.separates,
    scored: cal.scored,
  };
}

// Refuses to write a USABLE artifact when the corpus cannot separate: the file
// is still written (for the report/audit trail) but carries status
// SCORE_UNCALIBRATED and tau=null, so score.mjs fail-fasts instead of scoring.
export function writeCalibration(artifact, outPath = CALIBRATION_FILE) {
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
  return outPath;
}

export function loadCalibration(path = CALIBRATION_FILE) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---- CLI: node calibrate.mjs [--source corpus|golden] [--out <file>] -------
// No args → regenerate BOTH regime artifacts (golden + corpus) to their canonical
// paths. This is the poka-yoke against the defect where a plain run clobbered the
// corpus finding with the golden one: the default action keeps the two in sync and
// can never silently drop the honest real-site result.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  let source = null; // null → both regimes
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--source") source = argv[++i];
    else if (argv[i] === "--out") out = argv[++i];
  }
  if (out && !source) {
    console.error("--out requires --source (it targets a single regime); omit both to regenerate both canonical artifacts");
    process.exit(2);
  }
  const regimes = source ? [source] : ["golden", "corpus"];
  const summaries = [];
  for (const s of regimes) {
    const provenance =
      s === "corpus"
        ? { manifest: "fixtures/corpus/manifest.json" }
        : { manifest: "fixtures/labels.json" };
    const cal = s === "corpus" ? calibrateFromCorpus() : calibrateFromFixtures();
    const target = out || (s === "corpus" ? CORPUS_CALIBRATION_FILE : GOLDEN_CALIBRATION_FILE);
    const written = writeCalibration(toArtifact(cal, { source: s, provenance }), target);
    summaries.push({
      source: s,
      status: cal.status,
      counts: cal.counts,
      tau: cal.tau,
      margin: cal.margin,
      maxGeneric: cal.maxGeneric,
      minDistinctive: cal.minDistinctive,
      separates: cal.separates,
      artifact: written,
    });
  }
  console.log(JSON.stringify(summaries.length === 1 ? summaries[0] : summaries, null, 2));
  // Exit code reflects the CANDIDATE (golden) regime — what the pipeline scores
  // against. The corpus regime being SCORE_UNCALIBRATED is the KNOWN honest finding
  // carried in its own artifact, not a failure of this run. Only a targeted
  // `--source corpus` surfaces its non-separation as a non-zero exit.
  const gate = source === "corpus" ? summaries[0] : summaries.find((x) => x.source === "golden");
  if (gate && !gate.separates) process.exitCode = 3; // SCORE_UNCALIBRATED — honest non-zero
}
