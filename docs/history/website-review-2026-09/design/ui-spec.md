---
project: nirmaan-website
agent: ui-designer
status: ready-for-handoff
confidence: MEDIUM
assumptions:
  - >-
    No wireframes, user-flows.md, ux-spec.md, or visual-direction.md were
    provided as input files — this spec works entirely from the verbatim
    copy/structure given in the brief. If a UX spec or CD direction doc exists
    elsewhere, it supersedes assumptions made here.
  - >-
    Breakpoints follow Tailwind defaults since Tailwind utility classes are
    already in use: mobile <640px, tablet 640–1023px, desktop ≥1024px, wide
    ≥1280px.
  - >-
    The tilt-hover card, gradient-text span, and orb-glow are each a single
    shared CSS pattern reused across pages today (as implied by the brief), not
    already-varied per page.
  - >-
    No error/success/warning color tokens currently exist in the token set (none
    were listed), despite contact-form.js needing validation states — treated as
    a genuine gap, not an oversight in the brief.
  - >-
    Process step cards are presumed non-interactive (no navigation on click)
    unless built otherwise; flagged explicitly below because it changes their
    required state set.
inputs:
  - |-
    ## What this is

    Nirmaan is a small custom website & software development studio. This is a
    review of Nirmaan's OWN publ...
outputs:
  - design/ui-spec.md
decisions: []
risks:
  - >-
    Contrast figures below are computed from the stated hex values, not measured
    against the live rendered site (actual overlays, opacity stacking, or
    backdrop blur in the glass cards could shift effective contrast). A live
    audit with the real DOM is needed before sign-off.
  - >-
    Reducing gradient-text to homepage-only and detuning tilt intensity on the
    Services grid are visually significant changes to shipped pages — flagged
    for Creative Director confirmation before Design System Engineer implements,
    not silently rolled in as 'spec detail.'
  - >-
    Proposed error/success hues (#F87171 / #34D399) are new hue families with no
    precedent in the current palette — per decision rules this is a system
    addition, not a variant, and needs explicit CD + DSE review before adoption.
open_questions:
  - >-
    What are the current tilt.js rotation-max, easing, and duration values? Spec
    below gives target values assuming typical tilt.js defaults (~10–15deg) are
    the source of the 'gimmicky at scale' problem on the 13-card Services grid —
    needs confirmation against actual code.
  - >-
    Is #475569 (text-tertiary) currently used anywhere at body-text sizes (<18px
    normal weight)? This needs an actual audit pass across all six pages;
    flagged as a likely AA failure below but not confirmed against real usage.
  - >-
    Are the Process step cards wrapped in <a>/<button> with real tabindex/focus
    behavior today, or are they static divs? Determines whether the 'don't fake
    interactivity' fix below is a real defect or a non-issue.
  - >-
    Confirm intended contact-form.js validation state colors — do Formspree
    error responses need a distinct 'submission failed' state versus inline
    field validation, or is one error treatment sufficient?
review_required: true
---
# Nirmaan Marketing Site — Visual Design Spec
### From "needs a human touch" to a systematized fix

## 0. The verdict, stated plainly

**The palette and type pairing are not the problem. The specific values chosen, and the restraint applied on top of them, are.**

Dark neutral background + indigo accent + Inter/Manrope is a legitimate, professional system for a dev studio — dark-mode-only devtool aesthetics are on-brand for a company selling backend/API/admin-panel work, not a liability. Do not re-theme.

But look at the exact values: `#0D1117` is GitHub's dark surface color, unmodified. `#6366f1` / `#818cf8` are Tailwind's stock `indigo-500` / `indigo-400`, unmodified. This is the single most common palette combination in AI-generated and template-generated dev-tool marketing sites shipped in the last two years, because it is *the path of zero customization* in Tailwind — anyone who types `bg-slate-950 text-indigo-400` with no further thought lands exactly here. That's a real, specific, checkable claim, not a vibe: paste `#0D1117` and `#6366f1` into any "identify this palette" search and you'll get GitHub Dark and Tailwind Indigo back immediately. That is the single biggest tell that reads as "vibe-coded" — not the hue family, the fact that the hue family was never *touched*.

