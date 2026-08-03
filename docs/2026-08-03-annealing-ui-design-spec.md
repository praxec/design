# `praxec/design` — UI-design annealing pipeline (spec)

**Status:** draft for review · **Date:** 2026-08-03 · **Pack namespace:** `design/*`

## 1. Thesis

The highest-quality UI-design workflow is not "pick the best model." It is an **annealing
pipeline**: maximize diversity early, then progressively reduce entropy — generate many
directions, prune hard, refine the survivors — until one direction remains. This pack expresses
that pipeline as a **governed praxec orchestrator**, with the generation tools wired as
connections and the exploration lineage carried by praxec's own run tree.

This is **UI design** (layout, aesthetics, components, motion) — deliberately distinct from
`cognitive-architectures-max`, which is **UX/product** (JTBD, research, spec). Separate concern,
separate repo, separate namespace (`design/*`).

## 2. The load-bearing insight: it's pure workflow

Every annealing stage maps onto a primitive praxec already has — **no engine change**:

| Annealing stage | praxec primitive (grounded) |
|---|---|
| Generate MANY diverse directions | fan-out via `executor: { kind: workflow, definitionId: … }` — one sub-instance per candidate (the `flow.execute-cohorts` cohort pattern) |
| Branch into style systems | more `kind: workflow` spawns under the parent candidate |
| Score on independent axes | a scoring capability (`kind: agent`/`kind: llm`) writing per-axis scores to `$.context` |
| One-screen prune (human) | **`cap.gate.human-disambiguate`** — `actor: human`, `presents: ["$.context.candidates"]`, `choices: { field, from, value, title }` (already exists in cognitive-architectures) |
| Narrow → variations → narrow | a HATEOAS state machine with a loop-back transition, gated on the human pick |
| Audit / critique | a `verify`/`review` capability before the code state |
| Build into code | the coding `kind: agent` leaf (reuse `cognitive/*` implement caps) |

**Branching + lineage are free.** Every candidate is a workflow instance with a `run_id` (the
exploration tree) and a `parent` (the branch it came from) — persisted in the store, queryable via
`praxec.query`. The ref's "git-style branching, never overwrite, lineage always visible" **is** the
praxec run tree. No new branching machinery.

## 3. The three-way boundary (be honest about what's *not* workflow)

1. **The annealing spine = pure workflow** (this pack): diverge → score → gate → narrow → audit →
   code, with governance (cost gates, evidence, HITL), branching, and lineage.
2. **The generation tools = connections** (config, not engine): Impeccable, 21st AI, 21st MCP,
   Higgsfield are external MCP/REST services. They are `kind: mcp`/`kind: rest` connections,
   declared in the pack's reference `connections/` and **provisioned through the tool registry**
   (`praxec tools install` / the community-and-premium lane — they are paid/licensed).
3. **The one-screen gallery = a cockpit/UI** (host superpower, not this pack): the Lightroom-style
   canvas that shows 30–60 live thumbnails and lets a human prune branches visually. praxec exposes
   the *data* (candidates, per-axis scores, run-tree lineage) via `praxec.query` and the *selection
   gate* via HITL; **Mission Control** (the Build/Run cockpit) renders it and answers the gate. The
   annealing interface is Mission Control's flagship view — it is not an engine or workflow change.

The pack delivers (1) and declares (2). (3) is a separate cockpit deliverable that consumes this
pack's state; the pack is designed so a *dumb* renderer (thumbnails + a pick call) is sufficient.

## 4. Orchestrator shape

One top orchestrator, `design/flow.anneal`, drives the loop; capabilities do the work.

```
design/flow.anneal
  states:
    diverging      → fan-out N maximally-different directions  (kind: workflow × N)
    styling        → fan-out each survivor × M style systems   (kind: workflow × N·M)
    scoring        → per-axis scores for every candidate        (cap.score.axes)
    pruning        → HUMAN picks a cluster / survivors          (cap.gate.human-disambiguate)   ← HITL park/resume
    refining       → fan-out K variations of each survivor      (loops back to scoring)
    auditing       → design critique on the finalist            (cap.audit.impeccable)
    coding         → production component build                 (kind: agent, reuse cognitive/* implement)
    done
```

- **`diverging`/`styling`/`refining`** are the same fan-out primitive at different entropy: spawn
  `kind: workflow` children, each a `design/cap.generate.direction` call parameterized by a
  *diversity seed* (Stage-1: barely-resemble-each-other archetypes; Stage-2: {minimal, editorial,
  swiss, playful, premium}; Stage-6: micro-variations of type/spacing/radius only). Diversity is
  **enforced by the seed set + a "no two within ε" novelty check**, not hoped for.
- **`scoring`** = `design/cap.score.axes` — returns *independent* axis scores (visual hierarchy,
  typography, density, novelty, brand fit, accessibility, conversion clarity, interaction, motion
  potential, implementation complexity). **No overall score** (different products optimize
  differently — the ref is right). Scores are advisory inputs to the human prune, never an
  auto-gate.
