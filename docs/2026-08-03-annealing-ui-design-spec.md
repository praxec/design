# `praxec/design` — UI-design annealing pipeline (spec)

**Status:** draft for review · **Date:** 2026-08-03 · **Pack namespace:** `design/*`

## 1. Thesis

The highest-quality UI-design workflow is not "pick the best model." It is an **evolutionary
annealing search with a warm start**: first converge on the human's **aesthetic foundation**
(elicit their direction over *distinctive* references), then maximize diversity *within* that
foundation, then progressively reduce entropy — mutate (variations), crossover (mix aspects of
survivors), select (human prune) — under fitness floors, until one direction remains. This pack
expresses that as a **governed praxec orchestrator**, with generation tools wired as
connections/skills and the exploration lineage carried by praxec's own run tree.

**The warm start is deliberate (and departs from a cold "maximum-entropy-first" spread):** a wide
cold spread wastes the human on obvious discards. The goal is a first spread where **every proposal
is already good** — in-purpose (§4), in-aesthetic (the elicited foundation), and distinctive (§3) —
so the human chooses among strong options instead of filtering junk. The foundation is elicited over
the **distinctive-tail** reference set (§3.3), so it converges on "distinctive AND preferred," never
the human's familiar-but-generic comfort zone; the learned taste profile (§3.6) warm-starts the
elicitation on later runs so it shrinks over time.

This is **UI design** — layout, aesthetics, style, components, motion — deliberately **distinct
from `cognitive-architectures-max` (UX engineering: JTBD, IA, product/research).** Visual design
here, UX engineering in max; they compose (max → a UX/IA foundation → `design/*` designs over it)
but do not overlap.

The search is pinned by **two co-equal, load-bearing requirements** — §3 and §4 — because the two
existential failure modes pull against each other:

- **§3 Distinctiveness** — don't ship the cookie-cutter LLM default.
- **§4 Fit-for-purpose** — don't ship beautiful-but-wrong.

Pushing either alone breaks the other; the pipeline holds both with independent floors.

## 2. It's pure workflow (no engine change)

Every stage maps onto a primitive praxec already has:

