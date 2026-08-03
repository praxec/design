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
import { readFileSync, existsSync } from "node:fs";

// ---- ordered feature schema (distinctive direction = high) -----------------
export const FEATURE_KEYS = [
  "serif_or_display",       // primary font is serif/mono/display (not sans)  [structural]
  "no_overused_font",       // detect did NOT fire overused-font              [detect]
  "square_corners",         // max border-radius is small/zero                [structural]
  "intentional_asymmetry",  // COMPOSITIONAL asymmetry, sidebars DISCOUNTED   [structural]
  "not_centered",           // hero not text-align:center                    [structural]
  "no_gradient_bg",         // no gradient background/text/button            [structural]
  "heavy_rules",            // thick borders (>=3px) present                 [structural]
  "display_scale",          // very large display type (>=60px) present      [structural]
  "bold_palette",           // a highly-saturated non-neutral color present  [structural]
  "minimal_polish",         // distinctiveness-through-restraint (type/palette/space) [structural]
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

// ---- signals for the two discriminating features ---------------------------
// Both failure-mode features (intentional-asymmetry, minimal-polish) are computed
// from a compact `signals` object. It is populated from EITHER the cached rich
// geo blob (real-site corpus) OR a lightweight CSS parse (toys / generator
// candidates), so the feature computation itself stays single-path and the toy
// and corpus feature spaces remain commensurable.

// Fonts that ARE the generic/default web aesthetic — a primary family in this set
// is NOT a deliberate typeface choice, so it cannot count toward minimal_polish.
const DEFAULT_PRIMARY_FONTS = [
  "inter", "roboto", "helvetica", "arial", "system-ui", "-apple-system",
  "apple-system", "blinkmacsystemfont", "segoe", "geist", "plus jakarta",
  "jakarta", "ui-sans", "sf pro", "noto sans", "open sans", "lato",
];
const GENERIC_KEYWORDS = ["sans-serif", "serif", "monospace", "system-ui", "ui-serif", "ui-monospace", "ui-sans-serif"];

function firstFamilyToken(stack) {
  const first = (stack || "").split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  return first;
}
// A deliberate (non-default) primary typeface.
function isCustomType(stack) {
  const primary = firstFamilyToken(stack);
  if (!primary) return false;
  if (GENERIC_KEYWORDS.includes(primary)) return false;
  if (DEFAULT_PRIMARY_FONTS.some((d) => primary.includes(d))) return false;
  return true;
}

// ---- CSS front-end (toys / candidates): derive the same signals from inline CSS
function bodyFontSizeCss(css) {
  const m = css.match(/body\s*\{[^}]*font-size\s*:\s*([\d.]+)\s*(px|rem|em)?/i);
  if (!m) return 16;
  let v = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  if (unit === "rem" || unit === "em") v *= 16;
  return v || 16;
}
function maxLetterSpacingCss(css) {
  let max = 0;
  for (const m of css.matchAll(/letter-spacing\s*:\s*(-?[\d.]+)\s*(px|em|rem)?/gi)) {
    let v = Math.abs(parseFloat(m[1]));
    const unit = (m[2] || "px").toLowerCase();
    if (unit === "em" || unit === "rem") v *= 16;
    if (v > max) max = v;
  }
  return max;
}
function weightSpreadCss(css) {
  const ws = [...css.matchAll(/font-weight\s*:\s*(\d{3})/gi)].map((m) => parseInt(m[1], 10));
  if (ws.length === 0) return 0;
  return Math.max(...ws) - Math.min(...ws);
}
function distinctChromaticColorsCss(css) {
  const set = new Set();
  const add = (r, g, b) => {
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum < 0.06 || lum > 0.96) return;
    if (hexToSat(r, g, b) > 0.12) set.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
  };
  for (const m of css.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const h = m[1];
    add(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
  }
  for (const m of css.matchAll(/#([0-9a-f]{3})\b/gi)) {
    const h = m[1];
    add(parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16));
  }
  for (const m of css.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/gi)) {
    add(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  return set.size;
}
// grid track ratio (max/min) from grid-template-columns fr weights.
function gridInfoCss(css) {
  let tracks = null;
  let ratio = 1;
  for (const m of css.matchAll(/grid-template-columns\s*:\s*([^;}]+)/gi)) {
    const val = m[1].toLowerCase();
    if (/repeat\s*\(/.test(val)) { if (!tracks) tracks = [1, 1]; continue; } // repeat(N,1fr)=symmetric
    const frs = [...val.matchAll(/([\d.]+)fr/g)].map((x) => parseFloat(x[1])).filter((x) => x > 0);
    if (frs.length >= 2) {
      const mn = Math.min(...frs), mx = Math.max(...frs);
      const r = mx / mn;
      if (r > ratio) { ratio = r; tracks = frs.slice(); }
    }
  }
  return { tracks, ratio };
}
function hasComposeTransformCss(css) {
  return /transform\s*:\s*[^;}]*(rotate|skew|matrix)/i.test(css);
}

function signalsFromCss(css) {
  const grid = gridInfoCss(css);
  const bodyFontPx = bodyFontSizeCss(css);
  return {
    fontStack: firstFamilyToken(css.match(/font-family\s*:\s*([^;}]+)/i)?.[1] || ""),
    rawStack: (css.match(/font-family\s*:\s*([^;}]+)/i)?.[1] || "").toLowerCase(),
    displayFontPx: maxFontSize(css),
    bodyFontPx,
    letterSpacing: maxLetterSpacingCss(css),
    lineHeight: 0, // not reliably parseable from static toys; neutral
    weightSpread: weightSpreadCss(css),
    saturation: maxSaturation(css),
    distinctChromaticColors: distinctChromaticColorsCss(css),
    gradient: hasGradientBg(css),
    gridTracks: grid.tracks,
    gridRatio: grid.ratio,
    sidebarLike: grid.tracks ? grid.ratio > 6 : false, // extreme fr ratio = functional rail
    transformComposed: hasComposeTransformCss(css),
    offCenterHero: false, // static CSS can't localize the heading; neutral
    whitespaceRatio: 0.5, // neutral baseline for toys/candidates
  };
}

