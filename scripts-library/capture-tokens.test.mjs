// capture-tokens.test.mjs — atomic red-first contracts for the design-system →
// token-contract capture core (spec §4b, Increment IV-a). ONE behavioural claim
// per test, pinned against the real approved design-system markdown (copied into
// fixtures/ so the test is hermetic + in-repo).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { captureTokens } from "./capture-tokens.mjs";

const md = () =>
  readFileSync(fileURLToPath(new URL("../fixtures/design-system.sample.md", import.meta.url)), "utf8");

test("captures every `--token #hex` color row into colors[]", () => {
  const { colors } = captureTokens(md());
  // The allumata palette has 9 named color tokens.
  assert.equal(colors.length, 9);
});

test("a color row carries both the --token name and its #hex", () => {
  const { colors } = captureTokens(md());
  const ink = colors.find((c) => c.token === "--ink");
  assert.deepEqual(ink, { token: "--ink", hex: "#1f2330" });
});

test("hex values are normalized lowercase with a leading #", () => {
  const { colors } = captureTokens(md());
  for (const c of colors) assert.match(c.hex, /^#[0-9a-f]{6}$/);
});

test("the font Family stack is captured into fonts[]", () => {
  const { fonts } = captureTokens(md());
  assert.equal(fonts.length, 1);
  assert.match(fonts[0], /Georgia/);
  assert.match(fonts[0], /serif$/);
});

test("the type scale px sizes are captured ascending + deduped", () => {
  const { scale } = captureTokens(md());
  assert.ok(scale.length > 0, "scale must be non-empty");
  // ascending
  for (let i = 1; i < scale.length; i++) assert.ok(scale[i] > scale[i - 1], "scale ascending + deduped");
  assert.ok(scale.includes(12), "smallest body step 12 present");
  assert.ok(scale.includes(42), "display step 42 present");
});

test("a `--fs-caption … --fs-display` prose note (tokens without a hex) is NOT a color", () => {
  const { colors } = captureTokens(md());
  assert.ok(!colors.some((c) => c.token === "--fs-caption"), "scale-name tokens must not leak into the palette");
  assert.ok(!colors.some((c) => c.token === "--fs-display"));
});

test("a markdown with no `--token #hex` rows throws NO_TOKENS", () => {
  assert.throws(() => captureTokens("# just prose\n\nno tokens here."), /NO_TOKENS/);
});
