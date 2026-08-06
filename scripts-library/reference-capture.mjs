// reference-capture.mjs — GATHER the operator's external references + internal
// moodboard into ONE grounded visual set the front-end (and, later, generation)
// can actually SEE, plus the measured structural DNA of the reference sites.
//
// Two inputs, one job:
//   1. external references {name,url} → a bounded reference SCREENSHOT each
//      (render-screenshot.mjs, fold 1280), so the model sees what the site looks
//      like — not a name it has to guess from.
//   2. internal moodboard images (abs paths the operator dropped in) → validated
//      and carried through as-is.
// Then the reference URLs also go through reference-dna.mjs to extract the
// closed-vocabulary structural DNA (type/grid/palette/…) that CORROBORATES the
// visuals with measured fact.
//
//   node reference-capture.mjs <refs_json> <internal_images_json> <out_dir> <scripts_dir>
//     refs_json             JSON array (or path to one) of { name, url } externals
//     internal_images_json  JSON array of ABSOLUTE image paths (may be [])
//     out_dir               where ref-<name>.png screenshots are written
//     scripts_dir           abs path to this pack's scripts-library/ (holds the
//                           render-screenshot.mjs + reference-dna.mjs helpers)
//
// Emits on stdout EXACTLY:
//   { reference_images, reference_images_json, reference_dna, notes }
//   - reference_images       array of abs paths: ref screenshots THEN internal images
//   - reference_images_json  JSON.stringify of that SAME array (a STRING — so it
//                            flows through the engine `images:` array-flatten)
//   - reference_dna          measured structural DNA text ("" when no refs)
//   - notes                  per-item skips/failures (never crashes on one bad ref)
//
// A single capture failure (bad URL, missing image) is SKIPPED with a note — the
// run stays grounded in whatever DID capture, never aborting the whole gather.
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

function parseJsonArg(arg, label, notes) {
  if (!arg) return [];
  let raw = arg;
  try {
    if (existsSync(arg)) raw = readFileSync(arg, "utf8");
  } catch {
    /* treat as inline */
  }
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) {
      notes.push(`${label}: not a JSON array — ignored`);
      return [];
    }
    return v;
  } catch (e) {
    notes.push(`${label}: unparseable JSON (${e.message}) — ignored`);
    return [];
  }
}

function main() {
  const [refsArg, internalArg, outDir, scriptsDir] = process.argv.slice(2);
  if (!outDir || !scriptsDir) {
    console.error("usage: node reference-capture.mjs <refs_json> <internal_images_json> <out_dir> <scripts_dir>");
    process.exit(2);
  }
  const notes = [];
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* best effort */
  }

  const refs = parseJsonArg(refsArg, "reference_urls", notes);
  const internal = parseJsonArg(internalArg, "internal_images", notes);

  const renderer = join(scriptsDir, "render-screenshot.mjs");
  const referenceImages = [];

  // 1. External references → bounded screenshots (fold 1280).
  for (const r of refs) {
    const name = (r && r.name) || "ref";
    const url = r && r.url;
    if (!url) {
      notes.push(`ref ${name}: no url — skipped`);
      continue;
    }
    const outPng = join(outDir, `ref-${name}.png`);
    try {
      const stdout = execFileSync(
        "node",
        [renderer, url, outPng, "fold", "1280"],
        { encoding: "utf8", timeout: 120000 }
      );
      let ok = false;
      try {
        ok = JSON.parse(stdout.trim().split("\n").pop()).ok === true;
      } catch {
        ok = existsSync(outPng);
      }
      if (ok && existsSync(outPng)) {
        referenceImages.push(outPng);
      } else {
        notes.push(`ref ${name} (${url}): capture failed — skipped`);
      }
    } catch (e) {
      notes.push(`ref ${name} (${url}): capture error (${String((e && e.message) || e).split("\n")[0]}) — skipped`);
    }
  }

  // 2. Internal moodboard images → validate existence, carry as-is.
  for (const p of internal) {
    if (typeof p !== "string" || !p) {
      notes.push(`internal image: non-string entry — skipped`);
      continue;
    }
    if (!isAbsolute(p)) {
      notes.push(`internal image ${p}: not an absolute path — skipped`);
      continue;
    }
    if (!existsSync(p)) {
      notes.push(`internal image ${p}: file not found — skipped`);
      continue;
    }
    referenceImages.push(p);
  }

  // 3. Structural DNA from the reference SITES (measured, not guessed).
  let referenceDna = "";
  if (refs.length > 0) {
    const dnaTool = join(scriptsDir, "reference-dna.mjs");
    try {
      const stdout = execFileSync(
        "node",
        [dnaTool, JSON.stringify(refs), outDir],
        { encoding: "utf8", timeout: 240000 }
      );
      const parsed = JSON.parse(stdout.trim().split("\n").pop());
      referenceDna = parsed.reference_dna || "";
    } catch (e) {
      notes.push(`reference-dna: failed (${String((e && e.message) || e).split("\n")[0]}) — DNA empty`);
    }
  }

  console.log(
    JSON.stringify({
      reference_images: referenceImages,
      reference_images_json: JSON.stringify(referenceImages),
      reference_dna: referenceDna,
      notes,
    })
  );
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
