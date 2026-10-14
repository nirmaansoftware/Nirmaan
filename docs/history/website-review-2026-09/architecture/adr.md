---
project: nirmaan-website
agent: principal-architect
status: in-progress
confidence: LOW
assumptions: []
inputs:
  - |-
    ## What this is

    Nirmaan is a small custom website & software development studio. This is a
    review of Nirmaan's OWN publ...
outputs:
  - architecture/adr.md
decisions: []
risks: []
open_questions: []
review_required: true
---
I couldn't reach the Nirmaan site source from this working directory (it resolves to an unrelated project, and filesystem search outside it was denied), so this ADR is written against the verbatim inventory in the brief. Every factual claim about the repo that I could not verify is marked as a verification step rather than asserted.

---
```yaml
project: nirmaan-website
task: architecture-review / build-tooling decision
agent: principal-architect
status: ready-for-handoff
confidence: MEDIUM
assumptions:
  - "I could not read the site repo; this is written from the verbatim file/page inventory in the brief. Structural claims (6 pages, duplicated nav/footer/CTA, Tailwind compile, Three.js in hero + architecture section) are taken as given from the founder's description."
  - "Three.js is assumed to be loaded as a full prebuilt bundle (CDN or vendored three.min.js), not tree-shaken through a bundler, since the brief states there is no build step beyond the Tailwind CSS compile."
  - "Hosting is assumed to be a static host on a free or near-free tier (Netlify/Vercel/Cloudflare Pages/GitHub Pages); no server runtime is in play."
  - "The Formspree-style endpoint in contact-form.js is assumed to be the only lead-capture path on the site."
  - "Traffic is assumed to be low-volume studio marketing traffic, not a scale problem. No requirement in the brief implies otherwise."
risks:
  - "Silent SEO drift is already accruing across 6 hand-edited <head> blocks and is invisible without an audit — unlike nav drift, nothing on screen reveals it."
  - "Three.js in the hero sits directly in the LCP path on the one page that carries the primary CTA, on a site whose Services page sells 'Performance Optimization' as a paid service."
  - "contact-form.js is the single point of failure for all revenue on the property; a silent POST failure produces zero visible symptoms and zero leads."
  - "Migration to a generator, if done as a rewrite rather than a mechanical move, can burn a week of a solo founder's time for zero user-visible gain."
  - "Tree-shaking Three.js typically underdelivers versus expectations (WebGLRenderer pulls in most of the core); a build step must not be justified on that number alone."
open_questions:
  - "What is the measured mobile LCP and total transferred bytes on index.html today, on a throttled mid-tier Android profile? The perf recommendation's priority order depends on this."
  - "Are per-page <title>, meta description, canonical, and OG/Twitter tags currently unique per page, or copied? This determines whether the SEO fix is urgent or merely overdue."
  - "Is there a sitemap.xml, robots.txt, and any JSON-LD structured data on the site today?"
  - "Does the Contact page 'Project Estimator' widget submit its computed output with the form, or is it display-only?"
  - "Is Three.js loaded from a CDN or vendored, and at what version/build? Determines the actual byte cost."
  - "Is there any form-submission monitoring or delivery confirmation today?"
review_required: true
inputs:
  - "Founder brief: current implementation, visual system, verbatim page copy, stated ask"
outputs:
  - "architecture/decisions/ADR-0001-build-tooling-and-templating.md (this document)"
next_agent: orchestrator
```
---

# ADR-0001 — Adopt a build-time templating layer (Eleventy); keep the site static and framework-free

**Status:** Proposed · **Date:** 2026-09-23 · **Supersedes:** none · **Superseded by:** none
**File as:** `/projects/nirmaan-website/architecture/decisions/ADR-0001-build-tooling-and-templating.md`

## Decision

Introduce **Eleventy (11ty)** as a build-time templating layer over the existing HTML/CSS/JS. Keep the output as plain static HTML. Keep all current JavaScript as vanilla JS, unchanged. Do **not** adopt React, Next.js, or any client-side framework.

Concretely:
- One base layout owns `<head>`, nav, footer, and the repeated CTA section.
- Each of the six pages becomes a content file carrying its own front matter (`title`, `description`, `canonical`, `ogImage`).
- The repeated card grids become data files rather than markup: `services.json` (13 cards), `process.json` (5 steps), `technology.json` (the Frontend/Backend/Database/Tools groupings), `projects.json`.
- `sitemap.xml` and `robots.txt` become generated artifacts.
- Three.js moves behind a deferred, conditional load (detail in §Consequences → Performance).

