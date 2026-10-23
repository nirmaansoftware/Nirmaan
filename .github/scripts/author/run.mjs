#!/usr/bin/env node
// Author-side usage log: runs one `claude -p` step of an author pipeline
// (writer, checker or eval) and appends one line about it to the local call
// log, in the same format as the review calls, so the plan's use by authors
// is counted beside the review loop's. How it is used:
// docs/operations/pr-review.md ("Author-side usage").
//
// Usage: node .github/scripts/author/run.mjs --role <role> --step <writer|checker|eval>
//          [--pr <n>] [--repo <owner/name>] -- <claude arguments...>
// Everything after `--` goes to claude unchanged, plus `--output-format json`
// when it is not given (the usage is read from claude's JSON result; another
// output format is refused). Standard input goes to claude; claude's standard
// output and error come back unchanged, and the exit code is claude's.
// Exit 2: bad arguments (nothing is run or logged).
//
// The line goes to calls.jsonl in the state directory
// (NIRMAAN_REVIEW_STATE_DIR, default ~/.nirmaan/pr-review), outside the
// repository: kind "author", role, step, model, outcome, duration, input,
// output and cache tokens. It never holds the prompt or the answer.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { interpret } from '../pr-review/claude.mjs';
import { logCall } from '../pr-review/lib.mjs';
import { defaults } from '../pr-review/review.mjs';

export const STEPS = ['writer', 'checker', 'eval'];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

// Parses the wrapper's own arguments (before `--`) and claude's (after).
// Returns { ok, role, step, pr, repo, claudeArgs, model } or { ok: false, error }.
export function parseArgs(argv) {
  const sep = argv.indexOf('--');
  if (sep < 0) return { ok: false, error: 'missing "--" before the claude arguments' };
  const own = argv.slice(0, sep), claudeArgs = argv.slice(sep + 1);
  const opts = {};
  for (let i = 0; i < own.length; i += 2) {
    const k = own[i], v = own[i + 1];
    if (!['--role', '--step', '--pr', '--repo'].includes(k) || v === undefined) return { ok: false, error: `unknown or incomplete option ${k}` };
    opts[k.slice(2)] = v;
  }
  if (!opts.role || !SLUG.test(opts.role)) return { ok: false, error: '--role must be a role slug, such as content-strategist' };
  if (!STEPS.includes(opts.step)) return { ok: false, error: `--step must be one of ${STEPS.join(', ')}` };
  if (opts.pr !== undefined && !/^\d+$/.test(opts.pr)) return { ok: false, error: '--pr must be a number' };
  if (opts.repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) return { ok: false, error: '--repo must be owner/name' };
  if (!claudeArgs.length) return { ok: false, error: 'no claude arguments after "--"' };
  const fmt = claudeArgs.indexOf('--output-format');
  if (fmt >= 0 && claudeArgs[fmt + 1] !== 'json') return { ok: false, error: 'only --output-format json can be logged (the usage is in the JSON result)' };
  const args = fmt >= 0 ? claudeArgs : [...claudeArgs, '--output-format', 'json'];
  const m = args.indexOf('--model');
  return { ok: true, role: opts.role, step: opts.step, pr: opts.pr ? Number(opts.pr) : null, repo: opts.repo ?? null, claudeArgs: args, model: m >= 0 ? args[m + 1] ?? null : null };
}

// Runs claude with `a.claudeArgs`, passing standard input, output and error
// through, and logs one line. Returns claude's exit code.
export function run(a, { bin, stateDir, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, env = process.env }) {
  const started = Date.now();
  return new Promise((resolve) => {
    let out = '', err = '', done = false;
    const finish = (code, failure) => {
      if (done) return;
      done = true;
      const r = failure ? { kind: 'error', error: failure } : interpret({ code, stdout: out, stderr: err });
      logCall(stateDir, {
        kind: 'author', repo: a.repo, pr: a.pr, role: a.role, step: a.step, model: a.model, reported_model: r.reportedModel ?? null,
        outcome: r.kind, exit_code: code, duration_ms: Date.now() - started,
        input_tokens: r.tokens?.input_tokens ?? null, output_tokens: r.tokens?.output_tokens ?? null,
        cache_read_tokens: r.tokens?.cache_read_tokens ?? null, cache_write_tokens: r.tokens?.cache_write_tokens ?? null,
      });
      resolve(code);
    };
    let child;
    try {
      child = spawn(bin, a.claudeArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { finish(127, `claude could not start: ${e.message}`); return; }
    child.stdout.on('data', (d) => { out += d; stdout.write(d); });
    child.stderr.on('data', (d) => { err += d; stderr.write(d); });
    child.on('error', (e) => finish(127, `claude could not start: ${e.message}`));
    child.on('close', (code) => finish(code ?? 1));
    child.stdin.on('error', () => { /* claude may exit before reading */ });
    stdin.pipe(child.stdin);
  });
}

async function main(argv) {
  const a = parseArgs(argv);
  if (!a.ok) {
    console.error(`author/run: ${a.error}\nusage: run.mjs --role <role> --step <${STEPS.join('|')}> [--pr <n>] [--repo <owner/name>] -- <claude arguments...>`);
    return 2;
  }
  const d = defaults();
  return run(a, { bin: d.claudeBin, stateDir: d.stateDir });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`author/run: ${e.stack || e.message}`); process.exit(2); });
}
