// snapshot.mjs — render a REAL live URL and capture its design GEOMETRY from the
// COMPUTED styles of the rendered page (spec §3: the feature vector is "parsed
// from the rendered page"), then emit a SELF-CONTAINED HTML snapshot whose inline
// CSS reproduces that geometry in the exact patterns features.mjs already parses.
//
// Why a snapshot instead of feeding the live DOM to features.mjs directly:
// features.mjs regex-parses INLINE CSS — the representation of a generator
// candidate (self-contained HTML w/ inline styles). Real websites ship external
// stylesheets + utility classes, so that regex would see NOTHING on a live page.
// Rendering to computed styles and re-inlining them keeps ONE feature space, so
// extractFeatures() works IDENTICALLY on toy fixtures, generator candidates, and
// real-site snapshots — which is exactly what makes the calibration commensurable.
//
// The REAL font stack is preserved so `impeccable detect`'s overused-font signal
// still fires on the snapshot the way it would on the live page.
//
// Deterministic: no LLM. Puppeteer is reused from impeccable's bundled install.

import { createRequire } from "node:module";
import { readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---- resolve puppeteer from impeccable's bundled npx install ----------------
function resolvePuppeteer() {
  // Allow an explicit override.
  if (process.env.PUPPETEER_DIR) {
    const require = createRequire(join(process.env.PUPPETEER_DIR, "x.js"));
    return require("puppeteer");
  }
  const npx = join(homedir(), ".npm", "_npx");
  if (existsSync(npx)) {
    for (const hash of readdirSync(npx)) {
      const p = join(npx, hash, "node_modules", "puppeteer");
      if (existsSync(p)) {
        const require = createRequire(join(npx, hash, "node_modules", "x.js"));
        return require("puppeteer");
      }
    }
  }
  // last resort: resolve from wherever node can find it
  const require = createRequire(import.meta.url);
  return require("puppeteer");
}

// ---- in-page computed-geometry extraction -----------------------------------
// Runs in the browser context. Returns raw geometry signals; the Node side turns
// them into the features.mjs-parseable snapshot.
function pageGeometry() {
  const px = (v) => parseFloat(v) || 0;
  const vis = Array.from(document.querySelectorAll("body *")).filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none";
  });

  const cs = (el) => getComputedStyle(el);

  // primary/display font = font of the element carrying the largest rendered text.
  let displayFont = cs(document.body).fontFamily;
  let displayAlign = cs(document.body).textAlign;
  let maxFontEl = 0;
  let maxFont = 0;
  for (const el of vis) {
    const s = cs(el);
    const fs = px(s.fontSize);
    if (fs > maxFont) maxFont = fs;
    const hasText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 1
    );
    if (hasText && fs > maxFontEl) {
      maxFontEl = fs;
      displayFont = s.fontFamily;
      displayAlign = s.textAlign;
    }
  }

  // max corner radius across elements.
  let maxRadius = 0;
  for (const el of vis) {
    const s = cs(el);
    for (const p of [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius",
    ]) {
      const v = px(s[p]);
      if (v > maxRadius) maxRadius = v;
    }
  }

  // asymmetric grid: any display:grid whose column tracks are meaningfully unequal.
  let gridTracks = null; // normalized fr ratios
  let asymFound = false;
  for (const el of vis) {
    const s = cs(el);
    if (!s.display.includes("grid")) continue;
    const tracks = s.gridTemplateColumns
      .split(/\s+/)
      .map(px)
      .filter((x) => x > 0);
    if (tracks.length < 2) continue;
    const mn = Math.min(...tracks);
    const mx = Math.max(...tracks);
    if (mn > 0 && mx - mn > 1 && mx / mn > 1.15) {
      // normalize to small integer fr ratios
      gridTracks = tracks.map((t) => Math.max(1, Math.round(t / mn)));
      asymFound = true;
      break;
    }
    if (!gridTracks) gridTracks = tracks.map(() => 1); // symmetric seen
  }

  // gradient background anywhere.
  let gradient = false;
  for (const el of vis) {
    const bi = cs(el).backgroundImage;
    if (bi && bi.includes("gradient")) {
      gradient = true;
      break;
    }
  }

  // max VISIBLE border width (border-style not none).
  let maxBorderW = 0;
  for (const el of vis) {
    const s = cs(el);
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (s["border" + side + "Style"] !== "none") {
        const w = px(s["border" + side + "Width"]);
        if (w > maxBorderW) maxBorderW = w;
      }
    }
  }

  // boldest chromatic color (ported saturation calc), scanning color/bg/border.
  const sat = (r, g, b) => {
    const mx = Math.max(r, g, b) / 255;
    const mn = Math.min(r, g, b) / 255;
    if (mx === mn) return 0;
    const l = (mx + mn) / 2;
    const d = mx - mn;
    return l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  };
  const parseRgb = (str) => {
    const m = str && str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    if (!m) return null;
    const a = str.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
    if (a && parseFloat(a[1]) < 0.1) return null; // transparent
    return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  };
  let boldest = null;
  let boldestSat = 0;
  for (const el of vis) {
    const s = cs(el);
    for (const prop of ["color", "backgroundColor", "borderTopColor"]) {
      const rgb = parseRgb(s[prop]);
      if (!rgb) continue;
      const [r, g, b] = rgb;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.06 || lum > 0.96) continue; // ignore near-black/white structure
      const sv = sat(r, g, b);
      if (sv > boldestSat) {
        boldestSat = sv;
        boldest = [Math.round(r), Math.round(g), Math.round(b)];
      }
    }
  }

  // background color of the body (fallback when no gradient).
  const bodyBg = cs(document.body).backgroundColor;

  return {
    displayFont,
    displayAlign,
    maxFont,
    maxRadius,
    gridTracks,
    asymFound,
    gradient,
    maxBorderW,
    boldest,
    boldestSat,
    bodyBg,
  };
}

