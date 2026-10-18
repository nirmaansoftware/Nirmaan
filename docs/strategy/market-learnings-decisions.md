# Market learnings decisions, 2026-10-18

The founder asked for the market to be studied, for the ten companies that
work most like Nirmaan to be researched, and for what we learn and could
improve to be written down. He delegated the judgement to a decision meeting
([how meetings run](../operations/decision-meetings.md)). One research report
covered ten companies, four of them Indian: engineering and design studios, a
subscription design service, a consultancy that became a product company, an
AI services firm, a product company, an AI app builder and one cautionary case
that failed. It also covered the AI app builders that now compete with small
studios. Twenty-seven agent roles gave independent positions and checked
the report against our own code and site; the Orchestrator chaired and
decided.

The founder keeps merges, contracts, spending, prices and public names. This
record and the documentation changes listed in section 6 ship together in one
pull request. Nothing else here is done yet: section 7 is a backlog, and items
marked **Founder** wait for him. The report, the positions and the internal
minutes are kept outside this public repository.

## 1. How to read this

- **ADOPT NOW**: can be done with no new spending, and is either in this pull
  request or in the backlog without a gate.
- **ADOPT LATER**: the gate and its owner role are named.
- **REJECT**: with the reason. A rejection can be reopened by a new decision.
- What another company says about itself is its claim, not a fact. Where the
  report was wrong about Nirmaan, section 5 says so.

## 2. The fifteen learnings

| # | Learning | Decision | Gate and owner |
|---|---|---|---|
| 1 | A fixed-price paid discovery, credited against the build | ADOPT LATER | See 2.1. Business Analyst, Finance / Estimation, Product Manager |
| 2 | Rescue and harden apps built with AI app builders | ADOPT NOW internally, LATER in public | See 2.2. Security Engineer |
| 3 | Never quantify AI's share of the work or speed multiples | ADOPT NOW | In this PR. Brand Strategist |
| 4 | Publish the method as a readable guide | ADOPT LATER | Sign-off wording true, phase names unified, status labels swept. Content Strategist |
| 5 | An eval set for every AI feature delivered to a client | ADOPT NOW | Rule now, applied at the first client AI feature. AI / ML Engineer |
| 6 | More proof: case studies, reviews, listings | ADOPT NOW the process, LATER the content | Written client consent. Content Strategist, SEO Specialist |
| 7 | Founder writing and building in public | ADOPT LATER | **Founder** commits to a cadence and approves each post. Content Strategist |
| 8 | Apply the productization evidence gate to Nirmaan Outreach | ADOPT NOW, corrected | In this PR. Product Manager |
| 9 | The client portal as a product for other studios | REJECT for now | Reopen only after Outreach passes its gate, the OS has run on real clients and three outside studios ask. Principal Architect |
| 10 | Write capacity into the offer | ADOPT NOW as internal rules | In this PR, no numbers in the repo. Business Analyst, SRE |
| 11 | One referral channel that sees many small businesses | ADOPT NOW, narrowed to chartered accountants | Unpaid, recorded by hand. Sales and Partnerships, **Founder** makes the asks |
| 12 | A written AI and data clause in proposals | ADOPT NOW as an internal draft, LATER in proposals | Counsel review, founder checks the account's training setting. Legal Counsel |
| 13 | Say publicly who should not hire us | ADOPT NOW as draft wording | **Founder** merges the page change. Brand Strategist |
| 14 | Free local meetups | ADOPT LATER | Two published notes and one recorded referral; free venue only. Sales and Partnerships |
| 15 | Partner and expert programs | ADOPT LATER for model vendors, REJECT for an app builder's referral program | **Founder** reads each program's terms. Sales and Partnerships |

### 2.1 Paid discovery (1)

- **Decision:** three steps. Now, internally: the Business Analyst defines the
  deliverable (typed discovery items, requirements, risks, an architecture
  sketch and a fixed quote; no design, no code) and a process path of its own.
  It must not reuse the build proposal path, because approving a proposal
  opens a project and closes the lead. Legal Counsel drafts a one-page order,
  internal and marked as not reviewed by counsel.