So: **~20% of the "templated" feeling is token-level** (values taken verbatim from someone else's defaults instead of tuned), **~80% is execution** — thin token set (8 values total, no border/elevation/semantic tokens), one card component reused unmodified across three structurally different content types, decorative motifs (gradient text, glow orbs) applied reflexively on every headline instead of once with intent, and a numbered-step pattern that is the literal industry-default agency motif with no distinguishing treatment. Those get different fixes, and both are addressed below: §1 detunes the token values without changing the theme; §3–5 fix the execution layer.

---

## 1. Token audit and extension

### 1.1 Keep, but detune (small, deliberate nudges — not a re-theme)

| Token | Current | Issue | Proposed |
|---|---|---|---|
| `color-bg` | `#080C14` | fine as-is, distinct enough from GitHub's `#0d1117` | **keep** `#080C14` |
| `color-surface` | `#0D1117` | identical to GitHub Dark's canvas color — the most-recognized dark surface hex on the web | shift to `#0B1019` (imperceptible visual difference, but no longer a 1:1 hex match to GitHub) |
| `color-elevated` | `#111827` | this is Tailwind's `slate-900`, also unmodified default | shift to `#121A2C` (slightly cooler/more blue than slate-900, ties to the indigo accent family instead of borrowing neutral gray from Tailwind's own scale) |
| `color-accent-500` | `#6366f1` | Tailwind `indigo-500`, unmodified | shift to `#5457E8` (same indigo family, ~4° cooler hue, no longer an exact Tailwind token match) |
| `color-accent-400` | `#818cf8` | Tailwind `indigo-400`, unmodified | shift to `#7B82F0` to stay paired with the new 500 |

This is the whole "fix the palette" ask: five one-line hex nudges, same theme, same mood, no longer identifiable as "opened Tailwind's color picker and stopped." Everything else in §1.2–1.4 is new tokens that don't exist yet, needed to make the system actually systematized rather than three flat surfaces and two accent shades.

### 1.2 New tokens needed (gaps in current set)

The current set has no border tokens, no elevation/shadow tokens, and no semantic (error/success) tokens — yet the site has cards (need borders), hover states (need elevation), and a validation form (needs semantic color). These aren't new decisions, they're filling real holes:

```
--border-subtle:    rgba(148, 163, 184, 0.12)   /* derived from text-secondary, not a new hue */
--border-default:   rgba(148, 163, 184, 0.20)
--border-accent:    rgba(84, 87, 232, 0.35)      /* derived from new accent-500 */

--shadow-resting:   0 1px 2px rgba(0,0,0,0.4)
--shadow-hover:     0 12px 32px -8px rgba(84,87,232,0.25), 0 4px 12px rgba(0,0,0,0.3)
--shadow-active:    0 2px 8px rgba(0,0,0,0.35)

--radius-sm:  8px   /* badges, chips, tags */
--radius-md:  12px  /* buttons, inputs */
--radius-lg:  16px  /* cards */
--radius-xl:  24px  /* large panels, project case-study tiles */
```

### 1.3 Semantic color — flagged for CD/DSE review, not decided unilaterally here

The contact form (`contact-form.js`) validates and posts to an endpoint, which means it needs error and (ideally) success states. None exist in the current palette. Per the escalation rule for "a genuinely new pattern with no existing precedent," I'm proposing, not finalizing:

```
--color-error:   #F87171   /* red-400, ~4.9:1 on #080C14, passes AA body text */
--color-success: #34D399   /* emerald-400, ~7.8:1 on #080C14 */
```
These introduce two hue families (red, green) that don't exist anywhere else on the site. **This needs Creative Director sign-off** — it's exactly the case the decision rules call out as "document explicitly as a proposed system addition, flag for review," not something a designer should silently ship into a form component.

### 1.4 Text tokens — keep values, but constrain usage (accessibility, see §6)

`text-primary #F8FAFC`, `text-secondary #94A3B8` — no change, both contrast-safe at body sizes. `text-tertiary #475569` — **keep the value but restrict its legal use** to text ≥18px or ≥14px-bold (large-text AA threshold); see §6 for why.

---

## 2. Type scale

Manrope ExtraBold (800) is currently used for all display type. **Restricting 800-weight to exactly two levels site-wide (Hero H1, top-of-page H2) and dropping card/component titles to Manrope Bold (700)** is itself part of the fix — right now if every headline down to card titles is the same maximum weight, weight stops being able to signal hierarchy at all, which is a big contributor to the "flat, templated" read.

