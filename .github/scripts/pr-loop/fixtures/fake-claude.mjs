#!/usr/bin/env node
// A fake `claude` for the loop's tests: answers both the reviewer processes
// and the fixer process. No model is called. It reads scenario.json next to
// itself (the processes get a token-free allowlisted environment, so nothing
// comes through env) and records every call to calls.jsonl beside it.
//
// scenario.json: { reviews: [response...], fixes: [fix...] }, each list used
// in order (the last entry repeats).
//   review response: { verdict, findings?, sha? } or { type: 'rate_limit' }
//   fix: { status?, edits?: {path: text}, notAddressed?: [{id, reason}],
//          humanMove?: {gitDir, ref, sha}, type?: 'rate_limit' | 'garbage' }
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(here, 'scenario.json'), 'utf8'));
const argv = process.argv.slice(2);
const isFixer = (argv[argv.indexOf('--tools') + 1] ?? '').includes('Edit');
const kind = isFixer ? 'fixes' : 'reviews';
const counterFile = join(here, `counter-${kind}.json`);
const n = existsSync(counterFile) ? JSON.parse(readFileSync(counterFile, 'utf8')).n : 0;
writeFileSync(counterFile, JSON.stringify({ n: n + 1 }));
const list = scenario[kind] ?? [];
const r = list[Math.min(n, list.length - 1)] ?? {};

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', () => {
  appendFileSync(join(here, 'calls.jsonl'), `${JSON.stringify({ kind, argv, cwd: process.cwd(), env: Object.keys(process.env), stdin })}\n`);
  const out = (o) => process.stdout.write(JSON.stringify(o));
  const ok = (structured) => out({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(structured), structured_output: structured, usage: { input_tokens: 100, output_tokens: 20 }, modelUsage: { 'fake-model': {} } });
  if (r.type === 'rate_limit') { out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'API Error: 429 rate limit exceeded' }); return; }
  if (!isFixer) {
    const head = /Head SHA: ([0-9a-f]{40})/.exec(stdin)?.[1];
    ok({ verdict: r.verdict ?? 'pass', sha: r.sha ?? head, findings: r.findings ?? [], checks_run: ['read the diff'], not_run: ['tests (no command tools)'] });
    return;
  }
  if (r.type === 'garbage') { out({ type: 'result', subtype: 'success', is_error: false, result: 'I fixed it!' }); return; }
  const findings = JSON.parse(/# Findings to fix[^\n]*\n\n([\s\S]*?)\n\n# PR text/.exec(stdin)[1]);
  for (const [p, text] of Object.entries(r.edits ?? {})) {
    mkdirSync(dirname(join(process.cwd(), p)), { recursive: true });
    writeFileSync(join(process.cwd(), p), text);
  }
  if (r.humanMove) execFileSync('git', ['--git-dir', r.humanMove.gitDir, 'update-ref', r.humanMove.ref, r.humanMove.sha]);
  const notAddressed = r.notAddressed ?? [];
  ok({
    status: r.status ?? 'fixed',
    addressed: findings.map((f) => f.id).filter((id) => !notAddressed.some((x) => x.id === id)),
    not_addressed: notAddressed,
    summary: 'Changed what the findings asked for.',
  });
});
