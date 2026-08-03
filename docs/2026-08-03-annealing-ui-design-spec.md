# `praxec/design` — UI-design annealing pipeline (spec)

**Status:** draft for review · **Date:** 2026-08-03 · **Pack namespace:** `design/*`

## 1. Thesis

The highest-quality UI-design workflow is not "pick the best model." It is an **annealing
pipeline**: maximize diversity early, then progressively reduce entropy — generate many
directions, prune hard, refine the survivors — until one direction remains. This pack expresses
that pipeline as a **governed praxec orchestrator**, with the generation tools wired as
connections/skills and the exploration lineage carried by praxec's own run tree.

This is **UI design** — layout composition, aesthetics, style, components, motion. It is
deliberately **distinct from `cognitive-architectures-max`, which is UX engineering** (JTBD,
information architecture, product/research). Clear separation: **visual design here, UX
engineering in max.** The two packs compose (max produces a UX/IA foundation → `design/*` does
the visual design over it), but they do not overlap.

## 2. The load-bearing insight: it's pure workflow

Every annealing stage maps onto a primitive praxec already has — **no engine change**:

| Annealing stage | praxec primitive (grounded) |
|---|---|
| Research directions (inspiration) | `cap.research.directions` — deep-research real templates/visual references → offered direction options |
| Generate MANY diverse candidates | fan-out via `executor: { kind: workflow, definitionId: … }` — one sub-instance per candidate (the `flow.execute-cohorts` cohort pattern) |
| Branch a survivor into variations | more `kind: workflow` spawns under the parent candidate |
| Render → thumbnail | `cap.render.thumbnail` — screenshot each candidate via the **browser MCP** (reused from the QA pack) → thumbnail ref in context |
| Score on independent axes | `cap.score.axes` (`kind: agent`/`llm`) writing per-axis scores to `$.context` — no overall score |
| Deterministic quality gate | `cap.detect.antipatterns` — `npx impeccable detect --json` (`kind: cli`, LLM-free) |
| One-screen prune (human) | **`cap.gate.human-disambiguate`** — `actor: human`, `presents: ["$.context.candidates"]`, `choices: { field, from, value, title }` (already exists in cognitive-architectures) |
| LLM design critique | `cap.audit.impeccable` — `kind: agent` + the imported Impeccable skill |
| Build into code | `cap.build.component` — `kind: agent`, reuse `cognitive/cap.implement.*` |

**Branching + lineage are free.** Every candidate is a workflow instance with a `run_id` (the
exploration tree) and a `parent` (the branch it came from), persisted in the store, queryable via
`praxec.query`. The ref's "git-style branching, never overwrite, lineage always visible" **is** the
praxec run tree.

## 3. The three-way boundary (what is / isn't in this pack)

1. **The annealing spine = pure workflow** (this pack): research → diverge → render → score → gate
   → narrow → audit → code, with governance (cost gates, evidence, HITL), branching, lineage.
2. **The generation tools = connections/skills** (config, not engine): see §6.
3. **The one-screen gallery = a Mission Control cockpit view** (host superpower, not this pack):
   the Lightroom-style canvas of 30–60 live thumbnails with visual branch-pruning. The pack exposes
   candidates + per-axis scores + run-tree lineage via `praxec.query` and the selection gate via
   HITL; a **dumb renderer (thumbnails + a pick call) is sufficient**. This is Mission Control's
   flagship view, not an engine/workflow change.

## 4. Orchestrator shape + ordering modes

Structure (layout) and style are two annealing **axes** with different cost-of-change — structure
is expensive to change late, style is a cheap re-skin. That asymmetry drives the ordering, and the
pack supports **three modes over the same shared capabilities** (thin orchestrators, near-zero
extra cost):

- **`design/flow.anneal.structure-first`** (DEFAULT) — anneal the expensive axis first: diverge
  *layout/composition* → prune → then diverge *style* over the chosen layout → prune → refine.
  Matches the ref (archetype → 5 styles) and design-system practice (tokens over structure).
