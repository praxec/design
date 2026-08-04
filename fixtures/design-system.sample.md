# ALLUMATA design system — captured from the approved agencies landing (design C, polished)

> Source of truth: `allumata-agencies-landing.APPROVED.html` (operator sign-off 2026-08-03, landing-page
> scope). This is the portable system the rollout applies across allumata-site + allumata-saas. Consistency
> = these tokens + component patterns; LAYOUT adapts fit-for-purpose per surface (landing / blog / app).

## Color tokens (roles)
| token | hex | role |
|---|---|---|
| `--ink`        | #1f2330 | primary text, rules |
| `--ink-soft`   | #52586a | secondary text |
| `--paper`      | #f5f0e4 | page background (warm) |
| `--paper-deep` | #ece4d1 | raised/alt surface |
| `--accent`     | #b34a1f | rust — primary accent |
| `--accent-deep`| #8a3512 | rust — hover/emphasis |
| `--teal`       | #1d5c56 | teal — secondary (two-tone) |
| `--teal-soft`  | #2f7a72 | teal — soft/supporting |
| `--hair`       | #cfc5ad | hairline rules/borders |

## Type
- Family: `Georgia, "Iowan Old Style", "Times New Roman", serif` (transitional serif).
- Scale (editorial, dense): body 12 / 13 / 13.5 / 14 / 14.5 / 15 / 17 / 19 / 21 / 22px; display 40–42px.
- ROLLOUT NOTE: tokenize this scale into named steps (`--fs-caption … --fs-display`); prefer rem over
  the source px so it scales. Reserve UPPERCASE for short labels only (the one remaining `all-caps-body`
  warning to avoid).

## Layout / structure
- 12-column editorial grid, `max-width: 1240px`; constrained reading measures (60ch / 34ch / 22ch).
- Hairline rules as the structural idiom; numbered section markers (01…07) where content is a real sequence.
- Generous padding; symmetric header margins; calm, readable (not busy).

## Component patterns (to formalize during capture)
- Section = eyebrow/kicker + numbered label + display heading + constrained body.
- Buttons: primary (accent fill) + ghost. Hairline-framed cards. Audit form block.

## Adaptation rules per layout-type (fit-for-purpose)
- **Landing** (marketing conversion): the editorial treatment above, as approved.
- **Blog / long-form**: single-column reading measure, the type scale + palette, lighter chrome — NOT
  the multi-column landing grid.
- **App screens** (allumata-saas): the tokens (color/type) + components, in a DENSE, functional layout
  (dashboards/forms/data) — never the landing hero/editorial composition. Fit = density, scannability.

## Rollout gates (per surface — commodity can't regress)
Each rolled surface must: use ONLY these tokens (no off-system colors/fonts), carry the design DNA
(distinctiveness in-family), stay detect-usable (0 blocking), and be fit-for-purpose for its layout-type.
