#!/usr/bin/env node
// Internal link check for the built website (website/public). No dependencies.
//
// Reads every .html, .css and .xml file under the root and checks each link that
// points inside the site: root-relative ("/x.html"), relative ("x.html"), and
// absolute links to the site's own host (--site, e.g. https://www.nirmaan.online,
// with or without "www."). A link passes when the file exists (a path ending in
// "/" means its index.html) or it is a redirect source in vercel.json. A
// "#fragment" on an HTML target must match an id="" or name="" in that file.
// External links, mailto:, tel:, data: and javascript: are skipped.
//
// Usage: node .github/scripts/check-links.mjs <root> [--site https://host]
// Exit 0 when every internal link resolves, 1 otherwise (one line per problem).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_SCHEME = /^(mailto|tel|data|javascript|sms):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Pull candidate links out of a file by type. Comments are removed first so a
// commented-out link is not checked.
export function extractLinks(text, kind) {
  const links = [];
  if (kind === 'html') {
    const body = text.replace(/<!--[\s\S]*?-->/g, '');
    for (const m of body.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      links.push(m[1] ?? m[2]);
    }
    for (const m of body.matchAll(/\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      for (const part of (m[1] ?? m[2]).split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) links.push(url);
      }
    }
    // og:url, og:image and similar point at the site's own host.
    for (const m of body.matchAll(/<meta\s[^>]*content\s*=\s*"(https?:\/\/[^"]*)"/gi)) {
      links.push(m[1]);
    }
    for (const m of body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) links.push(m[1]);
  } else if (kind === 'css') {
    const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) links.push(m[1]);
  } else if (kind === 'xml') {
    for (const m of text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) links.push(m[1]);
  }
  return links.map((l) => l.trim()).filter(Boolean);
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/');
}

function hostsFor(site) {
  if (!site) return new Set();
  const host = new URL(site).host.toLowerCase();
  const bare = host.replace(/^www\./, '');
  return new Set([bare, `www.${bare}`]);
}

function redirectSources(root) {
  const file = join(root, 'vercel.json');
  if (!existsSync(file)) return { sources: new Set(), destinations: [] };
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const redirects = config.redirects ?? [];
  return {
    sources: new Set(redirects.map((r) => r.source)),
    destinations: redirects.map((r) => r.destination),
  };
}

// Returns { path, fragment } inside the site for an internal link, or null for
// a link this check does not own (external host, mailto:, etc.).
export function resolveInternal(link, fromFile, root, hosts) {
  let url = decodeEntities(link);
  if (SKIP_SCHEME.test(url)) return null;
  if (url.startsWith('//')) url = `https:${url}`;
  if (HAS_SCHEME.test(url)) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (!/^https?:$/.test(parsed.protocol) || !hosts.has(parsed.host.toLowerCase())) return null;
    url = parsed.pathname + parsed.search + parsed.hash;
  }
  const hashAt = url.indexOf('#');
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : '';
  let path = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = path.indexOf('?');
  if (queryAt >= 0) path = path.slice(0, queryAt);
  const fromDir = '/' + relative(root, dirname(fromFile)).split(sep).join('/');
  if (path === '') {
    path = '/' + relative(root, fromFile).split(sep).join('/');
  } else if (!path.startsWith('/')) {
    path = posix.join(fromDir, path);
  }
  path = posix.normalize(path);
  try { path = decodeURIComponent(path); } catch { /* keep as is */ }
  return { path, fragment };
}

function anchorsOf(file, cache) {
  if (!cache.has(file)) {
    const text = readFileSync(file, 'utf8');
    const ids = new Set();
    for (const m of text.matchAll(/\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) ids.add(m[1] ?? m[2]);
    cache.set(file, ids);
  }
  return cache.get(file);
}

export function checkLinks(root, { site } = {}) {
  const hosts = hostsFor(site);
  const { sources, destinations } = redirectSources(root);
  const anchorCache = new Map();
  const problems = [];
  let checked = 0;

  const check = (link, fromFile, label) => {
    const target = resolveInternal(link, fromFile, root, hosts);
    if (!target) return;
    checked += 1;
    const where = relative(root, fromFile).split(sep).join('/');
    let file = join(root, ...target.path.split('/').filter(Boolean));
    if (target.path.endsWith('/')) file = join(file, 'index.html');
    if (existsSync(file) && statSync(file).isDirectory()) {
      problems.push(`${where}: ${link} (a folder; link to its .html file)`);
      return;
    }
    if (!existsSync(file)) {
      if (sources.has(target.path)) return; // served by a vercel.json redirect
      problems.push(`${where}: ${link} (${label ?? 'no such file'}: ${target.path})`);
      return;
    }
    if (target.fragment && file.endsWith('.html')) {
      const fragment = decodeURIComponent(target.fragment);
      if (!anchorsOf(file, anchorCache).has(fragment)) {
        problems.push(`${where}: ${link} (no id="${fragment}" in ${target.path})`);
      }
    }
  };

  for (const file of walk(root)) {
    const kind = file.endsWith('.html') ? 'html'
      : file.endsWith('.css') ? 'css'
        : file.endsWith('.xml') ? 'xml' : null;
    if (!kind) continue;
    for (const link of extractLinks(readFileSync(file, 'utf8'), kind)) check(link, file);
  }
  const vercel = join(root, 'vercel.json');
  for (const dest of destinations) check(dest, vercel, 'redirect destination missing');

  return { checked, problems };
}

function main(argv) {
  const args = argv.slice(2);
  const siteAt = args.indexOf('--site');
  const site = siteAt >= 0 ? args[siteAt + 1] : undefined;
  const root = args.find((a, i) => !a.startsWith('--') && (siteAt < 0 || i !== siteAt + 1));
  if (!root || !existsSync(root)) {
    console.error('usage: check-links.mjs <root> [--site https://host]');
    return 2;
  }
  const { checked, problems } = checkLinks(root, { site });
  for (const p of problems) console.log(`BROKEN ${p}`);
  console.log(`check-links: ${checked} internal links checked, ${problems.length} broken`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv);
}
