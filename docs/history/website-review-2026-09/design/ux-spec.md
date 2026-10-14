---
project: nirmaan-website
agent: ux-designer
status: ready-for-handoff
confidence: MEDIUM
assumptions:
  - >-
    The homepage's structure below the hero (services teaser, process teaser,
    testimonials, footer nav) was not described in the input, so it isn't
    audited here — only what's explicitly given (hero, CTAs, social-proof line)
    is evaluated. This is a real coverage gap, not an oversight.
  - >-
    The Formspree-style endpoint on Contact returns a standard success/error
    response (no multi-step confirmation page); flows below assume an AJAX-style
    submit with inline state change, not a page redirect, since contact-form.js
    is described as handling 'validation, posts to a Formspree-style endpoint'
    client-side.
  - >-
    The Project Estimator widget's internal logic (inputs, calculation, output
    format) was not specified in the input — it is treated as an open question,
    not assumed.
  - >-
    No mobile-nav-specific script is named among the five listed
    (page-transitions.js, layers-3d.js, tilt.js, contact-form.js,
    device-switcher.js), so the mobile nav's implementation (custom JS vs.
    CSS-only checkbox pattern vs. framework default) is unknown and flagged
    rather than assumed broken.
  - >-
    The two named clients (Sudaangeo.in, Khelshiksha.com) are the full extent of
    visible social proof described; no additional client roster was given.
inputs:
  - |-
    ## What this is

    Nirmaan is a small custom website & software development studio. This is a
    review of Nirmaan's OWN publ...
outputs:
  - design/ux-spec.md
