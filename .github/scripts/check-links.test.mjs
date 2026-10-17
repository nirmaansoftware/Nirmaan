// Tests for check-links.mjs. Run: node --test .github/scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkLinks } from './check-links.mjs';

const SITE = 'https://www.example.test';

function site(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-links-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

function run(files) {
  const root = site(files);
  try { return checkLinks(root, { site: SITE }); } finally { rmSync(root, { recursive: true }); }
}

test('a clean site passes', () => {
  const r = run({
    'index.html': `<a href="/about.html#team">a</a><a href="services/x.html">x</a>
      <a href="#top" id="top">t</a><link href="/styles.css"><img srcset="/a.png 1x, /a.png 2x">
      <meta property="og:url" content="${SITE}/about.html"><a href="https://other.test/nope.html">e</a>
      <a href="mailto:a@b.test">m</a><a href="/old">r</a><a href="/about.html?plan=x">q</a>`,
    'about.html': '<h2 id="team">Team</h2><a href="/">home</a>',
    'services/x.html': '<a href="../index.html">up</a>',
    'styles.css': 'body{background:url("/a.png")}',
    'a.png': '',
    'sitemap.xml': `<urlset><url><loc>${SITE}/</loc></url><url><loc>https://example.test/about.html</loc></url></urlset>`,
    'vercel.json': JSON.stringify({ redirects: [{ source: '/old', destination: '/about.html#team' }] }),
  });
  assert.deepEqual(r.problems, []);
  assert.ok(r.checked >= 12);
});

test('missing pages, assets, anchors and redirect targets fail', () => {
  const r = run({
    'index.html': `<a href="/gone.html">g</a><a href="/about.html#nope">n</a><script src="/missing.js"></script>
      <meta property="og:image" content="${SITE}/og.png"><a href="#absent">a</a>`,
    'about.html': '<p id="team"></p>',
    'styles.css': 'b{background:url(/fonts/missing.woff2)}',
    'sitemap.xml': `<loc>${SITE}/removed.html</loc>`,
    'vercel.json': JSON.stringify({ redirects: [{ source: '/old', destination: '/nowhere.html' }] }),
  });
  const text = r.problems.join('\n');
  for (const bad of ['/gone.html', '#nope', '/missing.js', '/og.png', '#absent',
    '/fonts/missing.woff2', '/removed.html', '/nowhere.html']) {
    assert.match(text, new RegExp(bad.replace(/[.#/]/g, '\\$&')), `expected a problem for ${bad}`);
  }
  assert.equal(r.problems.length, 8);
});

test('commented-out links are ignored', () => {
  const r = run({ 'index.html': '<!-- <a href="/gone.html">g</a> -->', 'styles.css': '/* url(/x.png) */' });
  assert.deepEqual(r.problems, []);
});

test('a link to a folder without an index fails; a trailing slash needs index.html', () => {
  const r = run({ 'index.html': '<a href="/docs">d</a><a href="/blog/">b</a>', 'docs/a.html': '', 'blog/index.html': '' });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /\/docs \(a folder/);
});
