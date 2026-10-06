# Design system

The visual system for arlingtonview.org. Tokens live in `src/styles/tokens.css`, everything else in
`src/styles/global.css`. This file records the decisions and the numbers behind them so later pages can
follow the system instead of reinventing it. Where this file and the spec (plan, Part 1, section 5)
disagree, the spec wins.

## Subject and idea

Arlington View is a small historic neighborhood in Arlington, Virginia (formerly Johnson's Hill). The logo
is a line elevation of the Harry W. Gray house: a brick rowhouse with a bracketed cornice and a dentil
course, shuttered arched windows, and a full-width porch. The audience is neighbors, many on phones, who
want one thing first: when and where the next meeting is. The site answers that, then gets out of the way
of documents and county links.

The idea: indigo ink on warm paper, set like a well-kept public notice. Everything is typography and
rules. The one flourish, the cornice, comes from the house itself.

Hard limits: no client JavaScript, no imagery beyond the logo, no shadows, no rounded cards, no motion,
no gradients except the cornice dentils, no italics (none are loaded), no all-caps or letterspaced labels,
no icons or arrows in link or button text, no dark mode at launch. Headings and labels are sentence case.

## Color

Pinned by the spec. Do not add hues.

| Token | Value | Role |
|---|---|---|
| `--indigo` | `#3A3796` | accent: links, primary button, logo, the cornice |
| `--ink` | `#1B1B1F` | body text, headings |
| `--paper` | `#FBFAF7` | page background |
| `--tint` | `#ECEBF6` | next-meeting block and callouts only |
| `--rule` | `#D9D7CF` | hairlines, table row rules |
| `--ink-soft` | `#55545E` | secondary text |

### Contrast (WCAG 2.x relative luminance, computed from the hex values)

| Foreground | Background | Ratio | AA normal text (4.5) |
|---|---|---|---|
| `--ink` | `--paper` | 16.45 | pass |
| `--ink` | `--tint` | 14.54 | pass |
| `--indigo` | `--paper` | 9.29 | pass |
| `--indigo` | `--tint` | 8.21 | pass |
| `--paper` | `--indigo` (button) | 9.29 | pass |
| `--ink-soft` | `--paper` | 7.14 | pass |
| `--ink-soft` | `--tint` | 6.31 | pass |

`--rule` on `--paper` is 1.38. It is decoration only: never use `--rule` for text or for a boundary that
a control depends on. Do not set text in any pairing not listed here without measuring it first.

### Indigo against the logo source

Sampled from `design/logo-source.jpg` (house region, pixels with luminance under 90, n = 20,791): median
`#34327B`. The most saturated tenth of those pixels: `#31318A`. Against `#3A3796` that is 5 to 9 points
low in red and green and 12 to 27 low in blue. The strokes are about 2px wide and the JPG is chroma
subsampled, so paper bleeds into the ink color and the sample reads darker and greyer than the original
artwork would. `--indigo` stays `#3A3796` as the spec pins it.

## Type

- Display and headings: EB Garamond 400, 500, 600. Body and UI: Source Sans 3 400, 600. Self-hosted through
  fontsource (`latin-<weight>.css` entry points), latin subset, upright only.
- `--font-display: "EB Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`
- `--font-body: "Source Sans 3", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- `font-synthesis-weight` and `font-synthesis-style` are `none`, so a missing weight or style falls back
  to a real file instead of a smeared fake. `em` renders as weight 600, upright.

| Token | Size | Use |
|---|---|---|
| `--step--1` | 0.875rem (14) | footer, secondary dates, restacked table labels |
| `--step-0` | 1.0625rem (17) | body |
| `--step-1` | 1.3125rem (21) | h3, entry titles |
| `--step-2` | 1.75rem (28) | h2; h1 on phones |
| `--step-3` | 2.25rem (36) | h1 from 40rem up |
| `--step-4` | 3rem (48) | reserved |
| `--step-display` | `clamp(2.25rem, 1.5rem + 3.5vw, 3.75rem)` | the next-meeting date only (`.display`) |

- Line height: body 1.55, headings 1.15, display 1.05. Prose measure `--measure: 70ch`.
- Weights: h1 and h2 Garamond 500, h3 Garamond 600, display date Garamond 400. Body 400; emphasis and
  table headers 600.
- Figures: `lining-nums` wherever Garamond sets dates or times, `tabular-nums` in tables and file dates.
  The fontsource latin subset has no `lnum` or `onum` feature; its default figures are already lining, so
  `lining-nums` is a statement of intent that costs nothing.
- Wordmark: the text "Arlington View" in EB Garamond 500, `font-variant-caps: small-caps`,
  `letter-spacing: 0.12em`, matching the JPG (large A and V, small capitals between). Beneath it,
  "Civic Association" in Source Sans 3 400 at `--step--1`, `--ink-soft`.
- Small caps are synthesized. The fontsource latin subset of EB Garamond carries no `smcp` feature
  (GSUB features present: `dnom frac liga locl numr pnum rlig tnum`), so browsers scale down the capitals.
  At wordmark size the lighter stems of the scaled capitals are visible on close inspection. True small
  caps would need a different build of the font (the upstream family has them).

## Space

`--space-1` 0.25rem, `-2` 0.5rem, `-3` 0.75rem, `-4` 1rem, `-5` 1.5rem, `-6` 2rem, `-7` 3rem, `-8` 4rem,
`-9` 6rem.

Page sections are separated by `--section-gap`: `--space-7` on phones, `--space-8` from 40rem up.
Whitespace is the main separator. Rules mark boundaries that carry meaning (header and footer edges, table
rows, list entries), not every block.

## Layout

- Single column, left-aligned. Text and blocks are never centered. `.container` is `max-width: 72rem`,
  centered in the viewport, with `--gutter` side padding: 16px at phone width, growing to `--space-6`.
- Prose sits in `.measure` (70ch) at the left edge of the container. The empty right side at wide widths
  is deliberate.
- One breakpoint, 40rem, phone-first. No fixed widths; nothing scrolls horizontally at 320px.
- Header: mark and wordmark on the left, nav on the right. When they do not fit on one line the nav wraps
  beneath the brand as a plain flex-wrapped list. No menu button.

## The cornice

The top edge of the next-meeting block, and nothing else on the site, carries a cornice taken from the
house: a 2px `--indigo` rule with a dentil course beneath it (6px teeth, 5px tall, 12px pitch), drawn as a
CSS background on `.cornice`. No image. In print the teeth drop and the rule stays.

## Components

Classes are flat: one class per selector, `:where()` for nested elements, so utilities always win a tie
by source order and nothing needs `!important`.

| Class | What it is |
|---|---|
| `.container` | page-width wrapper with gutters |
| `.measure` | 70ch prose column |
| `.stack` | vertical rhythm: `> * + *` gets `--stack-gap` (default `--space-4`); margins are otherwise reset to 0 |
| `.sections` | same, at `--section-gap`, for the top-level sections of a page |
| `.visually-hidden` | available to screen readers, not drawn |
| `.soft`, `.small` | secondary text color; `--step--1` size |
| `.display` | the next-meeting date |
| `.button` | the one primary action in a block: solid indigo, paper text, Source Sans 600, 2px radius, 44px minimum height. Secondary actions are plain links, never ghost buttons |
| `.notice` | tint ground, padded (`--space-5`, `--space-6` from 40rem). With `.cornice` it is the next-meeting block |
| `.callout` | same ground and padding, no cornice, no accent bar |
| `.cornice` | see above; next-meeting block only |
| `.entries` / `.entry` / `.entry-title` | ruled entry list: auto-fit grid (min 14rem), each entry a 1px top rule, a Garamond heading link, one line of body text |
| `.table` | left-aligned table with 1px row rules and tabular figures. Under 40rem each row restacks as a block and each cell is labelled from `td[data-label]`, so every `td` needs a `data-label` |
| `.files` / `.file` / `.file-date` | plain list: a link plus a secondary date |
| `.site-header`, `.brand`, `.site-nav` and friends | `src/components/Header.astro` |
| `.site-footer` and friends | `src/components/Footer.astro` |
| `.skip-link` | first focusable element on every page |

Links are indigo with a 1px underline at 0.15em offset that thickens to 2px on hover. The nav is the one
exception: `--ink`, no underline until hover or focus, and the current section (`aria-current="page"`)
gets a 2px indigo bottom border. Focus is a 2px indigo outline at 2px offset on everything.

Print: nav, skip link, and footer links are hidden; tokens flip to black on white; no tint ground.

Markup conventions:

- Every page uses `src/layouts/Base.astro` (`title`, optional `description`, optional `lastUpdated`) and
  has exactly one `h1`.
- Every internal href and asset URL goes through `withBase()` from `src/lib/paths.ts`. External links
  open in the same tab.
- `.table` loses native table semantics in some browsers once it restacks. Tables with more than a
  couple of columns should add `role="table"`, `role="row"`, and `role="cell"` in markup.

## Logo

Source: `design/logo-source.jpg` (539 x 559, indigo line drawing above the wordmark). No vector original
was available. If one turns up, replace the traced files with it and delete this section's procedure.

Files:

- `src/assets/logo.svg`: the house only, one path, `fill="currentColor"`, viewBox `0 0 371.8 392.3`
  (source pixels). Inlined in the header and colored by `color: var(--indigo)`. The wordmark is live text.
- `src/assets/logo-mono.svg`: identical geometry, `fill="#1B1B1F"`. Footer.
- `public/favicon.svg`, `public/favicon.ico`: see below.

How `logo.svg` was produced (vtracer 0.6.5, sharp 0.35.5):

1. Prepare the raster with sharp: extract the house at left 70, top 46, width 400, height 412 (this drops
   the wordmark); greyscale; resize to 8x (3200px wide) with the `lanczos3` kernel; `blur(2.4)`;
   `threshold(150)`; `dilate(3)`.
2. Trace: `vtracer --input house.png --output logo-raw.svg --colormode bw --mode polygon
   --filter_speckle 16 --path_precision 1`
3. Tidy with a short script: apply each path's `translate`; simplify every ring with Douglas-Peucker at
   3 raster px (0.375 source px), which turns JPG stair-stepping back into straight lines; divide by 8;
   replace each vertex that turns less than 40 degrees with a quadratic curve through it (control point
   at the vertex, ends at half the adjacent segment or 9 units, whichever is shorter), which smooths the
   window arches; shift the bounding box to the origin; round to one decimal; emit one `path`.

The `dilate(3)` step is a deliberate departure from the source: it takes the strokes from about 2.1 to
about 3.1 source pixels (0.5% to 0.8% of the drawing's height). At source weight the strokes are 0.24px
wide in a 44px mark. The traced weight still renders light at 44px on a 1x display (about 0.35px
strokes); it is clean at 2x and above and at 200px.

Result: 123 rings, 1,160 vertices, 21.2 KB (7.9 KB gzipped).

## Favicon

The full drawing turns to mush at 32px, so the favicon is a separate hand-authored mark on a 32-unit
grid: the cornice band, the two facade walls, three arched upper windows, the porch roof, three posts, a
railing, and the base, in `#3A3796` on a `#FBFAF7` tile with a 3-unit radius. The tile keeps the mark
visible on dark tab strips, where bare indigo all but disappears. Edges sit on even coordinates so the
mark stays sharp at 16px. `favicon.ico` is a single 32 x 32 PNG rendering of the SVG (sharp) in an ICO
container.

## Fonts shipped

Five `@font-face` rules, each with a woff2 and a woff source (the woff fallback comes with the fontsource
entry point; no current browser requests it). Base.astro preloads the two faces every page needs: Source
Sans 3 400 and EB Garamond 500.

| File | woff2 bytes | woff bytes |
|---|---|---|
| EB Garamond 400 | 23,820 | 28,608 |
| EB Garamond 500 | 25,264 | 30,208 |
| EB Garamond 600 | 25,348 | 30,400 |
| Source Sans 3 400 | 15,696 | 19,900 |
| Source Sans 3 600 | 15,668 | 19,900 |
| Total | 105,796 | 129,016 |
