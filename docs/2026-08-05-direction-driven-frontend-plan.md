# Direction-driven front-end for the `design` annealing pack — implementation plan

> **Goal:** make the `design` pack turn a single **top-level prose direction** (+ references +
> the target's real content) into scored candidate options for a human prune — with the
> **incumbent design injected as a baseline alternative** — driven entirely by the governed
> engine. No hand-authored seeds. No hand-edited artifacts. Reusable across design efforts;
> not coupled to any one design.

**Dogfood target:** `/home/mc/working/preveti-site` public landing → later `rollout` to the SaaS tool.
**Direction under test:** enterprise / reliable / safer; institutional trust; beat mirofish.ink;
in the spirit of bizgen / labflox / Labout — while keeping Preveti's decision-protocol substance.

---

## Global Constraints

- **Fix the pack (and engine, if it blocks) — never the output.** Any core-engine or workflow-repo
  defect hit during the dogfood is fixed at source. No working around, no hand-authoring/hand-editing
  candidates or design systems to fake progress.
- **Direction-agnostic.** Nothing about "enterprise/reliable/safe" or preveti lives in pack internals.
  The direction is an *input string*; the same caps serve the next effort with a different direction.
- **Valid cap-verbs only** (closed set): plan, implement, compose, research, summarize, verify, run,
  inspect, gate. (`brief`/`elicit` from the spec are NOT verbs and must not be used.)
- **V-rule shape for agent caps:** an `agent` step is not a legal initial-state primary (V6) →
  `noop` prep state first, then the `agent` step (mirror `cap.implement.generate-direction`).
- **No fabricated success:** agent steps set `requires_file_write: true` and a deterministic
  verifier re-opens/parses the written artifact (mirror the generate→verify→gate pattern).
- **Additive:** the existing annealing spine (`flow.anneal.structure-first`) and its offline twin
  stay working unchanged underneath; new inputs are optional-with-safe-defaults.

---

## What exists vs. what's missing (grounded)

| Piece | State |
|---|---|
| Annealing spine `flow.anneal.structure-first` (diverge→score→detect→human prune→refine) | **BUILT, proven live** (allumata r1–r3 runs in `design-runs/`) |
| Generation leaf `cap.implement.generate-direction` (agent, `design` affinity → Kimi K3) | **BUILT** |
| Score / detect / contact-sheet / prune-and-steer caps | **BUILT** |
| `models.yaml` binds `design`→Kimi K3 (frontier) + `rollout`→DeepSeek-v4-pro (commodity); `OPENROUTER_API_KEY` present | **READY** |
| **Direction front-end** (`app_type` + `profile` + `seeds` from a prose direction) | **MISSING — 0 files.** Today operator hand-authors all three per run. THIS is the coupling. |
| **Incumbent-as-baseline** (capture existing site → scored candidate on the contact sheet) | **PRIMITIVE EXISTS, UNWIRED.** `scripts-library/snapshot.mjs` renders a live URL → self-contained HTML in the *same feature space* as generated candidates; no cap/flow runs it. |
| praxec binary / live gateway | **0.0.47** — pack's `affinities:` manifest key needs **0.0.48**; `target/` was `cargo clean`ed. Rebuild required. |

---

## Sequenced tasks

### Task 0 — Rebuild + install praxec 0.0.48; stand up a focused design gateway
- `cargo build --release -p praxec --bin praxec` in `/home/mc/working/mcp-flowgate` (currently 0.0.48);
  install to `~/.cargo/bin/praxec`. Verify `praxec --version` → 0.0.48.
- **Drive mechanism decision (needs user nod):** rather than restart the user's live MCP mid-flow
  (fragile; also its on-disk `gateway.yaml` lists git packs that weren't loading), stand up a
  **focused gateway config** for this work mounting only: `design` (`/home/mc/working/design`),
  `preveti` (`/home/mc/working/preveti-site`, writable), `design-runs` (scratch out_dir), pointing
  `gateway.models_yaml` at the existing `~/.config/praxec/models.yaml`, `audit.sink: file`. Drive via
  the **headless `praxec` CLI** (`start` / `submit`) — same engine, same governance, fully under our
  control. Present contact sheets by opening the generated HTML.
  *(Alternative: install 0.0.48, then user restarts the praxec MCP so the two-tool surface picks up
  `design`. Slower feedback loop; keep as fallback.)*
- Fail-fast: if the focused config fails to load `design` (e.g. the `affinities:` block), that's a
  real 0.0.48 defect → fix in the engine.

### Task 1 — `cap.research.direction` (the direction front-end)  ← the core fix
- **New file:** `capabilities/cap.research.direction.yaml`. Verb `research` (cognitive).
- **Inputs:** `direction` (string, required — the prose brief), `references` (array of URL/notes,
  default []), `content_path` (string, default "" — target page's real copy), `n` (int — how many
  distinct seeds to derive), `app_type_hint` (string, default ""), `out_dir` (string, required).
- **Outputs:** `app_type` (string), `profile` (JSON string), `seeds` (array of hard-constraint
  objects — the exact shape `flow.anneal.structure-first` consumes: `{corners,type,grid,notes,…}`).
- **Shape:** `noop` prep → `agent` step (`affinity: design`, `requires_file_write: true`,
  `tools: [file:{{out_dir}}]`) that WRITES `brief.json` = `{app_type, profile, seeds[]}` honoring the
  direction (each seed a *genuinely distinct* hard-constraint interpretation that serves the
  direction — e.g. for "enterprise/reliable" it derives restrained-but-differentiated corners/type/
  grid/color DNA, NOT one generic default) → deterministic `verify.brief-parseable` script re-opens
  brief.json, validates the schema (app_type non-empty, profile valid JSON, seeds length ≥ 1 with
  required keys), emits the typed outputs; malformed ⇒ terminal `BRIEF_UNPARSEABLE` fail-fast.
- **Reference handling:** references are passed as text in the goal; the agent reasons over their
  described DNA. (Live web fetch of refs is a possible follow-on via a browser/MCP tool; v1 grounds
  on operator-provided reference notes + names to stay deterministic and offline-capable.)

### Task 2 — `cap.inspect.capture-incumbent` + wire it as a baseline (the incumbent alternative)
- **New file:** `capabilities/cap.inspect.capture-incumbent.yaml`. Verb `inspect` (deterministic).
- Wraps `scripts-library/snapshot.mjs` (`kind: script`, or a script-skill subject). **Input:**
  `target_url` (or local built-HTML path), `out_dir`, `candidate_id` (default `incumbent`). **Output:**
  a candidate object `{id, artifact, seed, generator: "incumbent-snapshot-v1"}` in the SAME shape
  generated candidates use, so score-axes/detect/collect/contact-sheet treat it uniformly.
- **Wire into `flow.anneal.structure-first`:** add optional input `incumbent_url` (default ""). When
  non-empty, an early branch captures → scores → detects → `collect-candidate`s the incumbent into the
  `eligible` ledger BEFORE the diverge loop, so it appears on the contact sheet as a baseline
  alternative (tagged `generator: incumbent-snapshot-v1`). Empty ⇒ current behavior exactly (additive).

### Task 3 — `flow.design.from-direction` (the top orchestrator)
- **New file:** `orchestrators/flow.design.from-direction.yaml`. Chains:
  `cap.research.direction` (→ app_type/profile/seeds) → `flow.anneal.structure-first`
  (fed the derived seeds/profile/app_type + `incumbent_url` + `content_path`).
- **Operator inputs (the ENTIRE hand-surface now):** `direction`, `references`, `content_path`,
  `incumbent_url`, `n`, `max_rounds`, `out_dir`, `scripts_dir`. No seeds/profile/app_type by hand.

### Task 4 — Prepare preveti inputs (grounding data, not design)
- Derive `content_path`: emit the landing page's real copy from `src/content/landing.json` into a
  content markdown (mechanical extraction — the page's actual words, so every candidate lays out the
  same content and design is the only variable).
- `incumbent_url` = the running preveti dev URL (or a built static export for stability).

### Task 5 — Drive end-to-end + human prune (the dogfood)
- `start flow.design.from-direction` with the preveti direction. Watch it: research→seeds→
  capture incumbent→diverge N→score→detect→contact sheet.
- Open the contact sheet; **user does the real prune-and-steer** (keep/reject/rank + likes/dislikes
  per candidate, including reacting to the incumbent baseline). Resume → refine round.
- Fix any engine/pack defect surfaced, at source; re-run.

### Task 6 — (later) Rollout the approved system to the SaaS tool
- Once a direction is chosen + an approved design system emerges, `flow.rollout` propagates it across
  the SaaS surfaces at commodity tier. Out of scope for the first prove-out; noted for continuity.

---

## Verification / definition of done
- `praxec check` on the focused config loads `design` clean on 0.0.48 (all new caps pass V-rules).
- `flow.design.from-direction` runs through the engine from a **prose direction only** — no
  hand-authored seeds/profile/app_type anywhere — and produces a contact sheet that includes the
  incumbent baseline + N generated directions, all scored + usability-floor-cleared.
- The same flow, given a *different* direction string, produces appropriately different seeds
  (proves reusability / no coupling) — smoke-checked with a second toy direction.
- Any defect found in the engine or pack during the run is fixed at source, with a regression test.
```
```
