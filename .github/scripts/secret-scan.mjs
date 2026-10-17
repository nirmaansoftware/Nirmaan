#!/usr/bin/env node
// Secret scan of a pull request's diff (<base>...HEAD). No dependencies.
//
// Fails when an added line matches a known secret format (private key blocks,
// cloud, GitHub, Anthropic, OpenAI, Google, Slack, Stripe and Fly tokens), or
// when the change adds a file that should never be committed: .env files
// (.env.example, .env.sample and .env.template are fine), key and certificate
// stores, and SQLite databases. Only added lines are scanned; a secret already
// on the base branch is out of scope here (rotate it and remove it instead).
// Findings name the file, line and pattern, never the matched value.
//
// This is a pattern check, not a guarantee: it catches the common formats.
// Secrets belong in os/.env.local (git-ignored) or the host's secret store.
//
// Usage: node .github/scripts/secret-scan.mjs <base-ref>
// Exit 0 when nothing is found, 1 on a finding, 2 on a usage or git error.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PATTERNS = [
  { name: 'private key block', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { name: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'Anthropic key or token', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI key', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { name: 'Slack webhook', re: /hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/ },
  { name: 'Stripe live key', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}/ },
  { name: 'Fly.io token', re: /\bFlyV1 fm[12][a-z]?_[A-Za-z0-9+/=_-]{20,}/ },
  { name: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
];

const ENV_OK = new Set(['.env.example', '.env.sample', '.env.template']);
const BAD_FILES = [
  { name: '.env file', test: (base) => /^\.env(\..+)?$/.test(base) && !ENV_OK.has(base) },
  { name: 'key or certificate store', test: (base) => /\.(pem|key|p12|pfx|jks|keystore)$/i.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)$/.test(base) },
  { name: 'SQLite database', test: (base) => /\.(db|sqlite|sqlite3)(-journal)?$/i.test(base) },
];

// Added lines of a unified diff, as { file, line, text }.
export function addedLines(diff) {
  const out = [];
  let file = null;
  let line = 0;
  let inHeader = false;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) { inHeader = true; file = null; continue; }
    if (inHeader) {
      if (raw.startsWith('+++ ')) file = raw === '+++ /dev/null' ? null : raw.slice(4).replace(/^b\//, '');
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (hunk) { inHeader = false; line = Number(hunk[1]); }
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (raw.startsWith('+')) {
      if (file) out.push({ file, line, text: raw.slice(1) });
      line += 1;
    } else if (raw.startsWith(' ')) {
      line += 1;
    }
  }
  return out;
}

export function scanLines(lines) {
  const findings = [];
  for (const { file, line, text } of lines) {
    for (const { name, re } of PATTERNS) {
      if (re.test(text)) { findings.push(`${file}:${line}: ${name}`); break; }
    }
  }
  return findings;
}

// entries: [{ status, paths }] from `git diff --name-status`.
export function scanPaths(entries) {
  const findings = [];
  for (const { status, paths } of entries) {
    if (!/^[ACR]/.test(status)) continue;
    const path = paths[paths.length - 1];
    const base = path.split('/').pop();
    const bad = BAD_FILES.find((b) => b.test(base));
    if (bad) findings.push(`${path}: ${bad.name} added (${status})`);
  }
  return findings;
}

function git(args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
}

function main(argv) {
  const base = argv[2];
  if (!base) {
    console.error('usage: secret-scan.mjs <base-ref>');
    return 2;
  }
  const range = `${base}...HEAD`;
  const entries = git(['diff', '--name-status', '-M', range]).split('\n').filter(Boolean)
    .map((l) => { const [status, ...paths] = l.split('\t'); return { status, paths }; });
  const lines = addedLines(git(['diff', '--no-color', '--no-ext-diff', '--unified=0', '-M', range]));
  const findings = [...scanPaths(entries), ...scanLines(lines)];
  for (const f of findings) console.log(`SECRET ${f}`);
  console.log(`secret-scan: ${entries.length} file(s), ${lines.length} added line(s), ${findings.length} finding(s)`);
  return findings.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    console.error(`secret-scan: ${err.message}`);
    process.exitCode = 2;
  }
}