| Level | Font / weight | Size (desktop → mobile, clamp) | Line-height | Tracking | Used for |
|---|---|---|---|---|---|
| Display/2XL | Manrope 800 | `clamp(2.75rem, 2rem + 3vw, 4.5rem)` | 1.05 | −0.02em | Hero H1 only (one per site: homepage) |
| Display/XL | Manrope 800 | `clamp(2.25rem, 1.75rem + 2vw, 3.25rem)` | 1.1 | −0.015em | Page-top H2 (Services/Projects/Process/Technology/Contact headlines) |
| Display/L | Manrope 700 | `1.75rem → 1.5rem` | 1.15 | −0.01em | Section sub-headers within a page |
| Display/M | Manrope 700 | `1.25rem` (20px) | 1.3 | −0.005em | Card titles (service/project/tech/step) |
| Body/L | Inter 400 | `1.125rem` (18px) | 1.6 | 0 | Hero subhead, intro paragraphs |
| Body/M | Inter 400 | `1rem` (16px) | 1.6 | 0 | Default body, card descriptions |
| Body/S | Inter 500 | `0.875rem` (14px) | 1.5 | 0 | Meta, nav labels, form labels |
| Body/XS | Inter 600 | `0.75rem` (12px) | 1.4 | +0.08em, uppercase | Eyebrow text, badges |
| Figure/Display | Manrope 800 | `clamp(2.5rem, 2rem + 2vw, 4rem)` | 1.0 | −0.01em, tabular-nums | Process step numbers only (see §5) — deliberately separated from the headline scale, not reused from Display/2XL, because it plays a structural/wayfinding role, not a reading role |

## 3. Spacing scale

Tailwind's own 4px-based scale is already fine as a raw scale — the problem isn't the increments, it's that there's no *semantic* layer on top of it, so section padding gets eyeballed per-page instead of pulled from one token. Fix: keep the raw scale, add named semantic tokens that every page must use for the same purpose.

Raw scale (px): `4, 8, 12, 16, 24, 32, 48, 64, 96, 128`

Semantic tokens (apply identically across all six pages — this is the actual fix, not the numbers themselves):
```
--space-card-padding:      24px   (32px on Project cards specifically, larger surface)
--space-card-gap:          24px
--space-section-y-desktop: 96px
--space-section-y-tablet:  64px
--space-section-y-mobile:  48px
--space-content-max:       1200px  (grid container)
```

---

## 4. Component spec — tilt-hover card

