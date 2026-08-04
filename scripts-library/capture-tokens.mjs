#!/usr/bin/env node
// capture-tokens.mjs — parse an approved design-system markdown into the
// canonical TOKEN CONTRACT the rollout gate (token-adherence) enforces (spec §4b,
// Increment IV-a). Deterministic, LLM-free, offline: the design system is the
// source of truth; this reduces it to the machine-checkable contract.
//
//   node capture-tokens.mjs <design-system.md>
//     → { colors: [{token, hex}], fonts: [stack], scale: [sizes] }
//
//   colors  every `--token #hex` row of the color-token table (the palette the
//           rolled surfaces may use — nothing else).
//   fonts   the design system's font family stack(s) (the `Family:` line) — the
//           ONLY font families a rolled surface may reference.
//   scale   the type-scale sizes (px numbers), ascending + deduped.
//
// This is the CAPTURE half of the anti-regression heart: token-adherence.mjs
// reads this contract and flags ANY off-system color/font a commodity model drifts
// back to. Single source of truth for BOTH halves is the design-system.md.
//
// Fail-fast: exit 2 NO_INPUT (no path arg), exit 3 NO_TOKENS (the markdown holds
// no `--token #hex` color rows — refuse to emit an empty, un-enforceable contract).

import { readFileSync } from "node:fs";

// ---- a color-token table row: `| `--ink` | #1f2330 | role |` -----------------
// A row contributes iff it carries BOTH a `--token` AND a hex on the same line
// (so the `--fs-caption … --fs-display` prose note — tokens without a hex — is
// never mistaken for a color). 3- and 6-digit hexes both accepted.
const TOKEN_RE = /(--[a-z0-9-]+)/i;
const HEX_RE = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i;

export function captureTokens(markdown) {
  const lines = String(markdown).split(/\r?\n/);

  // Colors — the palette.
  const colors = [];
  const seen = new Set();
  for (const line of lines) {
    const t = line.match(TOKEN_RE);
    const h = line.match(HEX_RE);
    if (!t || !h) continue;
    const token = t[1];
    const hex = `#${h[1].toLowerCase()}`;
    const key = `${token}=${hex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push({ token, hex });
  }

  // Fonts — the `Family:` line's backticked stack(s). Every `Family:` line that
  // carries a backticked value contributes one stack string.
  const fonts = [];
  for (const line of lines) {
    if (!/family\s*:/i.test(line)) continue;
    const m = line.match(/`([^`]+)`/);
    if (m) fonts.push(m[1].trim());
  }

  // Scale — every px size on a `Scale` line, ascending + deduped (numbers).
  const scaleSet = new Set();
  for (const line of lines) {
    if (!/scale/i.test(line)) continue;
    const nums = line.match(/\d+(?:\.\d+)?/g);
    if (nums) for (const n of nums) scaleSet.add(parseFloat(n));
  }
  const scale = [...scaleSet].sort((a, b) => a - b);

  if (colors.length === 0) {
    const err = new Error(
      "NO_TOKENS: the design-system markdown holds no `--token #hex` color rows; " +
        "refusing to emit an empty, un-enforceable token contract."
    );
    err.code = "NO_TOKENS";
    throw err;
  }

  return { colors, fonts, scale };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    console.error(JSON.stringify({ error: "NO_INPUT", message: "usage: node capture-tokens.mjs <design-system.md>" }));
    process.exit(2);
  }
  let md;
  try {
    md = readFileSync(path, "utf8");
  } catch (e) {
    console.error(JSON.stringify({ error: "NO_INPUT", message: String(e.message) }));
    process.exit(2);
  }
  try {
    // Wrap as { tokens: {...} } (mirrors contact-sheet.mjs's { contact_sheet: {...} })
    // so the cap maps `$.output.json.tokens` → the `tokens` slot.
    console.log(JSON.stringify({ tokens: captureTokens(md) }));
  } catch (e) {
    if (e.code === "NO_TOKENS") {
      console.error(JSON.stringify({ error: "NO_TOKENS", message: e.message }));
      process.exit(3);
    }
    throw e;
  }
}
