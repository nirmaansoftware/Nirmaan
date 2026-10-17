# CTO inspection decisions, 2026-10-17

The founder asked for one inspection of Nirmaan (nirmaan.online), the Nirmaan OS
(os.nirmaan.online) and IP Nirmaan (ip.nirmaan.online), and delegated the
decisions below to a decision meeting
([how meetings run](decision-meetings.md)). Twenty-seven agent
roles gave independent positions; the Orchestrator chaired and decided. The
founder keeps merges, contracts, spending and public names, and this meeting
also left every live-infrastructure and account action (stopping the OS,
revoking credentials, repo settings) for the founder to run or approve. Nothing
was changed by the meeting itself.

## 1. The OS is paused

The OS was meant to be paused (it was only ever used on Nirmaan itself, as a
test) but was found running.

- **Decision:** back up its data first, then stop it and turn off automatic
  start, so a web request cannot wake it. Keep the stopped machine and its
  storage; delete nothing. Not chosen: scaling to zero (it discards the
  machine's configuration for no extra benefit).
- **Backup:** checked by restoring it locally, encrypted, kept outside any
  repository. The do-not-contact list is always kept.
- **Timing:** outside the OS's sending hours and its nightly backup, so no
  message is half-sent.
- **No silent restart:** the OS configuration changes so a deploy cannot start
  the outreach worker or keep a machine running, the OS workflow keeps its
  tests and loses its deploy step, and the deploy credential is removed.
- **Before any restart:** a dependency security update is merged and deployed,
  the backup restore is checked, waiting messages are re-reviewed, replies that
  arrived during the pause are processed before anything is sent, credentials
  are reissued, monitoring is in place, and the founder approves. The checklist
  lives in the deployment docs.
- **Credentials** the OS held are retired at their providers while it is paused.
- The website does not depend on the OS; its contact form is unaffected.

## 2. Nirmaan Outreach becomes a waitlist

Nirmaan Outreach runs on the OS. With the OS paused, the page's statements that
we use it now and are taking businesses now stop being true
([principle 6](../company/principles.md)).

- **Decision:** keep the page and its address, switch it to a waitlist, and
  correct every such statement in one change (headline labels, buttons, the
  FAQ answers, the price section, the page descriptions and the products page).
  Not chosen: leaving it as is, or taking it down.
- **Own use:** described as "we built it for our own outreach and tested it on
  Nirmaan first", unless the founder confirms more from records. The founder
  confirmed the same day that it was used on real prospects, so the page says
  "we used it", in the past tense.
- **Price:** the planned price stays, labelled as the price when it opens;
  nothing is sold or signed until then. The early-access price line and any
  "first three" wording come off the page.
- **Structured data:** the offer markup is removed; the service description
  stays.
- **Also corrected:** two descriptions the code does not yet support (a full
  data export, and sending in the client's own voice and signature) are
  reworded as what the product will do when it opens.
- **Enquiries:** the contact page note for Outreach says it joins a waitlist; a
  full waitlist version of the form follows. Every Outreach enquiry gets a
  personal reply with no date and no price promise. No payment is taken while
  it is paused.
- No public reason or date is given.

## 3. Backlog

Owners, dependencies and done-criteria are tracked internally; the items are
listed here so other documents can refer to them by ID. Priority: P0 now, P1
this month, P2 later. Items for the IP Nirmaan repository (I1 to I7) are tracked
there.

| ID | Item | P |
|---|---|---|
| N1 | Back up the OS data before the stop, checked by a local restore, encrypted, outside any repository | P0 |
| N2 | Pause the OS: queue check, stop outside sending and backup hours, automatic start off, keep machine and storage | P0 |
| N3 | Remove the OS deploy credential from GitHub and revoke it at the host | P0 |
| N4 | Cap or disable the OS's metered API key; confirm no usage and no billed extras | P0 |
| N5 | OS dependency security update, merged, not deployed | P0 |
| N6 | Pause-safe OS configuration: no automatic start, worker off by default, OS workflow test-only | P0 |
| N7 | Outreach page to a waitlist, every claim corrected | P0 |
| N8 | Pause record and un-pause checklist in the docs | P0 |
| N9 | Mailbox handling while paused: waitlist reply, every enquiry answered, stop requests recorded | P0 |
| N10 | GitHub security features on both repositories | P0 |
| N11 | Retire the OS's remaining AI-plan and email credentials at the provider | P1 |
| N12 | Website CI: clean rebuild, fail if the built site differs | P1 |
| N13 | Required checks on `main` | P1 |
| N14 | Content Security Policy for nirmaan.online | P1 |
| N15 | Mark the September current-state page as a dated snapshot | P1 |
| N16 | Internal data register for what the OS holds | P1 |
| N17 | Contact form waitlist mode for Outreach | P1 |
| N18 | Private waitlist enquiry log | P1 |
| N19 | OS restart hardening before any un-pause | P2 |
| N20 | Uptime check and "machine started" alert before any restart | P2 |
| N21 | Minor OS dependency updates | P2 |
| N22 | Delete stale branches; auto-delete merged branches | P2 |
| N23 | Outreach un-pause or withdraw criteria for the 31 March 2027 review | P2 |
| N24 | Mobile page-speed baseline for both sites | P2 |
| N25 | Rule: a changed font file gets a new file name | P2 |
| N26 | Written visual direction for the current design | P2 |
| N27 | Per-page sitemap dates | P2 |
| N28 | Contact form without JavaScript | P2 |

Priority changes from the CTO's draft: turning on GitHub's free security
features moved up to now; marking the September current-state page as a dated
snapshot moved up to this month. The CSP header is built once in Nirmaan and
then copied to the IP site, after the IP site's copy of the shared components
is re-synced. The IP live evaluation runs locally on the existing plan and its
results are recorded as they come out, failures included; it is not an
accuracy study and supports no accuracy claim.

## Dissent recorded

- Principal Architect preferred scaling the OS to zero, and keeping a manual
  deploy step rather than removing it.
- AI/ML Engineer wanted one OS credential retired immediately rather than this
  month.
- Security Engineer considered retiring the email credential optional.
- Content Strategist wanted an early-access price for the first three waitlist
  businesses kept on the page.
- UX Designer wanted the full waitlist form in the same change as the page.
- Design System Engineer proposed moving the inline theme script to a file for
  the CSP; a hash was chosen.

## Open questions

- ~~Founder: whether real outreach was sent from September (decides the own-use
  wording).~~ Answered 2026-10-17: it was used on real prospects.
- For counsel, when funded: data retention while paused, and the privacy notice
  for data the OS holds.

## Founder's answers

- 2026-10-17: start the repository work now; the stop runs on Sunday 2026-10-18
  in the daytime; Outreach was used on real prospects, so the page says "we used
  it".

The founder can overrule any decision here; this record will say so.
