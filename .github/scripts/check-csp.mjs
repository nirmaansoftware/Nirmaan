#!/usr/bin/env node
// CSP hash check for the built website (website/public). No dependencies.
//
// The Content-Security-Policy in vercel.json allows inline scripts by hash only
// (no 'unsafe-inline' for scripts). This recomputes the sha256 of every inline
// script a browser runs or reads as rules (no src, and no type or a JavaScript,
// module or speculationrules type) in every .html file under the root, and
// fails when:
//   - vercel.json has no CSP header (enforced or Report-Only) on "/(.*)";
//   - its script-src lacks the hash of an inline script on some page;
//   - its script-src has a hash no page uses any more (a stale hash);
//   - its script-src allows 'unsafe-inline' or 'unsafe-eval'.
// Data blocks (application/ld+json, application/json) are not run, so CSP does
// not apply to them and they are skipped.
//
// Usage: node .github/scripts/check-csp.mjs <root> <vercel.json>
// Exit 0 when the policy matches the pages, 1 otherwise (one line per problem),
// 2 on a usage error.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSP_KEYS = ['content-security-policy', 'content-security-policy-report-only'];
const RUNNABLE = new Set(['', 'text/javascript', 'application/javascript', 'module', 'speculationrules']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/** The CSP source expression for each inline script a browser would check. */
export function inlineHashes(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  const hashes = [];
  for (const m of body.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1] ?? '';
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = (attr(attrs, 'type') ?? '').trim().toLowerCase();
    if (!RUNNABLE.has(type)) continue;
    const digest = createHash('sha256').update(m[2], 'utf8').digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
}

/** The script-src source list of the site-wide CSP header in a vercel.json. */
export function policyScriptSrc(vercel) {
  for (const rule of vercel.headers ?? []) {
    if (rule.source !== '/(.*)') continue;
    for (const h of rule.headers ?? []) {
      if (!CSP_KEYS.includes(String(h.key).toLowerCase())) continue;
      for (const directive of String(h.value).split(';')) {
        const [name, ...sources] = directive.trim().split(/\s+/);
        if (name === 'script-src') return sources;
      }
      return [];
    }
  }
  return null;
}

/** Problems with a policy, given each page's inline hashes ({ page: [hash] }). */
export function check(scriptSrc, pages) {
  if (scriptSrc === null) return ['vercel.json: no Content-Security-Policy(-Report-Only) header on "/(.*)"'];
  const problems = [];
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'"]) {
    if (scriptSrc.includes(bad)) problems.push(`vercel.json: script-src allows ${bad}`);
  }
  const allowed = new Set(scriptSrc.filter((s) => s.startsWith("'sha256-")));
  const used = new Set();
  for (const [page, hashes] of Object.entries(pages)) {
    for (const h of hashes) {
      used.add(h);
      if (!allowed.has(h)) problems.push(`${page}: inline script ${h} is not in script-src`);
    }
  }
  for (const h of allowed) {
    if (!used.has(h)) problems.push(`vercel.json: script-src hash ${h} matches no inline script (stale)`);
  }
  return problems;
}

function main(argv) {
  const [root, vercelPath] = argv;
  if (!root || !vercelPath) {
    console.error('usage: node .github/scripts/check-csp.mjs <root> <vercel.json>');
    return 2;
  }
  const pages = {};
  for (const file of walk(root)) {
    if (file.endsWith('.html')) pages[relative(root, file)] = inlineHashes(readFileSync(file, 'utf8'));
  }
  const scriptSrc = policyScriptSrc(JSON.parse(readFileSync(vercelPath, 'utf8')));
  const problems = check(scriptSrc, pages);
  for (const p of problems) console.log(p);
  if (problems.length) {
    console.log(`\n${problems.length} CSP problem(s). Put each inline script's hash (above) in script-src in ${vercelPath}, rebuild, and remove hashes no page uses.`);
    return 1;
  }
  const distinct = new Set(Object.values(pages).flat()).size;
  console.log(`CSP script-src covers the ${distinct} distinct inline script(s) on ${Object.keys(pages).length} pages.`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