## Context

### The founder's actual complaint, translated into a technical claim

"Too basic and seems vibe coded" is, at the code level, a diagnosis worth taking literally. The tell is not the absence of a framework — plenty of considered sites are hand-written HTML. The tell is **the absence of a single source of truth**. Six copies of a nav, six copies of a footer, six copies of a CTA block is precisely the artifact shape you get when a site is generated once and then hand-patched forever. The repo does not express intent anywhere; it expresses six parallel transcriptions of an intent that lives only in the founder's head.

That is the honest technical restatement of the complaint, and it is fixable independently of anything a designer does.

### The "no build step" premise is already false

This is the load-bearing fact in this decision and it deserves stating plainly: **there is already a build step.** Tailwind is compiled. There is already a `node_modules`, already a command to run before deploy, already a generated-artifact-vs-source distinction in the repo.

So the real question is not "do we accept a build step?" — that trade was made when Tailwind was adopted. The question is: *given that a build already runs, why is it producing zero structural leverage?* Adding templating to an existing build pipeline is a marginal cost, not a new category of cost. Most of the arguments a solo founder would reasonably make against tooling ("I don't want a toolchain", "I want to open the file and edit it", "I don't want to debug a build") have already been paid for and are not recoverable by staying put.

### Is 6 pages past the threshold? Yes — but not for the reason usually given

The standard argument is edit cost: a footer change is 6 edits. That argument is real but weak in isolation — 6 edits is maybe 4 minutes with find-and-replace, and a solo founder can rationally absorb that.

The stronger argument is **divergence, weighted by visibility**:

- **Nav/footer divergence is self-correcting.** If you update 5 of 6 navs, you will eventually click through and see the broken one. The failure is loud. Cost: embarrassment, bounded.
- **`<head>` divergence is silent and compounding.** If the Services page's `<title>` and meta description were copied from Home during a late-night edit, nothing on the rendered page tells you. No click-through reveals it. You find out months later, from a Search Console report you probably aren't reading, after the page has already failed to rank for the terms those 13 service cards exist to win.

This is the asymmetry that tips the decision. **The duplication that costs the most is the duplication you cannot see.** Six hand-maintained `<head>` blocks on a lead-generation site for a studio whose entire top-of-funnel is organic discovery is not a tidiness problem; it is an unmonitored revenue leak. Templating converts it from a recurring discipline problem into a structural impossibility — you cannot forget to update the canonical tag on page 4 if page 4 does not contain a canonical tag.

Secondary, and nearly as strong: the site does not scale in pages, it scales in **content instances**. The Services page has 13 cards today. Each new service, each new project on the Projects page, each new tech in a Technology grouping is currently a markup edit. Data-driving those grids means adding a service is adding four lines to a JSON file. Given the founder's stated direction — this site is a sales surface for a studio that intends to grow — that is where the compounding return is.

### Counter-argument, stated fairly

At exactly six pages with one maintainer who is also the only reader of the code, the status quo is *defensible*. Hand-written HTML has the lowest possible cognitive overhead: what you see is what ships, there is no build to break at 11pm before a client demo, there is no version of a generator to upgrade, and the site cannot be broken by a dependency. If the site were frozen — six pages, no new services, no new projects, no blog, no case studies, ever — I would say leave it alone and spend the time on design instead.

It is not frozen. A studio site that never adds a case study is a studio that isn't winning work. The decision below is a bet on the site being added to, and that bet is the same bet the founder is already making by paying for this review.

## Alternatives considered

### A. Status quo — hand-duplicated static HTML

**For:** Zero migration cost. Zero new dependencies. Maximum transparency. Nothing to learn.
**Against:** Does not fix silent `<head>` divergence. Does not make the 13-card Services grid maintainable. Every future page multiplies the problem. Leaves the repo shaped exactly like the thing the founder is complaining about.
**Rejected because:** the silent-SEO-drift failure mode is unbounded and already running, and the build step that would fix it is already installed.

### B. A ~100-line Node include script (build-time `<!-- @include nav.html -->`)

