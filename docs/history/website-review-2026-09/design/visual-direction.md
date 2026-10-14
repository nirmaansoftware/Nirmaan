---
project: nirmaan-website
agent: creative-director
status: ready-for-handoff
confidence: MEDIUM
assumptions:
  - >-
    No separate Brand Strategist artifact exists for this project. Per the
    task's explicit instruction, I'm grounding this direction directly in the
    given 'Nirmaan' brand meaning (creation / without ego) rather than inventing
    tone unilaterally. If a Brand Strategist artifact is authored later, this
    document should be checked against it.
  - >-
    Reading the founder's 'too basic, vibe coded' complaint as a critique of
    genericness/lack of point of view, not of technical execution — the
    engineering (reduced-motion handling, degrade paths) is sound and isn't
    what's being flagged.
  - >-
    Assuming the two named clients (Sudaangeo.in, Khelshiksha.com) are usable as
    proof elements with more visual prominence than they currently have; haven't
    confirmed client permission, which is outside my scope.
inputs:
  - |-
    ## What this is

    Nirmaan is a small custom website & software development studio. This is a
    review of Nirmaan's OWN publ...
outputs:
  - design/visual-direction.md
decisions: []
risks:
  - >-
    The dimmest text tier (#475569 on background #080C14) is likely below WCAG
    AA contrast (4.5:1) for body-sized text. I can't compute the exact ratio in
    this pass — flagging for mandatory verification by the Design System
    Engineer before it's used anywhere but large/decorative labels.
  - >-
    Principle 2 (consolidate to one flagship motif, built around the existing
    layered 3D scene) is a foundational, hard-to-reverse call about what the
    hero centerpiece is. I'm deciding it directly (not escalating) because real
    precedent already exists on the site — layers-3d.js and the Technology
    page's own Frontend/Backend/Database/Tools grouping — which gives clear
    signal per the decision rules. Flagging the confidence level explicitly
    rather than treating it as obvious.
  - >-
    No brand strategist artifact exists to check this against, per the
    constraints on this role. This document should be treated as provisional
    brand-tone interpretation, not confirmed brand strategy.
open_questions:
  - >-
    Should the hero 3D layer scene be literalized to represent actual site
    sections (frontend/backend/database/API), or does that read as too
    on-the-nose for a marketing hero? Needs UX/UI Designer feasibility input
    before principle 2 is built.
  - >-
    Is there founder appetite to build out real case-study/metrics content
    beyond the two named clients? Principle 4 (evidence over spectacle) is only
    as strong as the proof content behind it.
  - >-
    Confirm computed contrast ratio for #475569 on #080C14 and #6366f1/#818cf8
    against both surface colors — needs an actual contrast-checking pass, not a
    visual estimate.
review_required: true
---
# Nirmaan — Visual Direction Review & Standard

## Verdict

This is an assemblage, not a direction. Grid background, glow orbs, gradient-text hero headline, glassy tilt cards, indigo accent, numbered `01/02/03` steps — every one of these is the default vocabulary of dark-mode SaaS marketing sites circa 2023–2025. None of them is wrong in isolation. What's missing is a reason any of them is *here*, on *this* site, for *this* studio. Swap the logo and the thirteen service-card labels for any other dev shop and nothing on the page would look out of place or out of character — that's the operational definition of generic, and it's why the founder's gut read ("vibe coded") is correct even though the site works and nothing is broken.

The clearest tell: the accent color is `#6366f1` / `#818cf8` — Tailwind's own default `indigo-500`/`indigo-400`. That's not a chosen brand color, it's the color you get when no one chose one. Everything downstream (grid glow, gradient stops, hover states) inherits that same "never actually decided" quality.

The good news: there's real material to build a specific direction from. Nirmaan's name carries two meanings — "creation" and "without ego" (nir + maan) — and the site already has a true, specific differentiator buried in its own copy ("we don't just build the front end... website, backend, database, APIs, admin systems and business logic"). Neither of those is being used. The direction below is built to use them.

---

## What's working — protect this

- **`prefers-reduced-motion` handled everywhere, with real degrade paths.** This is engineering-level craft, not decoration, and it's exactly the kind of thing a founder who wants "designer, CTO, QA" rigor should be pointing at as proof of quality. Don't let a visual refresh regress this — it should be a hard constraint on every new motif added under this direction (see Interaction Philosophy).
- **Dark-only, no light/dark toggle debt.** A single committed palette is a decisive choice, not an indecisive one. Keep it — just give it a reason (below).
- **The completeness claim in the hero subhead.** "We don't just build the front end — website, backend, database, APIs, admin systems and business logic" is true, specific, and matches the "creation" reading of Nirmaan. It's currently typeset as a secondary paragraph under a generic gradient tagline. This sentence is the actual brand asset on the page; treat it that way.
- **Named, real client proof** (Sudaangeo.in, Khelshiksha.com). Most templated sites either have no social proof or generic "trusted by" logo soup. Two real, verifiable, named client sites is rare and valuable — it's just under-weighted (one caption line) relative to how much credibility it's carrying.
- **Direction-aware page transitions and named process steps** (Discover, Plan, Design, Build, Launch & Support). The underlying structure is sound; the visual treatment on top of it (generic numerals) is what's undercutting it.

---

## What reads as generic, and why

1. **Hero H1 — "We Build / Digital Experiences / That Work."** Short declarative + forced line breaks + bold claim + gradient-text span is the exact cadence of stock hero-copy patterns across component libraries. Nothing in it is specific to Nirmaan — it could sit on any studio's homepage unedited.
2. **Indigo `#6366f1`/`#818cf8` as "the" brand color.** As above — this is Tailwind's default indigo, unmodified. It signals no color decision was made, only a default accepted.
3. **Grid background + glow orbs.** Ambient texture used because "dark sites need something behind the hero," not because it represents anything. Pure decoration with no tie to what Nirmaan does or means.
4. **Tilt-on-hover glassy cards.** Tilt is a "look what our front-end can do" flourish. For a studio whose own name reads "without ego," a hover trick that exists to impress rather than to clarify is working against the brand, not for it.
5. **Numbered `01/02/03` step markers on Process.** Generic "how it works" section furniture — the numeral styling is doing nothing to communicate what Discover→Plan→Design→Build→Launch actually is (a construction sequence, which is exactly what "Nirmaan" means).
6. **Services page's flat 13-card grid**, including near-duplicate entries ("Backend & API Development" vs. "Database & API Development") with no visible hierarchy between them. This reads like a list assembled to maximize keyword/SEO surface area rather than an edited case for capability. No amount of card styling fixes this — it's a content/IA problem wearing a visual costume. (Flagging for UX Designer, not deciding — structure isn't my layer.)

---

## Visual Direction

### Mood
**Under construction, on purpose.** Not sterile-corporate, not startup-hype. The site should feel like the work of people who build complete, structural systems and don't need to perform that fact with spectacle — they just show you the structure. Confident and plain-spoken, not loud.

### Governing idea
Nirmaan means two things: *creation* (building something whole, from foundation up) and *without ego* (the work speaks, the studio doesn't posture). Every visual decision on this site should trace back to one of those two ideas. If a motif doesn't visually represent "we build complete structures" or doesn't pass a "would this exist on a site that doesn't need to show off" test, it doesn't belong.

### Principles

**1. Structure over spectacle.**
Any motion or interaction has to justify itself as revealing structure or order — not as a demonstration of front-end skill for its own sake.
- **Do:** Keep and expand the layered 3D scene from `layers-3d.js` — but re-scope it to represent actual system layers (frontend / backend / database / API), echoing the same grouping already used on the Technology page. That's structure with meaning.
- **Don't:** Keep tilt-on-hover (`tilt.js`) on the 13 service cards just because it's built. Tilt communicates "impressive," not "considered." Replace with a flat, deliberate elevation/border change, or cut it.

**2. One flagship motif, not four competing ones.**
Right now grid background, glow orbs, gradient text, and tilt cards all run at once with no hierarchy among them. Pick the one motif that actually means something — the layered 3D system scene — and let everything else recede or go.
- **Do:** Make the layered scene the signature device across Home and Technology. It's the only current element that structurally represents "we build the complete stack," matching the hero subhead's own claim.
- **Don't:** Keep glow-orb blur as ambient wallpaper with no relationship to anything. Either cut it, or repurpose the glow functionally (e.g., highlighting the active/hovered layer in the 3D scene) so it's signal, not texture.

**3. Hierarchy should mirror the brand claim: completeness before flourish.**
The real differentiator — "we don't just build the front end... website, backend, database, APIs, admin systems and business logic" — is currently a secondary subhead under the gradient tagline. That's backwards. The completeness claim *is* the message; the tagline is atmosphere.
- **Do:** On the Home hero, give the completeness sentence visual weight comparable to the H1 — not default subhead-paragraph styling.
- **Don't:** Let "We Build / Digital Experiences / That Work." (generic, could belong to any agency) outweigh the specific, true, differentiating claim underneath it.

**4. Evidence over spectacle — "without ego" as a restraint discipline.**
No visual flourish should stand in for a claim the site hasn't earned with actual evidence. Let real specifics — named clients, the described process, the stated capability list — carry credibility instead of decoration doing it for them.
- **Do:** Promote "Trusted by businesses including Sudaangeo.in and Khelshiksha.com" out of small-caption treatment into a named, visually distinct proof element.
- **Don't:** Lean on glassy/tilt/glow treatments to imply sophistication the page hasn't shown evidence for yet (no case studies, no metrics). That gap between visual confidence and shown evidence is precisely what reads as "vibe coded."

**5. Numbered systems, not numbered decoration.**
Since the brand is literally "construction," the Process page's five steps should read as build phases, not template numerals.
- **Do:** Give each step (Discover, Plan, Design, Build, Launch & Support) a treatment that visually assembles — building on the prior step — tying back to the layered-construction motif in Principle 2.
- **Don't:** Rely on oversized `01/02/03` numeral glyphs as the only differentiator between steps. Numerals alone signal "process section template," not an actual process.

**6. Taxonomy is a prerequisite for hierarchy, not a substitute for it.**
The Services grid's 13 items (with overlapping entries like Backend & API Development vs. Database & API Development) can't be fixed by card styling — this is a content-structure gap showing up as a visual one.
- **Do (UX handoff):** Regroup Services under the same categories Technology already uses (Frontend / Backend / Database / Tools & Infrastructure) so the two pages reinforce one taxonomy instead of inventing two.
- **Don't:** Apply uniform card styling to a flat 13-item list and call the result "visual hierarchy." Flagging this to UX Designer — it's an IA decision, not one I can resolve at the visual layer.

### Interaction philosophy
Motion on this site should communicate **precision and assembly** — the feeling of watching something get built correctly — not liveliness for its own sake. Concretely:
- Direction-aware page transitions (already built) fit this philosophy exactly: they're about spatial orientation, not flair. Keep and lean into this logic elsewhere.
- Any new motion introduced under this direction (an expanded layer scene, a reworked process sequence) must ship with the same `prefers-reduced-motion` + static-degrade discipline already established in `page-transitions.js` / `layers-3d.js`. That discipline is now a standing constraint on this project, not an optional nicety — treat it as equal in weight to any visual choice.
- Hover and interaction feedback should feel like confirmation ("this connected/responded"), not performance ("look what this can do"). This is the concrete test for keeping or cutting `tilt.js`-style effects anywhere on the site.

### Legibility & accessibility notes
- The dimmest text tier, `#475569` on background `#080C14`, needs an explicit contrast check before further use in body copy — it looks likely to fall under WCAG AA's 4.5:1 for normal text. Until verified, restrict it to large/decorative labels only. This is a required check for the Design System Engineer, not a judgment call I can make from a swatch.
- Gradient-text spans (hero headline treatment) must hold minimum contrast at *both* gradient stops against the background, not just at the midpoint — verify this explicitly if gradient text is kept anywhere under the new direction.
- Legibility is a visual-direction requirement here, same tier as the mood/motif principles above — not a QA pass applied after the fact.

---

## Handoff notes

- **To UX Designer:** Principle 6 (Services taxonomy) is an IA problem, not a visual one — needs your call on regrouping before UI work proceeds on that page.
- **To UI Designer / Design System Engineer:** Principles 1–5 assume the layered 3D scene becomes the site's one flagship motif — before committing engineering time to expanding it, confirm feasibility on literalizing it as frontend/backend/database/API layers (open question above). Contrast verification on `#475569` and the indigo accent pair is a blocking item, not a nice-to-have.
- **Escalation note:** This document interprets brand tone directly from the given name meaning because no separate Brand Strategist artifact exists yet, per the task's explicit instruction. If a formal brand strategy is authored later, re-check this document against it rather than treating it as final.
