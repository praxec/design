#!/usr/bin/env node
// audit-design-system.mjs — the DETERMINISTIC audit/detect stage of
// flow.design-system (the design-system LIFECYCLE flow, distinct from rollout
// which PROPAGATES an already-blessed system). Given a target repo, its central
// stylesheet, and its components dir, compute the deterministic signals a human
// (or the branch gate) needs to decide whether a real ATOMIC design system
// already EXISTS — and, if it does, what is MISSING (the gaps to hone).
//
//   node audit-design-system.mjs <repo_root> [token_target] [components_dir]
//     token_target    repo-relative central stylesheet (default src/styles/global.css)
//     components_dir   repo-relative shared-components dir (default src/components)
//
//   → { exists, spacing_scale_present, base_tokens_present, adhoc_px,
//       near_duplicates, component_files, gaps }
//
//   spacing_scale_present  the central stylesheet's :root defines a real spacing
//                          SCALE — >= SCALE_MIN distinct spacing custom properties
//                          (--space-*/--gap-*/--gutter-*/…). One-off vars are not a
//                          scale.
//   adhoc_px               distinct hardcoded padding/margin/gap px values across
//                          the stylesheet + component files, each { value, count,
//                          locations: [{ file, line }] } — the raw material a
//                          spacing scale replaces, WITH the exact sites to edit.
//   near_duplicates        the actual duplicated declaration bodies that recur
//                          across >1 selector, each { body, occurrences:
//                          [{ file, selector }] } — the copy-pasted blocks to
//                          consolidate, WITH where they live.
//   component_files        the shared component files under components_dir (repo-
//                          relative) — the atomic building blocks.
//   exists                 heuristic: a real atomic system already exists iff the
//                          spacing scale is present AND there are >= 2 shared
//                          component files. Drives create (false) vs hone (true).
//   gaps                   human-readable holes to close (missing scale, N ad-hoc px
//                          values, near-duplicate rule blocks, too-few components).
//
// LLM-free, offline, read-only. Fail-fast: exit 2 NO_INPUT (no repo_root). A
// missing stylesheet / components dir is NOT a crash — it is a first-class signal
// (absent scale, empty component set) the audit reports.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, isAbsolute, extname } from "node:path";

// A spacing SCALE is >= this many distinct spacing custom properties (a single
// --gap is not a scale). Kept in one place so the audit + the systematize
// verifier agree on what "a scale exists" means.
export const SCALE_MIN = 3;

// Component file extensions we count as a shared atomic building block.
const COMPONENT_EXTS = new Set([".astro", ".tsx", ".jsx", ".vue", ".svelte"]);

// Dirs we never descend into when walking the repo.
const SKIP_DIRS = new Set(["node_modules", ".git", ".astro", "dist", "build", ".next", ".cache", "coverage"]);

// ---- spacing-scale detection ------------------------------------------------
// A spacing custom property is a `--<name>: …` whose name reads as a spacing
// step (space/spacing/sp/gap/gutter/stack/inset/inline/block-spacing). We count
// DISTINCT such property names; >= SCALE_MIN of them is a real scale.
const SPACING_PROP_RE = /(--(?:space|spacing|sp|gap|gutter|stack|inset)[\w-]*)\s*:/gi;

export function detectSpacingScale(cssText) {
  const tokens = new Set();
  let m;
  SPACING_PROP_RE.lastIndex = 0;
  while ((m = SPACING_PROP_RE.exec(String(cssText))) !== null) {
    tokens.add(m[1].toLowerCase());
  }
  const list = [...tokens];
  return { present: list.length >= SCALE_MIN, count: list.length, tokens: list };
}

// ---- ad-hoc px harvest ------------------------------------------------------
// Every padding/margin/gap(-*) declaration's px literals, tallied by distinct
// px value. These are the hardcoded spacings a scale consolidates.
const SPACING_DECL_RE =
  /\b(?:padding|margin|gap|row-gap|column-gap|grid-gap|inset)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?\s*:\s*([^;{}]+)/gi;
const PX_RE = /(-?\d+(?:\.\d+)?)px/g;