// ---- geo front-end (real-site corpus): map the cached rich blob to signals ----
function signalsFromGeo(geo) {
  const tracks = Array.isArray(geo.gridTracks) ? geo.gridTracks.filter((x) => x > 0) : null;
  let ratio = 1;
  if (tracks && tracks.length >= 2) ratio = Math.max(...tracks) / Math.min(...tracks);
  return {
    rawStack: (geo.displayFont || "").toLowerCase(),
    fontStack: firstFamilyToken(geo.displayFont || ""),
    displayFontPx: geo.maxFont || 16,
    bodyFontPx: geo.bodyFontPx || 16,
    letterSpacing: Math.abs(geo.displayLetterSpacing || 0),
    lineHeight: geo.displayLineHeight || 0,
    weightSpread: Math.max(0, (geo.weightMax || 400) - (geo.weightMin || 400)),
    saturation: geo.boldestSat || 0,
    distinctChromaticColors: geo.distinctChromaticColors || 0,
    gradient: !!geo.gradient,
    gridTracks: tracks,
    gridRatio: ratio,
    sidebarLike: !!geo.sidebarLike || (tracks && ratio > 6),
    transformComposed: !!geo.transformComposed,
    offCenterHero: !!geo.offCenterHero,
    whitespaceRatio: typeof geo.whitespaceRatio === "number" ? geo.whitespaceRatio : 0.5,
  };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// FEATURE 1 — intentional_asymmetry: reward COMPOSITIONAL (deliberate, moderate)
// grid asymmetry and DISCOUNT the incidental asymmetry of a functional nav/sidebar
// (a narrow rail beside wide content). On the real corpus the offending generics
// are exactly the extreme-ratio rails — railway 1:29, shadcn 1:11, supabase 1:10 —
// which the naive `asymmetric_grid` scored as fully distinctive. A moderate,
// deliberate fr split (~1.2:1 … 3:1, e.g. an editorial 5:2) reads as composition;
// an extreme rail or a detected app-shell sidebar is incidental → 0.
// (transform/off-axis signals were captured too but fire on generics — vercel,
// clerk, pocket — as often as distinctives, so they do not discriminate on the
// real corpus and are deliberately excluded from the score.)
export function intentionalAsymmetry(s) {
  const symmetric = !s.gridTracks || s.gridRatio <= 1.15;
  const functionalRail = s.sidebarLike || s.gridRatio > 6; // app chrome / narrow rail
  if (symmetric || functionalRail) return 0;
  return clamp01((s.gridRatio - 1.15) / (3 - 1.15));
}

// FEATURE 2 — minimal_polish: distinctiveness-through-RESTRAINT that gross geometry
// misses. A CONJUNCTION gated on (a) a deliberate NON-DEFAULT typeface and (b)
// GENEROUS whitespace — the axis that empirically separates modern-minimal
// distinctives (are.na ws .73, cosmos .78, aworkinglibrary .71) from the clean-but-
// cramped generic Tailwind templates (radiant .27, studio .17, salient .03), which
// gross geometry reads as identical. Supported by palette restraint (few distinct
// chromatics) and deliberate typography (tracking / display-scale / weight spread /
// unusual leading). A generic default-font page scores 0 by the typeface gate; a
// cramped custom-font template scores 0 by the whitespace gate. Attacks failure
// mode 2 (are.na/cosmos/pudding scoring spuriously low).
export function minimalPolish(s) {
  const custom = isCustomType(s.rawStack || s.fontStack) ? 1 : 0;
  if (!custom) return 0; // default typeface ⇒ not polish-distinctive, by construction

  // generous negative space (gate): 0.4→0, 0.85→1.
  const space = clamp01((s.whitespaceRatio - 0.4) / (0.85 - 0.4));
  if (space === 0) return 0; // cramped ⇒ template density, not editorial restraint

  const paletteSupport = clamp01(1 - s.distinctChromaticColors / 8); // few, deliberate hues

  // deliberate typography: tracked letters, strong display/body scale, weight
  // spread, or unusual leading.
  const tracked = s.letterSpacing >= 0.5 ? clamp01(s.letterSpacing / 2) : 0;
  const typeScale = clamp01((s.displayFontPx / Math.max(1, s.bodyFontPx) - 2) / (5 - 2));
  const weightVar = clamp01(s.weightSpread / 300);
  const leading = s.lineHeight && (s.lineHeight <= 1.15 || s.lineHeight >= 1.7) ? 0.5 : 0;
  const typeSupport = clamp01(Math.max(tracked, typeScale, weightVar, leading));

  const support = clamp01(0.5 + 0.3 * paletteSupport + 0.2 * typeSupport);
  // multiplicative CONJUNCTION: both gates must pass; support modulates magnitude.
  return clamp01(custom * space * support);
}

// ---- assemble the feature vector -------------------------------------------
export function extractFeatures(file) {
  const html = readFileSync(file, "utf8");
  const css = cssText(html);
  const findings = runDetect(file);

  // Prefer the cached RICH geo blob (real-site corpus) for the two failure-mode
  // features; fall back to the CSS parse for toys / self-contained candidates.
  const geoPath = file.replace(/\.html?$/i, ".geo.json");
  let signals;
  let signalSource;
  if (geoPath !== file && existsSync(geoPath)) {
    signals = signalsFromGeo(JSON.parse(readFileSync(geoPath, "utf8")));
    signalSource = "geo";
  } else {
    signals = signalsFromCss(css);
    signalSource = "css";
  }

  const overused = findings.some((f) => f.antipattern === "overused-font");
  const slopCount = findings.filter((f) => f.category === "slop").length;

  const fontClass = primaryFontClass(css);
  const radius = maxBorderRadius(css);
  const centered = isCentered(css);
  const gradient = hasGradientBg(css);
  const borderW = maxBorderWidth(css);
  const bigType = maxFontSize(css);
  const sat = maxSaturation(css);

  const intentAsym = intentionalAsymmetry(signals);
  const polish = minimalPolish(signals);

  const features = {
    serif_or_display: fontClass !== "sans" ? 1 : 0,
    no_overused_font: overused ? 0 : 1,
    square_corners: 1 - Math.min(radius, 16) / 16, // 0px→1, >=16px→0
    intentional_asymmetry: intentAsym,
    not_centered: centered ? 0 : 1,
    no_gradient_bg: gradient ? 0 : 1,
    heavy_rules: Math.min(borderW, 6) / 6, // >=6px → 1
    display_scale: Math.max(0, Math.min(1, (bigType - 44) / (104 - 44))), // 44px→0, 104px→1
    bold_palette: sat, // 0..1 saturation of boldest chromatic color
    minimal_polish: polish,
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
    signalSource,
    signals,
    raw: { radius, borderW, bigType, sat, intentAsym, polish, centered, gradient },
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
