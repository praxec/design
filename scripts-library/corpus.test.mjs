// corpus.test.mjs — the REAL-DESIGN calibration acceptance test.
//
// The riskiest empirical claim behind betting a dogfood on structural-G: the
// metric that separated the n=8 TOY fixtures 2.4× ALSO separates REAL generic vs
// REAL distinctive designs. This test answers that HONESTLY against the curated
// real corpus (fixtures/corpus/manifest.json) — it PINS the observed outcome, it
// does not force a pass. If the real corpus does not cleanly separate, the test
// asserts THAT (SCORE_UNCALIBRATED), so a future change that fudged the corpus to
// force separation would show up as a diff, not a silent green.
//
// EMPIRICAL RESULT (2026-08-03, n=15 generic / 16 distinctive real sites):
//   structural-G STILL does NOT cleanly separate real designs — status
//   SCORE_UNCALIBRATED, no valid τ. But adding two failure-mode features
//   (intentional_asymmetry + minimal_polish) MEASURABLY narrowed the overlap:
//   margin -0.51 → -0.28 and rank AUC 0.90 → 0.94. The named failure-mode items
//   moved the right way (railway/shadcn/clerk G dropped; are.na/cosmos G rose) —
//   see features.test.mjs. It remains a ranking PRIOR, not a hard eligibility
//   floor: the binding maxGeneric is railway, whose serif+saturation+gradient cues
//   ape distinctiveness through the *pre-existing* coarse axes, not the two added
//   here. Crossing positive needs the deferred thumbnail image-embedding G.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  extractCorpus,
  calibrate,
  loadCorpus,
  loadCalibration,
  CALIBRATION_FILE,
} from "./calibrate.mjs";

// The corpus is a built artifact (node build-corpus.mjs). Skip cleanly if absent
// so the suite still runs on a fresh checkout without a network render.
const haveCorpus = existsSync(new URL("../fixtures/corpus/manifest.json", import.meta.url));

test("real corpus is present with both labels and a modest real n", { skip: !haveCorpus }, () => {
  const items = loadCorpus();
  const gen = items.filter((i) => i.label === "generic").length;
  const dist = items.filter((i) => i.label === "distinctive").length;
  assert.ok(gen >= 10, `want >=10 real generic, have ${gen}`);
  assert.ok(dist >= 10, `want >=10 real distinctive, have ${dist}`);
  // provenance: every item carries a real source URL
  for (const i of items) assert.ok(/^https?:\/\//.test(i.source), `${i.file} missing real source URL`);
});

// Extract once (each item runs impeccable detect); reuse across the tests below.
const corpusCal = haveCorpus ? calibrate(extractCorpus()) : null;

test("EMPIRICAL: structural-G does NOT cleanly separate the REAL corpus (honest finding)", { skip: !haveCorpus }, () => {
  // This is the headline result, asserted truthfully. If a future change makes
  // the real corpus separate, THIS test must be updated deliberately — it is the
  // guard against silently fudging the corpus/metric to force a green.
  assert.equal(corpusCal.status, "SCORE_UNCALIBRATED");
  assert.equal(corpusCal.tau, null);
  assert.ok(corpusCal.margin <= 0, `expected overlap (margin<=0), got margin ${corpusCal.margin}`);
});

test("EMPIRICAL: the two failure-mode features NARROWED the overlap vs the -0.51 baseline (honest, still negative)", { skip: !haveCorpus }, () => {
  // Pins the direction of the iteration: overlap shrank (margin moved toward 0)
  // but did NOT cross positive. A regression that re-widened it, or a fudge that
  // forced a false positive, both break this.
  assert.ok(corpusCal.margin > -0.45, `margin should have improved past the -0.51 baseline, got ${corpusCal.margin}`);
  assert.ok(corpusCal.margin < 0, `still honestly uncalibrated (margin<0), got ${corpusCal.margin}`);
});

test("EMPIRICAL: the metric still carries real RANK signal (not noise)", { skip: !haveCorpus }, () => {
  const dist = corpusCal.scored.filter((s) => s.label === "distinctive").map((s) => s.G);
  const gen = corpusCal.scored.filter((s) => s.label === "generic").map((s) => s.G);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  // distinctive sites are, on average, farther from the generic centroid
  assert.ok(mean(dist) > mean(gen), "mean distinctive G should exceed mean generic G");
  // rank AUC = P(random distinctive scores above random generic)
  let wins = 0, ties = 0;
  for (const d of dist) for (const g of gen) { if (d > g) wins++; else if (d === g) ties++; }
  const auc = (wins + 0.5 * ties) / (dist.length * gen.length);
  assert.ok(auc >= 0.8, `rank AUC ${auc.toFixed(3)} should show strong (not perfect) signal`);
});

test("the committed calibration.json reflects the real-corpus outcome (artifact is honest/current)", { skip: !haveCorpus }, () => {
  if (!existsSync(CALIBRATION_FILE)) return; // artifact optional on fresh checkout
  const art = loadCalibration();
  if (art.source !== "corpus") return; // only assert when the shipped artifact is the real-corpus one
  assert.equal(art.status, corpusCal.status);
  assert.equal(art.tau, corpusCal.tau);
  assert.ok(Math.abs(art.margin - corpusCal.margin) < 1e-9, "artifact margin must match a fresh corpus calibration");
});
