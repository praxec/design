# Visual self-review — letting the generator see its own work

Every candidate this pack produced before now was designed **blind**. The
generator writes HTML, a CSS parser scores it, a human is shown the result — and
the model that designed it never once looked at what it rendered. It shows:
pages that read well as markup and poorly as pictures, hierarchy that exists in
the stylesheet and not on screen, type that is legible in a rule and not in a
viewport.

`design/cap.implement.review-and-revise` closes that loop. It is **opt-in**: it
leases a browser, and browsers are not something a pack should conjure.

## What the operator has to grant

The browser connections live in `cognitive-architectures/connections/` as
**reference templates** — deliberately not auto-loaded. Copy one into your
gateway's `connections:` block and grant it:

| template | when |
|---|---|
| `browser-playwright.yaml` | plain Linux/macOS; bootstraps Playwright's own managed Chromium |
| `browser-chrome-devtools.yaml` | WSL, or when you want to drive an existing Chrome (including a Windows-side one) |

Both are `exclusive: true` under `pool: browser`, so parallel reviews queue for
the browser rather than fighting over one Chromium. Size the pool to your
parallelism.

`praxec doctor` reports a missing connection binary as a **warning**, not an
error — the rest of the pack runs fine without it, and a run that never invokes
the review cap never needs it.

## How it runs

```
serve-preview  →  snapshot  →  review (agent + browser)  →  verify  →  copy-check
                     │                                                     │
                     └──────────────── restore ◄───────────────────────────┘
```

The reviewer navigates to the candidate **as served** (`cap.run.serve-preview`),
not `file://`. Candidates reference local artwork and font files, and a `file://`
document is restricted in what it may load — a reviewer looking at a page whose
images silently failed would "fix" problems that do not exist. It has to see
what the human will see.

Exactly **one** pass. A self-critique loop that runs until the model is satisfied
has no fixed point; the model always finds something. One pass, then the human
decides — that is what the prune gate is for.

## The guard, and why it is deterministic

A model rewriting its own file is precisely where fabrication enters. Asked to
improve a design, it is one step from improving the **words** — tightening a
heading, adding a caption the layout seems to want, dropping a line that did not
fit. For this pack that is a silent corruption: the content source is the one
thing held constant so that DESIGN is the only variable between candidates. A
revision that edits copy has changed the experiment, not the design.

So the boundary is enforced in code, not requested in a prompt:

* `run.snapshot-candidate` copies the file aside **before** the reviewer runs.
* `verify.copy-preserved` requires the visible-text multiset to be unchanged.
  Reordering is free (that is layout). Restyling, re-marking-up, swapping classes
  and swapping images are free (none of those are copy). Adding, dropping or
  rewording a single visible word is `REVISION_ALTERED_COPY`.
* `run.restore-candidate` puts the original back on any rejection.

A failed review is **not** a failed candidate. The original is intact on disk and
still eligible; the failure says the *review* did not land. A reviewer must never
be able to cost the human a candidate they might have chosen.