export function collectAdhocPx(text) {
  const counts = new Map();
  let d;
  SPACING_DECL_RE.lastIndex = 0;
  while ((d = SPACING_DECL_RE.exec(String(text))) !== null) {
    const value = d[1];
    let p;
    PX_RE.lastIndex = 0;
    while ((p = PX_RE.exec(value)) !== null) {
      const px = parseFloat(p[1]);
      if (px === 0) continue; // 0 is scale-free; never ad-hoc
      counts.set(px, (counts.get(px) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value - b.value);
}

// LOCATED ad-hoc px harvest — the systematize agent needs WHERE each ad-hoc px
// lives, not just how many there are (otherwise it burns turns searching, since
// its file tool cannot grep a directory). Scans each source PER FILE and PER
// LINE so file boundaries survive: every distinct px value carries the exact
// { file, line } sites (repo-relative file, 1-based line) that declare it.
//   files: [{ file, text }]  →  [{ value, count, locations: [{ file, line }] }]
export function collectAdhocPxLocated(files) {
  const entries = new Map(); // px -> { count, locations: [] }
  for (const { file, text } of files) {
    const lines = String(text).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let d;
      SPACING_DECL_RE.lastIndex = 0;
      while ((d = SPACING_DECL_RE.exec(line)) !== null) {
        const value = d[1];
        let p;
        PX_RE.lastIndex = 0;
        while ((p = PX_RE.exec(value)) !== null) {
          const px = parseFloat(p[1]);
          if (px === 0) continue; // 0 is scale-free; never ad-hoc
          if (!entries.has(px)) entries.set(px, { count: 0, locations: [] });
          const e = entries.get(px);
          e.count += 1;
          e.locations.push({ file, line: i + 1 });
        }
      }
    }
  }
  return [...entries.entries()]
    .map(([value, { count, locations }]) => ({ value, count, locations }))
    .sort((a, b) => b.count - a.count || a.value - b.value);
}

// ---- near-duplicate rule signal ---------------------------------------------
// Count declaration BODIES that recur across >1 selector — copy-pasted styling
// that a shared component would consolidate. Normalizes each `{ … }` body
// (declarations trimmed + sorted) and tallies bodies seen more than once.
export function nearDuplicateSignal(cssText) {
  const bodies = new Map();
  const RULE_RE = /\{([^{}]+)\}/g;
  let r;
  while ((r = RULE_RE.exec(String(cssText))) !== null) {
    const decls = r[1]
      .split(";")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0)
      .sort();
    if (decls.length < 2) continue; // trivial 1-decl blocks aren't a dup signal
    const key = decls.join(";");
    bodies.set(key, (bodies.get(key) || 0) + 1);
  }
  let dup = 0;
  for (const n of bodies.values()) if (n > 1) dup++;
  return dup;
}

// LOCATED near-duplicate harvest — the structured counterpart of
// nearDuplicateSignal: instead of just how MANY bodies recur, it returns the
// actual duplicated declaration bodies with WHERE they occur so the systematize
// agent can go straight to the copy-pasted blocks and consolidate them. For each
// `selector { … }` rule it records the preceding CSS selector; bodies seen under
// more than one selector-occurrence are the near-duplicates.
//   files: [{ file, text }]
//     → [{ body, occurrences: [{ file, selector }] }]
export function collectNearDuplicates(files) {
  const bodies = new Map(); // key -> { body, occurrences: [] }
  const RULE_RE = /([^{}]*)\{([^{}]+)\}/g;
  for (const { file, text } of files) {
    RULE_RE.lastIndex = 0;
    let r;
    while ((r = RULE_RE.exec(String(text))) !== null) {
      let sel = r[1];
      // In component templates (.astro/.jsx) the text before a `<style>` rule's
      // block includes markup; keep only what follows the style-boundary/last tag
      // so the selector is the CSS selector, not the surrounding HTML. Pure-CSS
      // child combinators (`.a > .b`) are untouched (no `<` markup present).
      if (/<\s*style|<\/?\w/.test(sel)) sel = sel.split(">").pop();
      const selector = sel.replace(/\s+/g, " ").trim();
      const rawDecls = r[2]
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const norm = rawDecls.map((s) => s.toLowerCase()).sort();
      if (norm.length < 2) continue; // trivial 1-decl blocks aren't a dup signal
      const key = norm.join(";");
      if (!bodies.has(key)) {
        bodies.set(key, { body: norm.join("; "), occurrences: [] });
      }
      bodies.get(key).occurrences.push({ file, selector });
    }
  }
  return [...bodies.values()].filter((b) => b.occurrences.length > 1);
}

// ---- base token-system detection --------------------------------------------
// A design system EXISTS when the central stylesheet defines a base TOKEN SET
// (custom properties for color/type/etc.) — INDEPENDENT of whether a SPACING
// scale is present. Count DISTINCT custom-property names anywhere in the sheet.
export const BASE_TOKENS_MIN = 4;
const CUSTOM_PROP_RE = /(--[\w-]+)\s*:/g;
export function detectBaseTokens(cssText) {
  const tokens = new Set();
  let m;
  CUSTOM_PROP_RE.lastIndex = 0;
  while ((m = CUSTOM_PROP_RE.exec(String(cssText))) !== null) {
    tokens.add(m[1].toLowerCase());
  }
  return { present: tokens.size >= BASE_TOKENS_MIN, count: tokens.size };
}

// ---- exists heuristic -------------------------------------------------------
// A real (if incomplete) atomic system EXISTS when the site has a base token
// set AND >= 2 shared components — REGARDLESS of whether a spacing scale is
// present. A missing spacing scale / ad-hoc px / near-duplicates are GAPS to
// HONE, never a reason to CREATE from scratch (which would discard the existing
// system). Only a site with neither a token set nor a component set is
// greenfield (create).
export function computeExists({ base_tokens_present, component_files }) {
  return base_tokens_present === true && Array.isArray(component_files) && component_files.length >= 2;
}

// ---- fs helpers -------------------------------------------------------------
function walkComponents(repoRoot, dirAbs) {
  const out = [];
  if (!existsSync(dirAbs)) return out;
  const stack = [dirAbs];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(join(cur, e.name));
      } else if (e.isFile() && COMPONENT_EXTS.has(extname(e.name))) {
        out.push(relative(repoRoot, join(cur, e.name)));
      }
    }
  }
  return out.sort();
}

