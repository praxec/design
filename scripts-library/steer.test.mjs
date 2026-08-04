// steer.test.mjs — atomic red-first contracts for the VALENCED prune-and-steer
// aggregation (Increment I-c, spec §6b). The steer is direction, not just axis:
// dislikes carry the REDIRECT target ("upscale, restrained — not orange"), likes
// carry the quality to amplify, and amplify pulls from ALL carried-forward
// directions (verdict != "reject"), not just the single survivor.
//
// assert-don't-derive: these tests run the ACTUAL inline node bodies shipped in
// inspect.validate-prune.yaml + run.set-seeds.yaml (extracted from the YAML block
// scalar and executed), so the contract is pinned against the real primitive — not
// a re-implementation. One behavioural claim per test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));

// Extract the `body: |` block scalar from a script YAML and materialise it as a
// runnable .js file, so the test drives the exact shipped code.
function bodyRunner(yamlName) {
  const raw = readFileSync(join(HERE, yamlName), "utf8");
  const lines = raw.split("\n");
  const i = lines.findIndex((l) => /^\s*body:\s*\|\s*$/.test(l));
  assert.ok(i >= 0, `no 'body: |' block in ${yamlName}`);
  const indent = lines[i].match(/^(\s*)/)[1].length + 2; // block content indent
  const out = [];
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() === "") { out.push(""); continue; }
    if (l.match(/^(\s*)/)[1].length < indent) break;
    out.push(l.slice(indent));
  }
  const file = join(mkdtempSync(join(tmpdir(), "steer-")), yamlName.replace(/\.yaml$/, ".js"));
  writeFileSync(file, out.join("\n"));
  return file;
}

// Run inspect.validate-prune with [candidates, feedback]; return {stdout json, code}.
const AGG = bodyRunner("inspect.validate-prune.yaml");
function aggregate(candidates, feedback) {
  const stdout = execFileSync("node", [AGG, JSON.stringify(candidates), JSON.stringify(feedback)], {
    encoding: "utf8",
  });
  return JSON.parse(stdout).steer;
}
// Run and capture a non-zero exit (the PRUNE_UNRESOLVED guard).
function aggregateExpectFail(candidates, feedback) {
  try {
    execFileSync("node", [AGG, JSON.stringify(candidates), JSON.stringify(feedback)], { encoding: "utf8" });
    return { code: 0 };
  } catch (e) {
    return { code: e.status, stderr: e.stderr };
  }
}

const SEEDS = bodyRunner("run.set-seeds.yaml");
function setSeeds(seedsIn, chosen, steer) {
  const stdout = execFileSync("node", [SEEDS, JSON.stringify(seedsIn), JSON.stringify(chosen), JSON.stringify(steer)], {
    encoding: "utf8",
  });
  return JSON.parse(stdout).seeds;
}

// ---------------------------------------------------------------------------
// THE PINNED CONTRACT (brief DoD). This exact feedback → this exact steer.
// ---------------------------------------------------------------------------
const PIN_CANDIDATES = [{ id: "D0" }, { id: "D1" }, { id: "D2" }, { id: "D3" }];
const PIN_FEEDBACK = [
  { candidate_id: "D0", verdict: "keep", rank: 1,
    likes: [{ axis: "layout", toward: "clear headline at top" }, { axis: "type" }] },
  { candidate_id: "D1", verdict: "reject", rank: 4,
    dislikes: [{ axis: "feel", toward: "premium, not cheap" }] },
  { candidate_id: "D2", verdict: "compose", rank: 2,
    likes: [{ axis: "layout", toward: "professional structure" }],
    dislikes: [{ axis: "color", toward: "upscale, restrained — not orange" }] },
  { candidate_id: "D3", verdict: "reject", rank: 3,
    dislikes: [{ axis: "feel", toward: "premium, not cheap" }] },
];

test("PINNED: valenced steer aggregates exactly as specified", () => {
  const steer = aggregate(PIN_CANDIDATES, PIN_FEEDBACK);
  assert.deepEqual(steer, {
    amplify: [
      { axis: "layout", toward: "clear headline at top; professional structure" },
      { axis: "type", toward: "" },
    ],
    avoid: [
      { axis: "feel", toward: "premium, not cheap" },
      { axis: "color", toward: "upscale, restrained — not orange" },
    ],
  });
});

test("amplify pulls likes from ALL carried-forward directions (keep + compose), not just the survivor", () => {
  const steer = aggregate(PIN_CANDIDATES, PIN_FEEDBACK);
  // The composed direction D2's like MUST survive (fix #2) — merged, not dropped.
  const layout = steer.amplify.find((a) => a.axis === "layout");
  assert.equal(layout.toward, "clear headline at top; professional structure");
});

