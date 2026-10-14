# Prospecting · IMPLEMENTED (EXPERIMENTAL until used on real outreach)

Finding businesses Nirmaan could help, before they ask. Lives in the Nirmaan OS
at **Pipeline → Prospects** (`/os/prospects`), code in `os/src/lib/prospecting/`.

The website waits for people to bring a problem. Prospecting goes looking for the
problem: businesses that match the [ideal customer](../company/ideal-customer-profile.md)
and show a visible sign of it (no website, phone-only bookings, a site that isn't
built for phones, a busy business running on WhatsApp).

## The flow

```text
Search            "dental clinics" in "Ahmedabad", for Local service businesses
  ↓               Google Places + a web search (Claude, read-only web tools)
Prospects         PROS-###, one per real business (merged by place, website or name+city)
  ↓
Check             their homepage is read (phones? booking? store? how old?),
  ↓               then Claude scores the fit 0–100 and suggests a package
Draft             Claude writes a short first message by email or WhatsApp
  ↓
Approve           a person reads and edits the exact words, then:
  ↓                 email → "Approve and send" (founder/CTO), sent by the OS
  ↓                 WhatsApp → "Open in WhatsApp", sent from your phone
Replied?          "They replied" → "Create lead": LEAD-### (source OUTBOUND),
                  and from there the normal pipeline (discovery → proposal → project)
```

Nothing reaches a business without a person approving the exact message. The fit
score is advice, never a trigger.

## Campaigns: the automated version · IMPLEMENTED