function readIfExists(p) {
  try {
    if (existsSync(p) && statSync(p).isFile()) return readFileSync(p, "utf8");
  } catch {
    /* fall through */
  }
  return "";
}

// ---- the audit --------------------------------------------------------------
export function auditDesignSystem(repoRoot, tokenTarget = "src/styles/global.css", componentsDir = "src/components") {
  const abs = (rel) => (isAbsolute(rel) ? rel : join(repoRoot, rel));
  const cssPath = abs(tokenTarget);
  const componentsAbs = abs(componentsDir);

  const css = readIfExists(cssPath);
  const scale = detectSpacingScale(css);

  const component_files = walkComponents(repoRoot, componentsAbs);

  // Ad-hoc px + near-dup are harvested from the stylesheet AND the component
  // files (the two surfaces the systematize step is allowed to touch). Scanned
  // PER FILE so file boundaries survive — the located harvesters record the
  // exact { file, line } / { file, selector } sites the systematize agent edits
  // (no directory-wide searching required).
  const sources = [{ file: tokenTarget, text: css }];
  for (const rel of component_files) sources.push({ file: rel, text: readIfExists(abs(rel)) });
  const adhoc_px = collectAdhocPxLocated(sources);
  const near_duplicates = collectNearDuplicates(sources);
  const near_duplicate_count = near_duplicates.length;

  const spacing_scale_present = scale.present;
  const base = detectBaseTokens(css);
  const base_tokens_present = base.present;
  const exists = computeExists({ base_tokens_present, component_files });

  const gaps = [];
  if (!spacing_scale_present) {
    gaps.push(
      `No spacing scale in ${tokenTarget}: define a --space-* token set (found ${scale.count} spacing var(s), need >= ${SCALE_MIN}).`
    );
  }
  if (adhoc_px.length > 0) {
    const sample = adhoc_px
      .slice(0, 5)
      .map((a) => `${a.value}px×${a.count}`)
      .join(", ");
    gaps.push(`${adhoc_px.length} distinct ad-hoc padding/margin/gap px value(s) (${sample}): promote onto the spacing scale.`);
  }
  if (near_duplicate_count > 0) {
    gaps.push(`${near_duplicate_count} near-duplicate rule block(s): consolidate into shared components.`);
  }
  if (component_files.length < 2) {
    gaps.push(`Only ${component_files.length} shared component file(s) under ${componentsDir}: extract atomic shared components.`);
  }

  return { exists, spacing_scale_present, base_tokens_present, adhoc_px, near_duplicates, component_files, gaps };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const repoRoot = process.argv[2];
  if (!repoRoot) {
    console.error(
      JSON.stringify({ error: "NO_INPUT", message: "usage: node audit-design-system.mjs <repo_root> [token_target] [components_dir]" })
    );
    process.exit(2);
  }
  const tokenTarget = process.argv[3] || "src/styles/global.css";
  const componentsDir = process.argv[4] || "src/components";
  console.log(JSON.stringify(auditDesignSystem(repoRoot, tokenTarget, componentsDir)));
}
