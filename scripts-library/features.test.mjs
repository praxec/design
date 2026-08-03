// features.test.mjs — atomic contracts for the two DISCRIMINATING features added
// to attack the real-corpus failure modes (see the corpus report):
//   1. intentional_asymmetry — a functional nav/sidebar rail must NOT read as
//      distinctive; only DELIBERATE, moderate compositional asymmetry counts.
//   2. minimal_polish — distinctiveness-through-restraint (custom typeface +
//      generous whitespace + restrained palette/type) that gross geometry misses.
//
// One contract per test. The function-level tests are hermetic (synthetic signal
// objects) and are RED-FIRST by construction: before this change railway's rail
// scored asymmetric_grid=1 (an ===0 assertion would fail) and minimal_polish did
// not exist (a >0 assertion would fail). The corpus-grounded tests pin the SPECIFIC
// failure-mode items and skip cleanly when the built corpus is absent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  intentionalAsymmetry,
  minimalPolish,
  extractFeatures,
  FEATURE_KEYS,
} from "./features.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "fixtures", "corpus");

// A neutral signal object; individual tests override only the field under test.
const base = {
  rawStack: "areal, sans-serif",
  fontStack: "areal",
  displayFontPx: 16,
  bodyFontPx: 16,
  letterSpacing: 0,
  lineHeight: 1.4,
  weightSpread: 300,
  saturation: 0,
  distinctChromaticColors: 0,
  gradient: false,
  gridTracks: null,
  gridRatio: 1,
  sidebarLike: false,
  transformComposed: false,
  offCenterHero: false,
  whitespaceRatio: 0.73,
};

// ---- FEATURE 1: intentional_asymmetry --------------------------------------

test("CONTRACT: an extreme-ratio functional rail (railway 1:29) is DISCOUNTED to 0", () => {
  const g = intentionalAsymmetry({ ...base, gridTracks: [1, 29, 1], gridRatio: 29 });
  assert.equal(g, 0, "a narrow app-shell rail must not read as intentional asymmetry");
});

test("CONTRACT: a DETECTED nav/sidebar is discounted to 0 even at a modest ratio", () => {
  const g = intentionalAsymmetry({ ...base, gridTracks: [1, 4], gridRatio: 4, sidebarLike: true });
  assert.equal(g, 0);
});

test("CONTRACT: a deliberate moderate asymmetry (editorial 5:2) is REWARDED (0<g<1)", () => {
  const g = intentionalAsymmetry({ ...base, gridTracks: [5, 2], gridRatio: 2.5 });
  assert.ok(g > 0 && g < 1, `moderate compositional asymmetry should score in (0,1), got ${g}`);
});

test("CONTRACT: a symmetric grid is not asymmetry (0)", () => {
  assert.equal(intentionalAsymmetry({ ...base, gridTracks: [1, 1, 1], gridRatio: 1 }), 0);
});

// ---- FEATURE 2: minimal_polish ---------------------------------------------

test("CONTRACT: a DEFAULT-font page scores 0 by the typeface gate (generic minimal is not polish)", () => {
  const p = minimalPolish({ ...base, rawStack: "inter, system-ui, sans-serif", fontStack: "inter" });
  assert.equal(p, 0);
});

test("CONTRACT: a CRAMPED custom-font template scores 0 by the whitespace gate", () => {
  const p = minimalPolish({ ...base, whitespaceRatio: 0.2 });
  assert.equal(p, 0, "clean-but-cramped template density is not editorial restraint");
});

test("CONTRACT: custom typeface + generous whitespace + restrained palette scores HIGH (are.na signature)", () => {
  const p = minimalPolish({ ...base, rawStack: "areal", whitespaceRatio: 0.73, distinctChromaticColors: 0 });
  assert.ok(p > 0.5, `polished minimal site should score >0.5, got ${p}`);
});

// ---- schema -----------------------------------------------------------------

test("CONTRACT: the feature schema carries both new axes and dropped the naive asymmetric_grid", () => {
  assert.ok(FEATURE_KEYS.includes("intentional_asymmetry"));
  assert.ok(FEATURE_KEYS.includes("minimal_polish"));
  assert.ok(!FEATURE_KEYS.includes("asymmetric_grid"));
});

// ---- corpus-grounded: the SPECIFIC failure-mode items ----------------------
// These pin the real fix on the exact items named in the diagnosis. They read the
// cached rich geo blobs (free, no re-render) and skip if the corpus is absent.

const haveCorpus = existsSync(join(CORPUS, "manifest.json"));
const feat = (rel) => extractFeatures(join(CORPUS, rel)).features;

test("FAILURE-MODE 1: railway's incidental rail no longer reads distinctive (intentional_asymmetry 1→0)", { skip: !haveCorpus }, () => {
  assert.equal(feat("generic/railway.html").intentional_asymmetry, 0);
});

test("FAILURE-MODE 1: shadcn's sidebar grid no longer reads distinctive (intentional_asymmetry 1→0)", { skip: !haveCorpus }, () => {
  assert.equal(feat("generic/shadcn-ui.html").intentional_asymmetry, 0);
});

test("FAILURE-MODE 1: clerk's asymmetry is discounted below a full distinctive vote (<1)", { skip: !haveCorpus }, () => {
  assert.ok(feat("generic/clerk.html").intentional_asymmetry < 1);
});

test("FAILURE-MODE 2: are.na's polish is now counted (minimal_polish > 0.5)", { skip: !haveCorpus }, () => {
  assert.ok(feat("distinctive/are-na.html").minimal_polish > 0.5);
});

test("FAILURE-MODE 2: cosmos's polish is now counted (minimal_polish > 0.5)", { skip: !haveCorpus }, () => {
  assert.ok(feat("distinctive/cosmos.html").minimal_polish > 0.5);
});

test("FAILURE-MODE 2: pudding's polish is now counted (minimal_polish > 0)", { skip: !haveCorpus }, () => {
  assert.ok(feat("distinctive/pudding.html").minimal_polish > 0);
});