**Diagnosis first:** this is the highest-leverage fix on the site. One card component, one tilt behavior, applied unmodified to 13 short service tiles, a handful of large project case studies, and small tool/tech logo chips. Three structurally different content types get zero visual differentiation — that's what makes a page of 13 identical tilting rectangles read as "a component was dropped in a loop," which is precisely the founder's complaint. The fix is not a new card per page (that's a one-off); it's one base primitive with three documented variants, which is exactly the "does this generalize" test the system needs to pass.

### 4.1 Base primitive (shared by all three variants)

- Surface: `--color-elevated`, border `1px solid var(--border-subtle)`, radius `--radius-lg`
- Padding: `--space-card-padding`
- Shadow (resting): `--shadow-resting`

### 4.2 States (apply to all variants unless overridden below)

| State | Visual spec |
|---|---|
| **Default** | resting shadow, `border-subtle`, no transform |
| **Hover** (mouse/pointer only) | tilt transform per variant below; border → `border-accent`; shadow → `--shadow-hover`; background steps up one elevation tick (`#121A2C` → `#16203A`); transition `220ms cubic-bezier(0.2, 0.8, 0.2, 1)` |
| **Focus-visible** (keyboard) | **no tilt transform** — tilt is a pointer-position physical metaphor; forcing it on keyboard focus with no cursor position is disorienting and, per the brief, this is a real gap worth checking: if `tilt.js` today only binds `mousemove`, keyboard focus currently has *zero* visible feedback on these cards. Fix: `outline: 2px solid var(--color-accent-400); outline-offset: 2px`, plus the same border/shadow brightening as hover, minus the transform. |
| **Active/pressed** | tilt flattens to 0 instantly, scale `0.98`, border → full `border-accent` opacity, duration `100ms` |
| **Disabled** (e.g. "case study coming soon") | opacity `0.5`, no hover/tilt/focus treatment, `cursor: not-allowed` |
| **Loading** (if Projects grid ever lazy-loads) | skeleton at same footprint (prevents layout shift), `--color-elevated` base with a 1200ms shimmer sweep at 8% opacity, respecting `prefers-reduced-motion` by using a static pulse-opacity instead of a moving gradient |

### 4.3 Variant-specific deltas

**Service card** (13 instances, Services page)
- Max tilt: **reduce to ±3–4deg** (down from whatever the current default is, assumed 10–15deg). Thirteen cards simultaneously tilting at full intensity is where this micro-interaction crosses from "polished" to "noisy" — this is a required change, not a nice-to-have.
- Layout: icon (24px) top, Display/M title, Body/M description (2-line clamp), no image.
- **Hierarchy fix**: 13 equal-weight tiles is itself a problem independent of the card styling — recommend grouping into 3–4 labeled clusters (e.g., "Build," "Grow," "Maintain") rather than one flat 13-up grid, so the page has structure beyond "here is a wall of cards." (Flagging this to UX — it's information architecture, not mine to silently change.)

**Project card** (Projects page, few instances)
- Full tilt intensity retained: ±6–8deg — this is the flagship "look what we built" moment and there are few enough instances that it doesn't become noise.
- Image/screenshot-led, 16:9, with a meta overlay (client name, one-line tag) that fades in on hover only, `200ms` opacity transition.
- This is the one place `device-switcher.js`'s device-preview toggle lives — spec note: toggle control sits in Body/S weight in the card's top-right, not competing with the card title.

**Tech/tool card** (Technology page)
- **No tilt at all.** A 48–64px logo chip tilting on hover reads as jittery, not premium — remove the interaction entirely for this variant. Replace with: border brightens to `border-accent`, background lifts one elevation tick, `160ms` linear. This is a direct "remove a reflexively-applied default" call, not a variant of the same idea.

---

## 5. Component spec — numbered 01–05 step cards (Process page)

**Diagnosis first:** "five numbered steps" is the single most reused motif in agency/freelance-studio marketing sites — Discover/Plan/Design/Build/Launch is a genuinely good, clear structure (keeping it — that's UX's call, not mine to alter), but the *visual* treatment as five independent equal-weight tiles with bold colored numbers is the generic default. The fix is to make the numbers structural (wayfinding) rather than decorative (competing headline), and to connect the steps into one sequence instead of five unrelated cards that happen to be numbered.

### 5.1 Typography relationship (the core fix)

Today (per brief) the number and the step title are both likely near-maximum weight/size, competing for the same read. Fix: **the number recedes, the verb leads.**
- Step number: `Figure/Display` scale (§2), rendered as **outline/low-fill only** — either `-webkit-text-stroke: 1.5px var(--color-accent-400); color: transparent` or solid fill at `rgba(248,250,252,0.08)` — never a solid saturated color at full opacity in the default state. It reads as structural typographic furniture, not a second headline.
- Step title (Discover/Plan/Design/Build/Launch & Support): `Display/M`, Manrope 700, full `text-primary` — this is what should actually draw the eye first.

### 5.2 Structure: connect the steps, don't just number them

Add a connecting spine between step markers — horizontal on desktop, vertical on mobile — using `border-default`. As the section scrolls into view, the spine segment behind the current/passed step fills solid `color-accent-400` (progressive reveal), turning five static tiles into one visible sequence. This is the actual differentiator from every other "01/02/03" pattern: the numbers aren't just labels, the line between them is doing work.

### 5.3 States

| State | Spec |
|---|---|
| Default | number at low-fill/outline, spine segment `border-default` |
| Hover (desktop only, and only if the step is a real interactive target — see open question) | number brightens from outline to solid `text-tertiary`, incoming spine segment brightens |
| **In-viewport / "current step"** (scroll-linked class, not a pointer state) | number switches to solid `color-accent-400` fill, spine segment leading into it fills solid, step scales `1.02`. **Respect `prefers-reduced-motion`: skip the scroll-linked transition, render the in-view state statically as soon as the section mounts, no animated fill.** |
| Focus-visible | **only apply if the step card is a genuine interactive element** (e.g. it jumps to a case study). If it's static/decorative today, it should carry no `tabindex`, no focus ring, no hover cursor change — wrapping non-interactive content in fake-interactive markup (a `<div>` styled like a button, or an `<a href="#">` with no real destination) is itself a "vibe-coded" tell worth auditing for. This is flagged as an open question above because I can't confirm from the brief which case is true today. |

### 5.4 Responsive behavior

- **Desktop (≥1024px):** 5-across horizontal, number above title, spine runs full width between markers.
- **Tablet (640–1023px):** 2–3 per row, wraps; spine breaks into per-row horizontal segments (no diagonal/wrapping line — visually cleaner to let it break at the row edge).
- **Mobile (<640px):** single column, vertical spine down the left edge, number + title horizontally paired at the top of each block, body copy indented to align under the title.

---

## 6. Accessibility check (computed from stated hex values — flagged as needing live-DOM confirmation, see risks)

| Pairing | Approx. contrast | Verdict |
|---|---|---|
| `text-primary #F8FAFC` on `bg #080C14` | ~19:1 | Passes AAA, no issue |
| `text-secondary #94A3B8` on `bg #080C14` | ~8:1 | Passes AAA |
| `text-tertiary #475569` on `bg #080C14` | **~4.2:1** | **Fails AA (4.5:1) for normal body text.** Passes only for large text (≥18px regular or ≥14px bold). Action: audit every current use of this token — if it's on meta text, timestamps, or footnotes under 18px, either bump those instances to `text-secondary` or restrict `#475569` to genuinely large/decorative contexts only. Flagged as open question above since I can't confirm actual usage sizes without the live site. |
| `accent-500` (`#6366f1`/new `#5457E8`) as **standalone text color** on `bg #080C14` | **~3.7:1** | **Fails AA for normal text**, borderline-passes for large text only. Rule: never set body/link text color directly to accent-500. Use it only as a fill (button background), border, or icon color. |
| `accent-400` (`#818cf8`/new `#7B82F0`) as text on `bg #080C14` | ~5.2:1 | Passes AA normal text — this is the accent shade to use for inline links, highlighted words, focus rings. |
| Proposed `error #F87171` on `bg #080C14` | ~4.9:1 | Passes AA |
| Proposed `success #34D399` on `bg #080C14` | ~7.8:1 | Passes AAA |

**Tap targets:** every interactive element (nav links, CTAs, card click-areas, the Contact page's Project Estimator controls) gets a minimum 44×44px hit area, even where the visible label is smaller — pad the tappable region, don't shrink the target to match a compact label.

---

## 7. Things to remove outright — reflex defaults, not considered choices

1. **Gradient-text on every hero headline.** The brief lists five separate page headlines (Services, Projects, Process, Technology, Contact) each ending in a short emphasized phrase, plus the homepage H1. If all six get the same gradient-span treatment, gradient text has stopped meaning anything — it's just what headlines look like on this site, which is the definition of a reflex default. **Fix: restrict gradient text to the homepage hero H1 only** (the "front door," where one moment of maximum emphasis is earned), and let the other five page H2s use `Display/XL` weight + `text-primary` solid, with at most `accent-400` solid-color (not gradient) on the closing word if emphasis is still wanted. One gradient moment on the whole site reads as a choice; six reads as a default that was never turned off.

2. **Glow "orb" blur behind the hero, specifically.** The hero already has a real, considerably more expensive, custom-built Three.js 3D layer scene providing depth. A flat CSS radial-blur orb underneath it is redundant — it's competing with genuine dimensionality instead of supporting it, and it's the single most common "cheap depth" filler in template heroes precisely because it's easy to add without doing the work the 3D scene already does. **Remove the orb from the hero.** If the ambient-glow motif is wanted on pages *without* the 3D layers (Services/Process/Technology/Contact), keep it there — but as a single low-opacity orb, fixed position, not stacked with the grid background and other effects.

3. **The faint indigo grid background — keep this one.** Unlike the orb, it's cheap, subtle, and it's thematically appropriate (a "systems/technical" motif for a company that builds backends and APIs). This is an example of a motif that doesn't need removing, just doesn't need doubling up with an orb underneath it.

4. **Maximum-weight (Manrope 800) applied to card titles.** As covered in §2 — if display weight never varies, weight can't carry hierarchy. Card titles drop to 700.

5. **Uniform tilt intensity regardless of card count or content size.** Covered in §4.3 — same rotation angle on a 13-up grid of short text cards and a 4-up grid of large project imagery is the same "one card component, no variants" problem as the visual styling itself.

---

## 8. Handoff to Design System Engineer

Build order suggested:
1. Land the five detuned base tokens (§1.1) plus the new border/shadow/radius tokens (§1.2) — non-controversial, no new hues, ship first.
2. Type scale (§2) and semantic spacing tokens (§3) — mechanical, unblocks everything else.
3. Base card primitive + three variants (§4) — highest-visibility fix, do before touching Process.
4. Process step component with spine + scroll-linked state (§5) — needs the base tokens from step 1 and the type scale from step 2.
5. Hold on error/success tokens (§1.3) and the gradient-text/orb removal (§7) until Creative Director confirms — both are flagged for review, not blocked-and-forgotten, but they shouldn't ship silently inside a "systematization" PR.

Everything above traces to a named token or an explicitly-flagged proposed addition — nothing here is a one-off hex value or a per-component magic number that isn't in §1–3.
