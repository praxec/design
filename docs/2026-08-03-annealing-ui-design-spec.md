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

1. **Genericness axis `G` (computed, not vibes) — hard floor in the CANDIDATE regime, advisory on
   real sites.** A **structural-signature distance**: a candidate's design-*geometry* feature vector
   (grid symmetry, composition centering, corner geometry, palette/type signals — parsed from the
   rendered page) vs the **generic-corpus centroid**. High `G` = far from cookie-cutter. Never an LLM
   taste opinion (which shares the disease).
   **Two regimes, empirically established — this is the load-bearing honesty of the whole pack:**
   - **Candidate regime** (the self-contained designs the pipeline GENERATES): `G` separates cleanly
     — ~2.4× (golden set: generic G ≈ 0.56–0.91, distinctive 2.18–2.31, τ≈1.44, margin 1.05, zero
     overlap). Here `G < τ` → **ineligible** is a real hard floor. `calibration.golden.json`.
   - **Real-site regime** (live production pages — rollout surfaces, existing components): `G` does
     **NOT** separate. On a curated real corpus (n=15 generic / 16 distinctive), even after adding
     two failure-mode features (intentional-vs-incidental asymmetry + a minimal-polish axis), the
     overlap only narrowed −0.51 → −0.278 and never crossed positive (rank AUC 0.94, but no valid
     τ). The binding false-positive is a serif+saturated+gradient marketing page that apes
     distinctiveness through coarse visual cues structure can't disambiguate. So on real sites `G` is
     a **ranking prior, not a hard floor** — `calibration.corpus.json` is `SCORE_UNCALIBRATED` and
     the scorer **refuses** rather than fabricate a verdict.
   **Consequence (validated, not a fallback):** for real designs the **human prune is the genericness
   fitness function** (§8b) — the visual taste structure can't encode is exactly what the human
   supplies. The **thumbnail image-embedding `G`** is promoted from "later enhancement" to *the known
   path to an automated real-site hard floor*, a deferred increment. Key structural finding still
   holds in-regime: the signal is composition *geometry*, not fonts — a detect-clean brutalist ranks
   highest.
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
   generation; unusable output can never ship. **Note (Task-1 finding): `detect` is the *usability*
   floor, NOT a genericness signal** — a clean generic design passes detect with zero anti-patterns.
   Distinctiveness is `G` (geometry, #1); usability is `detect`. Two distinct roles, both kept.
6. **Human taste captured as evidence + learned** — each prune (chosen + rejected + `G`/axis
   context) → evidence → the flywheel builds a **per-operator taste profile** biasing future seeds.
7. **Testable acceptance (TDD)** — a **golden fixture set** (distinctive vs generic) the `G`-metric
   MUST rank correctly (unit test); every shippable **generated candidate** MUST clear **`G > τ` AND
   detect = 0 AND seed/DNA adherence** (candidate regime). On **real sites** the `G > τ` hard floor
   is replaced by the human prune (§8b) + detect + fit, since real-site `G` is advisory only. Pack CI
   gates both the golden separation AND the honest real-corpus non-separation (`SCORE_UNCALIBRATED`),
   so no future change can silently fudge the metric to force a green.

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

## 4b. Rollout — applying the chosen design across a target site (tiered economics)

Design is only half the job: once the annealing converges on a **winner**, the design must be
**rolled out across the whole target site** — and the two phases have opposite economics, so they
bind different model tiers:

- **Design (converge)** — creative, high-value, *few* candidates → the **`design` affinity →
  frontier tier** (Kimi3 / the 21st panel). Pay for taste here.
- **Rollout (apply)** — mechanical propagation of an *already-decided* design system across *many*
  surfaces → the **`rollout` affinity → commodity tier**. Applying fixed tokens + component
  patterns, not inventing. praxec's affinity→model binding + the cost thesis (commodity by default,
  frontier only where it earns it) keeps cost flat as the site grows.

