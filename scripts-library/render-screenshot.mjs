// render-screenshot.mjs — the shared REAL-PIXELS render primitive for the pack.
// Renders a candidate HTML file (or a live URL) to a real, size-bounded PNG via
// the same Puppeteer install snapshot.mjs uses. Three consumers:
//   1. reference capture (external URLs → visual reference inputs)
//   2. the self-check loop (a candidate's own render, fed back to the model)
//   3. the human contact sheet (real thumbnails, replacing the stub SVG)
//
// Size is bounded on purpose: these PNGs get base64'd into a model request, so a
// full 12000px page would blow the context/token budget. We cap the render width
// and the captured height so the image stays a faithful-but-compact view.
//
//   node render-screenshot.mjs <input> <out_png> [mode] [width] [maxHeight]
//     input      a local .html file path OR an http(s) URL
//     out_png    where to write the PNG
//     mode       "fold" (viewport only, default) | "full" (whole page, height-capped)
//     width      viewport width px (default 1280)
//     maxHeight  for mode=full, cap the captured height px (default 4000)
//
// Emits on stdout: { ok, out, mode, width, bytes }  (ok:false + reason on failure)
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { statSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolve Puppeteer exactly like snapshot.mjs does (impeccable's bundled npx install
// or a PUPPETEER_DIR), so the pack has ONE browser dependency story.
function resolvePuppeteer() {
  if (process.env.PUPPETEER_DIR) {
    const require = createRequire(join(process.env.PUPPETEER_DIR, "x.js"));
    return require("puppeteer");
  }
  const require = createRequire(import.meta.url);
  try {
    return require("puppeteer");
  } catch {
    // Fall back to the impeccable-bundled npx cache location snapshot.mjs targets.
    const { homedir } = require("node:os");
    const { readdirSync } = require("node:fs");
    const npx = join(homedir(), ".npm", "_npx");
    for (const hash of readdirSync(npx)) {
      const p = join(npx, hash, "node_modules", "puppeteer");
      if (existsSync(p)) {
        const r = createRequire(join(npx, hash, "node_modules", "x.js"));
        return r("puppeteer");
      }
    }
    throw new Error("PUPPETEER_UNRESOLVED");
  }
}

async function main() {
  const [input, outPng, modeArg, widthArg, maxHArg] = process.argv.slice(2);
  if (!input || !outPng) {
    console.error("usage: node render-screenshot.mjs <input> <out_png> [fold|full] [width] [maxHeight]");
    process.exit(2);
  }
  const mode = modeArg === "full" ? "full" : "fold";
  const width = parseInt(widthArg || "1280", 10) || 1280;
  const maxHeight = parseInt(maxHArg || "4000", 10) || 4000;
  const url = /^https?:\/\//i.test(input) ? input : pathToFileURL(input).href;

  let puppeteer;
  try {
    puppeteer = resolvePuppeteer();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, reason: "PUPPETEER_UNRESOLVED", message: String(e.message || e) }));
    process.exit(0);
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
    // let fade-in / late CSS settle
    await new Promise((r) => setTimeout(r, 700));

    if (mode === "full") {
      // Cap the captured height so a very long page stays a bounded image.
      const fullH = await page.evaluate(() => document.documentElement.scrollHeight);
      const clipH = Math.min(fullH, maxHeight);
      await page.screenshot({ path: outPng, clip: { x: 0, y: 0, width, height: clipH } });
    } else {
      await page.screenshot({ path: outPng, fullPage: false });
    }
    const bytes = existsSync(outPng) ? statSync(outPng).size : 0;
    console.log(JSON.stringify({ ok: bytes > 0, out: outPng, mode, width, bytes }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, reason: "RENDER_FAILED", url, message: String(e.message || e) }));
  } finally {
    await browser.close();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch((e) => { console.log(JSON.stringify({ ok: false, reason: "RENDER_FAILED", message: String(e) })); process.exit(0); });
