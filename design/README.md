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
rules. The one flourish, the cornice, comes from the house itself. The home page takes the idea literally:
its hero is the next meeting, set as a notice posted on the wall of the house (see "The meeting notice").

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
| `--step-display` | `clamp(2.25rem, 1.5rem + 3.5vw, 3.75rem)` | reserved; it set the next-meeting date before `--step-hero` took over |
| `--step-hero` | `clamp(3.25rem, 1.5rem + 8vw, 7.5rem)` | the month and day in the home meeting notice only (`.notice-monthday`) |

- Line height: body 1.55, headings 1.15, display 1.05, the hero month and day 0.95. Prose measure
  `--measure: 70ch`.
- Weights: h1 and h2 Garamond 500, h3 Garamond 600, the hero month and day and the lead Garamond 400.
  Body 400; emphasis and table headers 600.
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
- One general breakpoint, 40rem, phone-first. The home meeting notice adds two of its own: 48rem, where
  the cornice steps up to its larger scale, and 56rem, where the notice becomes two columns. No fixed
  widths; nothing scrolls horizontally at 320px.
- Header: mark and wordmark on the left, nav on the right. When they do not fit on one line the nav wraps
  beneath the brand as a plain flex-wrapped list. No menu button.

## The cornice

The top edge of the home meeting notice, and nothing else on the site, carries a cornice taken from the
house. Top to bottom: a 3px `--indigo` crown rule, a dentil course, and a 1px `--indigo` fascia rule 3px
beneath the dentils. It projects past the wall (the tint ground) on both sides, so it reads as a piece of
the building and not as a border.

| | Under 48rem | From 48rem |
|---|---|---|
| Dentil (`--dentil-width` x `--dentil-height`) | 6px x 5px | 8px x 7px |
| Pitch (`--dentil-pitch`) | 12px | 16px |
| Projection each side (`--cornice-overhang`) | 6px | 10px |
| Total height (`--cornice-height`) | 12px | 14px |

- Pure CSS on `.cornice::before`: the crown and fascia are its top and bottom borders, and the dentils
  are a hard-stopped `linear-gradient` clipped to its content box. No image, no extra markup. The
  dimensions are custom properties on `.cornice` (`--cornice-crown`, `--cornice-gap`, `--cornice-fascia`,
  and the four in the table), so both sizes and print share one rule set.
- The course always begins and ends on a whole tooth. `padding-inline` on the pseudo-element is half of
  what is left over after fitting whole pitches (`mod()`), floored to a whole pixel (`round()`), so every
  tooth sits on the pixel grid and the inset differs by under 2px between the two ends, at any container
  width. The declaration sits inside `@supports`, because a declaration containing `var()` is never
  dropped at parse time and so cannot serve as its own fallback. Where `mod()` and `round()` are
  unsupported the inset stays 0 and the course starts at the left edge, which can leave a part tooth at
  the right end.
- The projection is smaller than the page gutter at every width (16px minimum), so it never causes a
  horizontal scroll.
- `.cornice` sets `position: relative` and expects the block to leave `--cornice-height` of extra top
  padding; `.notice-hero` does.
- Print: the custom properties collapse to the 3px crown rule alone, with no projection.

## The meeting notice

The home page hero (`src/components/NextMeeting.astro`, classes `notice notice-hero cornice`) is the next
meeting set as a posted notice. The tint ground is the wall, the cornice projects above it, and the date is
a lockup the type carries. It is the one bold thing on the page; everything around it stays quiet.

- Heading: `Next meeting`, an `h2` in Garamond 500 at `--step-1`, `--indigo`, sentence case
  (`.notice-heading`).
- Date lockup: one `time` element holding two lines. The weekday (`.notice-weekday`) is Garamond 500 at
  `--step-2`. The month and day (`.notice-monthday`) are Garamond 400 at `--step-hero`, line height 0.95,
  `letter-spacing: -0.01em`, lining figures, never wrapping. The year is not shown; the full date with the
  year appears wherever `formatMeetingRange` or `formatMeetingDate` is used.