- **`pruning`** = the existing `cap.gate.human-disambiguate` presenting `$.context.candidates`
  (each carrying its thumbnail ref + axis scores + `run_id` lineage). The human keeps/branches/
  rejects; the pick advances the loop (or loops back to `refining`). This is the one place the
  pipeline **parks for a human** — the cockpit answers it.
- The loop (`refining → scoring → pruning`) is a **narrow-until-one** convergence, bounded by the
  human and a max-rounds guard.

## 5. Capabilities (`design/cap.*`)

| Capability | Kind | Role |
|---|---|---|
| `cap.generate.direction` | agent / mcp (Impeccable, 21st) | produce one candidate for a given diversity seed; emits a rendered artifact + a thumbnail ref |
| `cap.score.axes` | agent / llm | per-axis scores (data-in, no overall) |
| `cap.cluster.candidates` | llm / deterministic | group candidates so the human prunes *clusters* not 30 singletons (Stage-3) |
| `cap.gate.human-disambiguate` | HITL (reuse from `cognitive/*`) | the prune / pick gate |
| `cap.audit.impeccable` | mcp (Impeccable) / agent | design critique — weak hierarchy, spacing, contrast, anti-patterns |
| `cap.render.hero` | mcp/rest (Higgsfield) | hero imagery + motion for the finalist (final stage only) |
| `cap.build.component` | agent (reuse `cognitive/cap.implement.*`) | production React/component build of the winner |

Generation/critique/hero caps `wraps:` the imported tool connections and add governance (cost
gate, evidence, output mapping). Reuse the coding cap from cognitive-architectures rather than
re-authoring it.

## 6. Tool dependencies (registry + provisioning)

The pack `requires:` these tools; they are declared in `praxec/packs` and provisioned via the
`praxec tools install` chain we shipped:

- **21st** (21st MCP) — parallel frontier generation + production components → `kind: mcp`.
- **Impeccable** — design vocabulary + audit → skill / `kind: mcp` (its exact surface is an open
  item — §9).
- **Higgsfield** — hero imagery + motion → `kind: rest` (API).

All three are **third-party / paid** → they flow through the **community-and-premium provisioning
lane** (extra operator approval; secrets via `providers.env`, never in config — e.g. API keys,
which URL Figma-style tools need). The pack ships **reference** connections operators copy; nothing
runs a tool the operator hasn't granted.

## 7. Pack structure (repo)

```
praxec/design
  praxec.repo.yaml          # schema praxec.repo/v1, namespace: design
  orchestrators/flow.anneal.yaml
  capabilities/cap.generate.direction.yaml, cap.score.axes.yaml, cap.cluster.candidates.yaml,
               cap.audit.impeccable.yaml, cap.render.hero.yaml, cap.build.component.yaml
  skills/      # design vocabulary skills (spacing/hierarchy/type/rhythm) — hash-pinned
  connections/ # REFERENCE 21st / impeccable / higgsfield connection templates (operator copies)
  docs/        # this spec + guides
```

Consumed by an operator via `repos: [{ uri: git+https://github.com/praxec/design, ref: main }]`
(always-latest) or a local `path:`. Every id is `design/`-prefixed.

## 8. Increment plan (build small)

- **Increment I — the governed spine, one tool.** `flow.anneal` with `diverging → scoring →
  pruning → refining → done` using **one** generation connection (21st MCP) + `cap.score.axes` +
  the existing `cap.gate.human-disambiguate`. Prove the loop end-to-end with the run-tree lineage,
  driven headlessly + resumed at the human gate. No Impeccable/Higgsfield yet, no cockpit.
- **Increment II — full toolchain.** Add `cap.audit.impeccable` + `cap.render.hero` (Higgsfield)
  + `cap.cluster.candidates`; register the tools in `praxec/packs`.
- **Increment III — the gallery cockpit.** The Mission Control view: one-screen thumbnails + axis
  scores + lineage tree + the pick call. Consumes this pack's state; no pack change.

## 9. Decisions & open questions (for review)

- **Impeccable's integration surface** — is it an MCP server, a REST API, or a skill/prompt
  vocabulary? Determines whether `cap.generate.direction`/`cap.audit.impeccable` `wraps` a
  connection or is an `kind: agent` with an imported skill. (Assumed: skill vocabulary + optional
  MCP; needs confirming.)
- **Rendering + thumbnails** — candidates are HTML/React. The pipeline needs a *render-to-thumbnail*
  step so the human prunes visually. Is that a tool (a headless-render connection, e.g. the browser
  MCP we already use for QA) or an artifact the generation tool returns? (Lean: reuse the browser
  connection to screenshot each candidate → thumbnail ref in context.)
- **Diversity enforcement** — seed archetypes + a novelty/"no two within ε" check vs trusting the
  model to diverge. (Lean: explicit seeds + a cheap novelty score; don't trust the model.)
- **Where the winner's code lands** — reuse `cognitive/cap.implement.*` into a writable `repo_root`,
  same as the SWE flows.
- **`-max` overlap** — fold the *reusable* design-vocabulary skills into `-max` and have `design/*`
  compose them, or keep them local to `design/`? (Lean: local first; extract shared later.)
