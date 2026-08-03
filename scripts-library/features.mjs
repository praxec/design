// features.mjs — deterministic structural feature-vector extraction for a
// rendered UI candidate (self-contained HTML w/ inline CSS).
//
// PRIMARY signal: `npx impeccable detect --json <file>` — an antipattern
// detector (domains: type, layout; categories: slop, quality). We consume its
// findings directly (esp. `overused-font`, a genuine cookie-cutter marker, and
// the aggregate `slop` count).
//
// SUPPLEMENT: impeccable detect is an *antipattern* detector, NOT a general
// structural feature extractor — it reports what's wrong, not the geometry of
// the design. It does not surface font *class* (serif/mono/display vs sans),
// corner-radius magnitude, grid symmetry, palette saturation, or border weight.
// Those are exactly the axes that separate the cookie-cutter default from an
// editorial/brutalist/swiss composition, so we derive them from a lightweight
// regex CSS parse of the SAME file. detect's output is preferred where it
// carries the signal; the CSS parse fills the geometry it cannot see.
//
// Every feature is oriented so the DISTINCTIVE direction is HIGH and normalized
// to roughly [0,1], defined against the *generic archetype* (sans / rounded /
// symmetric / overused-font / gradient) — NOT by peeking at each fixture's
// label. The golden-set test is what proves the axes actually separate.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// ---- ordered feature schema (distinctive direction = high) -----------------
export const FEATURE_KEYS = [
  "serif_or_display", // primary font is serif/mono/display (not sans)      [structural]
  "no_overused_font", // detect did NOT fire overused-font                  [detect]
  "square_corners",   // max border-radius is small/zero                    [structural]
  "asymmetric_grid",  // uses an unequal fr grid (e.g. 2fr 1fr)             [structural]
  "not_centered",     // hero not text-align:center                        [structural]
  "no_gradient_bg",   // no gradient background/text/button                 [structural]
  "heavy_rules",      // thick borders (>=3px) present                      [structural]
  "display_scale",    // very large display type (>=60px) present           [structural]
  "bold_palette",     // a highly-saturated non-neutral color present       [structural]
];

