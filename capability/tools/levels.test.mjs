// Tests for levels.mjs. Run: node --test capability/tools/levels.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blobSha, parseRecords, skillIndex, checkRecords, generateLevels, checkAppendOnly, EVENTS, LEVELS_PATH,
} from './levels.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const C = 'a'.repeat(40);

const skillText = (body = 'Use when: x.\n') => `---\nid: form-validation\nname: Form validation\nunit: web\nowners:\n  writer: frontend-engineer\n  checker: qa-engineer\n  unit: web\n---\n${body}`;
const SKILL = skillText();
const SHA = blobSha(SKILL);
const skills = (text = SKILL) => skillIndex([{ file: 'skills/web/form-validation.md', text }]);

const rec = {
  check: (extra = {}) => ({ record_id: 'r1', event: 'check', skill_id: 'form-validation', skill_sha: SHA, commit: C, result: 'pass', evidence: 'review comment', written_by: 'checker', writer_session: 's1', agent: 'qa-engineer', ...extra }),
  evalRun: (extra = {}) => ({ record_id: 'r2', event: 'eval_run', skill_id: 'form-validation', skill_sha: SHA, commit: C, result: 'pass', evidence: 'ci run', written_by: 'tool', writer_session: 't1', judge: 'tool', command: 'node --test examples/form-validation', exit_code: 0, n: 5, model: 'claude-sonnet', provider: 'claude-code', ...extra }),
  use: (extra = {}) => ({ record_id: 'r3', event: 'pr_use', skill_id: 'form-validation', skill_sha: SHA, commit: C, result: 'pass', evidence: 'key-1 comment', written_by: 'review', writer_session: 'loop', pr: 130, key: 1, verdict: 'pass', ...extra }),
};
const jsonl = (...rs) => rs.map((r) => JSON.stringify(r)).join('\n') + '\n';

function levels(lines, text = SKILL) {
  const { records, problems } = parseRecords('capability/records/a.jsonl', lines);
  const checked = checkRecords(records, skills(text));
  const out = JSON.parse(generateLevels(skills(text), checked.live));
  return { problems: [...problems, ...checked.problems], skill: out.skills['form-validation'] };
}
const codes = (problems) => [...new Set(problems.map((p) => p.split(':')[0]))];

test('levels: check, tool eval and key-1 use give Checked, Tested and Used', () => {
  assert.equal(levels(jsonl(rec.check())).skill.level, 'Checked');
  assert.equal(levels(jsonl(rec.check(), rec.evalRun())).skill.level, 'Tested');
  const all = levels(jsonl(rec.check(), rec.evalRun(), rec.use()));
  assert.deepEqual(all.problems, []);
  assert.equal(all.skill.level, 'Used');
  assert.deepEqual(all.skill.used_in_prs, [130]);
  assert.equal(levels('').skill.level, 'none');
});

test('levels: heuristic, rubric, mock and small or failing runs never give Tested', () => {
  for (const extra of [{ judge: 'heuristic' }, { judge: 'rubric' }, { model: 'mock' }, { provider: 'mock' }, { n: 2 }, { exit_code: 1 }, { result: 'fail' }]) {
    const r = levels(jsonl(rec.check(), rec.evalRun(extra)));
    assert.deepEqual(r.problems, [], JSON.stringify(extra));
    assert.equal(r.skill.level, 'Checked', JSON.stringify(extra));
  }
  assert.deepEqual(levels(jsonl(rec.check(), rec.evalRun({ judge: 'rubric' }))).skill.rubric_evals, { runs: 1, passed: 1 });
});

test('levels: a changed skill file makes Checked stale, and the level drops', () => {
  const edited = skillText('Use when: x, edited.\n');
  const r = levels(jsonl(rec.check(), rec.evalRun(), rec.use()), edited);
  assert.equal(r.skill.level, 'none');
  assert.equal(r.skill.stale, true);
  assert.equal(r.skill.skill_sha, blobSha(edited));
});

test('levels: Used needs a key-1 verdict that passed; a revoking line takes it back', () => {
  assert.ok(codes(levels(jsonl(rec.check(), rec.evalRun(), rec.use({ key: 2 }))).problems).includes('record'));
  assert.equal(levels(jsonl(rec.check(), rec.evalRun(), rec.use({ verdict: 'fail' }))).skill.level, 'Tested');
  assert.equal(levels(jsonl(rec.check(), rec.evalRun())).skill.level, 'Tested');
  const revoked = levels(jsonl(rec.check(), rec.evalRun(), rec.use(), rec.use({ record_id: 'r4', result: 'revoked', supersedes: 'r3' })));
  assert.deepEqual(revoked.problems, []);
  assert.equal(revoked.skill.level, 'Tested');
});

