/*
  Eleventy config. Source is src/; the built site goes to public/, the folder
  Vercel deploys (Root Directory = website/public). Hand-written files in
  src/static/ are copied to public/ unchanged. Generated HTML is committed,
  so Vercel needs no build step.

  Shortcodes:
    {% logo "class" %}              the Nirmaan pixel-N mark as inline SVG
    {% glyph "10001/…", "class" %}  any 5x5 pixel glyph in the same visual
                                    language as the logo (5 rows of 5 bits)

  Detail pages are paginated from data: /pricing/<package>.html (plan.njk),
  /pricing/care/<plan>.html (care.njk) and /services/<id>.html (service.njk).
*/
const GLYPH = /^[01]{5}(\/[01]{5}){4}$/;

// The logo's own 5x5 grid: full-height stems plus a 3-step diagonal.
const LOGO = '10001/11001/10101/10011/10001';

const classes = (...names) => names.filter(Boolean).join(' ');

function cellsOf(pattern) {
  if (!GLYPH.test(pattern)) {
    throw new Error(`glyph: expected 5 rows of 5 bits like "${LOGO}", got "${pattern}"`);
  }
  const cells = [];
  pattern.split('/').forEach((row, y) => {
    [...row].forEach((bit, x) => { if (bit === '1') cells.push({ x, y }); });
  });
  return cells;
}

// Each lit cell is its own <rect> with --i (fill order) so CSS can assemble
// glyphs cell by cell; bottom row first, the way a structure is built.
function glyph(pattern, className = '') {
  const cells = cellsOf(pattern).sort((a, b) => b.y - a.y || a.x - b.x);
  const rects = cells
    .map((c, i) => `<rect x="${c.x}" y="${c.y}" width="1" height="1" style="--i:${i}"/>`)
    .join('');
  return `<svg class="${classes('glyph', className)}" viewBox="0 0 5 5" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${rects}</svg>`;
}

function logo(className = '') {
  return `<svg class="${classes('logo', className)}" viewBox="0 0 5 5" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path d="M0 0h1v5H0zM4 0h1v5H4zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3z"/></svg>`;
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addShortcode('glyph', glyph);
  eleventyConfig.addShortcode('logo', logo);

  // {% set s = services | service(id) %}: look up a catalogue entry by id so
  // featured lists reference the one catalogue instead of copying glyphs.
  eleventyConfig.addFilter('service', (services, id) => {
    for (const group of services.groups) {
      const hit = group.items.find((item) => item.id === id);
      if (hit) return hit;
    }
    throw new Error(`service: no catalogue entry with id "${id}"`);
  });

  // {{ 15000 | inr }} → "₹15,000" (Indian digit grouping).
  const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  eleventyConfig.addFilter('inr', (amount) => INR.format(Number(amount)));

  // {% set p = pricing | plan(id) %} / {% set c = pricing | care(id) %}: look up a package or care plan.
  eleventyConfig.addFilter('plan', (pricing, id) => {
    const hit = pricing.packages.find((p) => p.id === id);
    if (!hit) throw new Error(`plan: no package with id "${id}"`);
    return hit;
  });
  eleventyConfig.addFilter('care', (pricing, id) => {
    const hit = pricing.care.find((c) => c.id === id || c.name === id);
    if (!hit) throw new Error(`care: no care plan "${id}"`);
    return hit;
  });

  // {{ serviceList | forPlan('system') }}: the services that usually fall into a package.
  eleventyConfig.addFilter('forPlan', (list, id) => list.filter((s) => s.plan === id));

  // {{ 35000 | share(40) }} → 14000: a percentage of an amount, in whole rupees.
  eleventyConfig.addFilter('share', (amount, percent) => Math.round((Number(amount) * Number(percent)) / 100));

  // {{ pricing | interests(serviceList, products) }}: what contact.html can say
  // it's "about" when a visitor arrives from a plan, care plan, service or
  // product page (?plan=, ?care=, ?service=, ?product=), and the budget range
  // that fits it.
  const BUDGETS = [[25000, 'Under ₹25,000'], [75000, '₹25,000 – ₹75,000'], [200000, '₹75,000 – ₹2,00,000'], [500000, '₹2,00,000 – ₹5,00,000']];
  const budgetFor = (amount) => (BUDGETS.find(([max]) => amount < max) || [0, '₹5,00,000+'])[1];
  eleventyConfig.addFilter('interests', (pricing, serviceList, products = []) => {
    const byId = Object.fromEntries(pricing.packages.map((p) => [p.id, p]));
    const map = (list, fn) => Object.fromEntries(list.map((x) => [x.id, fn(x)]));
    return {
      plan: map(pricing.packages, (p) => ({ label: `${p.name} package`, detail: `from ${INR.format(p.from)} · ${p.weeks} weeks`, href: `/pricing/${p.id}.html`, budget: budgetFor(p.from) })),
      care: map(pricing.care, (c) => ({ label: `${c.name} care plan`, detail: `${INR.format(c.monthly)} / month`, href: `/pricing/care/${c.id}.html` })),
      product: map(products.filter((p) => !p.external), (p) => ({ label: p.name, detail: p.interestDetail || p.tagline, href: p.href })),
      service: map(serviceList, (s) => {
        const p = byId[s.plan];
        return { label: s.title, detail: p ? `usually ${p.name}, from ${INR.format(p.from)}` : 'a monthly care plan', href: `/services/${s.id}.html`, budget: p ? budgetFor(p.from) : '' };
      }),
    };
  });

  // {{ "Backend & API Development" | inSentence }} → "backend & API development":
  // a title lowercased to sit mid-sentence, keeping acronyms (AI, API, CRM) intact.
  eleventyConfig.addFilter('inSentence', (title) =>
    String(title).split(' ').map((word) => (/^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase())).join(' ')
  );

  // {{ services | serviceCount }}: how many services the catalogue offers.
  eleventyConfig.addFilter('serviceCount', (services) =>
    services.groups.reduce((n, group) => n + group.items.length, 0)
  );

  // Hand-written site files (CSS, JS, images, robots.txt, vercel.json) ship as-is.
  eleventyConfig.addPassthroughCopy({ 'src/static': '.' });

  return {
    dir: {
      input: 'src',
      includes: '_includes',
      data: '_data',
      output: 'public',
    },
    htmlOutputSuffix: '',
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
};