- **`design/flow.anneal.style-first`** — for brand-/aesthetic-led work where the visual direction
  drives layout: diverge *style* → prune → layout within it.
- **`design/flow.anneal.grid`** — fan out layout × style *simultaneously* (the ref's 6×5 = 30 on
  one screen) and prune the 2-D grid. Closest to the one-screen gallery.

All three compose the same `cap.*` and share the loop:

```
research → diverge → render → score → [detect gate] → PRUNE (human) → refine ↺ → audit → code → done
                                                          │
                                             loops back to refine until one remains
```

- **research** (`cap.research.directions`) seeds diversity from *real* references (Q3): deep-research
  common templates + visual sites, cluster into candidate directions, present options — so
  divergence starts from grounded inspiration, not a cold model.
- **diverge** stages are the fan-out primitive at different entropy, parameterized by a **diversity
  seed** (Stage-1 barely-resemble archetypes; Stage-2 {minimal, editorial, swiss, playful,
  premium}; late-stage micro-variations of type/spacing/radius only). Diversity is **enforced** by
  the seed set + a cheap "no two within ε" novelty check, not hoped for.
- **prune** is the one human-park point (`cap.gate.human-disambiguate`); the cockpit answers it.
- The loop is **narrow-until-one**, bounded by the human + a max-rounds guard.

## 5. Capabilities (`design/cap.*`)

| Capability | Kind | Role |
|---|---|---|
| `cap.research.directions` | agent + web (deep research) | inspiration: real templates/visual refs → clustered direction options |
| `cap.generate.direction` | agent (design affinity) / 21st MCP | one candidate for a diversity seed; emits a rendered artifact |
| `cap.render.thumbnail` | mcp (browser, reuse QA) | screenshot each candidate → thumbnail ref |
| `cap.score.axes` | agent / llm | per-axis scores (hierarchy, type, density, novelty, brand, a11y, conversion, interaction, motion, impl-complexity) — **no overall** |
| `cap.detect.antipatterns` | cli (`npx impeccable detect --json`) | deterministic, LLM-free design-quality gate |
| `cap.cluster.candidates` | llm / deterministic | group candidates so the human prunes clusters not singletons |
| `cap.gate.human-disambiguate` | HITL (reuse `cognitive/*`) | the prune / pick gate |
| `cap.audit.impeccable` | agent + imported Impeccable skill | LLM design critique (hierarchy, spacing, contrast, anti-patterns, UX-writing) |
| `cap.render.hero` | rest (Higgsfield) | hero imagery + motion, finalist only |
| `cap.build.component` | agent (coding affinity, reuse `cognitive/cap.implement.*`) | production component build of the winner |

**Model affinity split (per your call):** the *generation* caps bind a **design affinity** — best
served by a **multi-model panel via 21st AI** (the annealing thesis: don't bet on one model, let
them all pitch; a strong single model like Kimi3 is one voice in the panel, and the per-axis
scoring + de-escalation flywheel can A/B it rather than us guessing). The *build* cap binds a
**coding affinity** — "built by other agents" (a coding model). praxec's affinity→model binding
does this natively; the two are separate bindings in `models.yaml`.

## 6. Tool dependencies (integration surfaces)

- **21st AI / 21st MCP** — parallel frontier-model generation + production components → `kind: mcp`
  connection (declared in `praxec/packs`, provisioned via `praxec tools install`). Third-party/paid
  → **community-and-premium lane** (API key via `providers.env`).
- **Impeccable** — **NOT a service** (no MCP, no REST; open-source Apache-2.0 skill pack by Paul
  Bakaus, `impeccable.style`). Two-part integration:
  1. **`kind: agent` + imported skill vocabulary** — vendor its Apache-2.0 skill (typography, OKLCH
     color/contrast, spatial, motion, interaction, responsive, UX-writing; commands
     shape/craft/critique/polish/…) as a **hash-pinned skill** in this pack; the generation + audit
     caps are governed agents that use it.
  2. **`kind: cli` deterministic gate** — wrap `npx impeccable detect --json` (LLM-free
     anti-pattern rules, no auth) as `cap.detect.antipatterns`, a fast quality gate *before* the LLM
     critique. No network, no keys.
