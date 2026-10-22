#!/usr/bin/env node
// Capability records and levels (capability/README.md).
//
// levels.json is a pure function of capability/records/*.jsonl and the skill
// files under skills/: the same inputs always give the same bytes (no dates,
// sorted keys). Every problem starts with its check's code; each check has a
// fixture that must fail in levels.test.mjs.
//
//   record        a line is not one JSON object with the fields its event
//                 needs, or a value is out of range
//   record-id     a record id is used twice, or `supersedes` names no earlier
//                 record
//   skill         a record names a skill id with no skill file
//   writer        a check record is not written by the skill's checker role,
//                 or an eval or use record is not written by a tool run or the
//                 review script
//   append-only   a records file present on the base branch was edited,
//                 shortened or removed (only lines may be added at the end)
//   levels-drift  the committed capability/levels.json differs from a fresh
//                 generation
//
// Levels, lowest to highest (decision record D6.7 to D6.9):
//   Checked  a passing check record by the skill's checker role, bound to the
//            skill file's current git blob SHA. An edit makes it stale.
//   Tested   Checked, plus a passing tool-judged eval run on the current SHA
//            with n of at least 3 and exit code 0. Heuristic and rubric runs,
//            and runs whose model or provider is "mock", never count; rubric
//            runs are reported apart.
//   Used     Tested, plus a passing key-1 review verdict that cites the skill
//            (a pr_use record from the review script). A record that
//            supersedes it (for example on a revert) removes it.
//
// Usage (from the repository root):
//   node capability/tools/levels.mjs            check: records, then levels.json
//   node capability/tools/levels.mjs --write    regenerate levels.json
//   node capability/tools/levels.mjs --base <ref>  also check append-only
//                                                   against <ref>
// Exit 0 when every check passes, 1 when one fails, 2 on a usage or git error.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../../.github/scripts/review-teams.mjs';

// Skill files are skills/<unit>/<skill-id>.md with front matter between ---
// lines (the format of skills/README.md); the template is not a skill.
export const TEMPLATE_PATH = 'skills/_template.md';
export const skillFiles = (files) => files.filter((f) => f !== TEMPLATE_PATH && /^skills\/[^/]+\/[^/]+\.md$/.test(f));
export function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  try { return parseYaml(m[1]); } catch { return null; }
}

export const RECORDS_DIR = 'capability/records';
export const LEVELS_PATH = 'capability/levels.json';
export const EVENTS = ['check', 'eval_run', 'pr_use'];
export const JUDGES = ['tool', 'rubric', 'heuristic'];
export const MIN_TESTED_N = 3;
const COMMON = ['record_id', 'event', 'skill_id', 'skill_sha', 'commit', 'result', 'evidence', 'written_by', 'writer_session'];
const BY_EVENT = {
  check: ['agent'],
  eval_run: ['judge', 'command', 'exit_code', 'n', 'model', 'provider'],
  pr_use: ['pr', 'key', 'verdict'],
};
const OPTIONAL = ['supersedes', 'note'];
const RESULTS = { check: ['pass', 'fail'], eval_run: ['pass', 'fail'], pr_use: ['pass', 'revoked'] };
const WRITERS = { check: 'checker', eval_run: 'tool', pr_use: 'review' };

const isSha = (s, len) => typeof s === 'string' && new RegExp(`^[0-9a-f]{${len}}$`).test(s);

// The git blob SHA of a file's bytes (what `git hash-object` prints).
export function blobSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