test("a rejected direction's likes are excluded from amplify", () => {
  const steer = aggregate(
    [{ id: "A" }, { id: "B" }],
    [
      { candidate_id: "A", verdict: "keep", rank: 1, likes: [{ axis: "layout", toward: "grid" }] },
      { candidate_id: "B", verdict: "reject", rank: 2, likes: [{ axis: "motion", toward: "playful" }] },
    ],
  );
  assert.deepEqual(steer.amplify, [{ axis: "layout", toward: "grid" }]);
});

test("avoid carries the redirect target across the WHOLE spread, deduped by axis", () => {
  const steer = aggregate(PIN_CANDIDATES, PIN_FEEDBACK);
  const feel = steer.avoid.find((a) => a.axis === "feel");
  assert.equal(feel.toward, "premium, not cheap"); // D1 + D3 collapse to one
  assert.equal(steer.avoid.filter((a) => a.axis === "feel").length, 1);
});

test("distinct toward phrases on one axis merge with '; '", () => {
  const steer = aggregate(
    [{ id: "A" }, { id: "B" }],
    [
      { candidate_id: "A", verdict: "compose", rank: 1, dislikes: [{ axis: "color", toward: "muted" }] },
      { candidate_id: "B", verdict: "compose", rank: 2, dislikes: [{ axis: "color", toward: "cooler" }] },
    ],
  );
  assert.deepEqual(steer.avoid, [{ axis: "color", toward: "muted; cooler" }]);
});

test("back-compat: a bare-string like/dislike still parses to {axis, toward:''}", () => {
  const steer = aggregate(
    [{ id: "A" }],
    [{ candidate_id: "A", verdict: "keep", rank: 1, likes: ["type"], dislikes: ["color"] }],
  );
  assert.deepEqual(steer.amplify, [{ axis: "type", toward: "" }]);
  assert.deepEqual(steer.avoid, [{ axis: "color", toward: "" }]);
});

test("PRUNE_UNRESOLVED guard: a presented candidate with no feedback exits 3", () => {
  const res = aggregateExpectFail(
    [{ id: "A" }, { id: "B" }],
    [{ candidate_id: "A", verdict: "keep", rank: 1 }],
  );
  assert.equal(res.code, 3);
  assert.match(res.stderr, /PRUNE_UNRESOLVED/);
});

// ---------------------------------------------------------------------------
// Loop closure: the valenced steer folds into the seed notes as directional text.
// ---------------------------------------------------------------------------
test("set-seeds folds the valenced steer into notes as 'axis→toward'", () => {
  const steer = {
    amplify: [{ axis: "layout", toward: "clear headline at top" }, { axis: "type", toward: "" }],
    avoid: [{ axis: "color", toward: "upscale not orange" }, { axis: "feel", toward: "premium" }],
  };
  const seeds = setSeeds([{ corners: "square" }], {}, steer);
  assert.equal(
    seeds[0].notes,
    "amplify: layout→clear headline at top, type; " +
      "on color, go toward: upscale not orange; on feel, go toward: premium",
  );
});

// THE VALENCE CONTRACT. A dislike's `toward` is the REDIRECT TARGET — where the
// human wants the next divergence to GO. It must never reach the generation
// prompt behind a prohibition word, because that inverts the human's intent:
// a human asking to move toward a storybook palette previously produced
// "avoid: color→storybook palette", instructing the model to shun it.
test("set-seeds: a redirect target is never rendered as something to avoid", () => {
  const seeds = setSeeds([{ corners: "square" }], {}, {
    amplify: [],
    avoid: [{ axis: "color", toward: "storybook palette — forest green, lantern gold" }],
  });
  assert.match(seeds[0].notes, /go toward: storybook palette/);
  assert.doesNotMatch(seeds[0].notes, /avoid[^]*storybook palette/);
});

// An axis with NO direction given is the one true avoid: the human named the
// axis they disliked but not where to go, so there is nothing to steer toward.
test("set-seeds: an axis-only dislike still renders as a plain avoid", () => {
  const seeds = setSeeds([{ corners: "square" }], {}, {
    amplify: [],
    avoid: [{ axis: "motion", toward: "" }],
  });
  assert.match(seeds[0].notes, /avoid motion/);
  assert.doesNotMatch(seeds[0].notes, /go toward/);
});

test("set-seeds: empty toward renders the bare axis (no arrow)", () => {
  const seeds = setSeeds([{ corners: "square" }], {}, {
    amplify: [{ axis: "type", toward: "" }],
    avoid: [],
  });
  assert.match(seeds[0].notes, /amplify: type/);
  assert.doesNotMatch(seeds[0].notes, /type→/);
});

test("set-seeds: empty steer = today's behavior (no notes injected)", () => {
  const seeds = setSeeds([{ corners: "square" }], {}, {});
  assert.equal(seeds[0].notes, undefined);
});

test("set-seeds: the survivor seed carries the folded steer object back out", () => {
  const steer = { amplify: [{ axis: "type", toward: "sans" }], avoid: [] };
  const seeds = setSeeds([], { seed: { corners: "round" } }, steer);
  assert.deepEqual(seeds[0].steer.amplify, [{ axis: "type", toward: "sans" }]);
});