**Pipeline → Campaigns** (`/os/campaigns`). Write the goal in plain words ("dental and
skin clinics in Ahmedabad, Surat and Vadodara that still book by phone"); Claude turns
it into a plan (search terms × places, a segment, and the angle first messages lead
with) that you check and edit, then start. From then on the **worker** works on it
every day within the campaign's budgets:

1. **Searches** the next term × place in the plan: Google Places first (cheap, about
   20 businesses a search), then the web (slow; uses the Claude plan heavily).
2. **Checks** new businesses and scores them.
3. **Drafts first messages** for businesses at or above the campaign's lowest fit,
   split between email and WhatsApp by the campaign's share (default 50/50). WhatsApp
   only goes to mobile numbers; a business with only a landline and no email is skipped.
4. **Drafts follow-ups** on the days set (default 3 and 7 days after the previous
   message), as short replies in the same thread.
5. **Sends approved emails** one at a time from our mailbox, only in sending hours
   (10:00–19:00 India time, Monday to Saturday), with a random gap of about 45 to 110
   seconds between them. Never a burst.
6. **Reads the inbox** (with `IMAP_URL`): a reply stops that business's follow-ups;
   "stop" or "not interested" also puts them on the do-not-contact list; a bounce
   retires the address.

Every drafted message waits in **Pipeline → Outreach** (`/os/outreach`) for a person:
emails are approved one by one or all at once; WhatsApp messages are sent one tap at a
time from our WhatsApp Business number ("Open in WhatsApp" → send → "Sent"). Each
campaign shows replies and reply rate per channel, so the split can follow the evidence.

**Running the worker** (in `os/`):

```text
npm run campaigns:worker    # a tick every minute; leave it running
npm run campaigns:tick      # one tick (for cron), e.g. */2 * * * * cd …/os && npm run campaigns:tick
```

Or press "Run one tick now" on the Campaigns page. It only works while the machine is
on; on a server, run it as a service next to the OS.

## Autopilot · IMPLEMENTED

**Growth → Autopilot.** Prospecting without creating campaigns. Switch it on, set one
daily volume (default 100 new businesses) and the cities (default Gujarat's big
cities: Ahmedabad, Surat, Vadodara, Rajkot, Gandhinagar, Bhavnagar). The OS keeps one
standing campaign per segment, each with its own Google Maps searches:

- **Local services:** dental, skin and physiotherapy clinics, eye hospitals,
  diagnostic centres, coaching classes, chartered accountants, interior designers,
  salons, gyms.
- **Shops, restaurants, D2C:** restaurants, bakeries, boutiques, furniture,
  jewellery and sweet shops, electronics stores, cloud kitchens, organic and gift
  shops.
- **SMEs:** manufacturers, wholesale distributors, textile traders, transport,
  packaging, pharma distributors, engineering works, chemical suppliers, printing
  presses, couriers.

Every week it reviews the last 30 days and re-balances, in plain arithmetic (no model
call). It writes up what it changed on the Growth page:

- **Segments:** new contacts shift toward the segments that reply; each keeps at least
  15%, so nothing stops being tested.
- **Channel split:** moves 10 points toward the channel with the better reply rate,
  once both have 30+ contacts; it stays between 30% and 70%.
- **Cities:** the best-replying cities are searched first.

Messages are still approved by a person, in batches.

## Growth dashboard (owners only) · IMPLEMENTED

**Growth** (`/os/growth`), visible only with `growth:read` (the founder role; not even
the CTO):

- **Needs you now:** emails to approve, WhatsApp messages to send, replies to answer.
- **Outbound funnel** for today, the last 7 days and all time: found → checked →
  contacted → replied → leads → won, with the ₹ value won.
- **What's working:** reply rates by channel, segment and city.
- **Campaigns:** each one's email and WhatsApp results and leads.
- **Replies:** who answered, what they said, and whether they're a lead yet.
- **Leads from outreach:** where each came from and how far it got.
- **Every message** (`/os/growth/messages`): every email and WhatsApp message, to whom,
  when, with the exact text and who approved it. Searchable and filterable; "Download
  for Excel" exports the same view as CSV.

### Messages that read like a person

- Written for each business by Claude in the sender's voice (`OUTREACH_SENDER_NAME`),
  first person, one specific true observation, one small next step. No templates.
- The same real signature every time, with our WhatsApp number on emails.
- Plain text, no tracking pixels, no links except the website.
- Follow-ups arrive as replies in the same email thread ("Re: …").
- Paced sending in working hours; replies stop everything at once.

### WhatsApp: why it's one tap, not automatic

Sending WhatsApp messages automatically to people who haven't messaged us first breaks
WhatsApp's Business terms, and numbers that do it get banned quickly, usually within
days. That would lose our number. The official WhatsApp Business Platform allows
business-initiated messages only to people who opted in, using pre-approved templates.
So the OS prepares every WhatsApp message and a person sends it from our own phone in
one tap. It's also what keeps them personal. Start with around 30 to 50 new chats a day
on a new number and raise it gradually; many unanswered messages or people blocking
the number are the warning signs.


## Guard rails (enforced in code, not just the UI)

- **Approval:** only roles with `outreach:send` (founder, CTO) can send or mark a
  message sent. Project managers can search, check and draft (`prospect:run`).
- **Do not contact:** an email, phone or website domain on the list is left out of
  searches and can't be drafted to or sent to. "They asked not to be contacted"
  on a prospect adds its email, phone and domain and cancels its drafts. Anyone who
  replies "stop" goes on the list.
- **Opt-out line:** every message ends with "Not relevant? Reply “stop” and we
  won’t contact you again." It's added when sending and can't be edited away.
- **Follow-ups, not spam:** at most `OUTREACH_MAX_MESSAGES` messages per business per
  channel with no reply (default 3: the first and two follow-ups; at most 5), at least
  `OUTREACH_MIN_DAYS_BETWEEN` days apart (default 2), and nothing after they reply.
- **Daily email cap** `OUTREACH_DAILY_LIMIT`, default **400**. A Gmail account is cut
  off for a day at about 500 messages in 24 hours (Google Workspace: 2,000), so this
  stays just under the mailbox's own ceiling. Raise it only on Workspace or a sending
  domain.
- **Only published emails:** the web search drops any email it can't say where it
  saw; the site check only picks up addresses on the business's own site.
- **Web content is data:** search results and web pages are parsed strictly as JSON
  or plain signals. The web search runs `claude` with exactly `WebSearch` and
  `WebFetch` allowed (no files, no shell), and nothing it returns can act.
- **Safe site checks:** the fetcher refuses private and internal addresses (including
  after redirects), odd ports and non-web schemes, with time and size caps.
- **Everything is logged:** searches, checks, drafts, sends and do-not-contact
  changes go to the audit log; every Claude call to the AI usage ledger
  (`prospect-search`, `prospect-audit`, `outreach-draft`).

## Setup

| Variable | What it does |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Enables Google Places. A Google Cloud key with the **Places API (New)** enabled, restricted to that API. Without it, searches use the web only. |
| `OUTREACH_FROM` | Sender, e.g. `Nirmaan <you@example.com>`. Required for the OS to send email. |
| `SMTP_URL` | e.g. `smtps://you%40gmail.com:APP-PASSWORD@smtp.gmail.com:465` (a Gmail **app password**, never the account password). |
| `RESEND_API_KEY` | Alternative to SMTP (needs a verified sending domain). |
| `OUTREACH_REPLY_TO` | Optional: where replies go, if not `OUTREACH_FROM`. |
| `IMAP_URL` | Reads replies, "stop"s and bounces, e.g. `imaps://you%40gmail.com:APP-PASSWORD@imap.gmail.com:993` (the same app password as SMTP). |
| `OUTREACH_SENDER_NAME` | Who the messages are from, e.g. `Sahaj Patel`. Default "Team Nirmaan". |
| `OUTREACH_WHATSAPP_NUMBER` | Our WhatsApp Business number, shown in email signatures, e.g. `919493833697`. |
| `OUTREACH_DAILY_LIMIT` | Emails per day, default 400 (max 2,000). |
| `OUTREACH_MAX_MESSAGES` | Messages per business per channel without a reply, default 3 (max 5). |
| `OUTREACH_MIN_DAYS_BETWEEN` | Days between messages to one business, default 2. |
| `OUTREACH_GAP_SECONDS` | Shortest gap between two emails, default 45 (the gap is random, up to 2.5×). |
| `OUTREACH_SEND_HOURS`, `OUTREACH_SEND_DAYS` | Sending window in India time, default `10-19` and `1-6` (Monday–Saturday). |

Without email settings, approved emails are copied and sent by hand, then marked
with "I sent it myself". The web search and all Claude calls use the same model
routing as the rest of the OS (the `claude` CLI by default).

## Cost

- **Google Places:** one Text Search request per search (up to 20 businesses),
  billed by Google per request after the monthly free credit.
- **Claude:** one call per web search, one per check, one per draft. All appear
  under AI usage with their task names. Measured on the first real run (2026-09-26):
  a web search for 5 businesses took about 3.5 minutes and $1.17 of usage; a check
  about 15 seconds and $0.05. On a Claude subscription that counts against the plan's
  usage limits, so campaigns lean on Google Places for volume and keep web searches low.

## Before relying on it · PROPOSED

- **Google's terms:** Places content other than the place ID generally shouldn't be
  stored long term. Keep only prospects you're actively working, and dismiss the
  rest. A clean-up of old untouched prospects is a candidate next step.
- **Privacy law (India, DPDP Act):** outreach goes to published business contact
  details, one message at a time, with an opt-out that's always honoured. Keep it
  that way. No bought lists, no scraping personal numbers.
- **Email reputation:** a sending domain (not a free mailbox) with SPF, DKIM and
  DMARC set up is better for deliverability once volume grows.
- **First real run (2026-09-26):** 5 real Ahmedabad dental clinics found, every email
  with its source. Checking them by hand showed three wrong or weak claims, now fixed:
  a bot-protection page read as "broken website", an unreadable site used as
  evidence, and the web note overriding what the site check saw. Keep checking a few
  drafts by hand whenever a campaign starts.
