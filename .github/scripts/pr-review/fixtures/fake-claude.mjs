#!/usr/bin/env node
// A fake `claude` for the review script's tests. No model is called.
// It reads scenario.json next to itself (the reviewer's environment is an
// allowlist, so the scenario cannot come through env), answers the next
// response in order, and records each call to calls.jsonl beside it.
//
// Response types: verdict {verdict, findings, sha?}, result {text},
// stdout {text}, sleep {ms}, rate_limit, crash (no output), error.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(here, 'scenario.json'), 'utf8'));
const counterFile = join(here, 'counter.json');
const n = existsSync(counterFile) ? JSON.parse(readFileSync(counterFile, 'utf8')).n : 0;
writeFileSync(counterFile, JSON.stringify({ n: n + 1 }));
const r = scenario.responses[Math.min(n, scenario.responses.length - 1)];

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', async () => {
  appendFileSync(join(here, 'calls.jsonl'), `${JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: Object.keys(process.env), stdin })}\n`);
  const head = /Head SHA: ([0-9a-f]{40})/.exec(stdin)?.[1];
  const out = (o) => process.stdout.write(JSON.stringify(o));
  const ok = (text) => out({ type: 'result', subtype: 'success', is_error: false, result: text, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, modelUsage: { 'fake-model': {} } });
  switch (r.type) {
    case 'verdict':
      ok(JSON.stringify({ verdict: r.verdict, sha: r.sha ?? head, findings: r.findings ?? [], checks_run: ['read the diff'], not_run: ['tests (no command tools)'], ...(r.extra ?? {}) }));
      break;
    case 'result': ok(r.text); break;
    case 'stdout': process.stdout.write(r.text); break;
    case 'sleep': await new Promise((res) => setTimeout(res, r.ms)); ok('{}'); break;
    case 'crash': process.exitCode = 1; break; // exits with no output at all
    case 'rate_limit': out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'API Error: 429 rate limit exceeded' }); break;
    default: out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'something broke' }); process.exitCode = 1;
  }
});
