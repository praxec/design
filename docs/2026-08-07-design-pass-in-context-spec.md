# flow.design-pass — in-context design annealing for an existing site

**Status:** spec (2026-08-07) · **Owner:** design pack · **Kind:** new governed workflow + backlog ticket-type executor

## 1. Purpose

Anneal a design for **new functionality in an EXISTING property** — a front-end
**control** (a filter, a toggle, a bulk-action bar, a CTA variant) or a **page** —
producing a spread of on-brand options an engineer prunes and steers. Unlike
`flow.design.from-direction` (which designs a *new* look), this pass is **bound to
the existing site's design system**: every option is on-brand *by construction* and
rendered *in context*, so the review is "which presentation of this control works,"
not "what should the site look like."

This is the everyday product-design loop, and it is a **ticket type**: a vetted
ticket classified as *design-pass (existing site, control|page)* dispatches here.

## 2. Scope & granularity

One workflow, `granularity ∈ {control, page}` as an input:

| | control | page |
|---|---|---|
| **unit generated** | one component/control, mounted in a context slice | a full page in the site shell |
| **brief** | functional spec (what it does, inputs, states) | purpose + real content |
| **seed vocabulary** | presentation/interaction pattern, affordance, density, disclosure | layout/structure (as today) |
| **"distinctiveness" (G)** | meaningfully different UX approaches | different layouts |
| **"fit"** | serves the function + usable | serves the content/needs |

## 3. Grounding: on-brand by construction

The house style is **not re-derived** — it is consumed:

1. **Primary: the blessed `flow.design-system` artifact** — the canonical tokens
   (`global.css` `:root` + spacing scale) and shared components + `design-system.md`.
   This is the reason we built `flow.design-system`.
2. **Fallback:** if no blessed system exists, capture the site's current tokens
   (`cap.inspect.capture-tokens`) as a provisional house style.
3. **Context slice:** a representative fragment of the target property (the page/slot
   the control lives in, or the page shell) so options render *in situ*.

The generation agent (governed `kind: agent`, `design` affinity, **vision on**) is
handed: the token contract, the shared-component inventory, the context slice (as
markup + a screenshot reference), and the control brief. It emits a **self-contained
HTML** that imports/uses the site tokens and renders the control variant **inside the
context slice** — so `render-screenshot` produces a realistic, in-context preview.

## 4. Flow (reuses the annealing spine)

```
brief_gate → grounding (design-system + context slice) → researching (brief → seeds)
 → annealing:  diverge → generate (in-context, on house style, self-checked)
             → render (live) → score (G + fit) → detect (usability floor)
             → ON-BRAND GATE (token-adherence)   ← NEW eligibility criterion
             → collect → [human prune-and-steer, interactive contact sheet] → refine
```

- **Spine reused verbatim:** `cap.inspect.next-seed`, `flow.generate.self-checked`,
  `cap.run.render-thumbnail` (real screenshot), `cap.inspect.score-axes`,
  `cap.verify.detect-antipatterns`, `cap.inspect.collect-candidate`,
  `cap.inspect.contact-sheet` (**live iframes** — essential for interactive controls),
  `cap.gate.prune-and-steer`.
- **On-brand gate = `cap.verify.token-adherence`** (from rollout) added to the
  eligibility floor: an option that introduces off-system colors/fonts is not
  eligible. This is what keeps the spread on-brand without averaging out ideas.
- **Interactive review:** the contact sheet embeds each option live, so the engineer
  hovers/clicks and sees states (default / hover / active / disabled / error).

## 5. Net-new vs reuse

**Reuse (no change):** the whole annealing spine + gates + contact sheet + self-check
+ governed image inputs + token-adherence gate + capture-tokens.

**Net-new (this build):**
- `cap.research.design-pass` — granularity-aware front door: brief → `{unit_type,
  profile, seeds}` using the control-or-page seed vocabulary (the aesthetic narrative
  is replaced by the *design-system* + a functional/UX narrative).
- **Generation grounding change** — the generate goal consumes the design-system
  artifact + context slice and renders the unit **in-context, on the house style**
  (a re-grounded `cap.implement.generate-direction`, or a sibling
  `cap.implement.generate-in-context`).
- **On-brand eligibility** — wire `cap.verify.token-adherence` into the collect gate
  (an option must be detect-clean AND token-adherent to be eligible).
- **Control seed vocabulary** — extend the seed schema (score.mjs `SEED_CHECKS`) with
  control-presentation keys (pattern, affordance, density, disclosure) OR keep the
  structural vocab and carry the UX narrative in the `direction_brief`. (Decision D3.)
- `flow.design-pass.yaml` orchestrator + offline twin.

## 6. Backlog integration (ticket-type executor)

A vetted ticket → classified *design-pass (control|page, existing site)* → the lifecycle
starts `flow.design-pass` with `{ granularity, brief, repo_root, design_system_artifact,
context_slice }`. The engineer prunes; the chosen option flows to compose/rollout
(control → mounted into the real page; page → the rollout apply). This is the design
counterpart to the code-change ticket executor.

## 7. Dogfood plan

Run on preveti with a real control — e.g., **a "filter by segment" control** for a
future list view, or **a CTA-button variant set** — grounded in preveti's design
system, in a context slice of the landing/overview. Prune → refine → confirm the
options are on-brand + interactive + meaningfully different.

## 8. Open decisions

- **D1 — brief format:** short prose functional spec (recommended) vs a structured
  form (fields for inputs/states/constraints).
- **D2 — context slice source:** operator points at a page + a slot marker, vs the
  agent picks a representative slice from the target page.
- **D3 — seed vocabulary:** extend `SEED_CHECKS` with control-presentation keys, or
  keep the structural vocab + carry UX intent in `direction_brief` (lower-risk;
  recommended for v1).
- **D4 — no blessed design-system yet:** require one (clean dependency) vs the
  capture-tokens fallback (more usable day-1). Recommend fallback.

## 9. Risks

- **On-brand vs distinctive tension:** the token-adherence gate must constrain *style*
  without collapsing *UX-approach* diversity — G must reward different interaction
  patterns, not visual novelty. Watch this in the dogfood.
- **In-context fidelity:** the generated option must actually consume the shared
  components, not re-implement them off-system. The on-brand gate + a "compose from
  shared components" instruction mitigate; verify in the dogfood.