// Parse one records file. Returns { records, problems }.
export function parseRecords(file, text) {
  const records = [], problems = [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    let r;
    try { r = JSON.parse(line); } catch { problems.push(`record: ${where}: not one JSON object per line`); return; }
    if (!r || typeof r !== 'object' || Array.isArray(r)) { problems.push(`record: ${where}: not a JSON object`); return; }
    const need = [...COMMON, ...(BY_EVENT[r.event] ?? [])];
    if (!EVENTS.includes(r.event)) problems.push(`record: ${where}: event must be one of ${EVENTS.join(', ')}`);
    for (const k of need) if (!(k in r)) problems.push(`record: ${where}: missing "${k}"`);
    for (const k of Object.keys(r)) if (!need.includes(k) && !OPTIONAL.includes(k)) problems.push(`record: ${where}: unknown field "${k}"`);
    if ('skill_sha' in r && !isSha(r.skill_sha, 40)) problems.push(`record: ${where}: skill_sha must be a 40-character git blob SHA`);
    if ('commit' in r && !isSha(r.commit, 40)) problems.push(`record: ${where}: commit must be a 40-character commit SHA`);
    if (RESULTS[r.event] && !RESULTS[r.event].includes(r.result)) problems.push(`record: ${where}: result must be one of ${RESULTS[r.event].join(', ')}`);
    if (r.event === 'eval_run') {
      if (!JUDGES.includes(r.judge)) problems.push(`record: ${where}: judge must be one of ${JUDGES.join(', ')}`);
      if (!Number.isInteger(r.n) || r.n < 1) problems.push(`record: ${where}: n must be a positive integer`);
      if (!Number.isInteger(r.exit_code)) problems.push(`record: ${where}: exit_code must be an integer`);
    }
    if (r.event === 'pr_use') {
      if (!Number.isInteger(r.pr) || r.pr < 1) problems.push(`record: ${where}: pr must be a PR number`);
      if (r.key !== 1) problems.push(`record: ${where}: Used counts only a key-1 verdict (key: 1)`);
      if (!['pass', 'fail'].includes(r.verdict)) problems.push(`record: ${where}: verdict must be pass or fail`);
    }
    if (WRITERS[r.event] && r.written_by !== WRITERS[r.event]) problems.push(`writer: ${where}: a ${r.event} record is written by "${WRITERS[r.event]}", not "${r.written_by}"`);
    records.push({ ...r, _where: where });
  });
  return { records, problems };
}

// Skills: { id -> { sha, checker, writer } } from skill files.
export function skillIndex(entries) {
  const out = new Map();
  for (const { file, text } of entries) {
    if (file === TEMPLATE_PATH) continue;
    const fm = frontMatter(text);
    if (!fm || typeof fm.id !== 'string') continue;
    out.set(fm.id, { sha: blobSha(text), checker: fm.owners?.checker, writer: fm.owners?.writer });
  }
  return out;
}

// Validate records against each other and the skills; drop superseded ones.
export function checkRecords(records, skills) {
  const problems = [];
  const seen = new Map();
  for (const r of records) {
    if (seen.has(r.record_id)) problems.push(`record-id: ${r._where}: record id "${r.record_id}" is also used at ${seen.get(r.record_id)._where}`);
    if (r.supersedes != null && !seen.has(r.supersedes)) problems.push(`record-id: ${r._where}: supersedes "${r.supersedes}", which is not an earlier record`);
    seen.set(r.record_id, r);
    const skill = skills.get(r.skill_id);
    if (!skill) { problems.push(`skill: ${r._where}: no skill file has id "${r.skill_id}"`); continue; }
    if (r.event === 'check' && (r.agent !== skill.checker || r.agent === skill.writer)) problems.push(`writer: ${r._where}: a check record is by the skill's checker role (${skill.checker}), not "${r.agent}"`);
  }
  const superseded = new Set(records.map((r) => r.supersedes).filter((x) => x != null));
  return { problems, live: records.filter((r) => !superseded.has(r.record_id)) };
}

const mock = (r) => /\bmock\b/i.test(String(r.model)) || /\bmock\b/i.test(String(r.provider));