- The month and day are capped by their column so they never overflow. Inside `@supports (width: 1cqi)`,
  `.notice-date` is an inline-size container and the font size is `min(var(--step-hero), 19.2cqi)`: the
  widest dates (the two-digit days of November, then September) measure 5.15em at this tracking, so 19.2%
  of the column is the largest size at which every date fits on one line. In practice the cap applies in
  the two-column layout and on phones narrower than about 350px.
- Without container units the guard is skipped and the date keeps `--step-hero` alone. That is the honest
  degradation: the longest dates then overflow their line on a 320px phone and run past the column in
  the two-column layout. The guard is required; unguarded, the `cqi` declaration would be invalid at
  computed-value time and the date would fall to the inherited body size.
- Two optical corrections on the month and day: `margin-block-start: -0.05em` closes the lockup up under
  the weekday, and `margin-inline-start: -0.02em` brings the round capitals (O, S) out to the left edge
  the weekday sets.
- Two zones, split by meaning. The first is when and where (`.notice-when`): the lockup, then directly
  beneath it the time (`.notice-time`, Garamond 400 at `--step-2`, lining figures) and the place at body
  size (`Virtual meeting` or the location). The time and place are the continuation of the lockup, not a
  separate block: the gap under the month and day is `max(var(--space-3), 0.2em)`, which is `--space-3` on
  phones and grows with the type so the descenders of p, y, and g clear the time. The second zone is how
  to attend and what to do (`.notice-details`, a `.stack`): the virtual-link note with the contact link
  (`.notice-note`, 34ch), the agenda link when there is one, and the `.actions` row. An in-person meeting
  with no agenda leaves only the actions row there.
- Layout: one column under 56rem, in reading order (heading, lockup, time, place, note, agenda, actions),
  the second zone following the first after `--space-5`, with no dividing rule. From 56rem, two columns,
  `minmax(0, 1.6fr)` and `minmax(18rem, 1fr)`, with a `--space-7` gap. The heading spans both. 1.6fr is the
  smallest share that still lets the date reach its cap at the full container width: the widest date at
  111px needs 574px, and the column is 581px.
- The second zone carries a 1px `--indigo` rule on its left edge and `--space-6` of padding. The rule runs
  the full height of the two zones. Where the second zone is the shorter one its content rests at the
  bottom, and the last row of actions (44px tall, text centered) hangs below the zone by half the
  difference between its height and a body line, so its text shares a baseline with the place line. Where
  the second zone is the taller one (the two-column layout under about 69rem, or with an agenda link) it
  starts level with the weekday and the first zone keeps its place at the top.
- Padding (`--notice-pad`): `--space-5` on phones, `--space-6` from 40rem, `--space-7` from 56rem, plus
  `--cornice-height` at the top.
- Fallback (no upcoming meeting, or the calendar could not be read): the same notice, zones, and grid. The
  first zone is the standing meeting rule as a Garamond 400 lead at `--step-2`, at most 22em wide
  (`.notice-rule`), in place of the lockup. The second holds the note with the contact link and the two
  subscribe links; it is the taller zone, so it starts at the top and the note's capitals top-align with
  the rule's first line.
- Nothing in the notice depends on the build time, and nothing from a meeting is printed beyond date,
  time, place, and the agenda link.

## Components

Classes are flat: one class per selector, `:where()` for nested elements, so utilities always win a tie
by source order and nothing needs `!important`.

