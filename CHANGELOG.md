# Changelog

## 2026-09-28: Website launch list, run on nirmaan.online

- `docs/engineering/list.md`: the 20 things every website we build or run must
  get right before launch (privacy policy to single clear CTA), each with what
  "done" means, an owner, and how to check it. QA runs it and records each item
  as PASS, FIXED or N/A; the definition of done points to it.
- Run on nirmaan.online:
  - New `/privacy.html`, `/terms.html` and a branded `/404.html`, linked from the footer.
  - Fixed the canonical and `og:url` tags on the 24 service and pricing detail
    pages, which contained an unrendered `{{ ... }}` permalink.
  - Fixed two accessibility failures (dimmed journey stamps, the footer logo's
    accessible name). Lighthouse accessibility 96 to 100.

## 2026-09-26: Nirmaan OS: ready for Fly.io

- `fly.toml` + `Dockerfile.os`: the OS and its campaign worker on one always-on
  machine in Mumbai, with the database on a persistent volume, at os.nirmaan.online.
- The database location comes from `DATABASE_URL` (locally still `app/prisma/dev.db`).

## 2026-09-26: Nirmaan OS: Google sign-in only

- `NIRMAAN_PASSWORD_LOGIN=off` turns password sign-in off: the server refuses it,
  and the login page shows only "Sign in with Google".
- Accounts can be created without a password (Google-only), from the Team screen or
  `npm run user:create -- <email> "<name>" FOUNDER`.
- The ID-allocation test no longer fails when other tests allocate codes at the same time.

## 2026-09-26: Nirmaan OS: Sign in with Google

- "Sign in with Google" on the login page, for people who already have an OS
  account with the same (verified) email. Nobody gets an account by signing
  in, and the owners-only Growth dashboard stays behind `growth:read`.
- Setup in `docs/engineering/deployment.md` (a Google OAuth client, two env vars).

## 2026-09-26: Nirmaan OS: Autopilot and the Growth dashboard