**For:** Genuinely minimal. No new framework concepts. Fully understandable in one sitting. Fixes nav/footer/CTA duplication immediately. Adds no dependency beyond Node, which is already present.
**Against:** Fixes only the *visible* duplication — the easy half. The moment you need per-page front matter for titles and meta (the half that actually matters), you are writing a front-matter parser. Then a data loader for the services grid. Then sitemap generation. You arrive at a worse Eleventy that only one person on earth knows how to debug, and every hour spent on it is an hour not spent on client work.
**Rejected because:** it solves the loud problem and defers the silent one, and its end state is a bespoke generator with no docs and no community. This is the most tempting wrong answer here.

### C. Eleventy (11ty) — **selected**

**For:** Outputs plain static HTML with **zero client-side runtime** — the shipped site stays byte-for-byte the same kind of artifact it is today. Templates are near-HTML (Nunjucks), so the migration is mostly cut-and-paste rather than rewrite. Front matter and the data cascade solve the per-page meta problem directly, which is the actual motivating problem. Collections and pagination handle future case studies without further architecture. Node-only, no opinions about CSS, so the Tailwind compile and `styles.css` continue untouched. Well documented, stable, low churn.
**Against:** A real dependency with a real upgrade path. Nunjucks is a syntax to learn (small, but nonzero). The source no longer matches the output 1:1, which costs some debugging directness.
**Selected because:** it is the cheapest tool that solves the *silent* problem as well as the loud one, and its output is the same static HTML the site already serves — meaning the decision is nearly free to reverse (see §Reversibility).

### D. Astro

**For:** Strictly more capable. Component model with scoped CSS, built-in image optimization, islands architecture that would handle the Three.js hero and the Project Estimator widget cleanly, excellent static output.
**Against:** Astro's headline advantages — partial hydration, component islands, framework interop — solve problems this site does not have. There is no client state, no interactive app surface, no React/Vue/Svelte components to integrate. The existing JS (`page-transitions.js`, `layers-3d.js`, `tilt.js`, `contact-form.js`, `device-switcher.js`) is vanilla and already works; Astro's island model would invite rewriting working code to fit a component boundary that buys nothing. It carries more concepts, a heavier build, and a faster-moving upgrade treadmill.
**Rejected because:** per the cost-conscious default, when two approaches are close, take the one that is cheaper to maintain. This is the closest call on the list — if the site grows a blog with heavy imagery, or if the Project Estimator grows into a real interactive tool, Astro becomes the right answer and this ADR should be superseded. **That is the explicit trigger to revisit.**

### E. Next.js (or any React framework)

**For:** The founder's studio presumably builds in this stack for clients; dogfooding has some marketing value. Strong ecosystem.
**Against:** This is the expensive wrong answer, and the brief is right to pre-empt it. It means rewriting six pages of working HTML into JSX — not a mechanical move, a genuine rewrite with a real bug surface. It ships a client-side React runtime (on the order of 80–100 KB gzipped, before any application code) to render pages that are, correctly, static text and images today. It replaces a build you can reason about with a framework whose conventions change between majors — as the `AGENTS.md` note in the adjacent repo itself warns, this version's APIs may differ from what you know, which is a maintenance tax a solo founder pays in evenings. And it does all this to solve a problem that a layout file solves.
**Rejected because:** the migration cost is measured in weeks of founder time and the user-visible benefit is zero or negative. The dogfooding argument is a marketing claim, not an architecture rationale — and per this role's constraint, "we build in it for clients" is not a tradeoff, it's a preference.

### F. A CMS (headless or otherwise)

**Rejected without extended analysis:** introduces a service, a schema, an auth surface, and an ongoing cost to solve an editing problem that one person editing JSON files does not have. No requirement in the brief drives it. Revisit only if a non-technical person needs to edit content.

## Consequences

### Performance posture — the sharpest finding in this review

**The credibility problem is worse than the performance problem.** The Services page sells **"Performance Optimization"** as one of 13 paid service cards. The Technology page is titled "Tools of / the trade." A prospect evaluating a studio that sells performance will, with meaningful probability, run Lighthouse on that studio's own homepage. If the homepage ships a full Three.js build to animate decorative layers behind the H1, the site is actively arguing against a line item on its own price list. This is not a micro-optimization; it is a sales objection encoded in the page weight.

The technical specifics:

