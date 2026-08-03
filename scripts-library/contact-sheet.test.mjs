// contact-sheet.test.mjs — atomic red-first contracts for the prune-and-steer
// presentation core (spec §6b). ONE behavioural claim per test, pinned against
// the real fixtures/*.html as stand-in candidate renders + thumbnails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContactSheet } from "./contact-sheet.mjs";

const fx = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

// Three eligible records in the shape cap.inspect.collect-candidate accumulates:
// full render at top-level `artifact`, thumbnail at `thumbnail.artifact`, fit as
// an object carrying `.score`. Real fixture HTML files stand in for the renders.
const THREE = [
  {
    id: "editorial-serif",
    name: "editorial-serif · G=1.80 · fit=1 · usable=true",
    G: 1.8,
    fit: { score: 1 },
    thumbnail: { artifact: fx("distinctive-01-editorial-serif.html") },
    artifact: fx("distinctive-01-editorial-serif.html"),
  },
  {
    id: "brutalist",
    name: "brutalist · G=2.10 · fit=0.9 · usable=true",
    G: 2.1,
    fit: { score: 0.9 },
    thumbnail: { artifact: fx("distinctive-02-brutalist.html") },
    artifact: fx("distinctive-02-brutalist.html"),
  },
  {
    id: "swiss-mono",
    name: "swiss-mono · G=1.95 · fit=0.8 · usable=true",
    G: 1.95,
    fit: { score: 0.8 },
    thumbnail: { artifact: fx("distinctive-03-swiss-mono.html") },
    artifact: fx("distinctive-03-swiss-mono.html"),
  },
];

const freshOut = () => mkdtempSync(join(tmpdir(), "contact-sheet-"));

test("3 candidates: a contact-sheet.html is written", () => {
  const out = freshOut();
  const res = buildContactSheet(THREE, out);
  assert.equal(res.contact_sheet.artifact, join(out, "contact-sheet.html"));
  assert.ok(existsSync(res.contact_sheet.artifact), "sheet file must exist on disk");
});

test("3 candidates: exactly one labelled cell per candidate", () => {
  const out = freshOut();
  const { contact_sheet } = buildContactSheet(THREE, out);
  const html = readFileSync(contact_sheet.artifact, "utf8");
  const cells = html.match(/data-candidate-id=/g) || [];
  assert.equal(cells.length, 3, "one cell per candidate");
  for (const c of THREE) assert.match(html, new RegExp(`data-candidate-id="${c.id}"`));
});

test("3 candidates: each full render is linked", () => {
  const out = freshOut();
  const { contact_sheet } = buildContactSheet(THREE, out);
  const html = readFileSync(contact_sheet.artifact, "utf8");
  // Each render is linked by its basename (paths are made relative to the sheet).
  for (const name of [
    "distinctive-01-editorial-serif.html",
    "distinctive-02-brutalist.html",
    "distinctive-03-swiss-mono.html",
  ]) {
    assert.match(html, new RegExp(`href="[^"]*${name}"`), `render ${name} must be linked`);
  }
});

test("G score renders as a badge", () => {
  const out = freshOut();
  const { contact_sheet } = buildContactSheet(THREE, out);
  const html = readFileSync(contact_sheet.artifact, "utf8");
  assert.match(html, /badge--g/, "a G badge class must be present");
  assert.match(html, /G 1\.80/, "the G value must render in a badge");
});

test("fit score renders as a badge", () => {
  const out = freshOut();
  const { contact_sheet } = buildContactSheet(THREE, out);
  const html = readFileSync(contact_sheet.artifact, "utf8");
  assert.match(html, /badge--fit/, "a fit badge class must be present");
  assert.match(html, /fit 0\.9/, "the fit value must render in a badge");
});

test("the nominal candidate:{artifact} nesting is also honoured", () => {
  const out = freshOut();
  const nominal = [
    {
      id: "nom",
      name: "nominal-shape",
      G: 1.5,
      fit: { score: 1 },
      thumbnail: { artifact: fx("generic-01-saas-dark.html") },
      candidate: { artifact: fx("generic-01-saas-dark.html") },
    },
  ];
  const { contact_sheet } = buildContactSheet(nominal, out);
  const html = readFileSync(contact_sheet.artifact, "utf8");
  assert.match(html, /href="[^"]*generic-01-saas-dark\.html"/, "candidate.artifact must be linked");
});

test("empty array throws NO_CANDIDATES_TO_PRUNE", () => {
  assert.throws(() => buildContactSheet([], freshOut()), /NO_CANDIDATES_TO_PRUNE/);
});

test("non-array input throws NO_CANDIDATES_TO_PRUNE", () => {
  assert.throws(() => buildContactSheet(null, freshOut()), /NO_CANDIDATES_TO_PRUNE/);
});
