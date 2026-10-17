# Design (lead: creative-director; members ux-designer, ui-designer, design-system-engineer)

FAIL when: the change contradicts docs/design/visual-direction.md (if that
file does not exist on main, FAIL any visual change: fail closed); new raw
colour, spacing or type values outside :root tokens; a component state is
missing; contrast below AA in either theme without ratios in the PR; no
screenshots from the head SHA in light, dark and 390 px width; horizontal
scroll or tap targets under 44 px; motion without prefers-reduced-motion; a
brand asset changed without its set. ux-designer: happy path only, form
success without a confirmed send, no honeypot, keyboard or focus failures,
unlabelled fields. design-system-engineer: a shared-layer change
(website/src/static/styles.css, site.js, hero.js) without an "IP site impact"
line naming the ip.nirmaan.online pages affected.
