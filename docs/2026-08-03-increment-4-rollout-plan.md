# Increment IV — `flow.rollout` (design system → gated commodity fan-out → PR)

> Spec §4b. Apply an approved design system (e.g. `DESIGN-SYSTEM/allumata-design-system.md`) across a
> target repo's surfaces with a COMMODITY model (deepseek), gated so it can't regress to off-system.
> Frontier (Kimi) created the design; commodity propagates it. Built as a governed pack flow, offline
> spine first, then real deepseek. Namespace `design/*`.

## Composition (reuse where possible)
- **CPM:** `cognitive/cap.coordinate.cpm-plan` (+ the `cpm-planner` MCP connection) — feed the surface
  deliverables (id, file, layout-type, complexity→duration, deps) → get waves + critical path.
- **Per-surface coding:** the cognitive `build-loop` coding cap pattern (`verb: implement`,
  `requires_file_write: true`, `affinity: coding` → deepseek-v4-pro). One surface = one gated coding task.
- **Gates (per surface — "commodity can't regress"):**
  - REUSE `design/cap.verify.detect-antipatterns` (usability floor, blocking-severity only, per I-e).
  - NEW `design/cap.verify.token-adherence` — parse the rolled file's CSS/classes and assert it uses
    ONLY the design system's tokens (the 9 named colors + the serif stack + the type scale); ANY
    off-system hex/font/`rgb()` not in the token set → a blocking finding. This is the anti-regression
    heart: a cheap model drifting back to off-system colors/fonts fails the gate and retries (bounded).
  - fit-for-purpose per `layout-type` (landing / blog / utility / app-screen) — the adaptation rules
    from the design-system.md.
- **PR:** reuse the authoring PR-open leaf (or `gh` via a governed script leaf) on the target repo_root.

## `flow.rollout` shape
```
capture(design system → token contract)  [cap.inspect.capture-tokens — parse design-system.md → the
                                           canonical {colors[], fonts[], scale[]} contract]
  → plan(surfaces → CPM waves)            [cap.coordinate.cpm-plan]
  → FAN OUT per wave (parallel within a wave, waves ordered by the critical path):
       for each surface:
         apply(deepseek writes the surface to the token contract + layout-type)   [implement, coding affinity]
         → verify: token-adherence(NEW) + detect + fit                            [gates]
         → gate: pass → collected ; fail → bounded retry ; exhausted → flagged
  → assemble + open PR on the target repo_root
```

## Increments
- **IV-a (SPINE, this task):** `cap.inspect.capture-tokens` (parse the design-system.md → token
  contract JSON), `cap.verify.token-adherence` (NEW gate + red-first tests on fixtures: an on-system
  file passes, an off-system hex/font fails), the `flow.rollout` orchestrator wiring capture → (stub)
  cpm-plan → per-surface STUB apply → token+detect gates → collect → PR-plan (no real gh yet). Offline
  twin drivable via a stub coder (like the anneal offline twin). `praxec check` = 0 errors; offline drive
  parks/collects; smoke asserts token-adherence blocks an off-system surface.
- **IV-b:** wire the REAL `cpm-planner` (cap.coordinate.cpm-plan) with the allumata surface deliverables.
- **IV-c:** wire the REAL deepseek coding leaf (`affinity: coding`) + the target repo_root
  (allumata-site on `feat/design-system-rollout`, mounted writable) + real PR-open. Run the rollout.

## The allumata surface deliverables (input to cpm-plan; from the inventory)
Foundation (critical path): `src/styles/global.css`(D1) → {`BaseLayout`,`Header`,`Footer`}(D2-4) →
`BlogPost`(D5). Fan-out: `index`,`agencies`,`startup-teams`(landing), `talk-to-us`,`coming-soon`(utility),
`blog/index`,`blog/persona`,`blog/[slug]`(blog). Blog posts inherit (verify 2-3, no per-post task).

## Gates (eligibility per surface, mirrors the anneal reframe)
Hard: token-adherence == clean AND detect blocking == 0. Advisory/surfaced: fit-for-purpose,
per-layout-type notes. A surface that regresses (off-system color/font) fails HARD and retries.