decisions: []
risks:
  - >-
    Primary hero CTA ('Start Your Project') is the highest-commitment ask on the
    page, but the majority of first-time visitors to a small studio's homepage
    are cold evaluators, not ready buyers — sending them straight to a contact
    form skips every trust-building step and risks premature bounce.
  - >-
    The Services page's 13 cards mix service types, technical layers, and
    quality attributes as if they were parallel offerings (see 'Backend & API
    Development' vs 'Database & API Development' — near-duplicate cards), which
    reads exactly like the 'vibe-coded' impression the founder flagged,
    independent of any visual styling.
  - >-
    'Work that speaks for itself' (Projects H1) is a case-study-depth promise
    the described structure doesn't back up — a project grid plus a
    device-preview toggle shows visual output, not client outcomes,
    problem/solution narrative, or proof of results.
  - >-
    Pricing signal exists (Project Estimator) but is siloed on Contact, the last
    page in the funnel — a visitor comparing 'Business Websites' vs 'Custom Web
    Applications' on Services has nowhere to get a rough cost signal before
    deciding whether contacting is worth their time.
  - >-
    No stated CTA from Projects back into the funnel — if 'View Our Work'
    succeeds at building interest, there's no described mechanism to convert
    that interest without the visitor falling back on global nav.
  - >-
    Device-switcher (device-preview toggle) on the Projects page is a
    desktop-oriented feature with unclear mobile behavior — previewing a 'mobile
    view' while already on a mobile device is a redundant or confusing
    interaction if not deliberately adapted.
open_questions:
  - >-
    What does the Project Estimator actually output — a number, a range, a
    lead-qualifying question set — and does its result feed into the contact
    form below it, or is it a disconnected widget? This is a business-logic
    decision the PRD/founder needs to specify before the flow can be finalized.
  - >-
    Is there a stated policy on displaying pricing beyond the estimator (e.g.,
    'starting at' anchors on Services cards)? Many custom-dev studios
    deliberately withhold pricing to force a conversation — need founder
    confirmation this is/isn't the intended posture before recommending a
    Services-page pricing signal.
  - >-
    Does case-study content (client outcomes, problem/solution copy, metrics,
    testimonials) actually exist for the two named clients, or does the 'Work
    that speaks for itself' page currently rely on visuals alone because that's
    all that exists? This determines whether the gap is a structural omission or
    a content-production gap outside UX scope.
  - >-
    What handles the mobile hamburger menu open/close, and does it currently
    trap focus / return focus to the trigger on close? None of the five named
    scripts obviously own this — needs confirmation from whoever built it
    (likely Design System Engineer / dev) before accessibility rules below can
    be verified as met vs. still required.
  - >-
    Is there a Formspree success/error UI already, and does it move focus or
    announce state to assistive tech, or does the form just show a color change?
    Needed to know whether the accessibility rule below is a gap or already
    satisfied.
review_required: true
---
# Nirmaan Marketing Site — Structural UX Review

Scope: structure and flow only, independent of visual polish. This is a review of a live, shipped six-page site against one question — **does the structure help a visitor decide whether to hire this studio, or does it work against that decision?** Every point below is anchored to what's actually on the site as described; anything I couldn't verify from the input is called out as an open question rather than assumed.

---

## 1. Sitemap (as-is, annotated)

```
Home (index.html)
├─ Hero: eyebrow + H1 ("We Build / Digital Experiences / That Work.") + subhead
│  ├─ CTA: "Start Your Project" (primary) ──────────► Contact
│  └─ CTA: "View Our Work" (secondary) ─────────────► Projects
├─ Social proof line: "Trusted by businesses including Sudaangeo.in and Khelshiksha.com"
└─ [unspecified below-the-fold sections — not covered by input, flagged as gap]

Services
└─ 13 flat cards, no stated grouping (Custom Website Development, Business
   Websites, Website Redesign, E-commerce Websites, Performance Optimization,
   Website Maintenance & Support, Custom Web Applications, Backend & API
   Development, Database & API Development, Business Automation, Custom Admin
   Panels & Dashboards, Mobile-Responsive Web Development)
   → no stated CTA per card or page-level CTA into Contact

Projects
├─ Project grid ("Work that speaks for itself")
└─ Device-switcher: device-preview toggle (per-project? page-level? not specified)
   → no stated CTA back into Contact

Process
└─ 5 numbered steps: Discover → Plan → Design → Build → Launch & Support

Technology
└─ 4 groupings: Frontend / Backend / Database / Tools & Infrastructure

Contact
├─ Project Estimator widget (logic unspecified — open question)
└─ Contact form (validated client-side, posts to Formspree-style endpoint)
```

**Structural read:** every core PRD-implied feature (services listing, portfolio, process transparency, tech credibility, contact) is present — the sitemap isn't missing a page. The problem is **connective tissue between pages**, not page inventory: two of five content pages (Services, Projects) appear to dead-end rather than funnel forward, and the one page carrying a pricing signal (Contact) is the page furthest from where pricing questions actually arise (Services).

---

## 2. Core flow: first-time visitor → contact

**Persona (implied by the brief, not invented):** a business owner evaluating whether to hire a small dev studio — cold or lightly-referred traffic, high-consideration purchase, comparison-shopping against other studios/freelancers.

```
Land on Home hero
   │
   ├── reads eyebrow + H1 + subhead (states the studio builds full-stack
   │   systems, not just front-end — good differentiator, correctly placed
   │   above the fold)
   │
   ├── sees social proof line (2 named clients) — thin but real; correctly
   │   placed near the CTAs where trust is needed most
   │
   ▼
Two competing CTAs, same viewport
   │
   ├─► "Start Your Project" (primary emphasis)
   │      │
   │      ▼
   │   Contact page — form + estimator, no case-study or service detail
   │   surfaced first
   │      │
   │      ├─ FRICTION: a cold visitor who clicked because "Start Your
   │      │  Project" was the most visually prominent CTA — not because
   │      │  they'd already decided — is now asked to commit before
   │      │  seeing a single project outcome, service scope detail, or
   │      │  price anchor. Primary-CTA emphasis is optimized for the
   │      │  minority of visitors who arrive pre-sold, not the majority
   │      │  doing first-pass evaluation.
   │      │
   │      ▼
   │   Fills form / estimator → submits → [state unknown, see §4]
   │
   └─► "View Our Work" (secondary emphasis)
          │
          ▼
       Projects page — grid + device-switcher
          │
          ├─ FRICTION: page promises "Work that speaks for itself" but
          │  the described structure (grid + device-preview toggle) shows
          │  visual output only — no problem/client/outcome narrative per
          │  project. A visitor sold on visuals still lacks the business
          │  case (what problem was solved, for what kind of business,
          │  with what result) that would move them to contact.
          │
          ├─ FRICTION: no stated CTA out of this page. If the visitor
          │  IS convinced, they must self-navigate via global nav to
          │  Contact — every extra unprompted navigation step is a
          │  chance to lose them, especially on mobile.
          │
          ▼
       Visitor either backtracks to nav → Contact, or leaves.
```

**Direct answer to "do the two CTAs serve different intents or fragment attention?"**
The *existence* of two CTAs mapped to two intents (ready-to-commit vs. still-evaluating) is a defensible, conventional pattern — that part isn't the problem, and I'd call it fine at MEDIUM-HIGH confidence as a structural choice. The actual fragmentation is downstream: **neither path reconverges.** "Start Your Project" skips proof entirely; "View Our Work" dead-ends without an ask. A visitor who wants both proof and a low-friction way to act after seeing it has no single good path. Fix at the structural level (not visual): every content page (Services, Projects, Process, Technology) needs an explicit, consistent secondary CTA into Contact, and the primary hero CTA's dominance over "View Our Work" should be reconsidered given that cold B2B traffic typically wants evidence before commitment — worth an A/B framing, but flagging the default hierarchy as an assumption worth challenging.

---

## 3. Core flow: mobile nav

State inventory (per constraint: no flow ships without its non-happy-path states):

| State | Expected behavior | Status |
|---|---|---|
| Closed (default) | Hamburger icon visible, current page not otherwise indicated | Unverified — no nav-owning script named |
| Open (tap) | Menu overlays/pushes content, focus moves into menu, first link or close control receives focus | **Open question** — not covered by any of the five named scripts |
| Open → item selected | Menu closes, page-transitions.js direction-aware transition runs, focus moves to new page's H1 | **Risk**: if page-transitions.js doesn't reset focus per navigation, keyboard/SR users are stranded at old scroll position with no orientation cue |
| Open → dismiss without selecting (tap outside / Escape) | Menu closes, focus returns to hamburger trigger | **Open question** |
| Reduced motion preference set | Transition/open-close animation should be instant or minimal, consistent with the stated site-wide prefers-reduced-motion policy | Likely satisfied given input states "all motion respects prefers-reduced-motion" — but this specific interaction wasn't confirmed, not assumed here |

This is the one flow where the input genuinely doesn't tell me enough to assess pass/fail — it's called out above as an open question rather than guessed at, per the escalation rule for undefined business/technical logic.

---

## 4. Core flow: Contact page — Project Estimator + form

This is the page most directly tied to the founder's "no visible pricing signal" gap — worth walking in full, including the states a review this thorough shouldn't skip.

```
Arrive at Contact (from hero CTA, nav, or a content-page CTA if one existed)
   │
   ▼
H1: "Have an idea? / Let's build it."
   │
   ├─► Project Estimator widget
   │      │
   │      ├─ EMPTY STATE: no inputs selected yet — what does the widget show?
   │      │  (a static prompt? a placeholder number? nothing?) — unknown.
   │      │
   │      ├─ FILLED STATE: user selects/enters inputs → widget computes
   │      │  something → OPEN QUESTION: is the output a number, a range,
   │      │  or a soft qualifier like "let's talk"? This is load-bearing:
   │      │  if the estimator doesn't ultimately surface a real number or
   │      │  range, it's presented as solving the "no pricing signal" gap
   │      │  while actually just being a longer path to the same contact
   │      │  form — a trust cost if visitors feel misled by the framing.
   │      │
   │      ├─ RELATIONSHIP TO FORM BELOW: does a completed estimate
   │      │  pre-fill the contact form (project type, budget band) so the
   │      │  visitor doesn't re-enter the same information twice? If not,
   │      │  the two widgets duplicate effort on the same page — a real
   │      │  friction point regardless of visual design.
   │      │
   │      ▼
   ├─► Contact form
   │      │
   │      ├─ VALIDATION ERROR STATE: contact-form.js validates client-side
   │      │  — errors must be programmatically tied to fields (see §5),
   │      │  not just visually indicated.
   │      │
   │      ├─ SUBMIT / LOADING STATE: posts to Formspree-style endpoint —
   │      │  needs a visible pending state (button disabled + label
   │      │  change, or spinner) so a slow network doesn't read as a
   │      │  dead button.
   │      │
   │      ├─ SUCCESS STATE: what confirms receipt? Inline message,
   │      │  redirect, or nothing? OPEN QUESTION — not specified in input.
   │      │  Whatever it is, needs to be announced to assistive tech
   │      │  (see §5) since this is likely an AJAX submit, not a reload.
   │      │
   │      └─ ERROR STATE (network/endpoint failure): is there a fallback
   │         (e.g., "email us directly at X") if the Formspree-style post
   │         fails? Not specified — a form with no failure fallback is a
   │         dead end for exactly the visitor motivated enough to have
   │         filled it out.
```

**Direct structural read:** the Estimator's mere presence partially answers the "no pricing signal" critique in the brief — it's evidence the studio has already recognized this gap. The actual issue is placement and connection: it sits on the last page of the funnel rather than where price-sensitivity first arises (Services, while comparing "Business Websites" against "Custom Web Applications"), and its relationship to the form beside it is unconfirmed. Recommend, pending founder input on the open question above: surface a lightweight version or link to the estimator from Services, and make the estimator's output pre-fill the form rather than sit next to it as a separate exercise.

---

## 5. Accessibility requirements (interaction-level, testable)

These are scoped to what the described scripts actually do — not generic WCAG boilerplate — so QA can test each one directly against a named feature.

1. **layers-3d.js (Three.js hero + "architecture" section scenes):** canvas must be `aria-hidden="true"` or otherwise excluded from the accessibility tree — it's decorative, not content-bearing per the brief's description. Tab order must skip the canvas entirely; a keyboard user tabbing through the hero should go eyebrow → H1 (if focusable/skippable) → CTA 1 → CTA 2 without ever landing "inside" the 3D scene.
2. **tilt.js (tilt-on-hover cards, used on Services' 13 cards and Projects grid):** tilt is a hover-only enhancement. Keyboard-focused and touch-activated cards must expose the same information/affordance the tilt reveals on hover — no content or interactive target should be hover-only. Focus ring must remain visible and undistorted by the tilt transform.
3. **page-transitions.js (direction-aware transitions):** each transition must move DOM focus to the new page's H1 (or a skip-link target) on completion — a keyboard/screen-reader user must not be left focused on a now-removed element or at a stale scroll position. Must not intercept or break the browser back/forward button.
4. **device-switcher.js (Projects device-preview toggle):** must be a real `<button>` (or `role="button"` with full keyboard support), with `aria-pressed` reflecting current state and an accessible name that states what device is currently shown (e.g., "Switch to mobile preview", not an icon alone).
5. **contact-form.js (validation + submit):** validation errors must be linked to their field via `aria-describedby`, not conveyed by color/position alone. On submit failure, focus must move to an error summary (or the first invalid field). On submit success, the confirmation must be announced via `aria-live="polite"` (or equivalent), since the input describes a client-side post, not a page reload.
6. **Project Estimator widget:** all inputs must be labeled form controls (not click-only custom chips with no accessible name); the computed result region must be `aria-live="polite"` so screen-reader users receive the output without having to re-discover it.
7. **Mobile nav (owning script unconfirmed — open question in frontmatter):** hamburger trigger must be a real button with `aria-expanded` reflecting open/closed state; opening must trap focus within the menu; Escape must close it; closing must return focus to the trigger; the nav itself must be a landmark (`<nav aria-label="Primary">` or similar) with the current page marked `aria-current="page"`.
8. **Global:** confirm one `<main>` per page, heading order doesn't skip levels (each page's stated H1 should be the single H1), and the reduced-motion policy already claimed for the site ("all motion respects prefers-reduced-motion") is verified against each of the five scripts individually, not just the two most visibly animated ones (layers-3d, page-transitions) — tilt.js and device-switcher.js transitions need the same check.

---

## 6. Responsive/structural rules by breakpoint

1. **Services (13 cards):** at mobile width, a flat 13-card stack is a long, undifferentiated scroll with no way to jump to a category. Rule: regardless of visual treatment, mobile needs either (a) grouped sections with anchor/jump navigation, or (b) the card count structurally reduced per §7 recommendation below — a flat list of 13 is a mobile scroll-fatigue problem independent of card styling.
2. **Hero 3D scene (layers-3d.js):** rule needed beyond prefers-reduced-motion — a viewport/performance-based fallback (static image or gradient) below a defined width or on detected low-power devices, since a full Three.js scene in the hero is a real first-paint cost on mobile networks, which is where a meaningful share of first-time evaluators will land.
3. **Tilt-on-hover (tilt.js):** must no-op cleanly on touch — there is no hover state on touch devices, so cards must convey their full hierarchy/content in the static (non-tilted) state. Rule: nothing on a Services or Projects card may be legible or discoverable only via the tilt/hover interaction.
4. **Device-switcher (Projects):** open question flagged above — but as a structural rule regardless of the answer: previewing "how this looks on mobile" while the visitor is already on a mobile device is either redundant or needs a distinct mobile-specific behavior (e.g., default to showing the desktop preview, since that's the view the mobile visitor can't otherwise see). This needs an explicit decision, not a default carried over unchanged from desktop.
5. **CTA stack order on mobile hero:** with two CTAs of different visual weight, confirm the primary ("Start Your Project") doesn't visually or logically get buried below the secondary at narrow widths — button stacking order should preserve the same primary/secondary hierarchy as desktop.

---

## 7. Direct answers to the three framing questions

**Do the two hero CTAs fragment attention?** Not by existing — by not reconverging. Recommend keeping both, but auditing whether "Start Your Project" should remain the higher-emphasis default for cold traffic, and mandating that every content page (not just the hero) carries a consistent path into Contact.

**Is 13 service cards discoverable or overwhelming?** Overwhelming, and specifically for a citable reason: the list isn't structured by any single logic — it mixes project types (E-commerce Websites), technical layers (Backend & API Development, Database & API Development — near-duplicate cards), ongoing services (Website Maintenance & Support), and a quality attribute presented as if it were a purchasable service (Mobile-Responsive Web Development). That flat, unstructured enumeration is a concrete, specific instance of the "vibe-coded" feeling the founder named — it reads like a keyword list, not a curated offering. Recommend collapsing to a small number of parent offerings (e.g., 3–5: Websites, Web Applications, Backend/Data Systems, Ongoing Support) with the current 13 nested underneath as deliverables/capabilities, not as 13 parallel front-door choices.

**What's structurally missing?** Two specific things, both already partially present but misplaced or unproven: (1) pricing signal exists (the Estimator) but sits on the last page instead of where price-comparison actually happens (Services); (2) case-study depth is promised by the Projects H1 ("Work that speaks for itself") but unsupported by the described structure (grid + device-preview only, no problem/outcome narrative) — and this is compounded by a credibility-scale mismatch worth surfacing directly to the founder: 13 advertised service lines against visible proof of only 2 named clients. That gap between claimed breadth and shown depth is arguably a bigger trust issue, structurally, than either CTA or card-count problem above.
