// contact-sheet.mjs — the PRUNE-AND-STEER presentation core (spec §6b).
//
// "Presentation = the browser": the render step already writes each candidate to
// a standalone HTML file. This deterministic core composes the ELIGIBLE spread
// into ONE self-contained local `contact-sheet.html` — a labelled grid, one cell
// per candidate: its stub/real thumbnail, id + name, G / fit badges, a
// quality-flags line (non-blocking `warnings` the human should see), and a link
// to the full candidate render. Side-by-side compare is native (one page; open
// cells in tabs). No external assets, no network — the sheet degrades to a file
// the human just opens (`browser` MCP is an OPTIONAL walk-through, not required).
//
// It is the taste-authority surface: the header states the four verdicts
// (keep / branch / compose / reject) and asks what the human likes/dislikes about
// each — those reactions become the annealing STEER for the next divergence.
//
// SINGLE SOURCE OF TRUTH: `buildContactSheet(candidates, outDir)` is the tested
// logic; the CLI + the `gate.build-contact-sheet` wrapper are thin shells over it.
//
// Candidate shape = the eligible-set record the flow accumulates
// (cap.inspect.collect-candidate → $.context.eligible): each is
//   { id, name, G, fit:{score,...}, thumbnail:{artifact}, artifact }
// where `artifact` is the FULL candidate render. We ALSO accept the nominal
// `candidate:{artifact}` nesting from the brief, so the core is faithful whether
// fed the accumulated record or the nominal shape — full render is read from
// `c.candidate?.artifact ?? c.artifact`, thumbnail from
// `c.thumbnail?.artifact ?? c.thumbnail`.
//
// Fail-fast (spec §6b): `NO_CANDIDATES_TO_PRUNE` when the eligible spread is empty
// or not an array — upstream collapsed; NEVER emit an empty sheet (don't present
// nothing to the human). buildContactSheet throws; the CLI exits 3.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const esc = (s) =>
  String(s ?? "").replace(/[<&>"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

// Full candidate render href: prefer the nominal candidate.artifact, else the
// accumulated top-level artifact.
const fullRenderOf = (c) => (c && c.candidate && c.candidate.artifact) || (c && c.artifact) || "";
// Thumbnail href: prefer thumbnail.artifact object, else a bare string thumbnail.
const thumbOf = (c) =>
  (c && c.thumbnail && c.thumbnail.artifact) || (typeof (c && c.thumbnail) === "string" ? c.thumbnail : "");

// A path the opened HTML can resolve: relative to the sheet's own directory when
// possible (portable), so file:// is never required to open the sheet in place.
const hrefFrom = (outDir, p) => {
  if (!p) return "";
  const abs = resolve(p);
  const rel = relative(resolve(outDir), abs);
  return esc(rel || abs);
};

// SELF-CONTAINED sheet: embed a thumbnail as a base64 data URI so contact-sheet.html
// is ONE portable file — double-click / move / open from anywhere, thumbnails never
// break on a relative-path miss. Only known RASTER image extensions are embedded;
// anything else (e.g. an .html stand-in in tests, or an .svg) returns "" and the
// caller falls back to the relative href (unchanged behaviour). Unreadable ⇒ "" ⇒
// fall back too — presentation is best-effort, never fatal.
const IMG_MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const thumbDataUri = (outDir, p) => {
  if (!p) return "";
  const abs = resolve(outDir, p); // absolute p ⇒ used as-is; relative ⇒ resolved under outDir
  const dot = abs.lastIndexOf(".");
  const mime = dot >= 0 ? IMG_MIME[abs.slice(dot).toLowerCase()] : undefined;
  if (!mime) return "";
  try {
    return `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
  } catch {
    return "";
  }
};

// LIVE preview: embed the candidate's full HTML render as a data: URI so the sheet
// shows the ACTUAL design — animations play, and clicking opens it full-size to
// interact — instead of a static thumbnail. Only .html renders embed; anything else
// returns "" and the caller falls back to the thumbnail image. Unreadable ⇒ "" too.
const renderDataUri = (outDir, p) => {
  if (!p) return "";
  const abs = resolve(outDir, p);
  const dot = abs.lastIndexOf(".");
  const ext = dot >= 0 ? abs.slice(dot).toLowerCase() : "";
  if (ext !== ".html" && ext !== ".htm") return "";
  try {
    return `data:text/html;base64,${readFileSync(abs).toString("base64")}`;
  } catch {
    return "";
  }
};

// Quality-flags (Increment I-e): the non-blocking `warnings` carried on the
// record — findings that did NOT gate the candidate but the human should see.
// Dedup by antipattern name, keeping a count, so 7× `cramped-padding` shows as
// one chip `cramped-padding ×7`. Returns [] when there are no warnings.
const warningsOf = (c) => {
  const raw = c && Array.isArray(c.warnings) ? c.warnings : [];
  const byKey = new Map();
  for (const w of raw) {
    const key = (w && (w.antipattern || w.name)) || "warning";
    byKey.set(key, (byKey.get(key) || 0) + 1);
  }
  return [...byKey.entries()].map(([label, count]) => ({ label, count }));
};

// The fit score badge value: the fit object carries `.score`; tolerate a bare number.
const fitScoreOf = (c) => {
  const fit = c && c.fit;
  if (fit && typeof fit === "object" && typeof fit.score === "number") return fit.score;
  if (typeof fit === "number") return fit;
  return null;
};

// A baseline record is present when it is a non-empty object carrying an id or a
// full render artifact (the incumbent snapshot). An empty {} (no incumbent_url)
// is absent — the sheet then renders the generated spread alone, unchanged.
const baselinePresent = (b) => !!(b && typeof b === "object" && (b.id || b.artifact));

export function buildContactSheet(candidates, outDir, baseline) {
  // NO_CANDIDATES_TO_PRUNE stays keyed to the GENERATED set — the baseline is a
  // reference, never a substitute for having something to prune.
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("NO_CANDIDATES_TO_PRUNE");
  }
  if (!outDir) throw new Error("OUT_DIR_UNSET");

  // Prepend the incumbent baseline as candidate-0 (marked so the cell badges it
  // BASELINE) when present, so the human prunes the fresh directions AGAINST what
  // exists today. It does NOT change the generated `candidates.length` header/count.
  const spread = baselinePresent(baseline)
    ? [Object.assign({}, baseline, { __baseline: true }), ...candidates]
    : candidates;

  const cells = spread
    .map((c, i) => {
      const id = c.id || `candidate-${i}`;
      const name = c.name || id;
      const gRaw = c && typeof c.G === "number" ? c.G : null;
      const gBadge = gRaw === null ? "n/a" : gRaw.toFixed(2);
      const fitRaw = fitScoreOf(c);
      const fitBadge = fitRaw === null ? "n/a" : String(fitRaw);
      const flags = warningsOf(c);
      const flagsLine = flags.length
        ? `<div class="quality-flags" title="non-blocking quality warnings — the human decides">${flags
            .map(
              (f) =>
                `<span class="flag">⚠ ${esc(f.label)}${f.count > 1 ? ` ×${f.count}` : ""}</span>`,
            )
            .join("")}</div>`
        : "";
      const render = hrefFrom(outDir, fullRenderOf(c));
      const isBaseline = c && (c.__baseline === true || c.baseline === true);
      // LIVE preview of the actual design (animations/interactions) via a scaled
      // iframe embedding the candidate HTML; the incumbent BASELINE is a captured
      // screenshot, so it (and any non-HTML render) falls back to the embedded thumb.
      const renderData = isBaseline ? "" : renderDataUri(outDir, fullRenderOf(c));
      const thumbSrc = thumbDataUri(outDir, thumbOf(c)) || hrefFrom(outDir, thumbOf(c));
      const openOverlay = render
        ? `<a class="preview-open" href="${render}" target="_blank" rel="noopener" title="open full — interact at real size"></a>`
        : "";
      const preview = renderData
        ? `<div class="preview live-wrap">${openOverlay}<iframe class="live" src="${renderData}" title="live preview of ${esc(id)}" scrolling="no" loading="lazy"></iframe></div>`
        : (thumbSrc
            ? `<div class="preview">${openOverlay}<img class="thumb" src="${thumbSrc}" alt="preview of ${esc(id)}" loading="lazy"></div>`
            : `<div class="preview"><div class="thumb thumb--missing">no preview</div></div>`);
      const renderLink = render
        ? `<a class="render-link" href="${render}" target="_blank" rel="noopener">Open full render →</a>`
        : `<span class="render-link render-link--missing">render missing</span>`;
      const baselineBadge = isBaseline
        ? `<span class="badge badge--baseline" title="the CURRENT live design, captured as a reference — prune the fresh directions against it">BASELINE</span>`
        : "";
      return `      <figure class="cell${isBaseline ? " cell--baseline" : ""}" data-candidate-id="${esc(id)}"${isBaseline ? ' data-baseline="true"' : ""}>
        ${preview}
        <figcaption>
          <div class="cell-id">${esc(id)}</div>
          <div class="cell-name">${esc(name)}</div>
          <div class="badges">
            ${baselineBadge}
            <span class="badge badge--advisory badge--g" title="distinctiveness G — advisory only, you decide">G ${esc(gBadge)}</span>
            <span class="badge badge--advisory badge--fit" title="fit-for-purpose score — advisory only, you decide">fit ${esc(fitBadge)}</span>
          </div>
          ${flagsLine}
          ${renderLink}
        </figcaption>
      </figure>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prune &amp; steer — ${candidates.length} eligible directions</title>
<style>
  :root { color-scheme: light dark; }
  /* The live preview renders the candidate at desktop width and scales it,
     so what the human compares is the composition the design actually has —
     a reflowed mobile stack would hide the layout being judged. */
  .thumb--live { position: relative; overflow: hidden; width: 100%; aspect-ratio: 4 / 3;
                 background: Canvas; border-bottom: 1px solid currentColor; }
  .thumb-frame { position: absolute; top: 0; left: 0; width: 1440px; height: 1080px;
                 border: 0; transform: scale(calc(1 / 3)); transform-origin: 0 0;
                 pointer-events: none; }
  @media (min-width: 1200px) { .thumb-frame { width: 1600px; height: 1200px;
                 transform: scale(0.3); } }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.4; }
  header { padding: 1.25rem 1.5rem; border-bottom: 2px solid currentColor; }
  header h1 { margin: 0 0 .35rem; font-size: 1.15rem; }
  header p { margin: .25rem 0; font-size: .9rem; max-width: 70ch; }
  .verdicts { font-size: .85rem; }
  .verdicts code { padding: .05rem .35rem; border: 1px solid currentColor; border-radius: .2rem; }
  main.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; padding: 1.5rem; }
  .cell { margin: 0; border: 1px solid currentColor; border-radius: .4rem; overflow: hidden; display: flex; flex-direction: column; }
  .preview { position: relative; width: 100%; height: 200px; overflow: hidden; border-bottom: 1px solid currentColor; background: #fff; }
  .live-wrap { height: 216px; } /* JS resizes to fit width; this is the pre-JS fallback */
  .live { position: absolute; top: 0; left: 0; width: 1280px; height: 800px; border: 0; background: #fff; transform-origin: top left; transform: scale(.27); pointer-events: none; }
  .preview-open { position: absolute; inset: 0; z-index: 3; display: block; }
  .preview-open:focus-visible { outline: 3px solid #2456c9; outline-offset: -3px; }
  .thumb { display: block; width: 100%; height: 200px; object-fit: cover; object-position: top center; background: #f4f1ea; }
  .thumb--missing { height: 200px; display: flex; align-items: center; justify-content: center; color: #999; font-size: .8rem; }
  figcaption { padding: .6rem .75rem; display: flex; flex-direction: column; gap: .35rem; }
  .cell-id { font-family: ui-monospace, monospace; font-weight: 600; font-size: .9rem; }
  .cell-name { font-size: .78rem; opacity: .8; }
  .badges { display: flex; gap: .4rem; flex-wrap: wrap; }
  .badge { font-family: ui-monospace, monospace; font-size: .72rem; padding: .1rem .45rem; border-radius: .8rem; border: 1px solid currentColor; }
  .badge--advisory { opacity: .65; border-style: dashed; }
  .badge--baseline { font-weight: 700; letter-spacing: .04em; border-style: solid; background: #111; color: #f4f1ea; }
  @media (prefers-color-scheme: dark) { .badge--baseline { background: #f4f1ea; color: #111; } }
  .cell--baseline { border-width: 2px; box-shadow: inset 0 0 0 1px currentColor; }
  .quality-flags { display: flex; gap: .3rem; flex-wrap: wrap; }
  .flag { font-family: ui-monospace, monospace; font-size: .68rem; padding: .05rem .4rem; border-radius: .8rem; border: 1px dashed #b8860b; color: #8a6d00; }
  @media (prefers-color-scheme: dark) { .flag { color: #e0b84a; border-color: #e0b84a; } }
  .render-link { font-size: .8rem; margin-top: .2rem; }
  .render-link--missing { opacity: .6; }
</style>
</head>
<body>
<header>
  <h1>Prune &amp; steer — ${candidates.length} eligible direction${candidates.length === 1 ? "" : "s"}</h1>
  <p>Every direction below already cleared the one hard floor — real usability (detect-clean, zero blocking findings). The G and fit badges are <strong>advisory only</strong> (dashed): a crude structural proxy, never a gate. You are the fitness function: compare side-by-side, then for each candidate give a verdict and say what you like / dislike — those reasons steer the next spread. <strong>Previews are live</strong> — animations play; click any preview to open it full-size and interact.</p>
  <p class="verdicts">Verdicts: <code>keep</code> survive · <code>branch</code> make variations · <code>compose</code> recombine · <code>reject</code> drop the lineage. Keep exactly one as the survivor to refine; note likes/dislikes per candidate.</p>
</header>
<main class="grid">
${cells}
</main>
<script>
  // Scale each live preview to fit its cell width (design is authored at 1280×800).
  (function () {
    var VW = 1280, VH = 800;
    function fit() {
      var wraps = document.querySelectorAll(".live-wrap");
      for (var i = 0; i < wraps.length; i++) {
        var w = wraps[i], f = w.querySelector(".live");
        if (!f) continue;
        var s = w.clientWidth / VW;
        f.style.transform = "scale(" + s + ")";
        w.style.height = (VH * s) + "px";
      }
    }
    document.addEventListener("DOMContentLoaded", fit);
    window.addEventListener("load", fit);
    window.addEventListener("resize", fit);
  })();
</script>
</body>
</html>
`;

  mkdirSync(outDir, { recursive: true });
  const artifact = join(outDir, "contact-sheet.html");
  writeFileSync(artifact, html);
  return { contact_sheet: { artifact } };
}

// ----------------------------------------------------------------------------
// CLI: node contact-sheet.mjs <candidates_json_or_path> <out_dir> [baseline_json]
//   arg1 accepts EITHER an inline JSON string (how the engine renders an array
//   arg — object/array script args are stringified, same as cap.inspect.collect-
//   candidate's eligible_in) OR a path to a .json file (CLI/fixture convenience).
//   arg3 (optional) is the incumbent BASELINE record as a JSON string ({} = none);
//   when non-empty it is prepended as candidate-0 with a BASELINE badge.
//   Prints { contact_sheet: { artifact } } on stdout.
// ----------------------------------------------------------------------------
const isMain = resolve(process.argv[1] || "") === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const candidatesArg = process.argv[2];
  const outDir = process.argv[3];
  const baselineArg = process.argv[4];
  if (!candidatesArg || !outDir) {
    console.error(JSON.stringify({ error: "ARGS_UNSET", need: ["candidates_json_or_path", "out_dir"] }));
    process.exit(2);
  }
  let candidates;
  try {
    const raw = existsSync(candidatesArg) ? readFileSync(candidatesArg, "utf8") : candidatesArg;
    candidates = JSON.parse(raw);
  } catch {
    console.error(JSON.stringify({ error: "CANDIDATES_UNPARSEABLE" }));
    process.exit(2);
  }
  // Baseline is OPTIONAL: absent/blank/unparseable ⇒ {} (no baseline), never fatal.
  let baseline = {};
  if (baselineArg) {
    try {
      const rawB = existsSync(baselineArg) ? readFileSync(baselineArg, "utf8") : baselineArg;
      baseline = JSON.parse(rawB);
    } catch {
      baseline = {};
    }
  }
  try {
    const out = buildContactSheet(candidates, outDir, baseline);
    console.log(JSON.stringify(out));
  } catch (e) {
    if (e && e.message === "NO_CANDIDATES_TO_PRUNE") {
      console.error(JSON.stringify({ error: "NO_CANDIDATES_TO_PRUNE" }));
      process.exit(3);
    }
    console.error(JSON.stringify({ error: String((e && e.message) || e) }));
    process.exit(1);
  }
}