1. **Byte cost.** A full prebuilt Three.js is on the order of 600–700 KB minified, roughly 150–170 KB gzipped. For comparison, that is likely larger than every other asset on the homepage combined. *Verify the actual figure before acting — see open questions.*
2. **Parse/execute cost dominates transfer cost.** On a mid-tier Android device — a realistic profile for this market — the main-thread cost of parsing and compiling that much JavaScript is the real damage, and it lands during the window where the hero should be painting. Fast connections do not save you from this; it is CPU-bound, not network-bound.
3. **It sits in the LCP path on the page that carries the primary CTA.** The hero H1 ("We Build / Digital Experiences / That Work.") and the "Start Your Project" button are the conversion surface of the entire property. Nothing decorative should be allowed to contend with them for the main thread.
4. **Tree-shaking will disappoint you.** A common reflex is "add a bundler, tree-shake Three.js." In practice `WebGLRenderer` pulls in most of the core, and realistic savings are far smaller than the import list suggests. **Do not justify the build step on this number.** The build step is justified by templating and meta; any Three.js savings are a bonus.

**Required changes (independent of the templating decision — do these regardless):**

- Render the hero text and CTAs in static HTML with no dependency on the 3D scene. The scene mounts into an already-painted layout; it never gates first paint.
- Load `layers-3d.js` and Three.js via **dynamic `import()` fired after LCP**, not as a blocking or eagerly-parsed script.
- **Gate the load on device capability, not just preference.** `prefers-reduced-motion` is already respected — good, and genuinely better than most sites at this tier. Add to it: skip the 3D entirely below a viewport-width threshold and/or on low `navigator.hardwareConcurrency`. Mobile visitors get the static hero. They lose nothing they were going to appreciate on a 5-inch screen, and they are the visitors most damaged by the cost.
- The **"architecture" section scene** must be `IntersectionObserver`-gated — it should not initialize until it is near the viewport, and arguably should share one renderer with the hero rather than instantiating a second WebGL context.
- Establish a byte budget and enforce it. Suggested starting line: **homepage under 200 KB transferred on mobile, LCP under 2.0s on a throttled mid-tier profile.** Treat a budget breach as a bug, not a preference.

The honest strategic question underneath all of this — which is the founder's call, not mine — is whether the 3D layers are earning their cost *as sales collateral*. My read: on desktop, for a studio selling technical depth, a restrained 3D motif can justify 150 KB. On mobile it cannot, and it should not be attempted. The conditional-load recommendation lets both answers be true at once, which is why it is the recommendation rather than "remove Three.js."

### SEO / metadata posture

The current approach is not *wrong* so much as **unenforceable**. Six hand-maintained `<head>` blocks means correctness depends on the founder's memory at the moment of each edit, forever, with no feedback signal when it fails.

Under the base layout, these become structural rather than remembered:

- **Per-page `title` and `description`** from front matter. Non-optional fields; a missing one should ideally fail the build.
- **`<link rel="canonical">`** generated from the page's URL. Removes the `index.html` vs `/` duplicate-content ambiguity for free.
- **Open Graph and Twitter Card tags**, with a per-page `ogImage` falling back to a site default. Today, a "View Our Work" link shared in a WhatsApp business chat — the actual distribution channel for a studio like this — likely renders bare or with the wrong page's image. That is a conversion loss on the highest-intent traffic the site gets.
- **JSON-LD structured data**, which is the largest outright gap and is trivial once there is a layout: `Organization` sitewide, `Service` entities driven off the same `services.json` that renders the 13 cards (one data source, two consumers — this is exactly the leverage the build step buys), and `BreadcrumbList` on inner pages.
- **`sitemap.xml` and `robots.txt`** generated from the page collection, so they cannot go stale.
- **The social-proof line** — "Trusted by businesses including Sudaangeo.in and Khelshiksha.com" — is the only third-party credibility signal on the entire site. Verify those are real, crawlable outbound links and that the corresponding Projects page entries are too. Two live client sites is genuinely more persuasive than anything else on the page; do not let it render as plain text.

### Lead capture — flagged outside the stated scope

`contact-form.js` posting to a Formspree-style endpoint is the correct, cheap architecture and I would not change it. But it is **the single highest-severity component on the property**, and the failure mode is silent: an endpoint change, a quota limit, a spam-filtered notification, or a JS error in the validation path produces a site that looks perfectly healthy and delivers zero leads, indefinitely.

Recommended, in priority order: (1) a synthetic submission check on a schedule, or at minimum a calendared manual test, so a dead form is detected in days not months; (2) a non-JS fallback path — a visible `mailto:` — so a script error is not total loss; (3) a honeypot field or Turnstile, since a public form endpoint will attract bot traffic and quota exhaustion on a free tier is itself an outage. Also confirm whether the **Project Estimator** widget's output is transmitted with the submission — if it is display-only, the highest-intent signal a visitor generates is being discarded at the moment of handoff.