**`flow.rollout` (design-system capture → gated commodity fan-out → PR):**
1. **Capture the design system** — extract from the winner the tokens (color/type/space/radius/
   motion) + component patterns + the **DNA signature** (the geometry that makes `G` high). A
   concrete artifact — this is what gets applied everywhere.
2. **Enumerate surfaces** of the target site (pages/components) under a writable `repo_root`.
3. **Fan out per surface** — a **commodity coding cap per surface** that applies the system,
   **reusing `cognitive/cap.implement.*`** + the PR-open leaf (where `/design` meets the coding side).
4. **Gate every rolled-out surface** — the critical poka-yoke: a naive commodity rollout **regresses
   to generic** (the cheap model drifts back to the LLM default page-by-page — mode collapse in the
   *application* phase). Each surface passes the **same gates**: `G > τ` (still distinctive, still
   matches the winner's DNA), `detect = 0` (usable), `fit ≥ floor` (on-purpose). A regressing surface
   **fails the gate and retries** (bounded), never ships. The design gates keep the commodity rollout
   from eroding the design it applies. Coherence is free: one captured system → shared tokens.
5. **Assemble + PR** on the target `repo_root`.

Full pipeline: **anneal (frontier) → capture design system → gated rollout across the target repo
(commodity) → PR.** Rollout proves you can *apply a distinctive design at scale without losing it*.

## 4c. Component design — annealing one component within an established site

The third scope: design or upgrade a **single component** within a site whose design system is
already in place. Same annealing spine, but the constraints **invert** and UX becomes first-class.

- **Consistency gate (NEW) — replaces site-level "far from generic".** The component must **match**
  the site's captured design system (tokens/DNA): `consistency ≥ floor`. (Site-level *maximized
  distance* from the generic centroid; component-level *maximizes fit* to the site's own DNA.)
- **Distinctiveness reframed to within-genre.** Don't ship a stock component (generic Bootstrap/
  Material card) — express the site's DNA *in* the component. Component-`G` = distance from generic
  *component* patterns, **while matching the site DNA**.
- **Fit = the component's UX role (where UX enters).** A nav needs wayfinding/discoverability; a
  form needs clarity + error/validation states; a table needs density + sort/filter; a CTA needs a
  single prominent action. The UX role sources from **`-max` (UX engineering)** or a lightweight
  component-purpose intake → the fit axis. This is the tightest `/design`(visual) ↔ `max`(UX)
  composition point — your "combined with UX considerations."
- **Two modes.** (a) **New component** — anneal from `{site system + UX role}`. (b) **Upgrade
  existing** — a **warm start with the current component as candidate-0**: anneal improvements that
  *beat candidate-0* on consistency/`G`/fit without regressing usability. "Upgrade" becomes
  **objective** — a candidate ships only if it beats the baseline on the axes that matter.
- **Apply = scoped single-surface** (`flow.rollout` restricted to the component's surface, gated by
  consistency so it slots into the existing site coherently).

`flow.anneal.component` reuses the measurement core + the annealing orchestrator + the scoped apply;
the only new pieces are the **consistency-to-system gate**, the **UX-role fit**, and the
**candidate-0 warm start**.

**The three scopes, one spine + one gate family:**

| Scope | Established | Explored | Fit axis | Distinctiveness | Apply |
|---|---|---|---|---|---|
| Site design | nothing | the whole system | app-type core needs | `G` far from generic | — |
| Site rollout | the system | (mechanical) | app-type needs | `G` matches winner DNA | all surfaces (commodity) |
| Component design | the site system (hard input) | one component | the component's UX role | within-genre (not stock) + **consistent** with DNA | one surface |

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

**Engine grounding (Task 2):** cap names bind to the engine's **blessed verb cloud** (V1/V2) and a
deterministic cap uses `kind: script`/`mcp`, not `cli` (V6). The table's names are intent; the
**authored Increment-I ids** are `cap.run.generate-direction`, `cap.run.render-thumbnail`,
`cap.inspect.score-axes` (threads `scripts_dir`), `cap.verify.detect-antipatterns` — CLIs live in
hash-pinned `scripts-library/` bodies. Later caps map to blessed verbs the same way.

