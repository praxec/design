# `praxec/design` — Increment I implementation plan

> Spec: `docs/2026-08-03-annealing-ui-design-spec.md`. Build order = **de-risk first**: prove
> distinctiveness + fit are *measurable* before wiring generation.

**Goal:** the governed annealing spine `flow.anneal.structure-first` with BOTH eligibility floors
(distinctiveness `G` + fit-for-purpose) and the aesthetic warm-start, ending at a human prune —
`praxec check`-valid, with the measurement core proven against a golden fixture set.

## Grounded resolutions (finer open items)
- **`G` = structural-signature distance, reusing `impeccable detect --json`.** The detect output is
  already a structural feature extraction (type/color/layout/spacing/motion rules + counts). `G` =
  distance of a candidate's feature vector from the **generic-corpus centroid** (computed from the
  same detect output over the generic fixtures). Deterministic, interpretable, no image-embedder;
  **doubles as the seed-adherence check** (same feature vector). `τ` is fit *from* the golden set
  (the threshold that maximally separates distinctive vs generic fixtures). Image-embedding G is a
  later enhancement, not needed for I.
- **fit-for-purpose = a per-app-type checklist over the detect features + a grounded LLM pass.** The
  core-needs profile (density/scannability for dashboards, hero/conversion for marketing, …) maps to
  concrete, checkable signals (info density, control affordances, hierarchy depth) from the detect
  output + a bounded LLM check *grounded in the brief*, not free vibes.
- **Generation (21st) is wired but stub-backed in I.** Running end-to-end needs the operator's 21st
  key + curated corpora (asset tasks). The **spine, the measurement core, the gates, the fail-fasts,
  and the golden-set acceptance test are all buildable + verifiable now** with a deterministic stub
  generator (produces fixture candidates) so the loop + gates are provable offline.

## Build order (subagent-driven, TDD, one at a time)

- **Task 1 — the measurement core (highest risk, no external deps).** A node/CLI component in the
  pack (`scripts-library/`) that: runs `impeccable detect --json` on a rendered candidate → a
  **feature vector**; computes **`G`** vs a generic-corpus centroid and **seed-adherence** vs a seed
  constraint set; computes **fit** vs an app-type core-needs profile. **Golden-fixture test**
  (red-first): a curated `fixtures/` set labeled distinctive-vs-generic that `G` MUST rank correctly
  and `τ` separates; assertions are atomic + declarative. Fail-fast: `SCORE_UNCALIBRATED` if the
  metric can't separate the golden set. *This proves the whole thesis is measurable.*
- **Task 2 — the deterministic gate + connections.** Reference `connections/` for
  `impeccable-detect` (`kind: cli`), `browser` (mcp, reuse QA), `21st` (mcp, declared). `praxec check`
  passes on the pack.
- **Task 3 — the capabilities (governed).** `cap.brief.purpose`, `cap.research.directions`,
  `cap.elicit.aesthetic` (reuse elicitation-mcp), `cap.generate.direction` (stub-backed),
  `cap.render.thumbnail` (browser), `cap.score.axes` (wraps Task 1: G + fit + seed-adherence),
  `cap.detect.antipatterns` (Task 1 gate), `cap.gate.human-disambiguate` (reuse from cognitive).
  Each with the fail-fasts (`PURPOSE_UNSET`, `CANDIDATE_NOT_RENDERABLE`, …). Authored + `praxec check`-clean.
- **Task 4 — the orchestrator.** `flow.anneal.structure-first`: purpose → research → elicit →
  diverge(within foundation) → render → score(G+fit) → detect-gate → PRUNE → refine ↺ → done.
  HATEOAS state machine + the eligibility (detect=0 AND fit≥floor AND G>τ) before the prune. Driven
  headless with the **stub generator** end-to-end + resumed at the human gate; run-tree lineage
  asserted.
- **Task 5 — acceptance + docs.** The Increment-I exit contracts as tests: golden set ranks;
  stub-run produces only eligible candidates; the prune gate parks + resumes; `praxec check` = 0
  errors. Guide doc.

## Out of Increment I (per spec)
Recombination/crossover, Impeccable LLM-skill critique, Higgsfield hero, style-first/grid modes,
the Mission Control gallery cockpit, real 21st generation + curated production corpora.

## Honest boundary
Increment I delivers a **validated, governed pipeline + a proven measurement core** — it runs
end-to-end on a stub generator and proves distinctiveness/fit are measurable and gated. **Live
generation** (real distinctive candidates from 21st) needs the operator's 21st key + production
corpora — an asset/wiring step, not a code gap.
