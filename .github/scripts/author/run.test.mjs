// Tests for the author-side usage log (run.mjs) against a fake `claude`.
// No model is called and nothing touches the network.
// Run: node --test .github/scripts/author/run.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = join(HERE, 'run.mjs');
const REPO = join(HERE, '..', '..', '..');

// A fake claude: records its arguments and standard input, then answers what
// FAKE_MODE asks for.
const FAKE = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  appendFileSync(process.env.FAKE_RECORD, JSON.stringify({ argv: process.argv.slice(2), input }) + '\\n');
  const mode = process.env.FAKE_MODE;
  if (mode === 'limit') { process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: "You've hit your session limit" })); process.exitCode = 1; return; }
  if (mode === 'crash') { process.stderr.write('boom'); process.exitCode = 3; return; }
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'DRAFT-TEXT', usage: { input_tokens: 12, output_tokens: 345, cache_read_input_tokens: 6789, cache_creation_input_tokens: 1011 }, modelUsage: { 'claude-sonnet-test': {} } }));
});
`;

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), 'author-run-test-'));
  const bin = join(tmp, 'claude.cjs');
  writeFileSync(bin, FAKE); chmodSync(bin, 0o755);
  const stateDir = join(tmp, 'state');
  const record = join(tmp, 'record.jsonl');
  const exec = (args, { mode = 'ok', input = 'PROMPT-TEXT' } = {}) => spawnSync(process.execPath, [RUN, ...args], {
    input, encoding: 'utf8', cwd: tmp,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NIRMAAN_CLAUDE_CODE: bin, NIRMAAN_REVIEW_STATE_DIR: stateDir, FAKE_MODE: mode, FAKE_RECORD: record },
  });
  const log = () => (existsSync(join(stateDir, 'calls.jsonl')) ? readFileSync(join(stateDir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const calls = () => (existsSync(record) ? readFileSync(record, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { tmp, stateDir, exec, log, calls, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

test('one run appends one line with role, step, model, tokens (including cache), duration and outcome; claude\'s output and exit code pass through; nothing under the repository', () => {
  const t = setup();
  const before = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: REPO, encoding: 'utf8' });
  try {
    const r = t.exec(['--role', 'content-strategist', '--step', 'writer', '--pr', '12', '--repo', 'nirmaansoftware/Nirmaan', '--', '-p', '--model', 'sonnet']);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).result, 'DRAFT-TEXT', 'claude\'s JSON comes back unchanged');
    const c = t.calls();
    assert.equal(c.length, 1);
    assert.deepEqual(c[0].argv, ['-p', '--model', 'sonnet', '--output-format', 'json']);
    assert.equal(c[0].input, 'PROMPT-TEXT', 'standard input reaches claude');
    const l = t.log();
    assert.equal(l.length, 1, 'one line per run');
    const { time, duration_ms: ms, ...rest } = l[0];
    assert.match(time, /^\d{4}-\d\d-\d\dT/);
    assert.ok(Number.isInteger(ms) && ms >= 0);
    assert.deepEqual(rest, {
      kind: 'author', repo: 'nirmaansoftware/Nirmaan', pr: 12, role: 'content-strategist', step: 'writer', model: 'sonnet', reported_model: 'claude-sonnet-test',
      outcome: 'ok', exit_code: 0, input_tokens: 12, output_tokens: 345, cache_read_tokens: 6789, cache_write_tokens: 1011,
    });
    assert.ok(!JSON.stringify(l[0]).includes('PROMPT-TEXT') && !JSON.stringify(l[0]).includes('DRAFT-TEXT'), 'no prompt or answer in the log');
    assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: REPO, encoding: 'utf8' }), before, 'nothing written under the repository');
  } finally { t.cleanup(); }
});

test('a session limit is logged as rate_limit and a crash as error, each with claude\'s exit code', () => {
  const t = setup();
  try {
    const a = t.exec(['--role', 'technical-writer', '--step', 'checker', '--', '-p'], { mode: 'limit' });
    assert.equal(a.status, 1);
    const b = t.exec(['--role', 'qa-engineer', '--step', 'eval', '--', '-p'], { mode: 'crash' });
    assert.equal(b.status, 3);
    assert.match(b.stderr, /boom/);
    assert.deepEqual(t.log().map((l) => [l.role, l.step, l.outcome, l.exit_code]), [['technical-writer', 'checker', 'rate_limit', 1], ['qa-engineer', 'eval', 'error', 3]]);
  } finally { t.cleanup(); }
});

test('bad arguments: exit 2, claude is not run and nothing is logged', () => {
  const t = setup();
  try {
    for (const args of [
      ['--step', 'writer', '--', '-p'],
      ['--role', 'Bad Role', '--step', 'writer', '--', '-p'],
      ['--role', 'sre', '--step', 'deploy', '--', '-p'],
      ['--role', 'sre', '--step', 'writer'],
      ['--role', 'sre', '--step', 'writer', '--'],
      ['--role', 'sre', '--step', 'writer', '--', '-p', '--output-format', 'text'],
      ['--role', 'sre', '--step', 'writer', '--pr', 'x', '--', '-p'],
    ]) {
      const r = t.exec(args);
      assert.equal(r.status, 2, args.join(' '));
    }
    assert.equal(t.calls().length, 0);
    assert.equal(t.log().length, 0);
  } finally { t.cleanup(); }
});

test('parseArgs keeps an explicit --output-format json and reads the model', () => {
  const a = parseArgs(['--role', 'sre', '--step', 'eval', '--', '-p', '--output-format', 'json', '--model', 'opus']);
  assert.ok(a.ok);
  assert.deepEqual(a.claudeArgs, ['-p', '--output-format', 'json', '--model', 'opus']);
  assert.equal(a.model, 'opus');
  assert.equal(a.pr, null);
});
