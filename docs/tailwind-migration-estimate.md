# What migrating to Tailwind + shadcn would cost

Requested as a number, not an argument. Measured from the current tree on 2 Sept 2026.

## What exists now

| | |
| --- | --- |
| CSS | **813 lines** — `landing.css` 428, `app.css` 361, `globals.css` 24 |
| TSX + CSS together | **3,172 lines** |
| Shipped surfaces | 5 — `/`, `/app`, `/app/cover`, `/app/policy`, `/app/funds` |
| Planned surfaces | 2 more — Engine, Activity |

Components split into two kinds, and the split is the whole estimate:

**Identity-carrying — 391 lines that no library can supply.** `Gauge` (125), `PayoffA` (100),
`RunState` (87), `CumChart` (65), `Wordmark` (14). These are SVG instruments styled through
CSS classes on SVG elements. They would have to be translated to utility classes by hand and
re-checked visually, and nothing is gained by it: there is no shadcn load-line gauge.

**Scaffold — 695 lines that a library could plausibly supply.** `PolicyEditor` (182),
`Checklist` (169), `FundsActions` (146), `TopBar` (107), `Sidebar` (91).

But of the shadcn primitives that would replace them, we use **one**: a dropdown menu, in
`TopBar`, which is 30 lines including its click-outside and Escape handling. We use no
dialogs, no tabs, no toasts, no skeletons — those were on the list before the shell existed,
and the shell did not need them.

## The cost

| Step | Time | Risk |
| --- | --- | --- |
| Install Tailwind v4, PostCSS, theme config for the eight tokens | 1–2 h | low |
| Translate 813 lines of CSS to utilities | **6–10 h** | medium — it is not mechanical |
| Re-verify the quality floor on every surface, twice | **3–4 h** | this is where it bites |
| Replace `TopBar`'s dropdown with shadcn's | 1 h | low |
| **Total** | **1.5–2.5 days** | — |

That is the entire remaining budget, and it lands on 4–5 September, displacing Engine,
Activity and the states pass.

### Why the CSS is not a mechanical translation

It carries decisions, not just declarations. The graduation field is a
`repeating-linear-gradient` under a horizontal `mask-image` so it fades away from the middle
of a panel. The gauge's load line is a layered stroke because an SVG `filter` sized in
percentages collapses on a zero-height bounding box. The cumulative chart is a step path.
`landing.css` scopes section padding to `.sec` specifically so it cannot reach a page it was
not written for. Each of those is a debugging round already spent; each has to survive the
move.

### What has to be re-proven, per surface

Ten properties, every one of which took a debugging round to find the first time:

zero horizontal overflow at 390 / 768 / 1440 / 1920 · server-rendered shell populated without
JavaScript · focus rings visible on dark · AA contrast · landing fold fits 100vh at four
viewport sizes · animations start from visible · `prefers-reduced-motion` renders static ·
tables scroll inside their own container · timestamps UTC · filters work without JavaScript

Five surfaces × four widths is twenty overflow checks alone, and a utility-class migration is
exactly the kind of change that breaks the invisible ones — overflow, the no-JS shell, the
fold — because nothing about it looks wrong in review.

## What it buys

Visually, nothing. The brief requires every library component to be restyled to our tokens
before it lands, so the result would be identical by construction. The gain is future
maintainability and a more familiar idiom for the next contributor.

## The cheaper option, and why it is worse

Tailwind could be installed and used **only** for the two remaining views, leaving the
existing CSS alone. That is about two hours and carries almost no risk to what is already
verified.

It also leaves two styling systems in one codebase, which is worse than either alone — and it
is the version most likely to be read as indecision rather than restraint.

## Recommendation

Not before the 8th. The honest case for doing it is maintainability, and this codebase's
horizon is the submission. If it goes ahead it should be after Engine, Activity and the states
pass, with notifications cut — and with the understanding that it consumes the remaining
budget and re-opens ten verified properties for no visible gain.

If the reason is that Tailwind is expected by reviewers rather than needed by the code, that
is a real reason and worth saying out loud — but it is a different reason, and it would be
cheaper to satisfy in the README than in the stylesheet.
