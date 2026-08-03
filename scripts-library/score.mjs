#!/usr/bin/env node
// score.mjs — the measurement CLI.
//
//   node score.mjs <html> [--seed <json>] [--profile <json>]
//     → { G, tau_suggested, seed_adherence, fit, features }
//
//   G              distance of the candidate's structural feature vector from the
//                  GENERIC-corpus centroid (mean over the generic golden fixtures).
//                  Higher G = more distinctive / further from the cookie-cutter default.
//   tau_suggested  the separating threshold learned from the golden set (midpoint of
//                  max-generic-G and min-distinctive-G). Candidate is distinctive if G > tau.
//   seed_adherence given a seed constraint set, does the feature vector satisfy it?
//   fit            given an app-type core-needs profile, a checklist score.
//
// Fail-fast: if the golden set cannot be separated, calibration emits
// SCORE_UNCALIBRATED and this CLI exits non-zero with NO fabricated G — the
// metric never returns a confident score it cannot stand behind.

import { extractFeatures } from "./features.mjs";
import { euclid } from "./features.mjs";
import { loadCalibration, CALIBRATION_FILE } from "./calibrate.mjs";
import { existsSync } from "node:fs";

// ---- seed-adherence: a hard-constraint set checked against the vector -------
// Same feature vector that powers G doubles as the seed-adherence check.
const SEED_CHECKS = {
  corners: (f, want) =>
    want === "square" ? f.square_corners >= 0.75 : f.square_corners < 0.5,
  type: (f, want, d) => d.font_class === want,
  grid: (f, want) =>
    want === "asymmetric" ? f.asymmetric_grid >= 1 : f.asymmetric_grid < 1,
  composition: (f, want) =>
    want === "off-center" ? f.not_centered >= 1 : f.not_centered < 1,
  palette: (f, want) =>
    want === "bold" ? f.bold_palette >= 0.6 : f.bold_palette < 0.6,
  gradient: (f, want) =>
    want === "none" ? f.no_gradient_bg >= 1 : f.no_gradient_bg < 1,
  rules: (f, want) =>
    want === "heavy" ? f.heavy_rules >= 0.5 : f.heavy_rules < 0.5,
};

export function seedAdherence(features, detect, seed) {
  if (!seed || Object.keys(seed).length === 0) return null;
  const checks = [];
  for (const [key, want] of Object.entries(seed)) {
    const fn = SEED_CHECKS[key];
    if (!fn) {
      checks.push({ constraint: key, want, pass: false, reason: "UNKNOWN_SEED_CONSTRAINT" });
      continue;
    }
    checks.push({ constraint: key, want, pass: !!fn(features, want, detect) });
  }
  const failed = checks.filter((c) => !c.pass).map((c) => c.constraint);
  return { ok: failed.length === 0, failed, checks };
}

// ---- fit-for-purpose: a per-app-type core-needs checklist ------------------
// HONEST SCOPE: the current feature vector is aesthetic/structural, so fit is a
// deterministic checklist PROXY over those same features. The spec's fuller fit
// = this checklist + a brief-grounded LLM pass; the LLM half is out of the
// deterministic measurement core (Increment I). Needs with no structural proxy
// are reported `assessable:false` and excluded from the score — never faked.
const NEED_SIGNALS = {
  density: (f) => f.not_centered >= 1, // dense layouts aren't centered single-column heroes
  hierarchy: (f) => f.display_scale > 0.2, // a display-scale type step = explicit hierarchy
  scannability: (f) => f.asymmetric_grid >= 1 || f.not_centered >= 1,
  "low-chrome": (f) => f.no_gradient_bg >= 1, // no decorative gradient chrome
  hero: (f) => f.display_scale > 0.2, // marketing hero needs a large display moment
};

export function fitScore(features, profile) {
  if (!profile || !Array.isArray(profile.needs) || profile.needs.length === 0) return null;
  const checks = profile.needs.map((need) => {
    const fn = NEED_SIGNALS[need];
    if (!fn) return { need, assessable: false };
    return { need, assessable: true, pass: !!fn(features) };
  });
  const assessable = checks.filter((c) => c.assessable);
  const passed = assessable.filter((c) => c.pass).length;
  return {
    app: profile.app || null,
    score: assessable.length ? passed / assessable.length : null,
    passed,
    assessable: assessable.length,
    unassessable: checks.filter((c) => !c.assessable).map((c) => c.need),
    checks,
  };
}

// ---- CLI -------------------------------------------------------------------
function parseArgs(argv) {
  const out = { file: null, seed: null, profile: null, calibrationFile: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") out.seed = JSON.parse(argv[++i]);
    else if (a === "--profile") out.profile = JSON.parse(argv[++i]);
    else if (a === "--calibration") out.calibrationFile = argv[++i];
    else if (!a.startsWith("--")) out.file = a;
  }
  return out;
}

// score.mjs LOADS the calibration ARTIFACT (produced by `node calibrate.mjs`)
// for its centroid + τ — it does NOT recompute them from the toy fixtures. This
// is what lets calibration scale to any corpus. No fallback: a missing artifact,
// or one whose corpus could not separate (status SCORE_UNCALIBRATED), fail-fasts.
export function score(file, { seed = null, profile = null, calibrationFile = CALIBRATION_FILE } = {}) {
  if (!existsSync(calibrationFile)) {
    const err = new Error(
      `SCORE_UNCALIBRATED: no calibration artifact at ${calibrationFile}. ` +
        "Run `node calibrate.mjs` against a labeled corpus first."
    );
    err.code = "SCORE_UNCALIBRATED";
    throw err;
  }
  const cal = loadCalibration(calibrationFile);
  if (cal.status !== "CALIBRATED" || !cal.separates || cal.tau == null) {
    const err = new Error(
      "SCORE_UNCALIBRATED: the calibration corpus could not separate generic from distinctive " +
        `(margin ${Number(cal.margin).toFixed(3)}). Refusing to emit a fabricated score.`
    );
    err.code = "SCORE_UNCALIBRATED";
    err.calibration = cal;
    throw err;
  }
  const fx = extractFeatures(file);
  const G = euclid(fx.vector, cal.genCentroid);
  return {
    file,
    G,
    tau_suggested: cal.tau,
    distinctive: G > cal.tau,
    calibration_margin: cal.margin,
    calibration_source: cal.source,
    seed_adherence: seedAdherence(fx.features, fx.detect, seed),
    fit: fitScore(fx.features, profile),
    features: fx.features,
    detect: fx.detect,
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { file, seed, profile, calibrationFile } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error("usage: node score.mjs <html> [--seed <json>] [--profile <json>] [--calibration <artifact.json>]");
    process.exit(2);
  }
  try {
    const opts = { seed, profile };
    if (calibrationFile) opts.calibrationFile = calibrationFile;
    console.log(JSON.stringify(score(file, opts), null, 2));
  } catch (err) {
    if (err.code === "SCORE_UNCALIBRATED") {
      console.error(JSON.stringify({ error: "SCORE_UNCALIBRATED", message: err.message }, null, 2));
      process.exit(3);
    }
    throw err;
  }
}
