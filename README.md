# praxec/design

A **UI-design annealing pipeline** as a governed [praxec](https://github.com/praxec/praxec) pack
(namespace `design/*`).

The best UI-design workflow isn't "pick the best model" — it's an **annealing pipeline**: maximize
diversity early, then progressively reduce entropy until one direction remains. This pack expresses
that as a pure praxec orchestrator — **generate many → score (per-axis) → human prune → refine →
audit → code** — with the generation tools (21st, Impeccable, Higgsfield) wired as connections and
the branching/lineage carried by praxec's own run tree. No engine change.

This is **UI design** (layout, aesthetics, components, motion) — distinct from
`cognitive-architectures-max` (UX/product).

**Status:** spec only. See [`docs/2026-08-03-annealing-ui-design-spec.md`](docs/2026-08-03-annealing-ui-design-spec.md).