// ---- impeccable detect (primary signal) ------------------------------------
export function runDetect(file) {
  let stdout;
  try {
    stdout = execFileSync("npx", ["--yes", "impeccable", "detect", "--json", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    // detect exits non-zero when it finds findings; stdout still holds the JSON.
    stdout = err.stdout ? err.stdout.toString() : "";
  }
  const trimmed = (stdout || "").trim();
  if (!trimmed) return [];
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`DETECT_UNPARSEABLE: could not parse impeccable detect --json for ${file}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`DETECT_UNEXPECTED_SHAPE for ${file}`);
  return parsed;
}

// ---- lightweight CSS extraction --------------------------------------------
function cssText(html) {
  let css = "";
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += "\n" + m[1];
  for (const m of html.matchAll(/style\s*=\s*"([^"]*)"/gi)) css += "\n" + m[1];
  return css;
}

const SANS = ["inter", "roboto", "helvetica", "arial", "system-ui", "-apple-system",
  "segoe", "plus jakarta", "geist", "space grotesk", "sans-serif", "ui-sans"];
const SERIF = ["georgia", "times", "garamond", "playfair", "fraunces", "baskerville",
  "hoefler", "lora", "cormorant", "spectral", "merriweather", "libre", "tiempos", "serif"];
const MONO = ["mono", "courier", "consolas", "menlo", "plex mono", "jetbrains", "fira code"];
const DISPLAY = ["bebas", "archivo black", "anton", "oswald", "abril"];

// primary font = the font-family on body / :root / * (whichever first declares a stack)
function primaryFontClass(css) {
  const decls = [...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((m) => m[1].toLowerCase());
  if (decls.length === 0) return "sans"; // browser default is a sans stack
  const stack = decls[0];
  const has = (list) => list.some((k) => stack.includes(k));
  // order matters: "sans-serif" contains "serif", so test mono/serif-name/display first,
  // then explicit sans, then fall through.
  if (has(MONO)) return "mono";
  if (has(DISPLAY)) return "display";
  // serif only if a serif-name matches AND it's not merely the "sans-serif" fallback token
  const serifHit = SERIF.some((k) => k !== "serif" && stack.includes(k)) ||
    (stack.includes("serif") && !stack.includes("sans-serif"));
  if (serifHit) return "serif";
  if (has(SANS)) return "sans";
  return "sans";
}

function maxBorderRadius(css) {
  let max = 0;
  for (const m of css.matchAll(/border-radius\s*:\s*([^;}]+)/gi)) {
    for (const num of m[1].matchAll(/([\d.]+)\s*(px|rem|em|%)?/gi)) {
      let v = parseFloat(num[1]);
      const unit = (num[2] || "px").toLowerCase();
      if (unit === "rem" || unit === "em") v *= 16;
      if (unit === "%") v = v > 20 ? 24 : v; // pill = fully round → treat as very rounded
      if (v > max) max = v;
    }
  }
  // 9999px pill → clamp
  return Math.min(max, 32);
}

function hasAsymmetricGrid(css) {
  for (const m of css.matchAll(/grid-template-columns\s*:\s*([^;}]+)/gi)) {
    const val = m[1].toLowerCase();
    if (/repeat\s*\(/.test(val)) continue; // repeat(N,1fr) = symmetric
    const frs = [...val.matchAll(/([\d.]+)fr/g)].map((x) => parseFloat(x[1]));
    if (frs.length >= 2) {
      const min = Math.min(...frs), max = Math.max(...frs);
      if (max - min > 0.001) return true; // unequal fr weights = asymmetric
    }
  }
  return false;
}

function isCentered(css) {
  // generic hero centers its container
  return /text-align\s*:\s*center/i.test(css);
}

function hasGradientBg(css) {
  return /(linear|radial|conic)-gradient\s*\(/i.test(css);
}

function maxBorderWidth(css) {
  let max = 0;
  // borders declared as `border: Npx ...` or border-*-width / border-bottom: Npx
  for (const m of css.matchAll(/border(?:-(?:top|right|bottom|left))?\s*:\s*([\d.]+)px/gi)) {
    const v = parseFloat(m[1]);
    if (v > max) max = v;
  }
  for (const m of css.matchAll(/border[a-z-]*width\s*:\s*([\d.]+)px/gi)) {
    const v = parseFloat(m[1]);
    if (v > max) max = v;
  }
  return max;
}

function maxFontSize(css) {
  let max = 0;
  for (const m of css.matchAll(/font-size\s*:\s*([\d.]+)\s*(px|rem|em)?/gi)) {
    let v = parseFloat(m[1]);
    const unit = (m[2] || "px").toLowerCase();
    if (unit === "rem" || unit === "em") v *= 16;
    if (v > max) max = v;
  }
  return max;
}

// crude but deterministic HSL-ish saturation of the boldest hex/rgb color.
function hexToSat(r, g, b) {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  if (mx === mn) return 0;
  const d = mx - mn;
  return l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
}
function maxSaturation(css) {
  let max = 0;
  const consider = (r, g, b) => {
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // ignore near-black/near-white (structure/text), we want a *chromatic* accent
    if (lum < 0.06 || lum > 0.96) return;
    const s = hexToSat(r, g, b);
    if (s > max) max = s;
  };
  for (const m of css.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const h = m[1];
    consider(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
  }
  for (const m of css.matchAll(/#([0-9a-f]{3})\b/gi)) {
    const h = m[1];
    consider(parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16));
  }
  for (const m of css.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/gi)) {
    consider(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  return max;
}

// ---- assemble the feature vector -------------------------------------------
export function extractFeatures(file) {
  const html = readFileSync(file, "utf8");
  const css = cssText(html);
  const findings = runDetect(file);

  const overused = findings.some((f) => f.antipattern === "overused-font");
  const slopCount = findings.filter((f) => f.category === "slop").length;

  const fontClass = primaryFontClass(css);
  const radius = maxBorderRadius(css);
  const asym = hasAsymmetricGrid(css);
  const centered = isCentered(css);
  const gradient = hasGradientBg(css);
  const borderW = maxBorderWidth(css);
  const bigType = maxFontSize(css);
  const sat = maxSaturation(css);

  const features = {
    serif_or_display: fontClass !== "sans" ? 1 : 0,
    no_overused_font: overused ? 0 : 1,
    square_corners: 1 - Math.min(radius, 16) / 16, // 0px→1, >=16px→0
    asymmetric_grid: asym ? 1 : 0,
    not_centered: centered ? 0 : 1,
    no_gradient_bg: gradient ? 0 : 1,
    heavy_rules: Math.min(borderW, 6) / 6, // >=6px → 1
    display_scale: Math.max(0, Math.min(1, (bigType - 44) / (104 - 44))), // 44px→0, 104px→1
    bold_palette: sat, // 0..1 saturation of boldest chromatic color
  };

  const vector = FEATURE_KEYS.map((k) => features[k]);

  return {
    file,
    vector,
    features,
    detect: {
      overused_font: overused,
      slop_count: slopCount,
      finding_count: findings.length,
      font_class: fontClass,
    },
    raw: { radius, borderW, bigType, sat, asym, centered, gradient },
  };
}

export function euclid(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export function centroid(vectors) {
  const n = vectors.length;
  const dim = vectors[0].length;
  const c = new Array(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) c[i] += v[i];
  return c.map((x) => x / n);
}
