#!/usr/bin/env node
// token-adherence.mjs — THE ANTI-REGRESSION HEART of flow.rollout (spec §4b,
// Increment IV-a). Given a rolled surface (html/css/astro) + the TOKEN CONTRACT
// (from capture-tokens.mjs), assert the surface uses ONLY the design system's
// palette + font stack. ANY off-system color (a hex / rgb() / rgba() not in the
// contract's palette) or any font family not in the contract's stack is a
// BLOCKING finding — a cheap model drifting back to off-system colors/fonts fails
// this gate and the rollout retries (bounded), or flags ROLLOUT_REGRESSED.
//
//   node token-adherence.mjs <artifact> <contract-json | contract.json path>
//     → { off_system: [{kind, value, line}], adherent: (off_system.length===0), count }
//
//   kind ∈ "color" | "font"; value = the offending literal as written; line = 1-based.
//
// Allowed, never flagged: the exact token hexes (any spelling — #RGB, #RRGGBB, or
// an rgb()/rgba() that resolves to a token hex), a fully-transparent color
// (alpha 0 / the `transparent`/`inherit`/`currentColor` keywords), and font
// families that appear in the contract's stack (incl. its generic tail, e.g.
// `serif`) plus the neutral `inherit`.
//
// Deterministic, LLM-free, offline. Fail-fast: exit 2 ARGS_UNSET (missing
// artifact/contract), exit 3 ARTIFACT_ABSENT (surface file does not exist),
// exit 4 CONTRACT_UNPARSEABLE / CONTRACT_EMPTY (no palette to enforce). A gate
// run that FINDS off-system tokens exits 0 — the finding is data the flow branches
// on (adherent:false), not a tool error.

import { existsSync, readFileSync } from "node:fs";

// ---- hex normalization: → lowercase 6-digit RRGGBB (alpha dropped) -----------
function normHex(raw) {
  let h = String(raw).replace(/^#/, "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // #RRGGBBAA → RRGGBB
  return h;
}

// ---- font family normalization: strip quotes, collapse ws, lowercase ---------
function normFamily(raw) {
  return String(raw).trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, " ").toLowerCase();
}

// A hex literal is transparent iff its alpha byte is 00 (#RRGGBB00 / #RGBA→A=0).
function hexIsTransparent(raw) {
  const h = String(raw).replace(/^#/, "").toLowerCase();
  if (h.length === 8) return h.slice(6) === "00";
  if (h.length === 4) return h[3] === "0";
  return false;
}

export function tokenAdherence(source, contract) {
  const colors = Array.isArray(contract && contract.colors) ? contract.colors : [];
  if (colors.length === 0) {
    const err = new Error("CONTRACT_EMPTY: the token contract carries no palette to enforce.");
    err.code = "CONTRACT_EMPTY";
    throw err;
  }
  const palette = new Set(colors.map((c) => normHex(c.hex)));
  const stacks = Array.isArray(contract && contract.fonts) ? contract.fonts : [];
  const allowedFonts = new Set(["inherit"]);
  for (const stack of stacks) {
    for (const fam of String(stack).split(",")) allowedFonts.add(normFamily(fam));
  }

  const lines = String(source).split(/\r?\n/);
  const off_system = [];

  const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
  const RGB_RE = /rgba?\(\s*([^)]*)\)/gi;
  const FONT_FAMILY_RE = /font-family\s*:\s*([^;}{\n]+)/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;

    // -- colors: hex literals --
    let m;
    HEX_RE.lastIndex = 0;
    while ((m = HEX_RE.exec(line)) !== null) {
      const raw = m[0];
      if (hexIsTransparent(raw)) continue; // alpha 0 == transparent, allowed
      if (!palette.has(normHex(raw))) {
        off_system.push({ kind: "color", value: raw, line: ln });
      }
    }

    // -- colors: rgb() / rgba() --
    RGB_RE.lastIndex = 0;
    while ((m = RGB_RE.exec(line)) !== null) {
      const parts = m[1].split(/[,\/]/).map((s) => s.trim()).filter(Boolean);
      const [r, g, b, a] = parts;
      const alpha = a === undefined ? 1 : parseFloat(a);
      if (alpha === 0) continue; // fully transparent, allowed
      const toByte = (v) => {
        if (v == null) return NaN;
        if (v.endsWith("%")) return Math.round((parseFloat(v) / 100) * 255);
        return parseInt(v, 10);
      };
      const hex = [r, g, b].map((v) => {
        const n = toByte(v);
        return Number.isNaN(n) ? "??" : n.toString(16).padStart(2, "0");
      }).join("");
      if (hex.includes("??") || !palette.has(hex)) {
        off_system.push({ kind: "color", value: m[0], line: ln });
      }
    }

    // -- fonts: font-family declarations --
    FONT_FAMILY_RE.lastIndex = 0;
    while ((m = FONT_FAMILY_RE.exec(line)) !== null) {
      for (const fam of m[1].split(",")) {
        const norm = normFamily(fam);
        if (!norm) continue;
        if (norm === "currentcolor" || norm === "transparent") continue;
        if (!allowedFonts.has(norm)) {
          off_system.push({ kind: "font", value: fam.trim(), line: ln });
        }
      }
    }
  }

  return { off_system, adherent: off_system.length === 0, count: off_system.length };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const artifact = process.argv[2];
  const contractArg = process.argv[3];
  if (!artifact || !contractArg) {
    console.error(JSON.stringify({ error: "ARGS_UNSET", message: "usage: node token-adherence.mjs <artifact> <contract-json|path>" }));
    process.exit(2);
  }
  if (!existsSync(artifact)) {
    console.error(JSON.stringify({ error: "ARTIFACT_ABSENT", artifact }));
    process.exit(3);
  }
  let contract;
  try {
    // The contract arg is either inline JSON or a path to a .json file.
    contract = existsSync(contractArg)
      ? JSON.parse(readFileSync(contractArg, "utf8"))
      : JSON.parse(contractArg);
  } catch (e) {
    console.error(JSON.stringify({ error: "CONTRACT_UNPARSEABLE", message: String(e.message) }));
    process.exit(4);
  }
  const source = readFileSync(artifact, "utf8");
  try {
    console.log(JSON.stringify(tokenAdherence(source, contract)));
  } catch (e) {
    if (e.code === "CONTRACT_EMPTY") {
      console.error(JSON.stringify({ error: "CONTRACT_EMPTY", message: e.message }));
      process.exit(4);
    }
    throw e;
  }
}
