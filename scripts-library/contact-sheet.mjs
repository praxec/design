// contact-sheet.mjs — the PRUNE-AND-STEER presentation core (spec §6b).
//
// "Presentation = the browser": the render step already writes each candidate to
// a standalone HTML file. This deterministic core composes the ELIGIBLE spread
// into ONE self-contained local `contact-sheet.html` — a labelled grid, one cell
// per candidate: its stub/real thumbnail, id + name, G / fit badges, and a link
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

// The fit score badge value: the fit object carries `.score`; tolerate a bare number.
const fitScoreOf = (c) => {
  const fit = c && c.fit;
  if (fit && typeof fit === "object" && typeof fit.score === "number") return fit.score;
  if (typeof fit === "number") return fit;
  return null;
};

export function buildContactSheet(candidates, outDir) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("NO_CANDIDATES_TO_PRUNE");
  }
  if (!outDir) throw new Error("OUT_DIR_UNSET");

  const cells = candidates
    .map((c, i) => {
      const id = c.id || `candidate-${i}`;
      const name = c.name || id;
      const gRaw = c && typeof c.G === "number" ? c.G : null;
      const gBadge = gRaw === null ? "n/a" : gRaw.toFixed(2);
      const fitRaw = fitScoreOf(c);
      const fitBadge = fitRaw === null ? "n/a" : String(fitRaw);
      const render = hrefFrom(outDir, fullRenderOf(c));
      const thumb = hrefFrom(outDir, thumbOf(c));
      const thumbImg = thumb
        ? `<img class="thumb" src="${thumb}" alt="thumbnail of ${esc(id)}" loading="lazy">`
        : `<div class="thumb thumb--missing">no thumbnail</div>`;
      const renderLink = render
        ? `<a class="render-link" href="${render}" target="_blank" rel="noopener">Open full render →</a>`
        : `<span class="render-link render-link--missing">render missing</span>`;
      return `      <figure class="cell" data-candidate-id="${esc(id)}">
        ${thumbImg}
        <figcaption>
          <div class="cell-id">${esc(id)}</div>
          <div class="cell-name">${esc(name)}</div>
          <div class="badges">
            <span class="badge badge--g" title="distinctiveness G">G ${esc(gBadge)}</span>
            <span class="badge badge--fit" title="fit-for-purpose score">fit ${esc(fitBadge)}</span>
          </div>
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
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.4; }
  header { padding: 1.25rem 1.5rem; border-bottom: 2px solid currentColor; }
  header h1 { margin: 0 0 .35rem; font-size: 1.15rem; }
  header p { margin: .25rem 0; font-size: .9rem; max-width: 70ch; }
  .verdicts { font-size: .85rem; }
  .verdicts code { padding: .05rem .35rem; border: 1px solid currentColor; border-radius: .2rem; }
  main.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; padding: 1.5rem; }
  .cell { margin: 0; border: 1px solid currentColor; border-radius: .4rem; overflow: hidden; display: flex; flex-direction: column; }
  .thumb { display: block; width: 100%; height: 180px; object-fit: cover; background: #f4f1ea; }
  .thumb--missing { display: flex; align-items: center; justify-content: center; color: #999; font-size: .8rem; }
  figcaption { padding: .6rem .75rem; display: flex; flex-direction: column; gap: .35rem; }
  .cell-id { font-family: ui-monospace, monospace; font-weight: 600; font-size: .9rem; }
  .cell-name { font-size: .78rem; opacity: .8; }
  .badges { display: flex; gap: .4rem; flex-wrap: wrap; }
  .badge { font-family: ui-monospace, monospace; font-size: .72rem; padding: .1rem .45rem; border-radius: .8rem; border: 1px solid currentColor; }
  .render-link { font-size: .8rem; margin-top: .2rem; }
  .render-link--missing { opacity: .6; }
</style>
</head>
<body>
<header>
  <h1>Prune &amp; steer — ${candidates.length} eligible direction${candidates.length === 1 ? "" : "s"}</h1>
  <p>Every direction below already cleared the hard floors (detect-clean, fit ≥ floor, G &gt; τ). You are the fitness function: compare side-by-side, then for each candidate give a verdict and say what you like / dislike — those reasons steer the next spread.</p>
  <p class="verdicts">Verdicts: <code>keep</code> survive · <code>branch</code> make variations · <code>compose</code> recombine · <code>reject</code> drop the lineage. Keep exactly one as the survivor to refine; note likes/dislikes per candidate.</p>
</header>
<main class="grid">
${cells}
</main>
</body>
</html>
`;

  mkdirSync(outDir, { recursive: true });
  const artifact = join(outDir, "contact-sheet.html");
  writeFileSync(artifact, html);
  return { contact_sheet: { artifact } };
}

// ----------------------------------------------------------------------------
// CLI: node contact-sheet.mjs <candidates_json_or_path> <out_dir>
//   arg1 accepts EITHER an inline JSON string (how the engine renders an array
//   arg — object/array script args are stringified, same as cap.inspect.collect-
//   candidate's eligible_in) OR a path to a .json file (CLI/fixture convenience).
//   Prints { contact_sheet: { artifact } } on stdout.
// ----------------------------------------------------------------------------
const isMain = resolve(process.argv[1] || "") === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const candidatesArg = process.argv[2];
  const outDir = process.argv[3];
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
  try {
    const out = buildContactSheet(candidates, outDir);
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
