---
project: nirmaan-website
agent: creative-director
contributors: [design-system-engineer, ui-designer]
status: current
confidence: HIGH
supersedes: docs/history/website-review-2026-09/design/visual-direction.md
assumptions:
  - Line numbers are from website/src/static/styles.css at nirmaansoftware/Nirmaan af420ce (main, 2026-10-17). A PR that moves lines updates the citations it touches.
  - Contrast ratios below were computed from the token hex values with the WCAG 2.x relative-luminance formula, not measured in a browser.
risks:
  - Section 9 lists places where the shipped CSS breaks this document. Until they are fixed, a PR that copies them is copying a known defect, not precedent.
open_questions:
  - Should the error colour (#C2261B) become a token with its own dark value? See 9.4.
review_required: true
---
# Nirmaan visual direction (current)

**Status: IMPLEMENTED.** This describes nirmaan.online as it is built. Design
key 1 checks a PR against it (`docs/operations/pr-review-decisions.md`, Design
row: "the written visual direction"). A reviewer cites the line in this file
that a diff breaks. A diff that makes this document untrue must update it in
the same PR.

It succeeds the dated record in
`docs/history/website-review-2026-09/design/visual-direction.md`. That record
critiqued an earlier, dark-only, indigo site. Almost all of it no longer
describes the site, and it stays unchanged as history. Where the two disagree,
this document wins.

**Shared layer.** `styles.css`, `site.js` and `hero.js` are copied byte for
byte into ip.nirmaan.online (`ip-nirmaan/site/nirmaan.css`, `site.js`,
`hero.js`). Everything here applies to both sites. A PR that touches those
files names the IP pages it affects.

Sources: `website/src/static/styles.css` (cited as `css:LINE`),
`website/src/static/site.js` (`site.js:LINE`), `website/src/static/hero.js`,
`website/src/_includes/base.njk` (`base.njk:LINE`), `website/.eleventy.js`,
and `docs/engineering/motion.md` (`motion.md:LINE`).

## 1. The idea

Everything comes from the logo: a 5x5 pixel grid, a heavy grotesk wordmark and
a monospaced descriptor (css:6-8). From that:

- **Built, not decorated.** Structure is drawn with 1px hairlines on a flat
  paper ground. There are no gradients-as-decoration, glow, glass cards or
  tilt.
- **Square corners.** No `border-radius` anywhere; inputs reset it to 0
  (css:1087).
- **One accent, spent sparingly.** Blueprint blue marks the current thing:
  the active nav link, the progress bar, the block still being laid, a
  reached step, the hover state. It is never a background wash for a whole
  section.
- **Things assemble bottom row first,** the way a structure goes up. This
  covers the logo, glyphs, page-head marks and the hero N (css:416-417,
  css:1536-1541, hero.js header).

A new motif must trace back to one of these four.

## 2. Colour tokens

All colours are custom properties on `:root` (css:30-44). Each is defined once
for light and again for dark: under `prefers-color-scheme: dark` when the
visitor has not picked light (css:71-80), and under `[data-theme="dark"]` for
an explicit choice (css:81-88). The theme toggle cycles system, light, dark
and is remembered in `localStorage` (`nirmaan-theme`, base.njk:74-75,
site.js section 2). `theme-color` metas match `--paper` in each theme
(base.njk:31-32).

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#F1F1EC` | `#0E0E0F` | Page ground |
| `--paper-2` | `#E8E8E2` | `#17171A` | Recessed panel, cards, `.section--tint` |
| `--paper-3` | `#DEDED7` | `#202024` | Pressed or hover panel |
| `--ink` | `#131313` | `#EDEDE7` | Text, primary fills, inverse panels |
| `--ink-2` | `#4F4F4A` | `#B2B2AA` | Secondary text |
| `--ink-3` | `#6A6A64` | `#8C8C85` | Meta and mono labels |
| `--line` | ink at 11% | ink at 10% | Hairlines |
| `--line-2` | ink at 22% | ink at 20% | Stronger hairlines, card borders |
| `--blue` | `#2E43F5` | `#8190FF` | The accent |
| `--blue-ink` | `#FFFFFF` | `#0B0B14` | Text on blue |
| `--blue-wash` | blue at 9% | blue at 12% | Tinted fills (focus ring, marks, spotlight) |
| `--blue-on-ink` | `#8190FF` | `#2E43F5` | Blue on an `--ink` panel |
| `--grid` | ink at 5.5% | ink at 5% | Blueprint grid lines |

Rules:

- **No raw colour outside the token block.** A new colour is a new token,
  with a light and a dark value and its contrast ratios in the PR. Today's
  exceptions are listed in 9.4.
- **Inverse panels** (CTA band css:435-437, the current layer in the stack
  css:645, `.svc-card--all` css:692) swap `--ink` and `--paper`. Their
  secondary text is `--paper` mixed to 65 to 72% (css:165, css:444, css:693),
  never a new grey.

### Contrast (WCAG AA: 4.5:1 body text, 3:1 large text and UI)

Computed from the values above:

| Pair | Light | Dark |
|---|---|---|
| `--ink` on `--paper` | 16.4 | 16.4 |
| `--ink-2` on `--paper` | 7.3 | 9.0 |
| `--ink-2` on `--paper-2` | 6.7 | 8.4 |
| `--ink-3` on `--paper` | 4.8 | 5.7 |
| `--ink-3` on `--paper-2` | **4.4** | 5.3 |
| `--blue` on `--paper` | 5.7 | 6.8 |
| `--blue` on `--paper-2` | 5.3 | 6.3 |
| `--blue-ink` on `--blue` | 6.5 | 6.9 |
| `--blue-on-ink` on `--ink` | 6.5 | 5.5 |
| `--paper` 72% on `--ink` (CTA text) | 8.8 | 7.3 |
| `--paper` 65% on `--ink` (inverse eyebrow) | 7.4 | 5.7 |

Rules:

- `--ink-3` is for meta text on `--paper` only. On `--paper-2` in light it is
  4.4:1, below AA for small text (see 9.2).
- Do not dim text with `opacity`. Any opacity below 1 on text must be
  recomputed against its ground and pass AA (see 9.1).
- The ratio comments in the token block (css:35-42) are out of date. The
  table above is the computed source until they are corrected (9.3).

## 3. Type

Three self-hosted variable fonts (css:20-22), preloaded (base.njk:85-87),
`font-display: swap`, Latin subset. No third-party font requests.

| Family token | Font | Use |
|---|---|---|
| `--display` | Archivo 500 to 900, width 100 to 125% | Headings, card titles, big numbers |
| `--body` | Hanken Grotesk 400 to 600 | Body copy, buttons, nav |
| `--mono` | JetBrains Mono 400 to 500 | Eyebrows, labels, tags, step numbers |

(css:46-48)

**Scale** (css:50-58). Fluid between 360 px and 1440 px viewports:

| Token | Value |
|---|---|
| `--fs-hero` | `clamp(3rem, 1.6rem + 6.2vw, 8.25rem)` |
| `--fs-h1` | `clamp(2.75rem, 1.7rem + 4.6vw, 6.25rem)` |
| `--fs-h2` | `clamp(2.25rem, 1.5rem + 3.3vw, 4.5rem)` |
| `--fs-h3` | `clamp(1.375rem, 1.15rem + 0.9vw, 1.875rem)` |
| `--fs-lede` | `clamp(1.125rem, 1.02rem + 0.45vw, 1.375rem)` |
| `--fs-body` | `1.0625rem` (17 px), line-height 1.6 (css:119-120) |
| `--fs-small` | `0.9375rem` |
| `--fs-mono` | `0.75rem` |

Voice of each style:

- **`.display`** (css:138-144): Archivo 800, width 112%, tracking -0.03em,
  line-height 0.94. Headlines are set tight and heavy.
- **`.mono` / `.eyebrow`** (css:147-163): uppercase, tracking 0.12em,
  `--ink-3`. The eyebrow leads with a 0.5rem blue square, which is the logo
  cell.
- **`.lede`** (css:167-172): `--fs-lede`, `--ink-2`, max 44ch.
- **Headings** balance (`text-wrap: balance`) and paragraphs use
  `text-wrap: pretty` (css:130-131). Measures stay at 38 to 58ch.
- The hero headline is sized to its column with container units, so each
  line fits on one line (css:536-541, css:572).

Rule: use the scale tokens. A one-off `font-size` needs a reason in the PR.
Card titles that sit between the h3 and h2 sizes have their own `clamp()`;
`.svc-card__title` (css:685) is the pattern.

## 4. Space and layout

- **8 px module** (css:60-61): `--s1` 0.5rem, `--s2` 1rem, `--s3` 1.5rem,
  `--s4` 2rem, `--s5` 3rem, `--s6` 4rem, `--s7` 6rem.
- **Section rhythm:** `--section` is `clamp(5rem, 3rem + 8vw, 10rem)`
  (css:62). Sections after the first are separated by a hairline (css:202);
  `.section--tight` is 0.6 of that (css:203).
- **Container:** `.wrap` is max `--max` 82.5rem, with gutters
  `--gutter` = `clamp(1.25rem, 0.6rem + 2.8vw, 3rem)` that respect safe areas
  (css:63-64, css:194-199). The page never scrolls sideways
  (`overflow-x: clip` on body, css:124).
- **Nav height:** `--nav-h` 4.25rem (css:65). Anchors and pinned scenes
  offset by it (css:110, css:637, css:666).
- **Grids** use `minmax(0, 1fr)` columns so long words cannot widen a track.
  They collapse at 70, 60, 56, 48, 40, 36 and 30rem (see the `@media` rules
  per component).
- **Hairline grids:** gap 1px on a `--line-2` background, so the gaps draw
  the lines (`.scope` css:705-709, `.packages` css:810). Prefer this to
  per-cell borders.

## 5. Components

Each component defines every state it can be in. A new component, or a new
state, follows the same table.

| Component | Rest | Hover | Focus | Active / current | Disabled / error | Source |
|---|---|---|---|---|---|---|
| `.btn` | ink fill, paper text, min-height 3.25rem | blue fill, `--blue-ink` text | global 2px blue ring, offset 3px (css:136) | `translateY(1px)`; on touch `scale(0.97)` (css:1488) | `[disabled]` 55% opacity, no pointer | css:236-255 |
| `.btn--ghost` | transparent, `--line-2` border | ink fill | as above | as above | as above | css:250-251 |
| `.btn--inverse` | paper on ink panels | blue | as above | as above | as above | css:248-249 |
| `.link-arrow` | underline drawn by background, min-height 2.75rem | blue, arrow moves 0.25rem | as above | | | css:257-268 |
| Nav link | `--ink-2` | `--ink`, blue underline draws in | as above | `aria-current` keeps the underline | | css:287-298 |
| `.svc-card` | `--paper-2`, `--line` border | whole card turns blue; odd glyph cells shrink | same as hover | touch `scale(0.985)` | | css:674-693 |
| `.input` | paper, `--line-2` border, min-height 3.1rem | `--ink-3` border | blue border plus 3px `--blue-wash` ring | | `aria-invalid` red border (9.4) | css:1084-1101 |
| Layer (stack) | `--paper-2` | | | current: ink panel, `--blue-on-ink` tech label | | css:614-646 |
| Theme toggle | 2.5rem square, `--line` border | `--ink`, `--line-2` border | as above | icon shows the mode | hidden without JS | css:327-338 |

Shared parts: the glyph and logo shortcodes (`.eleventy.js`; any 5x5 pattern
becomes an icon, css:232-233), `.tags` (mono chips, css:495-500), `.ticks`
(square bullets, css:503-511), `.page-head` (blueprint grid, glyph on the
right, last cell blue, css:392-422), `.cta-band` (ink panel with falling
blocks, css:435-462), and `.footer` (css:465-492).

Rules:

- **No shadows** except the input focus ring (css:1094), the highlighter
  underline on marks (css:775) and the phone page-slide edge (css:1702-1704).
- **Hover confirms, it does not perform.** It changes colour or border, or
  nudges an arrow by 0.25rem. No tilt, no lift, no glow. The desktop card
  spotlight is a `--blue-wash` radial that follows the pointer, only with a
  fine pointer (css:1652-1660).
- Every interactive element has a visible `:focus-visible` (the global ring,
  css:136) or its own equivalent.

## 6. Phone layout (at or below 48rem, checked at 390 px)

- **Nav:** links fold into the burger at 64rem (css:354-357); the nav CTA
  hides at 30rem (css:358-360). The menu is a full-height sheet under the
  bar, built from the top a row at a time (css:363-389, css:1476-1480).
- **Dock:** a fixed bottom bar with the main CTA and two links, min-height
  3.25rem (css:1446-1473, base.njk:122-127). It appears once the first
  screen's buttons have scrolled away (site.js "The dock"). The footer gets
  bottom padding so the dock never covers it (css:1472).
- **No backdrop blur on phones.** The nav and dock use a near-solid
  `--paper` at 97% because re-blurring on every scroll frame stuttered
  (css:1459-1464). Desktop keeps the blur (css:274-276).
- **Swipe rows:** `[data-swipe]` lists become one card plus a peek of the
  next (84%), snap, with dots and a count (css:1406-1443, site.js 4b).
- **Hero:** one screen, mark first, full-width buttons at 40rem
  (css:558-579).
- **Tap targets at least 44 px.** Buttons and inputs meet it by size. Small
  text links get an invisible hit area on coarse pointers (css:1890-1900);
  swipe dots get one too (css:1439-1441).
- **Press feedback on touch** (css:1482-1491).
- **Small phones (360 px and below):** heading sizes and the dock are reduced
  so nothing is wider than the screen (css:1499-1511).
- **Services rail:** pinned and scrubbed on any screen at least 520 px tall,
  with the phone stretch capped at about one screen (site.js "Services
  rail"). Its rule that keeps cards clear of the dock is restored by PR #75
  (`website/shared-layer-sync`).

Rule: at 390 px wide, in both themes, there is no sideways scroll and no text
under the dock, and every tap target is at least 44 px. The PR shows it with
screenshots (Design key 1).

## 7. Motion

Motion follows `docs/engineering/motion.md`. In short:

- **It shows structure, plays once, and never carries content**
  (motion.md:11-26). The HTML holds the final state.
- **Opt in.** `html.motion` is set before first paint only when JS runs,
  IntersectionObserver exists and reduced motion is off (base.njk:67-79).
  Every hidden start state is scoped to `.motion` (css:1569-1645), and load
  animations to `prefers-reduced-motion: no-preference` (css:1521-1563).
  Reduced motion also zeroes every transition and animation (css:1731-1733),
  turns off view transitions (css:1903) and turns off smooth scroll
  (css:112).
- **Vocabulary:** rise, assemble, reveal, draw, latch, print, count, build,
  scene (motion.md:27-44). A new pattern gets a name there first.
- **Easing:** `--ease-out` for arriving and `--ease-in-out` for travelling or
  drawing (css:67-68, motion.md:46-62). The phone page slide's
  `cubic-bezier(0.32, 0.72, 0, 1)` (css:1697-1700) is the one other curve.
- **Durations:** hover 150 to 250 ms, an entrance 600 to 1000 ms, a stagger
  of 45 to 90 ms, a page transition 500 to 800 ms (motion.md:54-62).
- **Cheap properties only:** transform, opacity, clip-path,
  stroke-dashoffset, and colours on small elements (motion.md:74-78).
- **Page transitions:** on desktop the new page builds block by block over
  12 stepped frames (css:1662-1689). On phones pages slide like a native app
  (css:1690-1710). Browsers without view transitions get the block curtain
  (css:1715-1729).
- **Scenes** (stack, rail, problem to system) pin only when they fit
  (site.js:260, css:1604-1636). Otherwise they are still and complete.
- **Ambient motion that does not stop:** the ticker (48 s loop, pauses on
  hover, css:1544-1545), the CTA band's falling blocks (css:1548-1549) and
  the hero N's occasional blink after it settles (hero.js, `BLINK_MS`). All
  stop under reduced motion. See 9.5.

Every moving element in a PR has a motion.md spec line, with a "Reduced:"
state and a "Why:" (motion.md:93-106), and passes the checklist at
motion.md:108-117.

## 8. What Design key 1 checks against this file

A visual PR fails key 1 if it:

1. adds a colour, font size or spacing value that is not a token, without
   adding the token (sections 2 to 4);
2. adds a token without both a light and a dark value, or without contrast
   ratios in the PR (section 2);
3. puts text below AA in either theme, including through `opacity` (section
   2);
4. adds rounded corners, decorative gradients, glow, tilt or drop shadows
   (sections 1 and 5);
5. leaves a component state undefined (section 5);
6. breaks the phone rules at 390 px (section 6), or comes without light,
   dark and phone screenshots;
7. adds motion outside `.motion` or `no-preference`, or motion without a
   motion.md spec line (section 7);
8. touches `styles.css`, `site.js` or `hero.js` without naming the IP site
   pages it affects.

## 9. Known gaps (the CSS currently breaks this document)

These are defects to fix, not precedent to copy.

1. **Journey stamps are dimmed below AA.** css:1602 sets `opacity: 0.55` on
   unreached stamps, which puts `--ink-3` at 2.1:1 in light and 2.5:1 in
   dark. The comment on css:1601 says "Scale only", and
   `docs/engineering/list.md` item 13 records this exact dimming as FIXED.
   Commit 711dd12 ("WIP: ... Drop the commit if the journey timeline should
   keep main's look") brought it back. `.stamp--approve::after` at 0.75
   (css:804) is 3.0:1 in light. Fix: remove both opacities.
2. **`--ink-3` on `--paper-2` in light is 4.4:1.** Small mono text on
   recessed panels misses AA, for example `.svc-card__more` (css:679 with
   css:687). Fix: darken light `--ink-3` slightly, or use `--ink-2` on
   `--paper-2`.
3. **The ratio comments in the token block are wrong.** css:35-42 claim
   8.1, 5.3, 6.3 and 6.2; the computed values are 7.3, 4.8, 5.7 and 6.5.
   Fix: update the comments to the table in section 2.
4. **The error colour is raw.** `#C2261B` is used for invalid borders and
   the error notice (css:1095, css:1117, css:1124) and is the same in both
   themes: 5.2:1 on light paper, 3.3:1 on dark (passes 3:1 for UI). Fix:
   make it a `--danger` token with a dark value.
5. **Ambient loops have no pause control.** motion.md:20-22 says nothing
   auto-moves for more than 5 s without a way to pause it. The ticker pauses
   only on mouse hover. The CTA band blocks and the hero blink have no pause
   besides reduced motion. Fix: decide whether these count as decoration
   under WCAG 2.2.2 and either add a pause or stop them after one pass.

## History

- 2026-10-17: written from the shipped site (tracker T14). Succeeds
  `docs/history/website-review-2026-09/design/visual-direction.md`.
