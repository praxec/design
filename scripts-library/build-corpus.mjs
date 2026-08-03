// build-corpus.mjs — assemble the REAL-design calibration corpus.
//
// Reads fixtures/corpus/sources.json (curated real URLs + human labels), renders
// each via snapshot.mjs (Puppeteer → computed-geometry → self-contained snapshot),
// writes the snapshot to fixtures/corpus/<label>/<slug>.html, and records ONLY the
// items that actually rendered into fixtures/corpus/manifest.json (item→label→source).
//
// HONEST-by-construction: a URL that is blocked/flaky/offline is recorded as a
// failure and EXCLUDED — the corpus reflects what really rendered, never a fake.
//
//   node build-corpus.mjs [--only <slug,slug>] [--timeout <ms>]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotUrl } from "./snapshot.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "fixtures", "corpus");

function parseArgs(argv) {
  const out = { only: null, timeout: 45000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") out.only = new Set(argv[++i].split(","));
    else if (argv[i] === "--timeout") out.timeout = parseInt(argv[++i], 10);
  }
  return out;
}

async function main() {
  const { only, timeout } = parseArgs(process.argv.slice(2));
  const sources = JSON.parse(readFileSync(join(CORPUS, "sources.json"), "utf8")).sources;
  const selected = only ? sources.filter((s) => only.has(s.slug)) : sources;

  const results = [];
  for (const src of selected) {
    const dir = join(CORPUS, src.label);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const rel = join(src.label, `${src.slug}.html`);
    const outFile = join(CORPUS, rel);
    process.stderr.write(`[snapshot] ${src.slug} <- ${src.url} ... `);
    try {
      const { geo, html } = await snapshotUrl(src.url, { timeoutMs: timeout });
      writeFileSync(outFile, html);
      results.push({ slug: src.slug, label: src.label, url: src.url, file: rel, ok: true, geo });
      process.stderr.write("ok\n");
    } catch (err) {
      results.push({ slug: src.slug, label: src.label, url: src.url, ok: false, error: String((err && err.message) || err) });
      process.stderr.write(`FAIL (${String((err && err.message) || err).slice(0, 80)})\n`);
    }
  }

  const ok = results.filter((r) => r.ok);
  const manifest = {
    description:
      "REAL-design calibration corpus. Each item is a self-contained snapshot of a live URL's " +
      "computed design geometry (via snapshot.mjs), labeled by human ground truth. Only items " +
      "that actually rendered are listed. Provenance: fixtures/corpus/sources.json.",
    generatedAt: new Date().toISOString(),
    counts: {
      generic: ok.filter((r) => r.label === "generic").length,
      distinctive: ok.filter((r) => r.label === "distinctive").length,
    },
    attempted: results.length,
    succeeded: ok.length,
    items: ok.map((r) => ({ file: r.file, slug: r.slug, label: r.label, source: r.url })),
    failures: results.filter((r) => !r.ok).map((r) => ({ slug: r.slug, label: r.label, url: r.url, error: r.error })),
  };
  writeFileSync(join(CORPUS, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  process.stderr.write(
    `\n[build-corpus] ${ok.length}/${results.length} rendered (generic ${manifest.counts.generic}, distinctive ${manifest.counts.distinctive})\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
