# Nirmaan Outreach · EARLY ACCESS (decided 2026-10-16)

Decisions on price, status, page copy and the gates before the first paying client:
[nirmaan-outreach-decisions.md](nirmaan-outreach-decisions.md). Where this brief and the
decisions differ, the decisions win.

A product page on nirmaan.online for the outbound marketing engine inside the
Nirmaan OS ([prospecting](prospecting.md)). Nirmaan built it to find its own
clients; this page offers to set it up for other businesses.

## The product, in one line

> Find the customers who need you. Write to them like a person.

It finds businesses that match the customer you want, looks for a real,
specific reason to write to each one, drafts a short personal message in your
voice, and sends it only after a person approves it. Replies stop the
follow-ups; "stop" puts them on a do-not-contact list; every week it moves
effort toward what gets answers.

## Who it's for

Businesses that sell to other businesses and win work through conversations:
studios and agencies, B2B suppliers, distributors and manufacturers,
consultants, accountants and service firms, software teams selling to small
businesses. Not for promotional blasts to the public. (The businesses it
*contacts* can be anything with a published business contact, such as clinics.)

## Why people buy it (the marketing argument)

| Pain | What it does about it |
|---|---|
| Ads are expensive and stop the day you stop paying | Builds conversations you own, at the cost of a message |
| Cold lists and blasts get ignored and burn your name | One message per business, written for that business, with an opt-out |
| Personal outreach works but doesn't scale | The research and the first draft are done for you; you only approve |
| You don't know which customers or channels respond | Reply rates by segment, city and channel, and it shifts effort to what works |

## What the page may say, and what stays private

Positioning rules apply (no invented clients, numbers or results; see
`company/positioning.md`). Customer-relevant behaviour is public; how the OS
does it is not.

| Public | Private (never on the page) |
|---|---|
| Find, check, draft, approve, send, listen, learn | Prompts, model names and routing |
| A person approves every message | How fit is scored |
| Working hours, natural gaps, under the mailbox's daily limit | Exact caps, gaps and rebalancing formulas |
| WhatsApp prepared, sent by you in one tap | Our own volumes, reply rates or results |
| Opt-out on every message, do-not-contact list | Anything from the OS screens or data |
| "Nirmaan finds its own clients with it" | Client names (there are none yet) |

## Information architecture

- New nav item **Products** → `/products.html`: Nirmaan's products, as a hub.
  Today: Nirmaan Outreach (this page) and IP Nirmaan (ip.nirmaan.online).
- **`/products/outreach.html`**: the product page.
- Products live in `website/src/_data/products.json`; the hub, the contact
  form's "asking about" context (`?product=outreach`) and the sitemap read it.

## The page

1. **Hero:** the line, one sentence of what it does, "Talk to us" and "See it work".
2. **The problem:** three ways businesses look for customers today, and why each falls short.
3. **See it work:** the demo (below).
4. **What it does:** nine capabilities, each a card with a glyph.
5. **How it markets you:** four outcomes, in the customer's words.
6. **Outreach that protects your name:** the guard rails.
7. **Who it's for**, and **how we set it up** (four steps).
8. **Questions:** spam, WhatsApp bans, AI, effort, data, cost.
9. Closing call to action → contact, with the product as context.

## The demo: why a scripted player, not the OS or a video

The OS is private, so the demo is a **scripted illustration** in the page's own
design language: a "campaign console" that plays seven beats with sample,
clearly fictional businesses (labelled as an illustration on the page):

| # | Beat | What the visitor sees |
|---|---|---|
| 1 | Goal | A plain-words goal becomes a plan: search terms × cities |
| 2 | Find | Businesses arrive in a list |
| 3 | Check | One business's site is read; the signals light up |
| 4 | Draft | A short message is written, with the one true observation highlighted |
| 5 | Approve | A person approves; the email queues for working hours |
| 6 | Listen | A reply lands; the follow-up is cancelled; a lead is created |
| 7 | Learn | The weekly review shifts effort toward the segment that replies |

Design choices:

- **A player, not scroll-jacking.** It plays once when it scrolls into view,
  pauses when the visitor interacts, and has numbered steps to jump between
  beats and a Replay button. It behaves the same on phones and desktops, which
  avoids the pinned-scroll problems the home page had on phones.
- **Progressive enhancement.** Without JavaScript, all seven beats render as an
  ordinary list of steps. With "reduce motion" on, nothing plays by itself; the
  steps still work.
- **Recordable.** The same player can be screen-recorded into a demo video later.
- **Own script** (`tour.js`), loaded only on this page, like `hero.js` on the home page.

## Open decisions (founder)

- **Commercial model.** The page says "fixed quote"; it doesn't publish a price.
  Setup plus a monthly care plan fits the other systems, but isn't decided.
- **Status.** Prospecting is marked EXPERIMENTAL inside the OS until it has run
  on enough real outreach; the page makes no claims about results.
- **Home page.** A "Products" strip on the home page is a natural next step.