const rgbToHex = (rgb) =>
  rgb ? "#" + rgb.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("") : null;

// ---- render the geometry into a features.mjs-parseable snapshot -------------
export function renderSnapshot(geo, sourceUrl) {
  const font = (geo.displayFont || "sans-serif").replace(/"/g, "'");
  const align = /center/i.test(geo.displayAlign || "") ? "center" : "left";
  const maxFont = Math.round(geo.maxFont || 16);
  const radius = Math.round(Math.min(geo.maxRadius || 0, 9999));
  const borderW = Math.round(geo.maxBorderW || 0);
  const cols =
    geo.gridTracks && geo.gridTracks.length >= 2
      ? geo.gridTracks.map((t) => `${t}fr`).join(" ")
      : "1fr 1fr";
  const accent = rgbToHex(geo.boldest) || "#111111";
  const bg = geo.gradient
    ? "linear-gradient(135deg,#111,#333)" // presence marker; magnitude not used
    : geo.bodyBg && geo.bodyBg.startsWith("rgb")
    ? geo.bodyBg
    : "#ffffff";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>snapshot</title>
<style>
body{font-family:${font};background:${bg};color:#111;margin:0}
.hero{text-align:${align};padding:40px}
.display{font-family:${font};font-size:${maxFont}px;margin:0}
.layout{display:grid;grid-template-columns:${cols};gap:16px;padding:40px}
.card{border-radius:${radius}px;padding:24px;background:#f4f4f4}
.rule{border:${borderW}px solid #111}
.accent{color:${accent};padding:0 40px}
</style></head>
<body>
<!-- computed-geometry snapshot of ${sourceUrl} -->
<header class="hero"><h1 class="display">Rendered geometry snapshot</h1></header>
<main class="layout"><section class="card rule">column a</section><section class="card">column b</section></main>
<p class="accent">accent sample</p>
</body></html>
`;
}

// ---- drive puppeteer over one URL -------------------------------------------
export async function snapshotUrl(url, { timeoutMs = 45000, viewport = { width: 1280, height: 800 } } = {}) {
  const puppeteer = resolvePuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
    // let late CSS/webfonts settle
    await new Promise((r) => setTimeout(r, 1200));
    const geo = await page.evaluate(pageGeometry);
    return { geo, html: renderSnapshot(geo, url) };
  } finally {
    await browser.close();
  }
}

// ---- CLI: node snapshot.mjs <url> <outfile> ---------------------------------
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [url, out] = process.argv.slice(2);
  if (!url || !out) {
    console.error("usage: node snapshot.mjs <url> <outfile.html>");
    process.exit(2);
  }
  snapshotUrl(url)
    .then(({ geo, html }) => {
      writeFileSync(out, html);
      console.error(JSON.stringify({ ok: true, url, out, geo }, null, 2));
    })
    .catch((err) => {
      console.error(JSON.stringify({ ok: false, url, error: String(err && err.message || err) }));
      process.exit(1);
    });
}
