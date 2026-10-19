# Nirmaan Outreach (formerly Nirmaan Marketing): launch decisions (2026-10-16)

Status of the page changes: done on PR #59 (2026-10-16), with the claim check by QA applied
(four claims softened to match the code). Internal minutes, with margins and cost arithmetic,
are kept outside this public repository.

A decision meeting of Nirmaan's agent roles, chaired by the Orchestrator. The founder delegated
these decisions to the meeting. The founder still merges the page and signs each contract.

## Decisions

### Name
- **Renamed by the founder on 2026-10-16: the product is Nirmaan Outreach**, the Brand Strategist's
  proposal (the meeting had kept "Nirmaan Marketing"). The URL is `/products/outreach.html`; the page
  had not been published under the old name, so nothing needed redirecting.
- The page title, description and lede say "B2B lead generation" and "outreach", so nobody mistakes
  it for a social media or ads agency.
- We look again if early enquiries read it as an ads or social media service. The fallback name is
  "Nirmaan Outreach".

### Status
- **Waitlist (OS paused 2026-10-17).** Not taking clients. No early access, no "up to three",
  no sign-up, no free trial, no contract, no payment. The page keeps its URL and stays indexed.
- Own use is past tense only: "We used it for our own outreach from September 2026." Never
  "we use it". The page gives no reason for the pause and no opening date.
- The page shows the planned price, labelled as the price when it opens. The early-access
  price (`earlySetup` in `pricing.json`) stays in data but is not shown. No JSON-LD `Offer`.
- No claim the code doesn't back: no "your voice" or "your real signature" until gate E1 closes,
  no full export on leaving until gate E16 closes (only the message-log CSV exists).
- The earlier status, "Early access, up to three businesses", is withdrawn. Where the "Page
  changes" checklist below says early access, it is history from PR #59 and must not be
  re-applied.
- When it opens, we set it up and run it with each client. Results are not promised.

### Price
- **One plan. No tiers.**
- **Setup: ₹35,000.** Paid 40% on signing, 40% when the first drafts are ready to review, 20% when
  the first approved emails go out.
- **Monthly: ₹12,000.** One fee, in rupees, billed monthly from the month real sending starts.
- **Early-access clients (up to three): ₹25,000 setup**, and ₹12,000 a month locked for 12 months.
  In return they take part in a staged start and a monthly feedback call. If we can't start real
  sending within 8 weeks of signing for reasons on our side, they can cancel and get the setup back.
- **The monthly fee includes:**
  - their own private setup, hosted and looked after by us;
  - up to 300 businesses researched a month (found, website checked, and drafted for when they fit);
  - email sent from their own mailbox, and WhatsApp messages prepared for them to send;
  - backups, updates and monitoring;
  - a monthly review of what was sent and what got replies;
  - up to 4 hours of changes a month;
  - replies the same working day, Monday to Saturday, 10:00 to 19:00 IST.
- **Google Maps search** runs on the client's own Google account. We set it up with them and show
  the expected cost before they start.
- **No surprise bills.** At the monthly limit, research pauses. More volume is quoted in advance.
- **Web search** is off by default. It's available as a quoted extra.
- **Minimum term:** 3 months from when real sending starts, then month to month with 30 days' notice.
- **GST:** "Prices are before GST. Where GST applies, it's added on the invoice."
- **Ownership:** the client owns their data and can export it as CSV at any time. They get a licence
  to use the software during the term, not the code.
- **Review:** prices are reviewed after three clients, or by 31 March 2027. The same review decides
  whether to un-pause or withdraw the product (see "31 March 2027 review" below).

### Price on the page
- **Yes, the price is shown.** Exact numbers, not "from", because there is one fixed plan.
- It lives in `website/src/_data/pricing.json` and is rendered with the existing care-card pattern.

### Can the page go live now?
- **Superseded 2026-10-17: the page is a waitlist (see Status).** Originally: yes, as early access, once the page changes below are done and the founder merges the PR.
- The page only collects enquiries. Work to get ready for clients happens in parallel.
- No contract is signed until the client agreement is ready. No client email is sent until every
  item in "Before the first paying client" has passed.