| Stage | praxec primitive (grounded) |
|---|---|
| Purpose brief | `cap.brief.purpose` — app-type + core-needs profile (from max, or lightweight intake) (§4) |
| Research directions | `cap.research.directions` — deep-research the **distinctive tail** (§3) → grounded options + DNA |
| Elicit aesthetic foundation (warm start) | `cap.elicit.aesthetic` — human reacts to distinctive refs → preference profile / seed direction (reuse elicitation-mcp) |
| Generate MANY (mutate) | fan-out `executor:{ kind: workflow, definitionId: … }` — one sub-instance per candidate (the `flow.execute-cohorts` cohort pattern) |
| Mix aspects (crossover) | `cap.recombine.aspects` — synthesize a child from aspects of several parents (§5) |
| Render → thumbnail | `cap.render.thumbnail` — screenshot each via the **browser MCP** (reused from QA) |
| Score (independent axes) | `cap.score.axes` — per-axis, **no overall**, incl. computed **G** (§3) + **fit** (§4) |
| Deterministic quality gate | `cap.detect.antipatterns` — `npx impeccable detect --json` (`kind: cli`, LLM-free) |
| One-screen prune (human) | **`cap.gate.human-disambiguate`** — pick/branch/**compose**; decisions recorded as evidence |
| LLM design critique | `cap.audit.impeccable` — `kind: agent` + imported Impeccable skill |
| Build into code | `cap.build.component` — reuse `cognitive/cap.implement.*` |

**Branching + lineage are free:** each candidate is a workflow instance with a `run_id` (the
exploration tree) and `parent`(s) (mutation = one parent; crossover = multiple, recorded in
evidence). The ref's "git-style branching, lineage visible" **is** the praxec run tree.

## 3. Anti-homogenization — CORE REQUIREMENT #1

The existential failure: **LLM mode collapse** — every generator regresses to the "default web
aesthetic" (Inter, dark gradients, rounded cards, the SaaS/Vercel clone). A naive annealer narrows
*within* the collapsed space → 30 look-alikes → "best cookie-cutter" → mediocrity with false
confidence. The pipeline is **architected against its generators' priors.** Through-line: **turn
"distinctive" from an LLM opinion into a computed, calibrated measurement, with fail-fast on
collapse.**

1. **Genericness axis `G` (computed, not vibes)** — embedding distance of the rendered thumbnail
   from a curated **generic corpus** centroid. High `G` = far from cookie-cutter. `G < τ` →
   **ineligible**. Never an LLM taste opinion (which shares the disease).
2. **Diversity as hard, verifiable constraints — not labels** — a seed ("brutalist / asymmetric /
   serif-display / mono+1") is a constraint set the generator must satisfy, **checked against the
   rendered CSS/DOM** (did the corners stay square, the grid asymmetric, the type serif?).
3. **Reference DNA from the distinctive tail** — `cap.research.directions` targets award-tier /
   editorial / print / cross-domain refs and extracts specific DNA; refs that cluster at the generic
   centroid are **rejected** (`RESEARCH_RETURNED_GENERIC_HEAD`).
4. **Decouple judge from generator** — subjective axes judged by a **different model family**; `G`
   is computed; the **human prune is the taste authority** (no auto-select on LLM taste).
5. **Deterministic usability floor (TRIZ: novelty ↔ usability)** — novelty differentiates only among
   candidates that clear the `impeccable detect` gate + a11y/hierarchy floors. Novelty runs free in
   generation; unusable output can never ship.
6. **Human taste captured as evidence + learned** — each prune (chosen + rejected + `G`/axis
   context) → evidence → the flywheel builds a **per-operator taste profile** biasing future seeds.
7. **Testable acceptance (TDD)** — a **golden fixture set** (distinctive vs generic) the `G`-metric
   MUST rank correctly (unit test); every shippable candidate MUST clear **`G > τ` AND detect = 0
   AND seed/DNA adherence.** Pack CI gates.

## 4. Fit-for-purpose — CORE REQUIREMENT #2

The counterpart failure: **beautiful-but-wrong.** Distinctiveness pressure (§3) *increases* the risk
of designs that don't serve the app's actual job — a data dashboard rendered like a fashion
editorial. Fit-for-purpose is a **co-equal floor**, held by the symmetric mechanism:

1. **Purpose brief at the top** — `cap.brief.purpose` establishes the **app-type + core-needs
   profile** before any generation. Sourced from the **max** pack's UX output when present, else a
   lightweight intake here. A short, explicit taxonomy → core-needs profile, e.g.:
   - *analytics/dashboard* → density, scannability, data hierarchy, low-chrome;
   - *marketing/landing* → conversion, narrative, hero, social proof;
   - *developer tool* → code/content density, keyboard, dark, docs-forward;
   - *e-commerce* → product-forwardness, trust, checkout clarity;
   - *consumer/social* → delight, onboarding, motion, thumb-reach.
2. **Fit-for-purpose scoring axis** — `cap.score.axes` scores how well each candidate serves the
   *core-needs profile* (independent axis, **no overall**; grounded in the brief, not free vibes).
3. **Fit as an eligibility floor** — symmetric to the usability floor: a distinctive candidate that
   **fails fit-for-purpose is ineligible**, not "interesting." (TRIZ separation: explore novelty,
   **enforce** fit — get both, not a compromise.)
4. **App-appropriate seeding** — diversity seeds are **bounded by app-type**: a dashboard's seed set
   won't include "playful marketing hero." Divergence stays wide but on-purpose.
5. **Fail-fast** — a run with no purpose brief refuses to generate (`PURPOSE_UNSET`); a round where
   all candidates fail the fit floor → `NO_FIT_FOR_PURPOSE` (don't prune off-purpose designs).

**§3 and §4 together** define the eligibility a candidate must clear to reach the human prune:
`detect = 0 (usable) AND fit ≥ floor (right) AND G > τ (distinctive)`. Novelty is the differentiator
*among* candidates that are already usable, right, and distinctive.

## 5. Capabilities (`design/cap.*`)

| Capability | Kind | Role |
|---|---|---|
| `cap.brief.purpose` | agent / intake (or max output) | app-type + core-needs profile (§4) |
| `cap.research.directions` | agent + web | distinctive-tail references + DNA (§3.3) |
| `cap.elicit.aesthetic` | HITL (reuse elicitation-mcp) | **warm start** — human reacts to distinctive refs → aesthetic foundation (preference profile + seed direction) that bounds divergence so the first spread is all-good; taste profile (§3.6) warm-starts it on later runs |
| `cap.generate.direction` | agent (design affinity) / 21st MCP | one candidate for a **hard-constraint, app-appropriate** seed; verified renderable artifact |
| `cap.recombine.aspects` | agent (design affinity) | **crossover / mix-and-match** — synthesize a child from selected aspects of N parents (header/cards/palette/type/motion), **re-harmonized** (Impeccable vocab), same gates apply; multi-parent lineage |
| `cap.render.thumbnail` | mcp (browser, reuse QA) | screenshot → thumbnail ref |
| `cap.score.axes` | agent/llm + **computed G** | per-axis incl. **G** (§3) + **fit-for-purpose** (§4) + seed-adherence; **no overall** |
| `cap.detect.antipatterns` | cli (`impeccable detect --json`) | deterministic LLM-free usability floor |
| `cap.cluster.candidates` | llm / deterministic | group so the human prunes clusters not singletons |
| `cap.gate.human-disambiguate` | HITL (reuse `cognitive/*`) | prune: **keep / branch / compose(recombine) / reject**; decisions → evidence |
| `cap.audit.impeccable` | agent + imported Impeccable skill | LLM design critique (finalist) |
| `cap.render.hero` | rest (Higgsfield) | hero + motion, finalist only |
| `cap.build.component` | agent (coding affinity, reuse `cognitive/*`) | production build of the winner |

**Recombination detail:** `cap.recombine.aspects` takes `{ parents: [candidate_ids], aspects: {header:A, cards:B, palette:C, type:D, motion:E} }` → a synthesized candidate. It **re-harmonizes** (spliced aspects are reconciled via the Impeccable design vocabulary, not pasted) and is subject to the **same eligibility** (detect + fit + G) plus a coherence check — an incoherent frankendesign is rejected, never shipped. This is the evolutionary **crossover** operator; the prune gate's *compose* action invokes it with the human's aspect selection.

**Model affinity split:** *generation/recombine* caps bind a **design affinity** — a **multi-model
panel via 21st** (cross-model collapse differs → the panel is itself an anti-homogenization
mechanism; a strong single model like Kimi3 is one *voice*, validated by `G`/fit + the flywheel,
not assumed). The *build* cap binds a **coding affinity** ("built by other agents").

## 6. Orchestrator shape + ordering modes

Structure (layout) and style are two axes with different cost-of-change. Three modes over the
**same shared caps** (thin orchestrators):

- **`flow.anneal.structure-first`** (DEFAULT) — diverge layout → prune → diverge style over it →
  prune → refine.
- **`flow.anneal.style-first`** — brand-/aesthetic-led.
- **`flow.anneal.grid`** — fan out layout × style simultaneously, prune the 2-D grid.

Loop (every mode):
```
purpose → research → ELICIT aesthetic foundation → diverge(within foundation) → [recombine]
       → render → score(G + fit) → detect-gate
       → PRUNE(human: keep/branch/compose/reject) → refine ↺ → audit → hero → code → done
```
Bounded (N/round), enforced (hard seeds + G floor + fit floor + app-appropriate seeds + the
elicited aesthetic foundation), human-gated, capped by max-rounds + the cost gate. The aesthetic
foundation is what makes the **first** spread all-good rather than a cold wide spread of discards.

## 7. Tool dependencies (integration surfaces)

- **21st AI / 21st MCP** — parallel frontier generation → `kind: mcp` (registry + `tools install`,
  community-and-premium lane; key via `providers.env`).
- **Impeccable** — **not a service** (Apache-2.0 skill pack, `impeccable.style`; no MCP/REST):
  (1) `kind: agent` + **vendored hash-pinned skill** for generation/recombine/critique;
  (2) `kind: cli` `npx impeccable detect --json` as the deterministic gate (no auth/network).
- **Higgsfield** — hero + motion (finalist only) → `kind: rest` (key via `providers.env`).
- **Browser MCP** — reuse QA connection for `cap.render.thumbnail`.
- **Corpora + fixtures** — generic-corpus + distinctive-corpus (back `G`) + the golden
  distinctive-vs-generic set + per-app-type core-needs profiles (back fit). Maintained fixtures.

## 8. Pack structure

```
praxec/design
  praxec.repo.yaml          # praxec.repo/v1, namespace: design
  orchestrators/            # flow.anneal.structure-first (default), .style-first, .grid
  capabilities/             # the cap.* above
  skills/                   # vendored Impeccable skill (Apache-2.0, hash-pinned) + design-vocabulary — LOCAL to design
  connections/             # REFERENCE 21st(mcp), higgsfield(rest), impeccable-detect(cli), browser(mcp)
  fixtures/                # generic/distinctive corpora, golden set, app-type core-needs profiles
  docs/
```

## 9. Increment plan (anti-collapse AND fit on the critical path)

- **Increment I — governed spine WITH both floors + the warm start.** `flow.anneal.structure-first`:
  purpose → research(distinctive-tail) → **elicit aesthetic foundation** → diverge(**hard,
  app-appropriate, in-foundation seeds**, 21st) → render(browser) →
  score(**G + fit** + seed-adherence) → **detect gate** → prune(human, contact-sheet surface,
  decisions recorded) → refine → done. **Exit = the acceptance contracts:** golden set ranks
  correctly; candidates are demonstrably `G > τ`, fit ≥ floor, detect-clean, seed-adherent — or the
  increment isn't done. All fail-fasts wired (`PURPOSE_UNSET`, `DIVERGENCE_COLLAPSED`,
  `NO_FIT_FOR_PURPOSE`, `SCORE_UNCALIBRATED`, `CANDIDATE_NOT_RENDERABLE`). (No recombine/Impeccable-
  skill/Higgsfield/cockpit yet.)
- **Increment II — crossover, full toolchain, modes.** `cap.recombine.aspects` (mix-and-match) +
  the gate's compose action; `cap.audit.impeccable` (skill) + `cap.render.hero` + `cap.cluster`;
  `style-first` + `grid`; taste-profile learning to the flywheel; register 21st/Higgsfield.
- **Increment III — the gallery cockpit.** Mission Control one-screen view (thumbnails + axis scores
  incl. G/fit + lineage tree + pick/compose). Consumes pack state; no pack change.

## 10. Decisions & finer open items

**Resolved:** Impeccable = skill + `detect` CLI gate. Browser-MCP thumbnails. Research = distinctive
tail + DNA. Visual skills local to `design/`. Ordering = structure-first + style-first + grid.
Model split = 21st panel (Kimi3 a voice) vs coding build. **Two co-equal core requirements —
distinctiveness (§3) + fit-for-purpose (§4) — with independent eligibility floors, both on
Increment I's critical path.** Mix-and-match = a crossover capability (Increment II) making the
search evolutionary.

**Finer open items (Increment-I / wiring):** the `G` metric (thumbnail-embedding vs structural
diff; `τ` from the golden set); fit scoring grounding (how much is checklist-deterministic vs LLM);
corpus + core-needs-profile curation (the accepted `Low` operational residual); seed-adherence
parseability; recombination coherence check; 21st/Higgsfield exact surfaces + cost.

## 11. FMECA provenance

§3 + §4 + the Increment-I re-sequence are mitigations from a failure-mode analysis whose two primary
risks — **mode collapse** (beautiful-cookie-cutter) and **not-fit-for-purpose** (beautiful-but-
wrong), each S:High P:High and pulling against each other — were reduced to Low by: moving both
"distinctive" and "fit" from LLM opinion to **computed/grounded signals with eligibility floors and
fail-fast**, enforcing diversity as **hard, app-appropriate constraints + cross-model**, using the
deterministic Impeccable gate as the **usability floor**, and putting both floors on the **critical
path** (TRIZ separations: novelty↔usability and novelty↔fit). Residual: corpus/profile curation
(Low, operational).