- **Autopilot:** no campaigns to create. Switch it on, set a daily volume and the
  cities (default Gujarat's big cities), and it runs one standing campaign per
  segment. Each week it re-balances from what got replies: more contacts to the
  segments and the channel that answer, best cities first. People still approve
  every message, in batches.
- **Growth** (owners only): the outbound funnel today, this week and all time, with
  the ₹ value won; reply rates by channel, segment, city and campaign; replies and
  what they said; leads from outreach; and every message ever sent, searchable and
  exportable to Excel.
- New capability `growth:read`, for the founder only.

## 2026-09-26: Website: WhatsApp

- Our WhatsApp Business number (+91 94938 33697) on the contact page and in
  every page's footer.

## 2026-09-26: Nirmaan OS: Campaigns (prospecting on autopilot, people still approve)

- **Campaigns** (`/os/campaigns`): describe a goal in plain words; Claude plans the
  searches (terms × places, segment, angle). A background worker
  (`npm run campaigns:worker`) then searches, checks, drafts first messages split
  between email and WhatsApp (default 50/50), and drafts follow-ups on schedule.
- **Outreach queue** (`/os/outreach`): approve emails one by one or all at once;
  send WhatsApp messages one tap at a time from our own number.
- **Human by design:** messages in Sahaj Patel's voice with a real signature and our
  WhatsApp number; follow-ups as replies in the same thread; emails sent from our
  own mailbox one at a time in Indian working hours with random gaps; replies,
  "stop"s and bounces read from our inbox (IMAP) stop everything at once.
- **Higher limits:** 400 emails a day by default (Gmail's own ceiling is about 500),
  up to 3 messages per business per channel without a reply (configurable to 5),
  at least 2 days apart. The one-per-week rule is gone.
- Fixes from the first real search: bot-protection pages are no longer read as
  broken sites, unreadable sites are "unknown" rather than evidence, the site check
  outranks the web note, landlines never get WhatsApp, web searches get more time.

## 2026-09-26: Nirmaan OS: Prospecting (find clients before they ask)

- New **Pipeline → Prospects** screen. Search for businesses ("dental clinics"
  in "Ahmedabad") through Google Places and a web search by Claude (read-only
  web tools only), for three segments: local services; shops, restaurants
  and D2C; SMEs on spreadsheets and WhatsApp. One prospect (PROS-###) per
  real business, merged across searches and sources.
- **Check:** reads each business's homepage (phones, booking, store, age) and
  Claude scores the fit 0–100 against the ideal customer, with a suggested
  package and the evidence behind it.
- **Outreach:** Claude drafts a short first email or WhatsApp message; a
  person edits and approves the exact words. The founder or CTO sends email
  from the OS (SMTP or Resend); WhatsApp opens pre-filled on your phone.
  A reply becomes a LEAD-### (new source OUTBOUND).
- Guard rails in code: a do-not-contact list, an opt-out line on every
  message, one message per business per week, a daily email cap, only
  published emails, and a site fetcher that refuses private addresses.
- New permissions `prospect:read`, `prospect:run` and `outreach:send`.
  Setup and policy: `docs/product/prospecting.md`.

## 2026-09-26: Website: hero keeps only the studio line

- The line explaining the two meanings of the name (निर्माण "to build",
  निर्मान "without ego") is gone from the homepage hero; "Software studio"
  stays above the headline.

## 2026-09-26: Website: phones no longer zoom out at the pricing section, plus a review pass

- Fixed: on phones, scrolling to the homepage pricing section zoomed the whole
  page out and dropped you near the end. Hidden screen-reader text in the
  package buttons escaped the swipe row once the cards revealed, widening the
  page. Swipe-row cards now contain their own positioned content, rows never
  capture vertical swipes, and cards off to the side reveal with the first.
- Small phones (320–360px): process and case-study pages no longer zoom out
  (headline sizes, the system map and the dock now fit the screen).
- Search: canonical, link-preview and sitemap URLs now use
  www.nirmaan.online, the address the site is actually served from; the
  homepage describes the studio to search engines (structured data); page
  descriptions trimmed to fit search results.
- Copy: service names keep their acronyms mid-sentence ("AI systems", not
  "ai systems"); the closing headlines read correctly to search engines and
  screen readers ("Step one is a conversation."); one reply-time promise
  (24 hours) everywhere; project timelines on the process page match the
  pricing; "fixed quote" instead of "cost estimate"; curly quotes throughout.
- Care plans: the middle plan is now "Plus" (it shared the name "Growth" with
  a build package); /pricing/care/growth.html redirects to plus.html. Replies
  are faster than a new enquiry's 24 hours on every plan: Essential within
  1 business day, Plus the same business day, Priority within 4 business hours.
- Prices no longer count up when they scroll into view, so a visitor never
  sees a figure that isn't the real price.
- Accessibility: text-only swipe rows can be scrolled from the keyboard.
- OS: the CI evidence endpoint no longer returns internal error details; bad
  payloads get 400/422, unexpected failures a plain 500.

## 2026-09-25: Website: contact details, and the services rail on phones

- Contact email is now nirmaansoftware@gmail.com; X (@Nirmaansoftware) added
  to the footer, the contact page and the link-preview tags.
- The homepage services rail now moves sideways as you scroll on phones
  too (any screen at least 520px tall), sized to the visible screen and kept
  clear of the dock.

## 2026-09-25: Website: built for phones

- Hero fills the first screen: a large mark (finer grid on small screens),
  the headline at full column width, a full-width button; tapping the grid
  sends a ripple of blue blocks out from your finger.
- Page transitions on phones slide like a native app: forward, the new page
  arrives complete from the right while the old one eases left and dims;
  back, the page slides off to the right. The nav and dock stay put.
- The homepage layer tabs on phones light up as you read them, top to
  bottom, instead of building from the bottom.
- Long card lists (packages, principles, prices, care plans, related
  services, plan switcher) become swipe rows with dots and a "2 / 4" count.
- A dock keeps "Tell us your problem" within thumb reach once the page's own
  buttons scroll away, and steps aside for the closing call to action.
- The menu builds down row by row and ends with the call to action and email.
- Cards and buttons give a little under your thumb; the footer is two
  columns instead of one long list.

## 2026-09-25: Website: a quieter hero, led by the mark

- Hero: the headline on the left, a large pixel N on the right leading the
  composition; the build-log box is gone.
- A larger studio line with both meanings of the name: निर्माण "to build"
  and निर्मान "without ego".
- The problem → system story moved into "How we work": the customer's
  words as the opening statement, then each step stamps its outcome as the
  line reaches it, with "you approve" on the steps that need sign-off.

## 2026-09-25: Website: page flow and a page for every plan and service

- Page transitions rebuilt: the next page is laid over the old one block by
  block (a stepped mask, portrait and landscape), the old page steps back the
  way you're travelling, and a clicked card's title flies into the next
  page's heading. Browsers without view transitions get the same block build
  from a small overlay. Links are prefetched on intent.
- Scroll motion on every screen size: headings uncover from the baseline,
  section rules draw across, prices count up, payment bars fill, cards get a
  pointer spotlight, and the homepage tower builds on phones too.
- New pages: /pricing/<plan>.html (4), /pricing/care/<plan>.html (3) and
  /services/<service>.html (17), each with fit, what's included and not,
  timeline, payments at the starting price, related plans or services, FAQ.
  Every card and "see more" link now opens its own page.
- Contact form knows where you came from (?plan=, ?care=, ?service=), shows
  it, pre-selects a budget range and sends it as `interest` (new
  `Lead.interest` column in the OS, shown on the lead page).

## 2026-09-24: Nirmaan OS, Phase 5 (Productization signals)

- `/os/patterns`: won projects grouped by kind of work, scored against the
  four productization criteria (pass / fail / unknown), with recorded
  pursue / not-now decisions in the knowledge base.

## 2026-09-24: Nirmaan OS, Phase 4 (Knowledge and IP)

- IP library with computed maturity, knowledge base with search, mandatory
  post-mortems before handover.
- Client accounts and a `/portal` scoped to one client: projects, invoices,
  support requests, change requests.
- Support queue for the team.

## 2026-09-24: Nirmaan OS, Phases 2 and 3

- AI software factory: architect, planner, budgeted orchestrator, metered
  dispatch, criticality routing, CI evidence endpoint.
- Financial OS: invoices from payment schedules, payments, GST, actual costs,
  project economics, care-plan billing, CFO screen.

## 2026-09-24: Nirmaan OS, Phase 1 (Business OS)

**Positioning** · The public site now leads with "You bring the problem. We build
the system." The contact page is a three-step, problem-first intake instead
of a project-type form. Services gained AI systems, mobile apps,
integrations, internal tools and modernisation. The public Agency OS page
was removed (it exposed internal agent architecture); its customer-relevant
ideas moved to Process → "How we keep it honest". Old links redirect.

**Nirmaan OS (`/app`)** · Authentication and capability-based RBAC; audit
log; human-readable IDs; leads and public intake API; Business Analyst
discovery mode with typed facts, assumptions, questions and
recommendations; requirements; structured proposals with internal
economics; client proposal links (approve, request changes, decline);
automatic project creation; traceability (REQ→FEAT→TASK→TEST→DEPLOY) with
evidence; change requests; 9 human gates; client status links; the
founder's Today screen; AI usage ledger; team management. 42 new tests
(149 total).

**Docs** · Full `/docs` structure with status labels (IMPLEMENTED / PLANNED /
PROPOSED / EXPERIMENTAL), including the current-state audit and roadmap.

**Not done yet (planned)** · Deploying the OS (so the website intake is not
live yet), Phase 2 AI software factory, Phase 3 financial OS, Phase 4
knowledge and IP, client accounts.

## 2026-09-23: "Block by block" redesign

New visual identity built from the Nirmaan logo; Tailwind and three.js removed.