| Class | What it is |
|---|---|
| `.container` | page-width wrapper with gutters |
| `.measure` | 70ch prose column |
| `.stack` | vertical rhythm: `> * + *` gets `--stack-gap` (default `--space-4`); margins are otherwise reset to 0 only for the elements in the base reset (`body`, `h1` to `h4`, `p`, `ul`, `ol`, `dl`, `dd`, `figure`, `blockquote`, `table`); any other child element keeps its browser default margin, so check before putting something new in a `.stack` |
| `.sections` | same, at `--section-gap`, for the top-level sections of a page |
| `.visually-hidden` | available to screen readers, not drawn |
| `.button` | the one primary action in a block: solid indigo, paper text, Source Sans 600, 2px radius, 44px minimum height. Secondary actions are plain links, never ghost buttons. The home page has exactly one: `Add to Google Calendar` |
| `.actions` | wrapping flex row of at most one `.button` followed by plain links, vertically centered on the button; each plain link has a 44px minimum tap height. Also used for a lone plain link that needs the tap height (`How to join` under the home lead). Reusable on any page |
| `.notice-meta` | a tight group of lines inside a `.notice` (`--space-1` between lines; the `.stack` around the groups separates them) |
| `.notice` | tint ground, padded by `--notice-pad` (`--space-5`, `--space-6` from 40rem) |
| `.callout` | same ground and padding, no cornice, no accent bar |
| `.cornice` | see "The cornice"; home meeting notice only |
| `.notice-hero` | modifier on `.notice.cornice` for the home hero: the grid, the wider padding, and the top padding that clears the cornice. See "The meeting notice" |
| `.notice-heading`, `.notice-when`, `.notice-date`, `.notice-weekday`, `.notice-monthday`, `.notice-time`, `.notice-rule`, `.notice-details`, `.notice-note` | the parts of the meeting notice; not for use elsewhere. `.notice-when` is a grouping hook with no rule of its own |
| `.lead` | an opening paragraph: Garamond 400, `clamp(1.3125rem, 1.1rem + 0.9vw, 1.5rem)`, line height 1.35, `--ink`, at most 44rem wide. One per page, directly under the hero or the `h1`; it tops out a step below the notice's weekday and time so it does not compete with them |
| `.entries` / `.entry` / `.entry-title` | ruled entry list: auto-fit grid (min `min(14rem, 100%)`), each entry a 1px top rule, a Garamond heading link, one line of body text. Auto-fit can strand one entry on a last row; for a set of four use `.entries-four` |
| `.entries-four` | modifier on `.entries` for sets of exactly four: 1 column, 2 x 2 from 36rem, 4 across from 64rem (`min-width` queries). Columns are 249px wide at the 36rem switch and 216px at the 64rem switch (gutters and 2rem gap included), so none is under 12rem. Use it instead of auto-fit, which always has a width band that lands 3 + 1 |
| `.table` | left-aligned table with 1px row rules and tabular figures. Under 40rem each row restacks as a block and each cell is labelled from `td[data-label]`, so every `td` needs a `data-label` |
| `.files` / `.file` / `.file-date` | plain list: a link plus a secondary date |
| `.schedule` / `.schedule-item` / `.schedule-date` / `.schedule-details` | the upcoming-meetings schedule (`MeetingList.astro`, Meetings page only): an `ol` capped at 44rem, grouped under an `h3` per New York year. Each item is a 1px `--rule` top border (none on the first of a group) with `--space-4` above and below. The date is EB Garamond 500 at `--step-1`, `--ink`, no year; the details are body sans in a wrapping flex row (time, place in `.soft`, `Agenda` link) with a `--space-4` column gap and no separator characters. Below 40rem the details sit `--space-1` under the date; from 40rem the item is a grid, date column `minmax(14rem, 18rem)`, details `1fr`, first baselines aligned |
| `.table-archive` | modifier on `.table` for the past-meetings table: `max-width: 52rem`; the Date, Agenda, and Minutes cells never wrap (`Not posted`, `Minutes (draft)`), Materials wraps |
| `.file-group` | wraps one `.files` list (and its sub-heading) on the Documents page: `max-width: 44rem` |
| `.soft` | text in `--ink-soft`; used for "Not posted" in the past-meetings table |
| `.cell-empty` | on a `td` with nothing in it: `display: none` under 40rem only (the stacked layout would otherwise print a bare label); on wider screens the cell stays so the columns line up |
| `.site-header`, `.brand`, `.site-nav` and friends | `src/components/Header.astro` |
| `.site-footer` and friends | `src/components/Footer.astro` |
| `.skip-link` | first focusable element on every page |

Links are indigo with a 1px underline at 0.15em offset that thickens to 2px on hover. The nav is the one
exception: `--ink`, no underline until hover or focus, and the current section (`aria-current="page"`)
gets a 2px indigo bottom border. Focus is a 2px indigo outline at 2px offset on everything.

Print: nav, skip link, and footer links are hidden; tokens flip to black on white; no tint ground; the
cornice is its crown rule alone.

Markup conventions:

- Every page uses `src/layouts/Base.astro` (`title`, optional `description`, optional `lastUpdated`) and
  has exactly one `h1`.
