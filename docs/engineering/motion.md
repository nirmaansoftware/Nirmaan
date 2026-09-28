# Motion design standard · IMPLEMENTED (nirmaan.online, ip.nirmaan.online)

How Nirmaan designs and builds motion: page loads, scroll reveals, product
explainers, and page transitions. The **UI Designer** specifies motion and the
**Frontend Engineer** builds it (see their `agent.md`); QA checks it against the
checklist at the end.

Reference implementations: the `motion` layer in `/styles.css` (nirmaan.online)
and `site/` in `nirmaansoftware/ip-nirmaan` (ip.nirmaan.online).

## 1. What motion is for

Motion earns its place by **showing structure**: the order things happen in,
what depends on what, what something is made of. If an animation only says
"look, it moves", cut it.

- **Show the real thing moving.** A product's own output (a plan printing, a
  pipeline advancing) beats an abstract flourish. If the motion depicts
  something that isn't real output, caption it as an illustration.
- **Once, not forever.** An entrance plays once. Explainers get a Replay
  button instead of looping. Nothing auto-moves for more than 5 seconds
  without a way to pause it (WCAG 2.2.2); the nirmaan.online ticker pauses on hover.
- **Motion never carries content.** The HTML holds every final value: the
  real number, the full text. Motion only animates toward it. With JavaScript
  off, or motion reduced, the page is complete and still.

## 2. Vocabulary

Use these names in specs and code, so a spec line like "the heading rises"
maps directly to one pattern.

| Name | What it does | Where it's used |
|---|---|---|
| **rise** | A headline comes up from its baseline, line by line (each line clips its own overflow) | Hero and page titles |
| **assemble** | A 5x5 glyph builds cell by cell, bottom row first, the way a structure is built | Logo, section glyphs |
| **reveal** | A block rises in once as it enters the viewport; its heading is uncovered from the baseline | Sections, cards |
| **draw** | A line or edge is drawn like a line on a drawing (`scaleX` or `stroke-dashoffset`) | Section rules, flows, graphs |
| **latch** | A state locks in when its evidence or trigger arrives | Step sequences, ladders, gates |
| **print** | Text appears line by line, as in a terminal | Command-line output |
| **count** | A number counts up to the value already in the HTML | Stat tiles |
| **build** | A page is laid down block by block (view transition with a stepped sprite mask) | Page-to-page navigation |
| **scene** | A story pinned in place and scrubbed by scroll: one progress value (0 to 1) drives every element's own span, so the reader sets the pace and can go back. Written in its finished state; pinned only when it fits the screen (zoomed down a little if it nearly fits), otherwise it stays still | Home "problem to system", ip.nirmaan.online "How it works" |

A new pattern gets a name here before it ships.

## 3. Timing and easing

Use the shared tokens instead of new curves:

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Anything arriving: rise, reveal, latch |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Anything travelling or being drawn |
| `steps(n)` | stepped | Pixel and block effects (build, cursor blink) |

| Kind | Duration |
|---|---|
| Hover, focus, colour change | 150 to 250 ms |
| Entrance of one element (rise, reveal) | 600 to 1000 ms |
| Stagger between siblings | 45 to 90 ms per item |
| Explainer sequence, start to end | 2 to 5 s, then stop |
| Page transition | 500 to 800 ms |

Choreograph with one delay variable per item (`--i`, `--d`, `--n`) and
`calc()`, not a separate rule per child.

## 4. How to build it

1. **Opt in, don't opt out.** Set a class on `<html>` (`motion`) only when
   JavaScript runs and `prefers-reduced-motion: reduce` does not match. Scope
   every animated rule to it. Without the class the page is in its final state.
2. **Default styles are the final state.** Write the resting, complete look
   first, then describe the starting state under `.motion ...:not(.is-in)`.
3. **Animate only cheap properties:** `transform`, `opacity`, `clip-path`,
   `stroke-dashoffset`, and colours (fill, border, background) on small
   elements, which repaint but never re-layout. Never animate `width`,
   `height`, `top`/`left` or margins. To move something by a fraction of its
   parent, put it on a full-width rail and translate the rail.
4. **Trigger with IntersectionObserver**, once per element, then unobserve.
   Explainers restart by removing the class, forcing reflow
   (`void el.offsetWidth`), and adding it back.
5. **Platform first.** CSS animations and transitions, scroll-driven
   animations (behind `@supports (animation-timeline: scroll())`), cross-document
   View Transitions, SVG with `pathLength="1"` for drawing, and
   `requestAnimationFrame` for counters. No animation library without a
   written reason (see coding standards).
6. **Listen for a mid-visit change** to the reduced-motion preference and drop
   the `motion` class when it turns on.
7. **Accessibility inside the motion:** text hidden while it prints uses
   `visibility: hidden`, so layout never shifts; a counting number is
   `aria-hidden`, and its label carries the final value.

## 5. Specifying motion (UI Designer)

Every moving element in a design spec gets one line:

```
<element>: <vocabulary name>, <trigger>, <duration> <easing>, <delay/stagger>.
  Reduced: <what it shows instead>.  Why: <the structure it reveals>.
```

Example: `Assurance ladder: latch, on entering view, 500 ms ease-out, 1 s
between rungs. Reduced: all rungs latched, refusal shown. Why: work climbs one
state at a time and needs evidence for each.`

A spec line without a "Why" or a "Reduced" state is incomplete.

## 6. Checklist (Frontend Engineer before handoff, QA at review)

- [ ] With reduced motion on, the page is complete: every value and line is visible.
- [ ] With JavaScript off, the page is complete.
- [ ] Every animated rule is scoped to the opt-in class.
- [ ] Only the cheap properties in 4.3 animate; no layout shift (CLS stays 0).
- [ ] Nothing loops or auto-moves for more than 5 s without a pause.
- [ ] Explainers have a Replay button that is keyboard reachable.
- [ ] Anything depicting output that isn't real is captioned as an illustration.
- [ ] Checked at 390 px and desktop, in light and dark.
