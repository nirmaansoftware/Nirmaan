---
project: nirmaan-website
agent: qa-engineer
status: ready-for-handoff
confidence: MEDIUM
assumptions:
  - >-
    No source files for the actual Nirmaan marketing site (index.html,
    styles.css, page-transitions.js, layers-3d.js, tilt.js, contact-form.js,
    device-switcher.js) were present or reachable in this workspace — this repo
    is the Nirmaan agency's own Next.js orchestrator app, not the static site
    under review. This QA pass is therefore a spec-and-architecture-level review
    against the written brief, not an executed test run against live
    markup/DOM/JS.
  - >-
    The README's fallback claims ("all motion respects prefers-reduced-motion
    and degrades to a static page if a feature can't run") are treated as an
    unverified developer assertion, not a QA-confirmed fact, per the task's own
    prompt to question whether this is "a real guarantee or an aspiration."
  - >-
    The contact form currently posts to a Formspree-style endpoint; I have no
    visibility into whether a real endpoint ID is wired on the live domain
    today, so form-submission tests below are specified as must-run rather than
    reported as pass/fail.
  - >-
    "Live domain" behavior (actual production nirmaan site) was not accessed
    directly (no browser/network tool was used against it in this pass) —
    findings are derived from the written implementation description, not a live
    crawl.
inputs:
  - |-
    ## What this is

    Nirmaan is a small custom website & software development studio. This is a
    review of Nirmaan's OWN publ...
outputs:
  - testing/test-report.md
decisions: []
risks:
  - >-
    If the contact form shows client-side validation success/animation without
    confirming the POST actually succeeded, prospective clients will believe
    they contacted Nirmaan when they didn't — this directly breaks the stated
    acceptance criterion ("reach the contact flow ... without broken states")
    and is a lead-generation-killing bug for a studio whose entire funnel is
    this one form.
  - >-
    Hand-rolled page-transition JS that intercepts anchor clicks is a common
    source of keyboard-inaccessible navigation (Enter-key activation silently
    swallowed, focus not moved to the new page's heading, browser back/forward
    state desyncing from the visible page) — none of this is exercised by a
    normal mouse-driven manual QA pass, which is exactly how a 'vibe-coded' site
    ships looking fine and testing broken.
  - >-
    13 service cards in what is almost certainly a 2, 3, or 4-column responsive
    grid produces an orphaned last-row card at common breakpoints — a visible,
    screenshot-catchable polish defect that reinforces the founder's 'looks
    templated' complaint rather than a functional break.
