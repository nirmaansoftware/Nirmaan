# Website launch list · IMPLEMENTED (as the launch checklist)

Every website Nirmaan builds or runs, for a client or for ourselves, goes
through this list before launch and again after any major change. It sits on
top of the [definition of done](definition-of-done.md), which covers features;
this covers the site as a whole.

The QA Engineer runs it and records the result in the project's test report,
one line per item: **PASS**, **FIXED** (what changed), or **N/A** (why). An
item is never skipped silently, and "N/A" needs a reason that is true for this
site. The owner named against each item makes it true.

Our own sites and their current record are at the end.

## The list

| # | Item | Done means | Owner | How to check |
|---|---|---|---|---|
| 1 | **Privacy policy** | A page that says, truthfully, what the site collects (forms, logs, analytics, cookies, local storage), who processes it (host, form service, fonts, analytics), why, for how long, and how to ask for deletion. Linked from every page's footer. Updated whenever any of that changes. | Legal/Compliance drafts, founder approves | Read it against the code: every third party the page loads or sends to is named |
| 2 | **Terms & conditions** | Terms of use for the site: what the content is (and is not, e.g. an estimate is not a quote), intellectual property, links, liability, governing law. Linked from the footer. | Legal/Compliance drafts, founder approves | Present, linked, and consistent with what the site actually offers |
| 3 | **Remove frontend secrets** | Nothing in shipped HTML, JS, or source maps grants access: no API secrets, tokens, or private keys. Keys that are public by design (e.g. a Web3Forms access key) are documented as such. | Frontend Engineer, Security Engineer reviews | Search the built output for key/secret/token/password patterns; check source maps are not shipped |
| 4 | **Enforce HTTPS** | HTTP redirects to HTTPS (301/308) and HSTS is sent. No mixed content. | DevOps Engineer | `curl -I http://...` shows the redirect; `curl -I https://...` shows `strict-transport-security` |
| 5 | **Cookie consent banner** | Required only when the site sets non-essential cookies or trackers. If it sets none, there is **no banner** and the privacy policy says so. A banner on a site with nothing to consent to is noise. | Legal/Compliance decides, Frontend Engineer builds | List cookies and storage in the browser's dev tools after using every page and form |
| 6 | **Meta titles / descriptions** | Every page has a unique `<title>` and meta description that describe that page, plus a correct `canonical` and `og:url`. | SEO Specialist | Check the built HTML of every page: no duplicates, no unrendered template tags |
| 7 | **Social preview image** | A 1200x630 `og:image` (and `twitter:card`) with alt text, served from an absolute HTTPS URL. | UI Designer | Paste the URL into a link-preview checker; the image renders |
| 8 | **Favicon** | An SVG favicon that works in light and dark, plus a 180x180 `apple-touch-icon`. | UI Designer | Visible in a browser tab in both themes |
| 9 | **Sitemap and robots.txt** | `robots.txt` allows what should be indexed and points to `sitemap.xml`; the sitemap lists every public page with absolute URLs and nothing that 404s. | SEO Specialist | Open both; every sitemap URL returns 200 |
| 10 | **Image alt text** | Every meaningful image has alt text that says what it shows; decorative images have `alt=""` or `aria-hidden`. | Frontend Engineer | No `<img>` without `alt`; screen-reader pass on key pages |
| 11 | **Image compression** | Images are in modern formats where it helps (WebP/AVIF, SVG for marks), sized for their slot, lazy-loaded below the fold, with width and height set. | Frontend Engineer | No image over ~200 KB without a reason; Lighthouse shows no "properly size images" savings |
| 12 | **Page load speed check** | Lighthouse (mobile) performance 90+; LCP under 2.5 s, CLS under 0.1, TBT under 200 ms. Record the numbers. | Performance Engineer | Lighthouse mobile run against the deployed URL, results in the test report |
| 13 | **Color contrast fixes** | All text meets WCAG AA (4.5:1 body, 3:1 large text and UI), in light and dark. | UI Designer, QA verifies | Contrast ratios documented next to the tokens; Lighthouse accessibility shows no contrast failures |
| 14 | **Mobile responsiveness** | Works at 360 to 390 px wide with no horizontal page scroll; tap targets at least 44x44 px; text readable without zoom. | Frontend Engineer | Real phone, or a true 390 px viewport, on every page |
| 15 | **Custom 404 page** | A branded 404 with a way back (home and the main CTA), served with a real 404 status. | Frontend Engineer | Request a made-up URL: branded page, status 404 |
| 16 | **Broken link fixes** | No internal link or fragment points nowhere; external links checked. | QA Engineer | Link check over the built site before each deploy |
| 17 | **Form validation** | Every form validates on the client for speed and on the server for truth, with messages that say how to fix the problem. The form never claims success for a message that was not received. | Frontend Engineer, Backend Engineer | Submit empty, malformed, and valid data; cut the network mid-submit |
| 18 | **Spam protection** | Every public form has at least a honeypot, plus provider-side filtering or rate limiting; add a CAPTCHA only when spam gets past those. | Backend Engineer | Submit with the honeypot filled: rejected |
| 19 | **Analytics setup** | A decision, recorded: either privacy-friendly analytics (cookieless, no personal data, named in the privacy policy) or none, with the reason. Adding analytics that set cookies brings item 5 into play. | Founder decides, DevOps Engineer sets up | The privacy policy matches what is loaded |
| 20 | **Single clear CTA** | Each page has one primary action, visually dominant; everything else is secondary. | UX Designer | Squint test on every page: one thing stands out |

## Our sites

| Site | Source | Last run |
|---|---|---|
| nirmaan.online | this repository (`/src`, built to the root) | 2026-09-28, see below |
| ip.nirmaan.online | `nirmaansoftware/ip-nirmaan`, `site/` | 2026-09-28, recorded in that repository's `site/README.md` |
| os.nirmaan.online | `/app` (sign-in only, not a public website) | Items 3, 4, 14, 16, 17 apply; not yet run |

### nirmaan.online, 2026-09-28

| # | Result |
|---|---|
| 1 | FIXED: added `/privacy.html` (covers every Nirmaan site) |
| 2 | FIXED: added `/terms.html` |
| 3 | PASS: only the Web3Forms access key, which is public by design |
| 4 | PASS: 308 to HTTPS, HSTS sent (Vercel) |
| 5 | N/A: no cookies; theme choice is in local storage; the privacy policy says so |
| 6 | FIXED: canonical and `og:url` on the 24 service and pricing detail pages contained an unrendered `{{ ... }}` permalink |
| 7 | PASS: `og-image.png`, 1200x630, with alt text |
| 8 | PASS |
| 9 | PASS: privacy and terms added at low priority; the 404 page is kept out and marked `noindex` |
| 10 | PASS: no `<img>`; glyphs are inline SVG marked `aria-hidden` |
| 11 | PASS: largest image is 38 KB |
| 12 | PASS: Lighthouse mobile on the live site: performance 99, LCP 1.7 s, CLS 0, TBT 0 ms |
| 13 | FIXED: the journey stamps were dimmed to 55% opacity before being reached (2.49:1); they now only scale. Lighthouse accessibility 96 to 100 |
| 14 | PASS. Also FIXED: the footer logo link's accessible name now includes its visible text ("Nirmaan Software Studio") |
| 15 | FIXED: added `/404.html` |
| 16 | PASS: no broken internal links or fragments; external links return 200 |
| 17 | PASS: client-side validation; Web3Forms validates server-side |
| 18 | PASS: honeypot plus Web3Forms filtering |
| 19 | Open: founder decision, currently none |
| 20 | PASS: "Tell us your problem" leads every page |
