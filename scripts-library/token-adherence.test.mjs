// token-adherence.test.mjs — atomic red-first contracts for THE anti-regression
// heart (spec §4b, Increment IV-a). ONE behavioural claim per test, ONE token
// contract per test. An on-system surface (only token hexes + the serif stack)
// is adherent; any off-system color/font is a BLOCKING finding carrying the
// offending value + line.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tokenAdherence } from "./token-adherence.mjs";

// ONE contract per test — the minimal allumata slice: ink + paper + the serif stack.
const CONTRACT = {
  colors: [
    { token: "--ink", hex: "#1f2330" },
    { token: "--paper", hex: "#f5f0e4" },
    { token: "--accent", hex: "#b34a1f" },
  ],
  fonts: ['Georgia, "Iowan Old Style", "Times New Roman", serif'],
  scale: [12, 17, 42],
};

const ON_SYSTEM = `<!doctype html><style>
body { background: #f5f0e4; color: #1f2330; font-family: Georgia, "Times New Roman", serif; }
.accent { color: #b34a1f; }
.veil { background: rgba(0,0,0,0); }
.inherit { color: inherit; border-color: currentColor; }
</style><h1>on system</h1>`;

const write = (html) => {
  const f = join(mkdtempSync(join(tmpdir(), "tok-adhere-")), "surface.html");
  writeFileSync(f, html);
  return f;
};

test("an on-system surface (only token hexes + the serif stack) is adherent", () => {
  const res = tokenAdherence(ON_SYSTEM, CONTRACT);
  assert.equal(res.adherent, true);
  assert.equal(res.count, 0);
  assert.deepEqual(res.off_system, []);
});

test("an off-system hex #123456 fails with the offending value flagged", () => {
  const res = tokenAdherence(
    `<style>a { color: #123456; }</style>`,
    CONTRACT
  );
  assert.equal(res.adherent, false);
  const finding = res.off_system.find((f) => f.kind === "color");
  assert.ok(finding, "an off-system color finding is emitted");
  assert.equal(finding.value, "#123456");
});

test("an off-system font `Inter` fails with the family flagged", () => {
  const res = tokenAdherence(
    `<style>body { font-family: Inter, sans-serif; }</style>`,
    CONTRACT
  );
  assert.equal(res.adherent, false);
  const inter = res.off_system.find((f) => f.kind === "font" && /Inter/i.test(f.value));
  assert.ok(inter, "the off-system Inter family is flagged");
});

test("a finding carries a 1-based line number", () => {
  const res = tokenAdherence(`line1\nline2 color: #abcdef;\nline3`, CONTRACT);
  const finding = res.off_system.find((f) => f.kind === "color");
  assert.equal(finding.line, 2);
});

test("an rgb() that resolves to a token hex is adherent", () => {
  // rgb(31,35,48) === #1f2330 (--ink)
  const res = tokenAdherence(`<style>a{ color: rgb(31, 35, 48); }</style>`, CONTRACT);
  assert.equal(res.adherent, true);
});

test("an rgb() NOT in the palette is off-system", () => {
  const res = tokenAdherence(`<style>a{ color: rgb(1, 2, 3); }</style>`, CONTRACT);
  assert.equal(res.adherent, false);
  assert.ok(res.off_system.some((f) => f.kind === "color" && /rgb\(1, 2, 3\)/.test(f.value)));
});

test("a fully-transparent rgba(...,0) is allowed (not off-system)", () => {
  const res = tokenAdherence(`<style>a{ background: rgba(12, 34, 56, 0); }</style>`, CONTRACT);
  assert.equal(res.adherent, true);
});

test("the generic stack tail `serif` is an allowed font family", () => {
  const res = tokenAdherence(`<style>body{ font-family: serif; }</style>`, CONTRACT);
  assert.equal(res.adherent, true);
});

test("the disk round-trip: an on-system surface read from a file is adherent", () => {
  const on = tokenAdherence(readFileSync(write(ON_SYSTEM), "utf8"), CONTRACT);
  assert.equal(on.adherent, true);
});