open_questions:
  - >-
    Can QA get read access to the actual site repo (or a staging/live URL) to
    execute the test cases below rather than specify them? Without it, no bug in
    this report can be marked CONFIRMED — all are PLAUSIBLE / to-verify, and the
    go/no-go verdict is provisional.
  - >-
    Is a real Formspree endpoint (or equivalent) currently wired on the
    production domain, and does contact-form.js distinguish a failed POST from a
    successful one in its UI state, or does it optimistically show a success
    message on submit regardless of response?
  - >-
    Does page-transitions.js manage focus on route change (e.g., moving focus to
    the new page's <h1> or a skip-link target), or does it only handle the
    visual crossfade/slide?
  - >-
    Do the 13 Services cards, Process's 5 steps, and Technology's 4 groupings
    share one actual nav/footer partial, or is each of the 6 pages'
    <header>/<footer>/CTA block copy-pasted independently? (Determines whether
    cross-page drift is a live bug or a structural risk.)
review_required: true
---
# Nirmaan Website — QA Test Plan, Test Cases & Release Recommendation

## 0. Scope note — read this first

I do not have access to the actual site source (`index.html`, `styles.css`, `page-transitions.js`, `layers-3d.js`, `tilt.js`, `contact-form.js`, `device-switcher.js`) or a live URL to load in this pass. This workspace contains Nirmaan's internal orchestrator app, not the marketing site being reviewed. Per the task brief, I'm reviewing what's **described**: verbatim copy, named files, and claimed behaviors.

That means every finding below is one of two kinds, and I'm marking each explicitly rather than blurring the line:

- **Spec-derivable** — I can assert this with real confidence from the brief alone (page/grid counts, copy, color values, architecture choices), independent of seeing code.
- **To-verify** — a specific, high-probability failure mode given the described architecture (hand-rolled JS, 6 independently maintained HTML files, third-party form endpoint), phrased as a test case with a pass/fail bar, not asserted as a confirmed bug. Treating these as confirmed without running them would be exactly the rubber-stamping this role exists to prevent.

Where I have real information (the exact copy, the exact page count, the exact card count), I cite it. Where I don't, I say so and put it in the test case's "how to check" step instead of the "expected" column.

---

## 1. Acceptance criteria (derived — no formal PRD exists)

Per the task brief, the working acceptance bar is:

**AC-1**: A prospective client can understand what Nirmaan does (services, differentiators, process) on both desktop and mobile.
**AC-2**: A prospective client can reach and complete the contact flow on both desktop and mobile.
**AC-3**: No broken states — visually, functionally, or interactively — across either path.
**AC-4**: Motion/3D features that can't run (reduced-motion preference, JS disabled, WebGL unavailable) degrade to a working static page, per the README's explicit claim.

Every test case below maps to one of these four.

---

## 2. Test plan by risk area

### 2.1 Reduced-motion & no-JS fallback (AC-4) — the README's claim is the thing under test

The brief explicitly asks whether "all motion respects `prefers-reduced-motion` and degrades to a static page" is a real guarantee or an aspiration. That's a red flag phrased as a question for a reason: a `README` claim about graceful degradation is a developer's stated intent, not evidence. Three independent systems (`page-transitions.js`, `layers-3d.js`, `tilt.js`) each have to honor it individually — one missed `matchMedia('(prefers-reduced-motion: reduce)')` check breaks the guarantee silently, and nothing in a normal click-through QA pass surfaces that, because the tester's own OS default is "no preference."

| ID | Test case | Steps | Expected | Status |
|---|---|---|---|---|
| RM-1 | Reduced-motion honored on hero 3D layers | Set OS-level `prefers-reduced-motion: reduce`, load Home | `layers-3d.js` hero scene does not animate; a static equivalent (image/gradient) renders in its place, no layout shift | **To-verify** |
| RM-2 | Reduced-motion honored on "architecture" section 3D scene | Same OS setting, scroll to architecture section (page unspecified — likely Technology or Process) | Same as RM-1 | **To-verify** |
| RM-3 | Reduced-motion honored on page transitions | Same OS setting, click a nav link | Instant/near-instant page swap, no directional slide/fade animation | **To-verify** |
| RM-4 | Reduced-motion honored on tilt-hover cards | Same OS setting, hover a service/project card | No tilt transform on hover (or a negligible one); card remains usable | **To-verify** |
| NJ-1 | No-JS: page is navigable | Disable JS entirely, load each of the 6 pages | All body copy, headings, and nav links are present and clickable; page is not blank | **To-verify** |
| NJ-2 | No-JS: contact form still submits | Disable JS, load Contact, fill and submit form | Form submits via native HTML form POST (no JS-dependent validation blocking it), user reaches a confirmation state | **To-verify — CRITICAL if it fails, since this is the AC-2 path** |
| NJ-3 | No-JS: device-switcher on Projects degrades | Disable JS, load Projects | A default device view renders (not a broken toggle UI with no visible target) | **To-verify** |
| NJ-4 | WebGL unavailable (e.g., forced software fallback / WebGL blocked) | Block WebGL via browser flag, load Home | Hero renders a static fallback, not a blank hero block or console-error-only failure | **To-verify** |

**Why this matters more than a normal site**: layers-3d.js is Three.js — a real WebGL dependency, not a CSS animation. "Degrades to a static page" for a WebGL failure means specifically catching a context-creation failure and swapping in a fallback element, which is meaningfully more code than a `prefers-reduced-motion` media query. These are two different failure modes and both need their own test, not one test standing in for both.

### 2.2 Contact form pre-launch/endpoint risk (AC-2, AC-3) — highest business impact

The founder's entire "Start Your Project" CTA and the Contact page's Project Estimator funnel into one form. If this fails silently, the site *looks* done and *is* broken for its one business-critical purpose.

| ID | Test case | Steps | Expected | Status |
|---|---|---|---|---|
| CF-1 | Successful submission gives true confirmation | Submit valid form data on live domain | UI success state appears **only after** the POST resolves with a success response, not optimistically on click | **To-verify — this is the single highest-priority item in this report** |
| CF-2 | Endpoint failure/misconfiguration is surfaced to the user | Point form at a deliberately broken/placeholder endpoint (or block the request in devtools) and submit | UI shows a visible error/retry state, not a silent no-op or a false "Message sent" | **To-verify — CRITICAL if it fails** |
| CF-3 | Network failure mid-submit | Throttle to offline mid-request | Same as CF-2 — user isn't told the message sent when it didn't | **To-verify** |
| CF-4 | Client-side validation matches server/endpoint expectations | Submit empty required fields, malformed email, extremely long text (boundary: 5000+ char message) | Client blocks invalid submission with inline errors; no partial/garbled POST is sent for the long-text case | **To-verify** |
| CF-5 | Double-submit / rapid re-click | Click submit twice quickly | Only one submission is sent, or the button disables after first click | **To-verify** |
| CF-6 | Project Estimator widget doesn't silently disagree with the form | Use the estimator, then check whether its output actually populates/matches what's submitted via the form | Estimator output is either passed into the form or is clearly presented as a separate, non-binding tool — no state where the two look connected but aren't | **To-verify — spec gap: brief doesn't say these are wired together, worth confirming they aren't presented as if they are** |

**On the specific phrasing "before a real Formspree endpoint is wired up on a live domain"**: if the current production deploy is pointing at a placeholder/example Formspree ID, CF-1 and CF-2 aren't edge cases — they're the default state a real visitor hits today. This is the one item in this report I'd escalate immediately rather than let ride to a normal fix cycle, because every day it's true, every "Start Your Project" click is a lost lead with no error and no way for Nirmaan to know it happened.

### 2.3 Keyboard & focus behavior — tilt cards and page transitions (AC-2, AC-3, accessibility)

Tilt-on-hover and direction-aware page transitions are both classic "looks great in a mouse demo, breaks for keyboard/screen-reader users" patterns, and neither is something a founder clicking through their own site with a mouse would ever notice.

| ID | Test case | Steps | Expected | Status |
|---|---|---|---|---|
| KB-1 | Tilt cards are keyboard-focusable | Tab through Services/Projects cards | Each card (or its link) receives visible focus in tab order | **To-verify** |
| KB-2 | Tilt cards have a focus-visible equivalent to the hover tilt | Tab to a card without a mouse | Some visible focus affordance exists (doesn't have to be the tilt itself, but must be *something* — an outline, glow, border) | **To-verify — likely gap: tilt.js as described is a mousemove/hover-driven effect; if it has no `:focus-visible` counterpart, keyboard users get zero feedback on which card is active** |
| KB-3 | Page-transition links are Enter-activatable | Tab to a nav link, press Enter (not click) | Transition fires and navigates, identically to a mouse click | **To-verify — hand-rolled click interceptors sometimes bind only to `click` mouse events in a way that still fires on Enter via native semantics, but custom `preventDefault` + animation-then-navigate logic can introduce timing bugs keyboard activation doesn't hit the same way in every browser** |
| KB-4 | Focus lands somewhere sane after a page transition | Trigger a transition via keyboard, observe focus after the new page loads | Focus moves to the new page's main heading or is not silently reset to `<body>`/lost entirely | **To-verify — CRITICAL for screen-reader users: if focus/announcement doesn't happen, a screen-reader user has no signal the page changed** |
| KB-5 | Skip-past-transition works for repeat keyboard navigation | Rapidly Tab+Enter through multiple page transitions | No stuck/duplicate transition state, no focus trap | **To-verify** |
| KB-6 | Device-switcher toggle is keyboard-operable | Tab to the Projects device-switcher, operate via keyboard | Toggle changes state via Enter/Space, has visible focus state, and announces its state (aria-pressed or equivalent) if it's a custom-built control rather than a native `<button>` | **To-verify** |

### 2.4 Mobile: 13-card Services grid & Projects device-switcher (AC-1, AC-3)

**Spec-derivable finding (no code needed):** 13 items is a genuinely awkward count for any standard responsive card grid. At a 3-column desktop layout, row 5 has exactly 1 orphaned card (13 = 4×3 + 1). At 2-column mobile, row 7 has 1 orphaned card (13 = 6×2 + 1). At 4-column, row 4 has 1 orphaned card (13 = 3×4 + 1). There is no common column count where 13 divides evenly. This isn't a hypothetical edge case a QA pass has to go looking for — it's guaranteed by the card count itself, and it's exactly the kind of visible asymmetry that reads as "templated/unpolished" rather than considered, which is the founder's core complaint.

| ID | Test case | Steps | Expected | Status |
|---|---|---|---|---|
| SV-1 | Services grid last-row layout, desktop | Load Services at common desktop widths (1440, 1280, 1024) | Confirm actual column count and whether the orphaned final card is styled/centered deliberately or left stranded flush-left with dead space beside it | **To-verify — near-certain to reproduce per the math above; the open question is whether it was designed for, not whether it happens** |
| SV-2 | Services grid last-row layout, mobile | Load Services at 375px, 390px, 414px widths | Same check | **To-verify** |
| SV-3 | Services grid, 13 tilt-enabled cards, low-end mobile perf | Load Services on a throttled/mid-tier mobile CPU profile | No jank/scroll-jank from 13 simultaneous tilt-listener-bound elements; scrolling stays smooth | **To-verify** |
| SV-4 | Card text doesn't overflow at longest label | Check "Custom Admin Panels & Dashboards" and "Backend & API Development" (longest of the 13 names) at mobile width | Text wraps cleanly, doesn't overflow card bounds or get clipped | **To-verify** |
| DS-1 | Device-switcher fits the actual mobile viewport | Load Projects on an actual 375px-wide device | The device-preview widget (whose entire purpose is showing desktop/tablet/mobile mockups) doesn't itself cause horizontal scroll or overflow on the real mobile screen it's being viewed on | **To-verify — specific irony risk: a "preview other device sizes" widget that isn't responsive itself is a very findable, very embarrassing bug** |
| DS-2 | Device-switcher touch targets | Measure toggle button hit areas on mobile | ≥44×44px per WCAG target-size guidance; adjacent toggle options aren't close enough to cause mis-taps | **To-verify** |
| DS-3 | Device-switcher default state on mobile | Load Projects fresh on mobile, no interaction | Confirm which device view shows by default — showing a "desktop" mockup by default on an actual mobile visitor's phone is a poor first impression even if technically functional | **To-verify** |

### 2.5 Cross-page consistency across the 6 hand-maintained pages (AC-1, AC-3)

**Spec-derivable finding:** the brief states this is plain static HTML with no framework — meaning there's no shared component system enforcing that `<nav>`, `<footer>`, and the CTA block are identical across `index.html`, Services, Projects, Process, Technology, and Contact. Every one of those six files is independently hand-edited. This is a structural risk regardless of what the current state happens to be: any future copy edit made on one page and forgotten on the other five reproduces drift, and nothing catches it because there's no build-time check across six standalone HTML files. That's worth flagging to Frontend even if this specific pass can't confirm current drift.

| ID | Test case | Steps | Expected | Status |
|---|---|---|---|---|
| CX-1 | Nav link set and order match on all 6 pages | Diff the `<nav>` markup/text across all 6 files | Identical link set, order, and active-state indicator logic | **To-verify** |
| CX-2 | Footer content matches (copyright year, links, contact info) | Diff `<footer>` across all 6 files | Identical, including copyright year (a common one-page-only edit) | **To-verify** |
| CX-3 | Primary CTA text/destination matches where reused | Compare "Start Your Project" (or equivalent) button text and href across pages that repeat it | Same label, same destination, on every page it appears | **To-verify** |
| CX-4 | Active-page nav state is correct on every page | Load each of the 6 pages, check which nav item shows "active"/current styling | Each page correctly marks itself, not a stale/copy-pasted "Home is active" state left over from templating | **To-verify — classic copy-paste artifact** |
| CX-5 | Grid background / orb motif / typography consistent | Visual diff of the recurring background grid, glow orbs, and Inter/Manrope usage across all 6 pages | Consistent treatment; no page where the motif was forgotten or applied at different opacity/scale | **To-verify** |
| CX-6 | 404/broken internal links | Crawl all internal links across all 6 pages | No 404s, no link pointing to a since-renamed page | **To-verify** |

### 2.6 Content/brand checks (spec-derivable, low effort, worth doing now)

These I can partially evaluate straight from the given copy, no code access needed:

- **Brand-name English-only rule**: confirmed testable — grep all 6 pages for the Gujarati script નિર્માણ; per the founder's explicit decision this should return zero matches anywhere in rendered markup, alt text, or meta tags. **Test case CN-1.**
- **Social proof claim**: "Trusted by businesses including Sudaangeo.in and Khelshiksha.com" — verify both are live, working domains at time of site review, and that linking to them (if the text is linked) doesn't send traffic to a broken or unrelated site. **Test case CN-2.** This is a real reputational risk if either domain has since lapsed — worth a 30-second check before sign-off.
- **13 Services cards vs. actual service delivery**: not a QA-testable item in the traditional sense, but flag to Product/Orchestrator: several of the 13 card titles overlap substantially ("Business Websites" vs. "Custom Website Development" vs. "Website Redesign"; "Database & API Development" vs. "Backend & API Development") — that's a content/IA concern, not a defect, so I'm not logging it as a bug, but it's adjacent enough to the founder's "seems vibe-coded, needs more considered" complaint that it belongs in this report rather than dropped.

---

## 3. Bugs log

Per the constraint that a bug must be reproducible from written steps alone, and per this pass's lack of code/live-site access, **I am not logging any item above as a CONFIRMED bug.** Doing so without having run the reproduction step would be fabricating an execution result, which this role explicitly should not do. Instead:

| Severity if confirmed | Item | Confirmed? |
|---|---|---|
| **Blocker** | CF-1/CF-2/CF-3 — contact form gives false success or silently fails when the Formspree endpoint isn't live/reachable | Not confirmed — requires live-domain test |
| **Critical** | KB-4 — focus lost/not managed after page transition, breaking screen-reader navigation | Not confirmed — requires code/live test |
| **Critical** | NJ-2 — contact form unusable with JS disabled | Not confirmed — requires code/live test |
| **Major** | KB-2 — tilt cards have no keyboard-focus-visible affordance | Not confirmed — requires code/live test |
| **Major** | DS-1 — device-switcher widget itself not responsive on real mobile viewport | Not confirmed — requires live-device test |
| **Minor** | SV-1/SV-2 — orphaned 13th Services card creates visible layout asymmetry | Near-certain by grid math, but exact severity depends on whether it's styled for | 
| **Minor–Major (structural)** | CX-1 through CX-5 — nav/footer/CTA drift across 6 hand-maintained pages | Not confirmed — requires page diff |

Every row above should be re-opened as a proper bug entry (with severity, exact repro, expected vs. actual, environment) the moment source or a live URL is available. I'm holding them at "to-verify" rather than writing them up as filed bugs because I have no reproduction to attach.

---

## 4. Release recommendation: **GO-WITH-KNOWN-ISSUES, contingent on one immediate verification**

The site is live and, per the brief, functionally serving its purpose today — this is not a "take it down" verdict. But I can't issue a clean **go** on the founder's actual ask (does this hold up as a considered, human-touch product, and does the funnel actually work), because:

1. **One item is a potential blocker and is cheap to check today**: whether the contact form's Formspree endpoint is live and whether the UI correctly distinguishes success from failure (CF-1/CF-2/CF-3). This is the entire business function of the site. I'd escalate this specific item to Orchestrator/Backend for same-day verification rather than let it ride in a normal QA cycle — if it fails, that's a **NO-GO** override on its own regardless of everything else in this report.
2. **Several accessibility items (KB-1 through KB-6) are exactly the class of bug a founder's own mouse-driven walkthrough will never surface**, which is consistent with the "vibe-coded" complaint: things that look fine in a demo and are broken for real users outside the demo's input method.
3. **The 13-card grid orphan (SV-1/SV-2) is a near-certain, low-effort-to-confirm visual defect** that directly reinforces "looks templated" — worth fixing regardless of severity ranking, because it's the kind of thing a design-literate visitor notices immediately.
4. **Cross-page drift (CX-1–CX-5) is a structural risk inherent to the six-independent-HTML-files architecture**, not necessarily a current bug — but it should be verified now and flagged to Frontend as a reason to consider a shared-partial/templating approach (even a basic build-time include) before the next redesign round, independent of whether current drift exists.

**What would move this to a clean GO**: CF-1/CF-2/CF-3 pass on the live domain, KB-3/KB-4 pass (keyboard nav doesn't break), and RM-1 through RM-4 confirm the reduced-motion claim is real rather than aspirational.

**What would move this to a hard NO-GO**: confirmation that the contact form shows success without a successful POST (CF-1 failing) — at that point the site's core conversion path is silently broken for every visitor, which fails AC-2 outright regardless of how polished everything else is.

**Immediate next step**: hand this report to Orchestrator with a request for either (a) read access to the actual site repo, or (b) the live production URL, so every "To-verify" line above can be executed and converted into a real pass/fail with reproduction steps, before any redesign work (Designer/Frontend) proceeds on top of an unverified baseline.