- **Higgsfield** — hero imagery + motion (finalist only) → `kind: rest` connection (API key via
  `providers.env`). Third-party/paid → community-and-premium lane.
- **Browser MCP** — reuse the QA pack's browser connection for `cap.render.thumbnail`.

The pack ships **reference** connections operators copy/grant; nothing runs a tool the operator
hasn't granted. Impeccable's skill is vendored in-pack (license permits redistribution).

## 7. Pack structure (repo)

```
praxec/design
  praxec.repo.yaml          # schema praxec.repo/v1, namespace: design
  orchestrators/            # flow.anneal.structure-first (default), .style-first, .grid
  capabilities/             # the cap.* above
  skills/                   # vendored Impeccable skill (Apache-2.0, hash-pinned) + design-vocabulary skills — LOCAL to design (Q4)
  connections/              # REFERENCE 21st (mcp), higgsfield (rest), impeccable-detect (cli), browser (mcp) templates
  docs/                     # this spec + guides
```

Consumed via `repos: [{ uri: git+https://github.com/praxec/design, ref: main }]` (always-latest)
or a local `path:`. Every id is `design/`-prefixed. Design-vocabulary skills stay **local to
`design/`** (not in max) to keep the visual-design ↔ UX-engineering boundary clean (Q4).

## 8. Increment plan (build small)

- **Increment I — governed spine, one generator + the deterministic gate.**
  `flow.anneal.structure-first` with research → diverge → render(browser) → score → detect-gate →
  prune → refine → done, using **21st MCP** for generation, `cap.render.thumbnail`, `cap.score.axes`,
  `cap.detect.antipatterns` (impeccable detect CLI), and the existing `cap.gate.human-disambiguate`.
  Prove the loop end-to-end + run-tree lineage, driven headless + resumed at the human gate. No
  Impeccable LLM-skill, no Higgsfield, no cockpit yet.
- **Increment II — full toolchain + modes.** Add `cap.audit.impeccable` (imported skill) +
  `cap.render.hero` (Higgsfield) + `cap.cluster.candidates`; add `flow.anneal.style-first` +
  `.grid`; register 21st/Higgsfield in `praxec/packs`.
- **Increment III — the gallery cockpit.** The Mission Control one-screen view (thumbnails + axis
  scores + lineage tree + the pick call). Consumes this pack's state; no pack change.

## 9. Decisions (resolved) & finer open items

**Resolved:**
- **Q1 Impeccable surface** — analyzed: open-source Apache-2.0 skill pack, no MCP/REST. Integrate
  as `kind: agent` + vendored skill, plus `npx impeccable detect --json` as a `kind: cli` gate.
- **Q2 thumbnails** — reuse the QA **browser MCP** to screenshot each candidate (`cap.render.thumbnail`).
- **Q3 diversity** — add a **research/inspiration step** (`cap.research.directions`) that
  deep-researches real templates/visual refs and offers grounded direction options, feeding
  divergence; plus explicit seeds + a novelty check.
- **Q4 boundary** — visual/UI design + its skills stay **local to `design/`**; UX engineering stays
  in `-max`. The packs compose, don't overlap.
- **Ordering** — **structure-first default**, with style-first + grid as sibling orchestrators over
  shared caps (three modes, near-zero extra cost).
- **Model split** — design-generation affinity (21st multi-model panel; Kimi3 a candidate voice,
  validated by scoring + flywheel) vs coding affinity for the build (other agents).

**Finer open items:**
- **Where the winner's code lands** — reuse `cognitive/cap.implement.*` into a writable `repo_root`,
  same as the SWE flows.
- **21st MCP exact tool names + auth** — confirm at wiring time (its MCP surface).
- **Higgsfield API shape + cost** — confirm; hero/motion is finalist-only to bound spend.
- **Novelty metric** — how "no two within ε" is computed (embedding distance on rendered thumbnails
  vs a cheap structural diff). To decide in Increment I.