- **Then by hand, as an option after the free first conversation.** Gate: the
  founder sets the price, the credit rule and whether it is refundable; a
  chartered accountant confirms the tax treatment; Market Research has a dated
  snapshot of local prices.
- **Then on the site.** Gate: lost reasons over 20 decided leads show that
  unclear scope is a real problem, and at least one discovery has been sold by
  hand. No OS change until one is sold.
- **Always:** the free first conversation stays, and the contact form is never
  a payment step.
- **Why:** every seat rated demand low or unknown. The examples were foreign
  firms far above our price range. A hand trial costs nothing.
- **Dissent:** Legal Counsel wanted the order usable now; it stays a draft.

### 2.2 Rescue of apps built with AI app builders (2)

- **Decision:** a variant of the existing Modernisation service ("old or
  fragile system"), never a new service line. Our care terms already require a
  review before we look after a system we did not build.
- **Now, internally:** one intake checklist owned by the Security Engineer,
  with sections from the Database, DevOps, Frontend, Performance and SRE roles
  and an acceptance test set from QA, written at the level of what we check.
- **Rules from today:** the first step is a fixed-price, read-only assessment,
  never a fixed price to fix code we have not seen; audit access is read-only
  and comes through the client's own secret store; work happens on a copy or
  staging system; nothing is written to production until a fresh export has
  been restored and the client has signed off in writing; the code and hosting
  move into accounts the client owns. We never call the result "secured",
  "hardened" or "audited"; we say what was checked, what was found and what
  was fixed. Public copy never names a platform or cites an incident.
- **Public listing, later.** Gate: the checklist exists and QA's tests have
  each been shown to fail on a seeded test app; a client agreement with a
  rescue schedule has been reviewed by counsel, or the founder records that he
  accepts the risk without one; two real enquiries have arrived with apps built
  this way; the founder merges.
- **Dissent:** the Brand Strategist, Principal Architect and the Frontend, UI,
  UX and Performance roles wanted a public line or page now. Drafts may be
  prepared; nothing merges before the gate. The chair sided with the Security
  Engineer and Legal / Compliance because the conflict touches security and
  legal terms.

### 2.3 Banned claims (3)

Added to the Voice "Never" list in `docs/company/positioning.md` in this PR,
because comparable firms used each of these, and the founder of one now calls "unlimited" misleading:

- "unlimited";
- speed or cost multiples ("3x faster", "40% cheaper");
- any share of the work done by AI ("80% built by AI", "AI builds your app"),
  ever. The OS records model calls, tokens, cost and latency, and cannot
  measure a share of work, so there is no method that could support one;
- "AI-powered" or "AI-native" as a label for Nirmaan, and a human name or
  persona for an AI;
- "pre-built modules", feature counts or a "library" in a proposal or on the
  site, until an asset is rated proven in `docs/strategy/reusable-ip.md`;
- "secure", "hack-proof", "bank-grade", "100% secure", "100% tested" or
  "audited" as outcomes, and any certification we do not hold;
- struck-through or "was" prices;
- uptime percentages, "real time" or "24/7".

A speed number is allowed only with a linked run anyone can repeat (device,
throttling, date). A search of the site source today finds none of these
words, so no page needs rework.

### 2.4 Evals for client AI features (5)

No AI feature delivered to a client reaches handover without a recorded eval
set: cases drawn from the client's real, anonymized inputs with expected
outcomes written by a person, the pass rate, known failure modes, the
fallback, and latency and cost per call. The handover states that results are
evidence at a date, not a promise of future output. The handover step is in
this PR; the rule in `docs/ai/evaluation.md` and the definition of done follow
in an Engineering documentation PR (ML5). **Founder:** whether a pass rate
ever becomes a contractual acceptance criterion.

### 2.5 Proof, consent and listings (6)

- **Now:** at handover, after the client has accepted the work and in a
  separate message, we ask for consent to name them, a review and one
  introduction. It is never a condition of acceptance. In this PR.
- Every exhibit on the site is labelled as client work, an illustration or our
  own build (ML24). No composite or invented client stories.
- A performance number in a case study needs a linked run.
- Google Business Profile comes before any directory listing, and directory
  listings are free ones only, after two clients can review us.
- **Founder:** asking our one case-study client for consent, screenshots and a
  review; deciding whether a public location or service area is shown.

### 2.6 Outreach's evidence gate (8) and the portal (9)

- Outreach came from our own use, so the four productization criteria (which
  count won client projects) fail by construction. This PR adds a section to
  `docs/strategy/productization.md` for products built for our own use:
  success is clients still paying after the three-month minimum term, judged
  at the existing price review, never waitlist sign-ups. No second product or
  new service is built before Outreach passes.
- The portal is rejected as a product for now: the OS has only been used on
  Nirmaan itself as a test, it is single-tenant, and a tool for other studios
  is a crowded horizontal market. Only "our own repeated rework" is added as a
  watched theme.

### 2.7 Capacity (10)

In this PR, with no numbers in the repo: a capacity check before a proposal is
drafted (`lead-to-project.md`); a queue that stays full triggers a price
review (`pricing-principles.md`); care-plan changes are worked one at a time in
the agreed order; and the care readiness gate in section 4 (D2). Publishing
"one open change at a time" as a term is later and the founder's.

### 2.8 Referrals, partners and meetups (11, 14, 15)

- Referrals start with chartered accountants only, unpaid and reciprocal,
  with every referral recorded by hand before the first conversation. Widen
  only after results are recorded. No referral fee until a chartered
  accountant has confirmed the rules and the tax treatment.
- An app builder's referral program is rejected: it needs a paid plan, which
  is new spending, and a commission from the platform we would be reviewing is
  a conflict. Model-vendor programs wait for the founder to read their terms;
  free only, any commission disclosed, and a badge is never a security
  credential.

### 2.9 AI and data clause (12)

An internal draft now. In proposals only after counsel review, after the
founder confirms the training setting on the account the work runs on, and
after each AI path's data terms are read and dated. The draft names each AI
path that sees client data; quotes each provider's own terms on training with
a date instead of making it our promise; lets the client exclude data from AI;
keeps credentials and live personal data out of AI tools without written
agreement; and says a person reviews every deliverable. A client's own AI
features run on a provider account in the client's name. Six engineering and
client roles wanted it in proposals now; the chair followed Legal /
Compliance and Legal Counsel because these are contract terms.

## 3. Other ideas

| Idea | Decision | Reason |
|---|---|---|
| A free public AI tool that turns a problem into a brief | REJECT for now | Needs new model spending or would serve anonymous traffic on the founder's plan; open to prompt injection |
| A pause option on care plans | ADOPT LATER, **Founder** | Copy must say plainly that nothing is monitored or backed up during a pause and that hours do not carry over |
| Outcome or gain-share billing | REJECT for now | Collection and measurement disputes; revisit after estimate and actual data on three projects |
| A separate software fee for the portal | REJECT | The portal is not a product |
| Open-sourcing the gate engine | REJECT | `reusable-ip.md` and `positioning.md` keep it private; other small pieces are a founder call |
| Saying "we don't pay for ads" | REJECT | Reads as cheap; the buyer value is an assumption |
| Stating an appetite per milestone | ADOPT LATER | On the next proposal written by hand. Business Analyst |
| Only collected revenue is ever quoted | ADOPT NOW | ML36. Finance / Estimation |
| Client production in client-owned accounts | ADOPT NOW for new work | Registrar, host and repository in the client's name from day one, Nirmaan as a collaborator; makes handover on cancellation true. In this PR |
| Gujarati and Hindi summaries | ADOPT LATER | Once Outreach records reply language; reviewed by a native speaker |

## 4. Drift and gaps in our own repo and site

The meeting found places where our pages or docs say more than our practice
or code supports ([principle 6](../company/principles.md)).

| ID | Finding | Decision |
|---|---|---|
| D1 | The Process page and `positioning.md` say the client signs off the plan, the design, going live and handover; the OS records only the proposal as the client's own decision | Made true by practice in this PR: the founder approves those gates only with the client's written sign-off attached as evidence (`project-lifecycle.md`). An OS record per milestone is ML17 |
| D2 | Care plans promise uptime monitoring with alerts and tested restores; monitoring for client systems is PLANNED | Care readiness gate in this PR (`maintenance.md`): no plan starts or is invoiced until that system has a monitor, an alert route, a runbook and a restore drill on record. Free monitoring is ML15, restore drills ML16. If a plan is to be sold before then, the copy changes first (**Founder**) |
| D3 | "Security monitoring" on the Maintenance service says more than "security and dependency updates" in `maintenance.md`; "security review before launch" is sold while the client review process is planned | Reword (ML13, **Founder**); write the minimum review before the next launch (ML14) |
| D4 | The privacy notice lists four processors but not the AI provider or the OS host | Fix (ML11, **Founder**); required before the OS worker restarts at the latest |
| D5 | The Process FAQ says the client owns "every deliverable" and gets "database schemas"; `reusable-ip.md` keeps reusable code in a private repository | The published page wins until the founder changes it. A carve-out is drafted for counsel, and the proposed wording is code, migrations, a full data export and accounts in the client's name (ML12, **Founder**) |
| D6 | Stale status labels; `moat.md` calls the IP library PLANNED while `reusable-ip.md` says IMPLEMENTED | `moat.md` corrected in this PR; full sweep is ML23 |
| D7 | Docs say the IP library is at `/os/ip`; the OS serves it at `/os/library` | Corrected in this PR |
| D8 | `pricing-principles.md` says price points are not in the public repo; `pricing.json` publishes them | Corrected in this PR: anchors are public in `pricing.json`, rate cards, margins and estimates stay internal |
| D9 | Phase names differ between the Process page, the pricing steps, the contact page and the portal | One shared list (ML19, **Founder**) |
| D10 | Response time: the Essential plan says one business day, `maintenance.md` says the same business day; "24 hours" is typed by hand on several pages | `maintenance.md` points to each plan's published response time in this PR; one site field for the enquiry reply time (ML20) |
| D11 | Numbers in `pricing.json` are repeated by hand in its own copy | A check that fails the build on a mismatch (ML21) |
| D12 | The OS colour tokens have drifted from the site's | A test that fails on any mismatch (ML22) |
| D13 | The Process page's call to action asks what you want to build, not what your problem is | Reword (ML33, **Founder**) |
| D14 | `project-lifecycle.md` shows lead stages as project stages; a project record starts at APPROVED | Corrected in this PR |
| D15 | Asset maturity counts a project at any stage | Count only delivered projects (ML31) |
| D16 | An invoice error message mentions credit notes, which do not exist | Fix the message (ML32) |

## 5. Where the report was wrong or thin

- The poor-fit list is not private: it is in this public repository, and
  per-package fit and exclusions are already on the pricing page.
- A rescue service already exists as Modernisation, with a review-first rule.
- The client portal is not a daily tool: the OS was only ever used on Nirmaan
  itself, as a test.
- The report said two agents had been exercised. Our own docs disagree on
  whether any agent has run end to end on a live model; the label sweep (ML23)
  settles it.
- There is no proposal template in the OS, only a draft built from the lead.
- "Private by default" in our principles covers public surfaces, not AI
  providers.
- Not every comparable grew on founder writing alone; one grew partly on
  search ads.
- Several learnings rest on one source or on a company's own claims, and the
  ten skew toward US and enterprise buyers. None sells to Indian small
  businesses at our price range, so a local snapshot is a backlog item (ML37).

## 6. Documentation changes in this pull request

No website, pricing data or OS change.

| File | Change |
|---|---|
| `docs/strategy/market-learnings-decisions.md` | This record (new) |
| `docs/README.md` | Link to this record in the Strategy row |
| `docs/company/positioning.md` | The banned claims in 2.3; a short "How we talk about AI" section; a dated note on the "You stay in control" row (D1) |
| `docs/finance/pricing-principles.md` | D8 corrected; principle: capacity before price; principle: every new offer states its tax treatment, confirmed by a chartered accountant before its first invoice |
| `docs/strategy/productization.md` | Section for products built for our own use (2.6); "our own repeated rework" as a watched theme |
| `docs/strategy/reusable-ip.md` | `/os/library`; no asset offered as a ready-made module until proven |
| `docs/strategy/moat.md` | IP library row: implemented in the OS, no client uses recorded yet |
| `docs/strategy/roadmap.md` | `/os/library` |
| `docs/operations/project-lifecycle.md` | Client written sign-off rule (D1); project records start at APPROVED (D14) |
| `docs/operations/client-handover.md` | Data export restored and checked; Nirmaan's access removed and keys rotated; accounts in the client's name; eval results for AI features; the consent, review and introduction ask, separate from acceptance |
| `docs/operations/lead-to-project.md` | Capacity check before a proposal; two lost reasons recorded by hand ("chose a DIY or AI builder", "already built, needs fixing") |
| `docs/operations/maintenance.md` | Care readiness gate (D2); response time per plan (D10); changes one at a time; systems we did not build start with a fixed-price read-only assessment; client-owned accounts |

## 7. Backlog

P1 this month, P2 later. **Founder** marks items that wait for the founder
(a merge in a founder class, spending, a public name, a contract or a price).

| ID | Item | Owner | Gate | File | Verified by | P |
|---|---|---|---|---|---|---|
| ML1 | Banned-word check over the built site | Brand Strategist, Frontend Engineer | This PR merged; **Founder** (workflow change) | `website/scripts/`, `.github/workflows/website.yml` | A planted "unlimited" fails the build | P1 |
| ML2 | Rescue intake checklist | Security Engineer | None | `docs/engineering/security.md` | Run on a local seeded test app; it catches a planted missing row-level policy, with query output captured | P1 |
| ML3 | Rescue acceptance tests | QA Engineer | ML2 | `docs/engineering/testing.md` | Each test fails on the seeded app before the fix and passes after | P2 |
| ML4 | Rescue line in Modernisation | Brand Strategist, Frontend Engineer | 2.2 public gate; **Founder** | `website/src/_data/services.json` | Launch list passes; QA checks each claim against practice | P2 |
| ML5 | Client AI feature eval rule and definition-of-done checkbox | AI / ML Engineer | None | `docs/ai/evaluation.md`, `docs/engineering/definition-of-done.md` | Key 1 refuses a handover checklist without the eval file | P1 |
| ML6 | Paid discovery deliverable and its own process path | Business Analyst | None | Internal first, then `docs/operations/lead-to-project.md` | The path does not use the build proposal; a lost reason "declined paid discovery" exists | P2 |
| ML7 | Draft discovery order | Legal Counsel | None (draft only) | Internal legal drafts | Marked as not reviewed by counsel, questions for counsel listed | P2 |
| ML8 | Paid discovery hand trial | Finance / Estimation | **Founder** sets price, credit, refund; chartered accountant on tax; ML37 | Internal | Trial results recorded per lead | P2 |
| ML9 | Paid discovery on the site | Product Manager, UX Designer | 20 decided leads, one sold; **Founder** | `website/src/_data/pricing.json`, `website/src/process.njk` | Free conversation still first; never a payment gate | P2 |
| ML10 | AI and data clause draft | Legal Counsel | Use in proposals: counsel review and **Founder** checks the training setting | Internal legal drafts | Each AI path named, provider terms dated | P1 |
| ML11 | Privacy notice lists the AI provider and the OS host | Legal / Compliance | **Founder** (privacy notice); before any worker restart | `website/src/privacy.njk` | The list matches the AI provider code and the hosting configuration | P1 |
| ML12 | Ownership wording and a carve-out for reused code | Legal Counsel | **Founder**, counsel | Process FAQ, `services.json`, `pricing.json` FAQ, client agreement | Each ownership promise maps to one clause | P2 |
| ML13 | Reword "Security monitoring" | Security Engineer | **Founder** (site copy) | `website/src/_data/services.json` | Search of the built site finds no "security monitoring" | P1 |
| ML14 | Minimum client security review before launch | Security Engineer | Before the next client launch | `docs/engineering/security.md` | One recorded review | P1 |
| ML15 | Free monitoring for client systems | SRE | Free quota checked; client addresses kept out of this repo | `docs/engineering/observability.md` | A broken preview address sends an email within one check interval | P2 |
| ML16 | Restore drills and an exit runbook | SRE, Database Engineer | Each care plan start | `docs/operations/maintenance.md` | No care invoice without a drill dated in the last 100 days | P2 |
| ML17 | Client sign-off recorded in the OS per milestone | Backend Engineer, Client Communication | **Founder** resumes OS work | OS approvals | A test: a gate that needs client sign-off refuses without it | P2 |
| ML18 | Weekly written update during a build, from recorded state | Client Communication | Publishing a cadence: **Founder** | `agents/client-communication/agent.md` | A test project's draft cites only existing records | P2 |
| ML19 | One shared list of phase names | UX Designer, Content Strategist | **Founder** (site) | New data file, `process.njk`, `pricing.json` steps, `contact.njk` | Build check: all pages render the same names | P1 |
| ML20 | One field for the enquiry reply time | Technical Writer, Frontend Engineer | **Founder** (contact form page) | `website/src/_data/site.json` and templates | No literal reply time left in templates | P2 |
| ML21 | Build check for repeated `pricing.json` numbers | QA Engineer | **Founder** (workflow change) | `website/scripts/`, `.github/workflows/website.yml` | A deliberate mismatch fails the build | P2 |
| ML22 | OS colour tokens follow the site's | Design System Engineer | None | `os/src/app/globals.css` and a test | The test fails today and passes after | P2 |
| ML23 | Status label sweep | Technical Writer | None | `business-model.md`, `maintenance.md`, `project-lifecycle.md`, `agents/README.md`, `docs/ai/agent-architecture.md`, `nirmaan-outreach.md`, the Creative Director spec | Each label checked against the code | P1 |
| ML24 | Case studies as data, and exhibit labels | Frontend Engineer, Creative Director | None | `website/src/projects.njk`, `docs/design/visual-direction.md` | Built page unchanged; every figure carries a label | P2 |
| ML25 | Case-study consent, screenshots and review | Content Strategist | **Founder** asks the client | `website/src/projects.njk` | Written consent on file | P2 |
| ML26 | Google Business Profile, with name, area and contact in one place | SEO Specialist | **Founder** decides location or area and the owner account | `website/src/_data/site.json`, `website/src/_includes/base.njk` | The same details in the built site and the profile | P2 |
| ML27 | Search Console and Bing verification | SEO Specialist | **Founder** adds the DNS record | `docs/engineering/list.md` | Sitemap fetched, indexed count recorded | P2 |
| ML28 | "Who this is not for" block on the pricing page | Brand Strategist, UX Designer | **Founder** (price page) | `website/src/pricing.njk` | Matches `ideal-customer-profile.md` | P2 |
| ML29 | Chartered accountant referral pilot and log | Sales and Partnerships | Log exists before the first conversation; **Founder** makes the asks | Internal | Every lead's source and referrer recorded | P1 |
| ML30 | Lost reasons and "referred by" in the OS | Product Manager, Backend Engineer, Database Engineer | OS work resumes | OS lead model | A test on the new values | P2 |
| ML31 | Asset maturity counts delivered projects only | Principal Architect | None | OS library code | A test: a use at discovery leaves maturity experimental | P2 |
| ML32 | Correct the invoice error message | Backend Engineer | None | OS invoice code | A finance test case | P2 |
| ML33 | Problem-first call to action on the Process page | UX Designer | **Founder** (site copy) | `website/src/process.njk` | Matches the primary action in `positioning.md` | P2 |
| ML34 | Method guide as a section of the Process page | Content Strategist | D1 practice in place, ML19, ML23; **Founder** | `website/src/process.njk` | Shows only what the client sees, decides, receives and can refuse | P2 |
| ML35 | Founder notes, published as site pages | Content Strategist | **Founder** cadence and approval; role scope updated | `agents/content-strategist/agent.md`, site | Each note approved before merge | P2 |
| ML36 | Only collected revenue is quoted; pipeline runway as PROPOSED | Finance / Estimation | None | `docs/finance/project-economics.md` | Marked PROPOSED, no figures | P2 |
| ML37 | Dated local price snapshot and local alternatives | Market Research | None | Internal research | Vendor pages with dates | P1 |
| ML38 | Performance budgets for apps; define the monthly performance report; record our own runs with device and throttling | Performance Engineer | None | `docs/engineering/definition-of-done.md`, `docs/operations/maintenance.md`, `docs/engineering/list.md` | The next handover report shows each budget, pass or fail | P2 |
| ML39 | Hosting plan terms for client work | DevOps Engineer | **Founder** | `docs/engineering/procurement.md` | Terms read and dated | P1 |
| ML40 | A client can deploy from the handover guide | DevOps Engineer | None | `docs/engineering/definition-of-done.md` | A dry run from a fresh checkout before handover | P2 |
| ML41 | Tax deducted at source on receipts; questions for a chartered accountant | Tax and Accounts | OS work resumes for the build | `docs/finance/recurring-revenue.md`, `docs/strategy/roadmap.md` | A test records a payment net of tax | P2 |
| ML42 | "Recommended" badge readable by screen readers | UI Designer | None | `website/src/static/styles.css`, plan template | Checked with a screen reader | P2 |

Engineering, design and agent-spec documentation (ML5, ML14, ML23, ML24,
ML38, ML40) goes in separate pull requests, so each stays within three owning
teams.

## 8. Founder items

- Merge this pull request (it touches positioning).
- Prices and terms: the discovery price, credit and refund; a pause option;
  "one open change at a time" as a published term; whether eval pass rates
  become acceptance criteria.
- Legal and money: engaging counsel for the client agreement, the rescue
  schedule, the AI and data clause and the ownership carve-out; a chartered
  accountant for discovery, referral and commission tax questions; confirming
  the training setting on the account AI work runs on; the hosting plan terms
  for client work.
- Public names and pages: any public mention of another company (none is
  named in this repository); the privacy notice; the rescue line; the "who
  this is not for" block; the phase list; a public location or service area;
  the Google Business Profile; partner program applications.
- Clients: asking our case-study client for consent, screenshots and a
  review; every message that goes to a client.
- Time: the referral asks, a writing cadence, meetups.

## 9. Where it is recorded, and naming other companies

This record is public. The research report, all positions and the internal
minutes, including company names, sources, incidents, costs and effort, stay
outside this repository. **This repository names no other company**:
competitors, platforms and reference firms appear only as categories. Sixteen
seats asked for that; five (Content, Market Research, QA, Technical Writer,
SEO) would have allowed names as cited sources of their own claims, and
Security would have cited platform incidents with sources. The chair chose no
names: a named comparison is a claim we would have to keep verified, it adds
nothing a client needs, and one of the companies is in insolvency
proceedings with contested allegations. Any public name is the founder's
decision.

## 10. Open questions

- Whether small businesses in our market will pay for discovery (ML8, ML9).
- Whether enquiries with apps built by AI app builders arrive at all (2.2).
- Whether chartered accountants refer (ML29).
- Whether our buyers check Google more than directories (ML26).
- The right minimum size of a client eval set; 20 cases is an assumption to
  revisit after the first client AI feature.