- Every internal href and asset URL goes through `withBase()` from `src/lib/paths.ts`. External links
  open in the same tab.
- The site builds with `trailingSlash: "always"`. Write every internal page path with its trailing slash
  (`/meetings/`, `/documents/#bylaws`, `/about/history/`); the home path is `/`. `withBase()` passes the
  path through as written and never adds a slash, so a missing one is a bug at the call site (GitHub
  Pages would answer it with a redirect). `isCurrentSection()` and the canonical link accept either form.
- `.table` loses native table semantics in some browsers once it restacks. Tables with more than a
  couple of columns should add `role="table"`, `role="row"`, and `role="cell"` in markup.

## Logo

Source: `design/logo-source.jpg` (539 x 559, indigo line drawing above the wordmark). No vector original
was available. If one turns up, replace the traced files with it and delete the tracing procedure below.

Three assets, by display size:

| File | Use | Notes |
|---|---|---|
| `src/assets/logo-small.svg` | under about 120px tall: the header mark (44px, indigo) and the footer mark (28px, ink) | hand-authored simplification, inlined, colored by `currentColor` |
| `src/assets/logo.svg` | about 120px tall and up | the full trace, `fill="currentColor"`; not on any page yet, and never inline it into every page (21 KB) |
| `src/assets/logo-mono.svg` | same sizes as `logo.svg`, where a fixed ink color is needed (e.g. as an `img`) | identical geometry, `fill="#1B1B1F"` |

The wordmark is always live text, never part of an image. The favicon is a fourth, still simpler drawing;
see below.

### The small mark

The full drawing's strokes are about 0.35px wide in a 44px mark, which renders as a pale smudge on a 1x
display. `logo-small.svg` redraws the same house for small sizes on a 46 x 48 grid (the trace's
proportions, 0.1224 scale), authored by hand with the trace as an underlay: facade walls, the cornice as a
top line with seven hanging dentils and a lower line, three arched upper windows flanked by shutters, the
porch roof, three posts on piers, three lower openings (the middle one behind the centre post, as in the
drawing), and a railing with balusters on a base.

Rules it follows, for anyone editing it:

- Nothing is thinner than 1.4 units: 1.28 CSS px at 44px tall, 1.4 at 48px. Arch strokes, sills, the
  centre post, and balusters are 1.5; walls and the cornice lines 1.5; side posts 2; shutters 2.2.
- Shutters are solid bars. Outlined shutters, as in the drawing, do not fit at this stroke weight: each
  shutter-window-shutter group is 8.4 units wide with 1.4 between groups.
- Symmetric about x = 23. Window groups start at x = 9, 18.8, 28.6 and line up between the storeys.
- Two paths: one filled (`fill="currentColor"`), one stroked for the six arches
  (`stroke="currentColor"`). 1.3 KB, 0.6 KB gzipped.

Below 28px (the footer size) it starts to close up; use the favicon drawing for anything smaller.

The footer mark is drawn at 28px tall, which is below the 1.25 CSS px stroke floor the header mark meets:
the 1.4-unit strokes render at about 0.8px there (1.4 x 28 / 48). That is accepted. The mark is
decorative (`aria-hidden`), the footer carries all its information as text, and in ink on paper at 0.8px
the strokes render as lighter lines rather than dropping out. Do not thicken it to fit: that would change
the proportions the header mark shares.

### How `logo.svg` was traced

vtracer 0.6.5, sharp 0.35.5:

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
about 3.1 source pixels (0.5% to 0.8% of the drawing's height), so the trace holds up from about 120px.

Result: viewBox `0 0 371.8 392.3` (source pixels), 123 rings, 1,160 vertices, 21.2 KB (7.9 KB gzipped).

## Favicon

Even the small mark closes up at 16 to 32px, so the favicon is a separate hand-authored mark on a
32-unit grid: the cornice band, the two facade walls, three arched upper windows, the porch roof, three posts, a
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

Two things in `dist/` ship unused, and are not worth chasing. The five `.woff` fallback files are
referenced by fontsource's per-weight CSS, so the build copies them; browsers that support woff2 (all
current ones) never fetch them. And one `_astro/logo-small.*.svg` is emitted because the SVG component
import also registers the file as an asset; the marks are inlined, so no page references it.
