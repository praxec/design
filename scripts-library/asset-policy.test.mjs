// asset-policy.test.mjs — the asset contract the generation prompt makes.
//
// "Self-contained" has two possible readings and the pack shipped the wrong one.
// It MEANT "renders with the network unplugged"; it SAID "no external
// fonts/styles/scripts/images", which the model correctly read as "no asset
// files at all". With real illustrations sitting in its own working directory,
// the generator hand-assembled pictures out of a dozen inline <svg> polygons
// instead — so every candidate read as a wireframe, on a product whose whole
// premise is that the artwork IS the design system.
//
// These are prompt-CONTRACT tests, not behaviour tests: the prompt is the only
// control surface over a frontier model, and re-tightening this wording is a
// one-line change that would silently return the pipeline to polygons. They pin
// both halves — local assets ALLOWED, network STILL FORBIDDEN — so neither can
// be lost without a test failing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK = join(HERE, "..");

// These are YAML block scalars, so any sentence may be wrapped across lines at
// an arbitrary column. Match against whitespace-normalised text so a reflow of
// the prompt never fails a test that is about its MEANING.
const norm = (t) => t.replace(/\s+/g, " ");
const SKILL = norm(readFileSync(join(PACK, "skills/implement.design-direction.yaml"), "utf8"));
const CAP = norm(readFileSync(join(PACK, "capabilities/cap.implement.generate-direction.yaml"), "utf8"));

// --- the network floor is unchanged ----------------------------------------

test("the skill still forbids network requests outright", () => {
  assert.match(SKILL, /NO NETWORK REQUESTS/);
  assert.match(SKILL, /renders with the network unplugged/i);
});

test("the task message still forbids network requests outright", () => {
  assert.match(CAP, /NO NETWORK REQUESTS/);
  assert.match(CAP, /render with the network unplugged/i);
});

test("named network sources stay explicitly banned", () => {
  for (const banned of [/CDN stylesheets/, /webfont services|Google Fonts/, /remote (images|scripts)/]) {
    assert.match(SKILL + CAP, banned, `expected the prompt to still name ${banned}`);
  }
});

// --- local assets are now permitted ----------------------------------------

test("the skill tells the generator that local files are NOT external", () => {
  assert.match(SKILL, /LOCAL FILES IN YOUR WORKING DIRECTORY ARE NOT "EXTERNAL"/);
});

test("the skill shows the concrete markup for both an image and a font", () => {
  assert.match(SKILL, /<img src="[^"]+">/);
  assert.match(SKILL, /@font-face/);
});

test("the task message permits local relative assets", () => {
  assert.match(CAP, /LOCAL FILES ALREADY IN YOUR WORKING DIRECTORY ARE NOT EXTERNAL/);
  assert.match(CAP, /USE THEM via relative paths/);
});

// The specific failure observed live: a real PNG sat in the agent's working
// directory and it drew a polygon scene instead.
test("both layers name the shape-assembly substitution as the wrong choice", () => {
  assert.match(SKILL, /Hand-assembling a picture out of a dozen inline `<svg>`/);
  assert.match(CAP, /do not substitute inline <svg> shape-assemblies/);
});

test("inline <svg> is still endorsed for icons — the fix is scoped, not a ban", () => {
  assert.match(SKILL, /Inline `<svg>` remains right for icons, marks, and diagrams/);
});

// --- the regression that would undo all of it -------------------------------

test("the old blanket phrasing is gone from both layers", () => {
  const OLD = /no external fonts\/styles\/scripts\/images/i;
  assert.doesNotMatch(CAP, OLD, "the blanket ban is what produced wireframes");
  assert.doesNotMatch(
    SKILL,
    /NO external stylesheets, fonts, scripts, images or network requests/i,
    "the blanket ban is what produced wireframes",
  );
});

// --- modern platform, with the scorer's blind spot made explicit ------------

test("both layers ask for semantic HTML5 and the modern CSS platform", () => {
  assert.match(SKILL, /semantic HTML5/);
  assert.match(CAP, /semantic HTML5/);
  for (const feature of [/CSS grid/, /aspect-ratio/, /prefers-reduced-motion/]) {
    assert.match(CAP, feature);
  }
});

// The scorer parses the STATIC DOM/CSS. A page that builds its layout in JS is
// not merely risky — it is unscoreable, and would silently read as a blank
// design. The prompt has to say so, or "use modern HTML5" becomes an invitation
// to hide the design from the only measurement in the loop.
test("inline script is permitted ONLY as progressive enhancement", () => {
  assert.match(SKILL, /INLINE `<script>` is allowed for BEHAVIOUR/);
  assert.match(SKILL, /COMPLETE AND CORRECT WITHOUT IT/);
  assert.match(SKILL, /scorer parses the STATIC DOM and CSS/);
  assert.match(CAP, /complete without it/i);
  assert.match(CAP, /invisible to it and scores as absent/i);
});

// --- the turn has to be long enough to actually finish the page -------------

test("generation gets a turn long enough for a finished page", () => {
  const m = CAP.match(/max_seconds:\s*(\d+)/);
  assert.ok(m, "cap must declare max_seconds");
  assert.ok(
    Number(m[1]) >= 1800,
    `a finished page with real assets needs a longer turn than a polygon wireframe; got ${m[1]}s`,
  );
});