// levels.json content, as a string ending in a newline.
export function generateLevels(skills, liveRecords) {
  const out = {};
  for (const id of [...skills.keys()].sort()) {
    const { sha } = skills.get(id);
    const mine = liveRecords.filter((r) => r.skill_id === id);
    const checks = mine.filter((r) => r.event === 'check' && r.result === 'pass' && r.agent === skills.get(id).checker);
    const checked = checks.some((r) => r.skill_sha === sha);
    const stale = !checked && checks.length > 0;
    const evals = mine.filter((r) => r.event === 'eval_run' && r.skill_sha === sha && !mock(r));
    const toolPass = evals.filter((r) => r.judge === 'tool' && r.result === 'pass' && r.exit_code === 0 && r.n >= MIN_TESTED_N);
    const tested = checked && toolPass.length > 0;
    const uses = mine.filter((r) => r.event === 'pr_use' && r.result === 'pass' && r.key === 1 && r.verdict === 'pass');
    const used = tested && uses.length > 0;
    const count = (judge) => {
      const runs = evals.filter((r) => r.judge === judge);
      return { runs: runs.length, passed: runs.filter((r) => r.result === 'pass').length };
    };
    out[id] = {
      level: used ? 'Used' : tested ? 'Tested' : checked ? 'Checked' : 'none',
      skill_sha: sha,
      stale,
      tool_evals: count('tool'),
      rubric_evals: count('rubric'),
      used_in_prs: [...new Set(uses.map((r) => r.pr))].sort((a, b) => a - b),
    };
  }
  return `${JSON.stringify({ generated_by: 'capability/tools/levels.mjs; do not edit by hand', skills: out }, null, 2)}\n`;
}

// Append-only: each records file on the base must be a line-prefix of the
// same file now. `base` and `head` map file -> text.
export function checkAppendOnly(base, head) {
  const problems = [];
  for (const [file, before] of base) {
    if (!head.has(file)) { problems.push(`append-only: ${file} was removed`); continue; }
    const now = head.get(file);
    const b = before.endsWith('\n') || before === '' ? before : `${before}\n`;
    if (!now.startsWith(b)) problems.push(`append-only: ${file}: a line that is on the base branch was edited or removed (add a correcting line with "supersedes" instead)`);
  }
  return problems;
}

// ---------------------------------------------------------------- CLI

function git(args) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1e8 }); }

function main(argv) {
  const write = argv.includes('--write');
  const bi = argv.indexOf('--base');
  const base = bi >= 0 ? argv[bi + 1] : null;
  if (bi >= 0 && !base) { console.error('levels: --base needs a ref'); return 2; }
  let files, problems = [], records = [], head;
  try {
    files = git(['ls-files', '-z']).split('\0').filter(Boolean);
    const recordFiles = files.filter((f) => f.startsWith(`${RECORDS_DIR}/`) && f.endsWith('.jsonl'));
    head = new Map(recordFiles.map((f) => [f, readFileSync(f, 'utf8')]));
    for (const [f, text] of head) {
      const r = parseRecords(f, text);
      records.push(...r.records);
      problems.push(...r.problems);
    }
    if (base) {
      const baseFiles = git(['ls-tree', '-r', '--name-only', base, '--', RECORDS_DIR]).split('\n').filter((f) => f.endsWith('.jsonl'));
      problems.push(...checkAppendOnly(new Map(baseFiles.map((f) => [f, git(['show', `${base}:${f}`])])), head));
    }
  } catch (e) {
    console.error(`levels: ${e.message}`);
    return 2;
  }
  const skills = skillIndex(skillFiles(files).map((file) => ({ file, text: readFileSync(file, 'utf8') })));
  const checked = checkRecords(records, skills);
  problems.push(...checked.problems);
  const fresh = generateLevels(skills, checked.live);
  if (write) {
    writeFileSync(LEVELS_PATH, fresh);
    console.log(`levels: wrote ${LEVELS_PATH}`);
  } else {
    let committed = null;
    try { committed = readFileSync(LEVELS_PATH, 'utf8'); } catch { /* missing */ }
    if (committed !== fresh) problems.push(`levels-drift: ${LEVELS_PATH} differs from a fresh generation; run node capability/tools/levels.mjs --write and commit it (never edit it by hand)`);
  }
  console.log(`${records.length} record(s) in ${head.size} file(s); ${skills.size} skill(s).`);
  if (problems.length) {
    console.error(`levels: ${problems.length} problem(s):`);
    for (const m of problems) console.error(`  - ${m}`);
    return 1;
  }
  console.log('levels: every check passed.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