**Recombination detail:** `cap.recombine.aspects` takes `{ parents: [candidate_ids], aspects: {header:A, cards:B, palette:C, type:D, motion:E} }` → a synthesized candidate. It **re-harmonizes** (spliced aspects are reconciled via the Impeccable design vocabulary, not pasted) and is subject to the **same eligibility** (detect + fit + G) plus a coherence check — an incoherent frankendesign is rejected, never shipped. This is the evolutionary **crossover** operator; the prune gate's *compose* action invokes it with the human's aspect selection.

**Generation grounding (research 2026-08-03) — supersedes the earlier "21st panel" assumption:**
- **Generation = `kind: agent` bound to a frontier design model + the imported design skill + hard
  seeds**, generating a self-contained distinctive HTML candidate per seed. NOT 21st MCP — 21st is a
  hosted, **shadcn/registry-biased** component tool (its `generate` writes shadcn-styled per-component
  files into a repo), which fights distinctiveness and isn't "one standalone candidate"; its
  multi-model fan-out isn't programmatically reachable. 21st stays in **reserve** only for
  registry-backed shadcn components (a different job than `cap.run.generate-direction`).
- **The lead design model = Kimi K3** (`moonshotai/kimi-k3` via OpenRouter; 1M ctx, multimodal).
  Honest caveat: K3's strength is coding/agentic, **not** design-specific (unproven for UI) — so it's
  bound behind the `design` **affinity**, swappable in one `models.yaml` line if aesthetics disappoint.