### Home page
- **No Products strip at launch.** The Products nav item and links from service pages are enough.
- Add a small strip when the first early-access client is live.

### 31 March 2027 review: un-pause or withdraw
**PROPOSED, not decided.** The thresholds below (at least 3 qualified enquiries, the withdraw
rule, the 30 September 2027 backstop) and the definition of "qualified" are INFERRED by the
Product Manager and Business Analyst. No decision record backs them. They bind nothing until
the founder accepts or changes them.

Written 2026-10-18 (tracker N23, Product Manager and Business Analyst). The review on
31 March 2027 is a decision meeting (`docs/operations/decision-meetings.md`). Its agenda has
this item, beside the price review above. The founder decides on the meeting's advice.

**What the meeting is given** (gathered the week before, by the Product Manager and the
Business Analyst):
1. **Waitlist count:** the number of qualified waitlist enquiries in the private enquiry log
   (N18), a count only, with no names or details here. (PROPOSED definition, INFERRED.) An enquiry is qualified when it is
   from a business in "Who it's for", says who it wants to reach, and arrived with the consent
   the privacy page describes. Spam, job seekers and duplicates are not counted.
2. **Counsel:** for each of L1 to L5, one of: answered by counsel, asked but not answered,
   or not asked.
3. **Gates:** for E1 to E17, O1 to O7 and Q1 to Q2, how many have passed with recorded
   evidence (Q2), and which are still open.