test('record: malformed lines, missing or unknown fields fail', () => {
  assert.ok(codes(levels('not json\n').problems).includes('record'));
  const { agent, ...noAgent } = rec.check();
  assert.ok(codes(levels(jsonl(noAgent)).problems).includes('record'));
  assert.ok(codes(levels(jsonl(rec.check({ level: 'Checked' }))).problems).includes('record'));
  assert.ok(codes(levels(jsonl(rec.check({ skill_sha: 'abc' }))).problems).includes('record'));
  assert.ok(codes(levels(jsonl(rec.check({ event: 'signoff' }))).problems).includes('record'));
  assert.ok(codes(levels(jsonl(rec.evalRun({ judge: 'vibes' }))).problems).includes('record'));
});

test('record-id: duplicate ids and a supersedes with no earlier record fail', () => {
  assert.ok(codes(levels(jsonl(rec.check(), rec.check())).problems).includes('record-id'));
  assert.ok(codes(levels(jsonl(rec.check({ supersedes: 'r9' }))).problems).includes('record-id'));
});

test('skill: a record for a skill id with no skill file fails', () => {
  assert.ok(codes(levels(jsonl(rec.check({ skill_id: 'ghost' }))).problems).includes('skill'));
});

test('writer: a check by anyone but the checker role, or an eval not written by a tool run, fails', () => {
  assert.ok(codes(levels(jsonl(rec.check({ agent: 'frontend-engineer' }))).problems).includes('writer'));
  assert.ok(codes(levels(jsonl(rec.check({ written_by: 'tool' }))).problems).includes('writer'));
  assert.ok(codes(levels(jsonl(rec.evalRun({ written_by: 'checker' }))).problems).includes('writer'));
  assert.ok(codes(levels(jsonl(rec.use({ written_by: 'checker' }))).problems).includes('writer'));
});

test('append-only: an edited, removed or reordered past line fails; an added line passes', () => {
  const base = new Map([['capability/records/a.jsonl', jsonl(rec.check(), rec.evalRun())]]);
  assert.deepEqual(checkAppendOnly(base, new Map([['capability/records/a.jsonl', jsonl(rec.check(), rec.evalRun(), rec.use())]])), []);
  assert.deepEqual(checkAppendOnly(base, new Map([['capability/records/a.jsonl', jsonl(rec.check({ result: 'fail' }), rec.evalRun())]])).length, 1);
  assert.deepEqual(checkAppendOnly(base, new Map([['capability/records/a.jsonl', jsonl(rec.evalRun(), rec.check())]])).length, 1);
  assert.deepEqual(checkAppendOnly(base, new Map([['capability/records/a.jsonl', jsonl(rec.check())]])).length, 1);
  assert.match(checkAppendOnly(base, new Map()).join(''), /was removed/);
});

test('generator: the output is deterministic and ends in one newline', () => {
  const { records } = parseRecords('x', jsonl(rec.check(), rec.evalRun()));
  const a = generateLevels(skills(), checkRecords(records, skills()).live);
  const b = generateLevels(skills(), checkRecords([...records].reverse(), skills()).live);
  assert.equal(a, b);
  assert.ok(a.endsWith('}\n'));
});

test('schema: records/schema.json lists exactly the fields and events levels.mjs accepts', () => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'capability/records/schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.event.enum, EVENTS);
  const { records, problems } = parseRecords('x', jsonl(rec.check(), rec.evalRun(), rec.use()));
  assert.deepEqual(problems, []);
  const used = new Set(records.flatMap((r) => Object.keys(r).filter((k) => k !== '_where')));
  for (const k of used) assert.ok(k in schema.properties, `${k} is in the schema`);
  for (const k of schema.required) assert.ok(records.every((r) => k in r), `${k} is required`);
});

test('repository: levels.json is current, and a hand edit fails the regenerate-and-diff check', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'levels-test-'));
  try {
    const sh = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' });
    sh('init', '-q', '-b', 'main');
    for (const f of ['capability/tools/levels.mjs', 'capability/records/schema.json', LEVELS_PATH, '.github/scripts/review-teams.mjs']) {
      mkdirSync(join(tmp, dirname(f)), { recursive: true });
      cpSync(join(ROOT, f), join(tmp, f));
    }
    sh('add', '-A');
    const run = () => spawnSync('node', ['capability/tools/levels.mjs'], { cwd: tmp, encoding: 'utf8' });
    assert.equal(run().status, 0, run().stderr);
    writeFileSync(join(tmp, LEVELS_PATH), readFileSync(join(tmp, LEVELS_PATH), 'utf8').replace('"skills": {}', '"skills": {"form-validation": {"level": "Used"}}'));
    const r = run();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /levels-drift/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