- **Cross-model diversity (anti-homogenization #4)** = binding **multiple** frontier models directly
  (a panel of agent bindings), since 21st's fan-out is unavailable. K3 is the first voice; add more.

**Model affinity split:** *generation/recombine* caps bind the **design affinity → frontier**
(Kimi K3 + a panel). The *build*/rollout caps bind a **coding/commodity affinity** ("built by other
agents"). praxec's affinity→model binding does this natively.

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
       → PRUNE-AND-STEER(human: verdict + likes/dislikes + rank) → refine ↺ → audit → hero → code → done
```
Bounded (N/round), enforced (hard seeds + G floor + fit floor + app-appropriate seeds + the
elicited aesthetic foundation), human-gated, capped by max-rounds + the cost gate. The aesthetic
foundation is what makes the **first** spread all-good rather than a cold wide spread of discards.

## 6b. Prune-and-steer — the human IS the fitness function

Per §3, on real designs `G` is advisory, not a hard floor — so the **human prune is the genericness
fitness function**, and it must be richer than keep/reject. Annealing needs a gradient; in a *design*
pipeline the gradient is human taste. The prune therefore **elicits structured reactions per candidate
and feeds the *reasons* back into the next divergence** — the human doesn't just cut, the human steers.

No bespoke cockpit. Two pieces the pack already owns:
- **Presentation = the browser.** The render step already writes each candidate to a standalone HTML
  file. A deterministic `contact-sheet.mjs` (`kind: script`) composes them into ONE local
  `contact-sheet.html` — a labelled grid (candidate id + G/fit/detect badges, each cell a thumbnail
  linking its full render). Side-by-side compare is native (one page; or open cells in tabs).
  Optionally a **headed browser** (browser MCP, reused from QA) walks the human through each render.
  The sheet degrades gracefully to a file the human opens — `browser` is optional.
- **Feedback = the elicitation MCP** already used for HITL park/resume.

**`cap.gate.prune-and-steer`** (replaces the thin `cap.gate.human-disambiguate`). State machine
`noop-initial → sheet-built (kind:script) → parked (elicitation) → resolved`, collecting per candidate:
`{ candidate_id, verdict: keep|branch|compose|reject, rank, likes[], dislikes[], notes }`. Tags are a
closed vocab over the design axes already in the feature space (`layout, type, color, space, motion,
feel`) so likes/dislikes are machine-consumable. Fail-fasts: `NO_CANDIDATES_TO_PRUNE` (empty eligible
spread — upstream failed, don't present nothing) and `PRUNE_UNRESOLVED` (resume missing a verdict for
any presented candidate — no silent partial prune).

**Closing the loop:** the prune output is the annealing gradient. `refine`/`diverge` consumes it —
`keep`→survive, `branch`→variations, `compose`→the crossover/recombine path, `reject`→drop the
lineage; and `likes/dislikes/rank` become **steering constraints appended to the next generation
prompt** (alongside the aesthetic foundation): "amplify {liked axes of the top-ranked}, avoid
{disliked}." The human's stated preferences are the fitness signal the next spread anneals toward —
this is what makes it *annealing*, not one-shot generate-then-pick. Lineage (keep/branch/compose) IS
the run tree.

**Dry-run proof BEFORE any paid generation.** The human loop is the least-proven half, so prove it for
**zero generation cost**: drive `flow.anneal` with **stub candidates** (or real corpus renders as
stand-ins) → contact sheet → the human actually clicks through and reacts via elicitation → workflow
parks + resumes → `refine` demonstrably consumes the steer. Only then does the first **credited Kimi**
spread flow through an already-proven gate.

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
- **Increment I-b — prune-and-steer, the human fitness function (§6b).** Upgrade the prune from
  keep/reject to `cap.gate.prune-and-steer`: `contact-sheet.mjs` presentation → per-candidate
  `{verdict, rank, likes[], dislikes[], notes}` via elicitation MCP (parked) → the steer flows into
  the next `diverge`. Fail-fasts `NO_CANDIDATES_TO_PRUNE` / `PRUNE_UNRESOLVED`. **Exit = a FREE
  dry-run:** drive `flow.anneal` on stub/corpus stand-in candidates, a real human pass through the
  gate, and `refine` demonstrably consuming the steer — proven before any paid generation. This is
  now the load-bearing anti-genericness mechanism for real designs, not a UX nicety.
- **Increment II — crossover, full toolchain, modes.** `cap.recombine.aspects` (mix-and-match) +
  the gate's compose action; `cap.audit.impeccable` (skill) + `cap.render.hero` + `cap.cluster`;
  `style-first` + `grid`; taste-profile learning to the flywheel; register 21st/Higgsfield.
- **Increment III — the gallery cockpit (OPTIONAL polish).** The prune-and-steer contact sheet (I-b)
  already presents thumbnails + G/fit badges + side-by-side, so a bespoke cockpit is **no longer
  load-bearing** — it's an ergonomic upgrade (richer lineage-tree view, in-place compose) over a
  proven gate, not a prerequisite. Consumes pack state; no pack change.
- **Increment IV — rollout (§4b).** `flow.rollout`: capture the winner's design system → **gated
  commodity fan-out** across a target site's surfaces (reuse `cognitive/cap.implement.*` + PR-open),
  every surface held to `G>τ / detect=0 / fit≥floor` (anti-regression). `design`→frontier,
  `rollout`→commodity affinities. Needs real generation wired (21st + Kimi) + curated corpora first.

- **Increment V — component design (§4c).** `flow.anneal.component` (new + upgrade modes) reusing
  the spine + scoped apply; adds the **consistency-to-system gate**, the **UX-role fit** (composes
  with `-max`), and the **candidate-0 warm start**. Constraints invert (match the site DNA, not flee
  the generic centroid).

**Dogfood targets (when the flows + real generation are in):** run the full **anneal → capture →
gated rollout** against the sibling repos **`allumata-site`** and **`preveti-site`** (wired as
writable `repo_root`s). The real proof — surfaces pack bugs the stub can't (cf. the tflo-site QA
dogfood).

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

A third primary risk governs the **rollout** (§4b): **rollout-regression-to-generic** — commodity
models mechanically applying the winner's design drift back to the cookie-cutter default surface by
surface (S:High, P:High). Mitigated to Low by carrying the SAME `G`/`detect`/`fit` eligibility into
the per-surface rollout loop (a regressing surface fails the gate + retries, never ships) — the
design floors double as the rollout's anti-regression guard.
