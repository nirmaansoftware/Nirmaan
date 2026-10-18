// Tests for check-csp.mjs. Run: node --test .github/scripts/check-csp.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { check, inlineHashes, policyScriptSrc } from './check-csp.mjs';

const sha = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

test('hashes inline scripts and speculation rules, skips src scripts, data blocks and comments', () => {
  const html = [
    '<script>var a = 1;</script>',
    '<script type="speculationrules">{"prefetch":[]}</script>',
    '<script type="module">import "/x.js";</script>',
    '<script src="/site.js" defer></script>',
    '<script type="application/ld+json">{"@type":"Thing"}</script>',
    '<script type="application/json" data-interests>[]</script>',
    '<!-- <script>commented()</script> -->',
  ].join('\n');
  assert.deepEqual(inlineHashes(html), [
    sha('var a = 1;'),
    sha('{"prefetch":[]}'),
    sha('import "/x.js";'),
  ]);
});

test('the hash covers the exact text, whitespace included', () => {
  assert.notEqual(inlineHashes('<script> x </script>')[0], inlineHashes('<script>x</script>')[0]);
});

const vercel = (key, value) => ({ headers: [{ source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key, value }] }] });

test('reads script-src from an enforced or a Report-Only header on /(.*)', () => {
  const policy = "default-src 'self'; script-src 'self' 'sha256-a='; object-src 'none'";
  assert.deepEqual(policyScriptSrc(vercel('Content-Security-Policy', policy)), ["'self'", "'sha256-a='"]);
  assert.deepEqual(policyScriptSrc(vercel('Content-Security-Policy-Report-Only', policy)), ["'self'", "'sha256-a='"]);
  assert.deepEqual(policyScriptSrc(vercel('Content-Security-Policy', "default-src 'self'")), []);
  assert.equal(policyScriptSrc({ headers: [] }), null);
});

test('passes when every inline hash is allowed and every allowed hash is used', () => {
  const h = sha('x');
  assert.deepEqual(check(["'self'", h], { 'a.html': [h], 'b.html': [h] }), []);
});

test('fails on a missing header, a missing hash, a stale hash and unsafe sources', () => {
  assert.equal(check(null, {}).length, 1);
  const [h1, h2] = [sha('one'), sha('two')];
  assert.deepEqual(check(["'self'", h1], { 'a.html': [h2] }), [
    `a.html: inline script ${h2} is not in script-src`,
    `vercel.json: script-src hash ${h1} matches no inline script (stale)`,
  ]);
  assert.deepEqual(check(["'self'", "'unsafe-inline'", "'unsafe-eval'"], {}), [
    "vercel.json: script-src allows 'unsafe-inline'",
    "vercel.json: script-src allows 'unsafe-eval'",
  ]);
});
