// reference-dna.mjs — GROUND the operator's reference URLs in their REAL structural
// DNA. For each reference site the pack captures a geometry snapshot (snapshot.mjs,
// Puppeteer) and extracts the SAME structural features the scorer uses
// (features.mjs), then distils them into the closed seed vocabulary the research
// front-end and scorer speak (type / grid / palette / gradient / corners / rules).
// This is how "emulate bizgen/labflox/Labout" becomes grounded fact instead of the
// model guessing from a name it has never seen.
//
//   node reference-dna.mjs <refs_json> <out_dir>
//     refs_json  JSON array of { name, url } (or a path to such a file)
//     out_dir    where to write each ref-<name>.html snapshot
//
// Emits on stdout: { reference_dna: "<multiline grounded DNA>", refs: [ {name,url,ok,dna,raw} ] }
// A single ref that fails to capture is recorded ok:false (not a crash) so the
// others still ground the run.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotUrl } from "./snapshot.mjs";
import { extractFeatures } from "./features.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function classify(fx) {
  const f = fx.features;
  const d = fx.detect;
  return {
    type: d.font_class, // serif | sans | mono | display
    grid: f.intentional_asymmetry > 0 ? "asymmetric" : "symmetric",
    composition: f.not_centered >= 1 ? "off-center" : "centered",
    palette: f.bold_palette >= 0.6 ? "bold" : "restrained",
    gradient: f.no_gradient_bg >= 1 ? "none" : "subtle",
    corners: f.square_corners >= 0.75 ? "square" : "round",
    rules: f.heavy_rules >= 0.5 ? "heavy" : "light",
    display_scale: Number(f.display_scale?.toFixed?.(2) ?? f.display_scale),
    bold_palette: Number(f.bold_palette?.toFixed?.(2) ?? f.bold_palette),
  };
}

async function main() {
  const refsArg = process.argv[2];
  const outDir = process.argv[3];
  if (!refsArg || !outDir) {
    console.error("usage: node reference-dna.mjs <refs_json> <out_dir>");
    process.exit(2);
  }
  let refs;
  try {
    const raw = existsSync(refsArg) ? readFileSync(refsArg, "utf8") : refsArg;
    refs = JSON.parse(raw);
  } catch (e) {
    console.error(JSON.stringify({ error: "REFS_UNPARSEABLE", message: e.message }));
    process.exit(2);
  }
  if (!Array.isArray(refs) || refs.length === 0) {
    // No references is legal — just emit empty grounding.
    console.log(JSON.stringify({ reference_dna: "", refs: [] }));
    return;
  }

  const results = [];
  for (const r of refs) {
    const name = (r && r.name) || "ref";
    const url = r && r.url;
    if (!url) { results.push({ name, url: "", ok: false, error: "NO_URL" }); continue; }
    const snapPath = join(outDir, `ref-${name}.html`);
    try {
      const { html } = await snapshotUrl(url, { timeoutMs: 60000 });
      writeFileSync(snapPath, html);
      const fx = extractFeatures(snapPath);
      const dna = classify(fx);
      results.push({ name, url, ok: true, dna, snapshot: snapPath });
    } catch (e) {
      results.push({ name, url, ok: false, error: String((e && e.message) || e) });
    }
  }

  const lines = results.map((r) =>
    r.ok
      ? `- ${r.name} (${r.url}): type=${r.dna.type}, grid=${r.dna.grid}, composition=${r.dna.composition}, ` +
        `palette=${r.dna.palette}, gradient=${r.dna.gradient}, corners=${r.dna.corners}, rules=${r.dna.rules}` +
        ` [display_scale=${r.dna.display_scale}, bold_palette=${r.dna.bold_palette}]`
      : `- ${r.name} (${r.url}): CAPTURE_FAILED (${r.error}) — not grounded; ignore in seeding`
  );
  const reference_dna =
    "Structural DNA extracted from the actual reference sites (grounded, not guessed):\n" +
    lines.join("\n");

  console.log(JSON.stringify({ reference_dna, refs: results }));
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch((e) => { console.error(String(e)); process.exit(1); });