4. **OS worker:** whether it is still off (`NIRMAAN_WORKER = "off"`), and which items of the
   checklist for turning it back on (`docs/engineering/deployment.md`, "Worker off, and
   turning it back on") are done.

**Un-pause** (PROPOSED, INFERRED thresholds; start getting ready for the first clients) only when all of these hold:
- at least **3** qualified waitlist enquiries (three, the number of clients the price review
  waits for, and the number we can set up by hand);
- **L1** is answered by counsel, and so are **L3, L4 and L5**. **L2** may still be open, but
  then WhatsApp first contact stays off, as the L2 row says;
- every gate still open has an owner and a date, agreed at the meeting;
- the founder approves.

Un-pausing changes no other rule: the worker is turned back on only through the checklist in
`deployment.md`, no contract is signed before L1, and no client email is sent before every
gate above has passed. The page leaves "Waitlist" only after that, through its own PR.

**Withdraw** (PROPOSED, INFERRED; take the product off the site) when both of these hold:
- **no** qualified waitlist enquiry, and
- **L1 not asked** of counsel.

Withdrawing is its own PR: the page and its Products card come off, the URL redirects to the
Products page, and anyone on the waitlist is told by email. The OS code stays in the
repository, and the worker stays off.

**Otherwise** the page stays a waitlist with no changes. The meeting sets the next review
date, no later than 30 September 2027 (PROPOSED backstop, INFERRED), and records why it neither un-paused nor withdrew.

## Page changes

History from PR #59. Superseded by the waitlist Status above: do not re-apply any early-access,
"up to three", "we use it", "your voice", "your real signature", full-export or `Offer` item.

File: `website/src/outreach.njk` on branch `product/nirmaan-marketing` (PR #59), plus the files
named below. Rebuild `website/public/` in the same PR.

### Head, hero and status
- [ ] `title` → `Nirmaan Outreach: B2B Lead Generation in India`
- [ ] `description` → `Find B2B customers in India with researched, personal email and WhatsApp outreach that you approve before anything is sent. Early access.`
- [ ] `eyebrow` → `Nirmaan Outreach · Early access`
- [ ] `lede` → `B2B lead generation without blasts or bought lists. Nirmaan Outreach finds businesses that match the customer you want, looks for a reason to write to each one, and drafts a short message in your voice. <strong>Nothing is sent until you approve it.</strong>`
- [ ] Hero primary action → `Ask for early access` (`/contact.html?product=outreach`). Secondary stays `See it work`.
- [ ] `products.json`: `label` → `Early access`.

### Order of sections
- [ ] New order: Hero → Problem → Demo → Who it's for → What it does → Guards → Getting started → Price → FAQ → CTA.
- [ ] **Cut** the "How it markets you" outcomes section completely (it promised results we have no evidence for).
- [ ] Problem section: remove the "01/02/03" numbers. Keep the copy.

### Demo
- [ ] Add a visible **Pause / Play** button next to Replay (WCAG 2.2.2).
- [ ] Stop autoplay when keyboard focus enters the tour (`focusin` → stop).
- [ ] Add `role="tab"` / `role="tabpanel"` from JS, so they aren't left behind when JS is off.
- [ ] Move `Illustration with sample businesses. Not real data.` **above** the demo. Use `--ink-2` for it.
- [ ] Use `--ink-2` (not `--ink-3`) for console labels, sub-lines and the opt-out line on the tinted section (AA contrast).
- [ ] Beat 1 caption → `Say you run a web studio and want clinics as clients. It turns your goal into a plan you can check and edit: what to search for, where, and what the first messages lead with.`
- [ ] Beat 2 caption → `It searches maps for businesses in your cities, a little every day. Each business appears once, with where it was found.`
- [ ] Beat 2: `Northgate Dental Care · Ahmedabad · web` → `Ahmedabad · maps`.
- [ ] Beat 3 caption → `It reads the business's own website and checks the fit. Businesses that don't fit are left out.`
- [ ] Beat 4 caption → `Short, first person, one specific observation and one small next step. Every email ends with a way to opt out.`
- [ ] Beat 5: Meridian Smiles chip `Read and approve` → `Read, edit, approve`.
- [ ] Beat 6 caption → `A reply stops the follow-ups, and you can turn it into a lead in one click. Anyone who replies “stop” goes on the do-not-contact list.`
- [ ] Beat 6 events: `Follow-up cancelled` stays; `New lead created` → `Ready to add as a lead`.
- [ ] Beat 7 title → `Every week, it shows what's working.`
- [ ] Beat 7 caption → `Replies by segment, city and channel. Once there's enough to go on, it moves effort toward what gets replies and tells you what it changed.`
- [ ] Should: drop the three window dots from the console bar. Add an edge fade to the step tabs on phones.

### Who it's for
- [ ] Section text → `For businesses whose offer fixes something you can see on a customer's website. It isn't for promotional blasts to the public.`
- [ ] List → `Web and design studios` · `Agencies that build for small businesses` · `Software teams selling to small businesses` · `IT and tech service firms`

### What it does (9 cards → 6)
- [ ] `Finds your customers` → `Searches Google Maps for businesses that match the customer you describe, in the cities you choose.`
- [ ] `Looks for a real reason` → title `Looks for a reason to write`, text `Reads each business's own website for signs of a problem you solve, like bookings only by phone or a site that's hard to use on a phone.`
- [ ] `Writes like a person` + `You approve every word` → title `Drafts for you to approve`, text `A short first message for each business, in your voice: one specific observation and one small next step. A person approves every message before it's sent. Edit it, approve it, or skip it.`
- [ ] `Sends like a person` → `Email goes from your own mailbox, in working hours, one at a time with natural gaps, under your mailbox's daily limit.`
- [ ] `WhatsApp, done right` → title `WhatsApp, sent by you`, text `WhatsApp messages are prepared for you, and you send each one from your own phone. It never sends WhatsApp messages by itself.`
- [ ] `Follows up, then stops` + `Listens to replies` → title `Follows up, then listens`, text `A short follow-up in the same email thread a few days later. An email reply stops the follow-ups. A “stop” goes on the do-not-contact list, and bounced addresses are retired.`
- [ ] **Remove** `Learns what works` (the demo's last step shows it).

### Guards
- [ ] Section text → `These rules are part of the system, not settings you have to remember.`
- [ ] → `Every email ends with a one-line way to opt out, and it can't be edited away.`
- [ ] → `A “stop” by email puts that business on the do-not-contact list automatically. A “stop” on WhatsApp is added when you mark it. Nobody on the list is contacted again.`
- [ ] → `Only contact details a business has published itself. No bought lists.`
- [ ] Keep: `Plain text with your real signature. No tracking pixels.`
- [ ] → `A few messages per business at most, days apart. An email reply stops the follow-ups at once.`
- [ ] Keep: `Every search, draft, approval and send is on record, with who approved it.`

### Getting started
- [ ] Step 2 text → `We connect a mailbox to send from (ideally one just for outreach), set up your sending domain and signature, and agree how your messages should sound.`
- [ ] Keep steps 1, 3 and 4.

### Price (new section, tinted, between Getting started and FAQ)
- [ ] Add `products.outreach` to `pricing.json`. Render with the `inr` filter and one `.care-card` in a `.mk-split`. No new component.
- [ ] Eyebrow `Price · Early access`. Heading `One plan, priced up front.`
- [ ] Section text `We use it for our own outreach. We're now taking up to three businesses as early-access clients.`
- [ ] Card: `₹35,000` `to set up`, then `₹12,000` `/ month`. Line: `Early-access clients: ₹25,000 to set up.`
- [ ] Ticks: `Your own private setup, hosted and looked after by us` · `Up to 300 businesses researched a month` · `Email from your own mailbox, WhatsApp prepared for you to send` · `Backups, updates and monitoring` · `A monthly review of what was sent and what got replies` · `Up to 4 hours of changes a month` · `Replies the same working day, Monday to Saturday`
- [ ] Button `Ask for early access`.
- [ ] Note: `Prices are before GST. Minimum term 3 months, then month to month. Google Maps search runs on your own Google account, and we show you the expected cost before you start. Need more than 300 businesses a month? We'll quote it before you commit.`
- [ ] If the 300 figure isn't confirmed before merge, use `Research for an agreed number of businesses each month` instead, in the tick and the note.

### FAQ
- [ ] `Is this spam?` → `It's built to be the opposite. Spam is the same message sent to everyone. Here each message is written for one business, about something on its own website, approved by a person, with a way to opt out. What's allowed depends on who you contact and where, so we agree that with you before you start.`
- [ ] `Will WhatsApp ban my number?` → `We can't promise that, and nobody honestly can. It never sends WhatsApp messages by itself: you send each one from your own phone. Each message is written for one business, and we start slowly. We'll talk through the risk with you before you use WhatsApp.`
- [ ] `Do I have to write the messages?` → `No. The research and the first draft are done for you. You read, edit if you like, and approve. Set aside a little time each working day: nothing goes out until you approve it.`
- [ ] `Does it use AI?` → `Yes, to research businesses and draft messages. A person approves every message, and nothing it reads on the web can send or approve anything.`
- [ ] `What do you need from me?` → `A mailbox to send from (ideally one just for outreach), a Google account for maps search, your WhatsApp Business number if you want WhatsApp, and an idea of who you want to reach. We'll help you sharpen the last one.`
- [ ] `What does it cost?` → `₹35,000 to set up, then ₹12,000 a month, before GST. Early-access clients pay ₹25,000 to set up. The monthly fee covers up to 300 businesses researched a month, hosting and care. Google Maps search is billed to your own Google account, and we show you the expected cost first. The minimum term is three months.`
- [ ] `Do you use it yourselves?` → `Yes. Nirmaan has used it for its own outreach since September 2026. That's why it exists.`
- [ ] Add `Is it ready?` → `It's in early access. We use it for our own outreach, and we're taking up to three businesses now. We set it up and run it with you, and we read the first drafts together. We can't tell you yet what reply rate to expect in your market.`
- [ ] Add `What access do you need to my mailbox?` → `An app password for the mailbox you send from. It lets the system send the emails you approve and read the replies. It opens the whole mailbox, so we suggest a separate mailbox just for outreach. You create the password, and you can revoke it at any time.`
- [ ] Add `Who owns the leads and messages?` → `You do. You can export your prospects, message log and do-not-contact list as CSV at any time, and you get an export if you leave.`
- [ ] Add `Can I use Gmail?` → `Yes, Gmail or Google Workspace. Free Gmail has a lower daily sending limit, so for steady outreach we suggest Workspace.`
- [ ] Do **not** add a data-law FAQ until counsel has reviewed it.

### Closing call to action
- [ ] Eyebrow → `Early access`
- [ ] Text → `We'll tell you honestly whether it fits, how it would find them, and what it would say. We're taking up to three businesses in early access.`
- [ ] Primary → `Ask for early access`. Secondary stays `See it work`.
- [ ] Should: on the contact form for `?product=outreach`, ask `Who do you want to reach?`

### SEO and structured data
- [ ] JSON-LD: `BreadcrumbList` and `Service` (provider → the home page Organization `@id`), with an `Offer` that matches the visible prices exactly. No ratings or reviews. No `FAQPage`.
- [ ] In-text links to the product page from `/services/automation.html` and `/services/ai-systems.html`, and one link back.
- [ ] Should: a product OG image (sample data only).

### Before merge
- [ ] Every kept guard and feature claim checked against the code by QA.
- [ ] A throttled mobile Lighthouse run on the preview, posted on the PR: LCP under 2.5 s, CLS under 0.1, INP under 200 ms.
- [ ] Founder reviews and merges.

Page gate owners: copy (Content Strategist, Technical Writer, with Legal / Compliance), demo and
price block (Frontend Engineer, UI Designer), the 300 figure (Finance / Estimation), SEO (SEO
Specialist), performance (Performance Engineer), claim check (QA Engineer).

## Before the first paying client

No contract is signed before **L1**. No client email is sent before every other item passes.

### Engineering
| # | Gate | Owner |
|---|---|---|
| E1 | Each client has their own profile (company, offer, customer, signature, segments, cities). No Nirmaan name or link appears in a client's messages. A test fails if it does. | Backend Engineer (Principal Architect reviews, QA verifies) |
| E2 | A marketing-only mode. Clients see only the outreach parts of the system. | Principal Architect, Backend Engineer |
| E3 | Each client's AI usage runs on its own metered account, with a hard monthly cap that pauses work. | AI/ML Engineer, DevOps Engineer |
| E4 | Client backups are encrypted, stored separately per client, kept 30 days or less. A restore is tested for each client. | Database Engineer, DevOps Engineer |
| E5 | Google Maps data is cleaned up on Google's retention schedule. | Database Engineer |
| E6 | The new deployment image runs on Nirmaan's own instance for two weeks first. | DevOps Engineer |
| E7 | A written provisioning runbook for each client deployment. | DevOps Engineer |
| E8 | Alerts if a client's worker stops or keeps failing. Sending pauses on high bounces or a spike in "stop" replies. A tested kill switch. | SRE (QA tests) |
| E9 | Every claim in a draft is tied to something found on the site and shown to the approver. No claim if the site couldn't be read. Each client has a facts sheet the drafts stay within. | AI/ML Engineer |
| E10 | A test set of about 50 real sites, with the pass rate recorded and agreed. | AI/ML Engineer, Product Manager |
| E11 | Security review of what the system reads from websites. | Security Engineer |
| E12 | "Stop" is understood in Hindi, Gujarati and Hinglish. Auto-replies don't count as replies. | Backend Engineer (QA tests) |
| E13 | An end-to-end test on a real Gmail and Workspace mailbox: send, follow-up, reply stops, "stop", bounce, daily limit. | QA Engineer |
| E14 | Proof that one client's deployment can't reach another's data or mailbox. | QA Engineer, Security Engineer |
| E15 | Leads stay in the client's own list, with CSV export. | Backend Engineer, Product Manager |
| E16 | Prospects and the do-not-contact list can be exported as CSV, not only the message log (the page promises a full export when a client leaves). | Backend Engineer |
| E17 | Web search is off by default for client campaigns (today a new campaign defaults to one web search a day). | Backend Engineer |

### Legal (reviewed by qualified Indian counsel)
| # | Gate | Owner |
|---|---|---|
| L1 | A client agreement and data processing addendum: roles, subprocessors, retention and deletion, breach notice, do-not-contact, the client's promise of lawful use, account ownership, credential handling, software licence, term and the early-access refund. | Legal / Compliance |
| L2 | Advice on first contact over WhatsApp. **Until then, WhatsApp first contact is off for clients.** | Legal / Compliance |
| L3 | Advice on India's DPDP Act for B2B outreach, and on where data is hosted. | Legal / Compliance |
| L4 | Google Maps Platform terms checked (client's own account, data retention). | Legal / Compliance, Database Engineer |
| L5 | The privacy notice covers prospect data and lists our processors. | Legal / Compliance, Technical Writer |

### Operations
| # | Gate | Owner |
|---|---|---|
| O1 | An onboarding checklist and a client expectations note: what we promise, what we don't, the client's daily effort, support hours. | Client Communication, Technical Writer |
| O2 | A credential runbook. The client creates and revokes the mailbox password. It is stored only in the deployment's secrets. Offboarding deletes everything. | Security Engineer |
| O3 | Support hours and an incident runbook: pause, fix, resume, tell the client. | SRE |
| O4 | A separate sending mailbox. SPF, DKIM and DMARC checked at onboarding. | DevOps Engineer, SRE |
| O5 | Client guides: setup, daily use (including marking WhatsApp replies and stops), data notice, running costs. | Technical Writer |
| O6 | A written scope, an out-of-scope list and an agreed way to judge success. No promised numbers. | Business Analyst |
| O7 | The monthly allowance confirmed against measured usage before it goes into a contract. | Finance / Estimation, AI/ML Engineer |

### QA
| # | Gate | Owner |
|---|---|---|
| Q1 | A staged start. Week 1: the client's mailbox, but only test recipients we control, with zero wrong sends. Then two weeks at no more than 20 real sends a day, each approved by hand. We check the first 50 drafts ourselves. | QA Engineer, Client Communication |
| Q2 | Recorded evidence for every gate. The Orchestrator checks it before marking a gate passed. | QA Engineer |

## Open questions
- Is cold first contact on WhatsApp allowed under WhatsApp's business rules? (Counsel. If not, WhatsApp first contact comes off the page and the product.)
- Under the DPDP Act, is the client the data fiduciary and Nirmaan the processor? What is the lawful basis for B2B cold outreach? (Counsel.)
- Is hosting client data outside India acceptable? (Counsel.)
- Does the 300-business allowance hold once usage is measured? (Finance / Estimation.)
- Nirmaan's GST registration status, for the invoice wording. (Finance / Estimation.)
- Who checks drafts in the long run, and how fast do clients approve? (Client Communication.)
- What reply rate can a client expect? Unknown. We don't quote one.

## Dissent
- **Brand Strategist** wanted to rename the product "Nirmaan Outreach". The meeting kept "Nirmaan Marketing"; the founder then chose "Nirmaan Outreach" (resolved).
- **Product Manager** and **Business Analyst** wanted no public price. The price is shown, with an Early access label and a review date.
- **Business Analyst** proposed ₹6,000 a month with running costs passed through. **Product Manager** proposed ₹25,000 setup and ₹8,000 a month. The monthly fee is ₹12,000; the PM's setup figure became the early-access price.
- **Client Communication** wanted every running cost in one fee. AI is included; Google Maps search stays on the client's own account.
- **Brand Strategist, Content Strategist, Creative Director, Frontend Engineer, UI Designer, SEO Specialist** and **Client Communication** wanted a home page Products strip now. **Product Manager** and **UX Designer** said wait. It waits until the first client is live.
- **UX Designer** wanted four features, who-it's-for earlier, the button "Request early access" and a text version of the demo email. Six features and "Ask for early access" were chosen; the text version is a later improvement.
- **Content Strategist** wanted Who it's for before the demo. The demo stays first, with a persona line.
- **Market Research** suggested 3 to 5 paid pilots. Capped at three while each client is set up by hand.
- **Legal / Compliance** flagged the WhatsApp claims. They are softened on the page, and WhatsApp first contact is off for clients until counsel advises.
