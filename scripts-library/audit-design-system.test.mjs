// audit-design-system.test.mjs — atomic red-first contracts for the design-system
// AUDIT core (flow.design-system stage 1). ONE behavioural claim per test, pinned
// against small hermetic CSS strings so the signals are exact + in-repo.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCALE_MIN,
  detectSpacingScale,
  collectAdhocPx,
  collectAdhocPxLocated,
  nearDuplicateSignal,
  collectNearDuplicates,
  computeExists,
  detectBaseTokens,
} from "./audit-design-system.mjs";

test(`a :root with >= ${SCALE_MIN} spacing custom properties is a scale`, () => {
  const css = `:root{ --space-1:4px; --space-2:8px; --space-3:16px; --space-4:24px; }`;
  const s = detectSpacingScale(css);
  assert.equal(s.present, true);
  assert.equal(s.count, 4);
});

test("a single spacing var is NOT a scale (present === false)", () => {
  const css = `:root{ --gap:12px; }`;
  const s = detectSpacingScale(css);
  assert.equal(s.present, false);
  assert.ok(s.count < SCALE_MIN);
});

test("stylesheet with zero spacing vars reports present === false", () => {
  const s = detectSpacingScale(`.card{ color:#111; }`);
  assert.equal(s.present, false);
  assert.equal(s.count, 0);
});

test("ad-hoc px values are harvested from padding/margin/gap and tallied by value", () => {
  const css = `.a{ padding:16px; } .b{ margin:16px 8px; } .c{ gap:16px; }`;
  const px = collectAdhocPx(css);
  const sixteen = px.find((p) => p.value === 16);
  assert.equal(sixteen.count, 3, "16px appears in 3 spacing declarations");
  assert.ok(px.some((p) => p.value === 8));
});

test("a 0px spacing is scale-free and never counted as ad-hoc", () => {
  const px = collectAdhocPx(`.a{ margin:0px; padding:0; }`);
  assert.equal(px.length, 0);
});

test("non-spacing px (font-size/border) is not harvested as ad-hoc spacing", () => {
  const px = collectAdhocPx(`.a{ font-size:14px; border:1px solid #000; }`);
  assert.equal(px.length, 0);
});

test("collectAdhocPxLocated carries per-file + 1-based-line locations for each ad-hoc px", () => {
  const files = [
    { file: "src/styles/global.css", text: `.a{ padding:16px; }\n.b{ margin:16px; }` },
    { file: "src/components/Card.astro", text: `.card{ gap:8px; }` },
  ];
  const px = collectAdhocPxLocated(files);
  const sixteen = px.find((p) => p.value === 16);
  assert.equal(sixteen.count, 2, "16px counted across both declarations");
  assert.deepEqual(sixteen.locations, [
    { file: "src/styles/global.css", line: 1 },
    { file: "src/styles/global.css", line: 2 },
  ]);
  const eight = px.find((p) => p.value === 8);
  assert.deepEqual(eight.locations, [{ file: "src/components/Card.astro", line: 1 }]);
});

test("collectNearDuplicates returns the duplicated body with its file+selector occurrences", () => {
  const files = [
    { file: "src/components/A.astro", text: `.a{ padding:16px; color:#111; }` },
    { file: "src/components/B.astro", text: `.b{ padding:16px; color:#111; }` },
  ];
  const dups = collectNearDuplicates(files);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].occurrences.length, 2);
  assert.deepEqual(
    dups[0].occurrences.map((o) => ({ file: o.file, selector: o.selector })),
    [
      { file: "src/components/A.astro", selector: ".a" },
      { file: "src/components/B.astro", selector: ".b" },
    ]
  );
  assert.ok(dups[0].body.includes("padding:16px"));
});

test("collectNearDuplicates ignores a body seen under only one selector", () => {
  const files = [{ file: "x.css", text: `.a{ padding:16px; color:#111; } .b{ padding:8px; color:#222; }` }];
  assert.deepEqual(collectNearDuplicates(files), []);
});

test("recurring declaration bodies across selectors are a near-duplicate signal", () => {
  const css = `.a{ padding:16px; color:#111; } .b{ padding:16px; color:#111; }`;
  assert.equal(nearDuplicateSignal(css), 1);
});

test("distinct rule bodies are not a near-duplicate", () => {
  const css = `.a{ padding:16px; color:#111; } .b{ padding:8px; color:#222; }`;
  assert.equal(nearDuplicateSignal(css), 0);
});

test("exists = a base token set AND >= 2 shared components (a missing spacing scale is a hone gap, not a create trigger)", () => {
  // Brownfield: tokens + components but NO spacing scale ⇒ exists ⇒ HONE (not create-from-scratch).
  assert.equal(computeExists({ base_tokens_present: true, component_files: ["a.astro", "b.astro"] }), true);
  // Greenfield: no base token set ⇒ create.
  assert.equal(computeExists({ base_tokens_present: false, component_files: ["a.astro", "b.astro"] }), false);
  // Tokens but no real component set ⇒ create.
  assert.equal(computeExists({ base_tokens_present: true, component_files: ["a.astro"] }), false);
});

test("detectBaseTokens: a :root with >= BASE_TOKENS_MIN distinct custom properties is a token system", () => {
  assert.equal(detectBaseTokens(":root{--ink:#000;--paper:#fff;--red:#a00;--font:serif}").present, true);
  assert.equal(detectBaseTokens(":root{--only:#000}").present, false);
});