### Cost

**Infrastructure: no change. $0 → $0.** Eleventy is a build-time dependency; the deployed artifact is the same static HTML on the same static host. No server, no database, no managed service, no new vendor. Nothing here requires Finance review.

**The only real cost is founder time.** Estimated: **one focused day** for the mechanical move (base layout, three includes, six content files with front matter — the page bodies move over as-is, this is not a rewrite), plus **a second day** to data-drive the card grids and fill in the meta/JSON-LD that is currently missing. Treat that as an estimate with meaningful error bars, not a commitment. The perf work on Three.js is separable and can be scheduled independently.

### Reversibility — why this is safe to commit to at MEDIUM confidence

Eleventy emits plain HTML. If it is abandoned in six months, the generated `_site/` output **is** a working hand-editable static site — precisely today's architecture. The exit cost is approximately zero, which is what makes this decidable now rather than something to agonize over. Contrast with alternative E, where abandoning Next.js means another full rewrite.

This is the decision rule applied honestly: cheap to reverse, so decide and move.

### What this decision explicitly does not fix

This ADR addresses the **foundation**, not the surface. It will not make the site stop reading as templated. The homepage will have the same dark-indigo-grid-plus-glow-orbs-plus-glassy-tilt-cards vocabulary after the migration as before, and "We Build Digital Experiences That Work" will be the same headline. The founder's complaint has a design component and a copy component that are real, are not mine to solve, and should be routed to the Design/UX track in parallel. **Do not let the build-tooling work stand in for the design work** — a perfectly DRY site that still looks generic has solved a problem the founder did not ask about.

## Dependency map & sequencing

```
                    ┌─────────────────────────────┐
                    │ ADR-0001: Eleventy layer    │
                    │  (base layout + data files) │
                    └──────┬──────────────────────┘
                           │ unblocks
        ┌──────────────────┼──────────────────────┐
        ▼                  ▼                      ▼
  ┌───────────┐    ┌──────────────┐      ┌──────────────────┐
  │ SEO pass  │    │ Content adds │      │ Design refresh   │
  │ meta/JSON │    │ cases/svcs   │      │ (one layout to   │
  │ -LD/sitemap│   │ via JSON     │      │  restyle, not 6) │
  └───────────┘    └──────────────┘      └──────────────────┘

  INDEPENDENT — do not sequence behind ADR-0001:
  ┌──────────────────────┐   ┌────────────────────────┐
  │ Three.js deferred/   │   │ Lead-capture hardening │
  │ conditional load     │   │ (monitor, fallback,    │
  │ + perf budget        │   │  honeypot, estimator)  │
  └──────────────────────┘   └────────────────────────┘
```

**Critical path note for the Orchestrator:** the design refresh should be sequenced *after* the Eleventy migration, not before or in parallel on the same files. Restyling six duplicated pages and then de-duplicating them means doing the same work twice and merging by hand. One layout is the cheaper surface to redesign against — which is a second, independent argument for doing this migration first.

**Recommended order:** (1) Three.js deferred load + lead-capture check — both are small, independent, and address live risk; (2) Eleventy migration; (3) SEO/JSON-LD pass on the new layout; (4) hand off to Design.

## Escalations

- **To Orchestrator / Founder:** the strategic question of whether 3D hero scenes are worth their cost *as sales collateral on desktop* is a product judgment, not an architecture one. I have recommended the conditional-load path that makes the answer cheap either way, but the call is the founder's.
- **To Security:** none blocking. The honeypot/Turnstile recommendation on the public form endpoint is standard hardening, not a sign-off gate. Flagging only so it is not dropped.
- **No Finance escalation required.** Zero incremental infrastructure cost.

## Verification before committing this ADR to Accepted

Because I could not read the repo, this decision should be confirmed against five measurements, all of which take under an hour combined:

1. Lighthouse mobile run on `index.html` — record LCP, TBT, total transferred bytes.
2. `diff` the six `<head>` blocks — confirm or refute the meta-drift hypothesis.
3. Confirm the Three.js build and version actually shipped, and its transferred size.
4. Check for `sitemap.xml`, `robots.txt`, and any JSON-LD.
5. Submit the contact form end-to-end and confirm the lead arrives.

If #2 comes back clean and #1 comes back fast, the *urgency* drops — but the decision does not change, because the argument rests on divergence risk over time and on the Services-page content model, neither of which a single clean snapshot refutes.
