#!/usr/bin/env node
// Skill file validator (skills/<unit>/<skill-id>.md), from the style rules in
// skills/README.md. Each check below has a fixture that must fail in
// skills.test.mjs; every problem starts with its check's code.
//
//   front-matter    a missing or unknown field, or a malformed value (tier,
//                   volatility, lists, tools, owners)
//   no-level        a level or sign-off field in the front matter
//   use-when        line 1 of the body is not "Use when: ..."
//   headings        the eight headings are not exact and in order, or a
//                   section is empty (an empty section says "None: <reason>")
//   worked-example  a runnable skill does not link examples/<id>/, or a
//                   knowledge-only skill does not say "None:" with a reason
//   words           the body, without Sources, is under 700 or over 2,500
//                   words
//   size            the file is over 16 KB
//   sources         an [S#] marker does not resolve, a source is listed twice,
//                   or a source line lacks a URL, a version or access date,
//                   or a licence
//   needs-source    [NEEDS SOURCE] appears
//   dashes          an em or en dash appears
//   expert          the word "expert" appears
//   never-list      a phrase from the Never list in docs/company/positioning.md
//                   appears
//   company-claim   company-claim voice (praise of Nirmaan, its team, its
//                   clients or its track record)
//   currency        a currency amount appears
//   instruction     text tells an agent to change its permissions, its
//                   escalation or a review
//   held-by         held_by is empty, or names a role that is not a lead or
//                   member of a review team
//   owners          the writer or checker is not a lead or member of a
//                   review team, they are the same role, or owners.unit
//                   differs from unit
//   unit            the folder, unit and owners.unit differ, or the unit is
//                   not an active unit in the chart
//   ids             the id is malformed, differs from the file name, contains
//                   the unit, is used twice, or a prerequisite does not exist
//   review-by       as_of is in the future, or review_by is not after as_of
//                   and within the volatility's months (fast 3, medium 6,
//                   stable 12)
//   eval-cases      a runnable skill lists no eval case
//   review-rule     .github/review-teams.yml has no rule "skills/<unit>/**"
//                   whose teams are exactly that unit
//
// skills/_template.md is checked for structure and voice only (front-matter
// fields, no-level, use-when, headings, sources, size and the voice checks):
// it has no subject, so words, ids, dates, roles, eval cases and the review
// rule are skipped for it.
//
// Usage: node .github/scripts/skills.mjs
// Run from the repository root. Exit 0 when every check passes, 1 when one
// fails, 2 on a parse or git error.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseYaml, MAP_PATH } from './review-teams.mjs';

export const SKILLS_DIR = 'skills';
export const TEMPLATE_PATH = 'skills/_template.md';
export const POSITIONING_PATH = 'docs/company/positioning.md';
export const MIN_WORDS = 700;
export const MAX_WORDS = 2500;
export const MAX_BYTES = 16 * 1024;
export const HEADINGS = [
  'Scope',
  'Core concepts',
  'How we do it',
  'Standards and specifications',
  'Common failures and pitfalls',
  'How good work is verified',
  'Worked example',
  'Sources',
];
export const FIELDS = ['id', 'name', 'unit', 'tier', 'prerequisites', 'related', 'tools', 'eval_cases', 'held_by', 'owners', 'volatility', 'as_of', 'review_by'];
const LEVEL_FIELDS = /^(levels?|proficiency|checked|tested|used|sign_?off|signed_?off|signoffs?|verified_?by|approved_?by)$/i;
export const VOLATILITY_MONTHS = { fast: 3, medium: 6, stable: 12 };
const TOOL_ACCESS = /\((free, connected|paid, known only)\)$/;

// Company-claim voice: a skill never praises Nirmaan, its team, its clients
// or its record.
export const CLAIM_PATTERNS = [
  /\b(our|nirmaan'?s) (clients?|customers?|team|track record|experience|expertise|portfolio|success)\b/i,
  /\bwe (have )?(delivered|served|guarantee|are (the |a )?(leading|best|trusted|top))\b/i,
  /\btrusted by\b/i,
  /\b(world|industry|best)[- ]class\b/i,
  /\bnirmaan (is|offers|delivers|provides|guarantees)\b/i,
];
export const CURRENCY_PATTERNS = [/₹\s?\d/, /\b(rs\.?|inr|usd|eur|gbp)\s?\d/i, /[$€£]\s?\d/];
// Text that tells an agent to change its permissions, escalation or review.
export const INSTRUCTION_PATTERNS = [
  /\b(ignore|disregard|forget) (all |any )?(the )?((previous|prior|above|earlier|your|system|role) ){1,2}(instructions|rules|constraints|prompt|spec)/i,
  /\b(skip|bypass|disable|turn off|override|circumvent) (the |a |any |all )?(reviews?|keys?|checks?|escalation|approvals?|gates?|ci|role spec|constraints|permissions)\b/i,
  /\b(do not|don't|never|no need to) escalate\b/i,
  /\b(approve|pass|merge) (this|the|any|every|your own) (pr|pull request|review|change)\b/i,
  /\b(grant|give) (yourself|the agent|agents?|your role) /i,
  /\b(widen|expand|raise|change) (your|the agent'?s|its) (permissions|tools|access)\b/i,
  /\byou (may|can|are allowed to) (deploy|send|publish|merge|approve)\b/i,
];

const list = (v) => (Array.isArray(v) ? v : []);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export function addMonths(date, months) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

// The quoted phrases of the "**Never:**" paragraph in positioning.md.
export function neverList(positioning) {
  const m = /\*\*Never:\*\*([\s\S]*?)(\n\s*\n|$)/.exec(positioning);
  if (!m) throw new Error(`no "**Never:**" list in ${POSITIONING_PATH}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

// Split a skill file into front matter (parsed) and body.
export function splitFile(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return { front: null, body: text, error: 'no front matter between --- lines at the top' };
  try {
    return { front: parseYaml(m[1]) ?? {}, body: m[2] };
  } catch (e) {
    return { front: null, body: m[2], error: e.message };
  }
}

// Sections of the body: [{ heading, text }], in order, from "## " lines.
export function sections(body) {
  const out = [];
  let cur = null;
  for (const line of body.split('\n')) {
    const h = /^##\s+(.*?)\s*$/.exec(line);
    if (h && !line.startsWith('###')) { cur = { heading: h[1], text: '' }; out.push(cur); }
    else if (cur) cur.text += `${line}\n`;
  }
  return out;
}

const words = (s) => (s.match(/\S+/g) ?? []).length;

// Check one file. `file` is its repository path. ctx: {
//   template: boolean, neverPhrases: string[], activeOccupants: Set,
//   activeUnits: Set, reviewTeams, today: "YYYY-MM-DD",
// }
export function checkSkill(file, text, ctx) {
  const problems = [];
  const p = (code, msg) => problems.push(`${code}: ${file}: ${msg}`);
  const full = !ctx.template;
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) p('size', `${Buffer.byteLength(text, 'utf8')} bytes (at most ${MAX_BYTES})`);
  const { front, body, error } = splitFile(text);
  if (error) p('front-matter', error);
  const fm = front ?? {};

  // Front matter.
  for (const k of Object.keys(fm)) {
    if (LEVEL_FIELDS.test(k)) p('no-level', `front matter field "${k}": levels and sign-offs come only from records`);
    else if (!FIELDS.includes(k)) p('front-matter', `unknown field "${k}"`);
  }
  if (front) for (const k of FIELDS) if (!(k in fm)) p('front-matter', `missing field "${k}"`);
  for (const k of ['prerequisites', 'related', 'tools', 'eval_cases', 'held_by']) if (k in fm && !Array.isArray(fm[k])) p('front-matter', `${k} must be a list`);
  for (const k of ['id', 'name', 'unit', 'tier', 'volatility', 'as_of', 'review_by']) if (k in fm && typeof fm[k] !== 'string') p('front-matter', `${k} must be a string`);
  if ('owners' in fm && (typeof fm.owners !== 'object' || Array.isArray(fm.owners) || !fm.owners || !['writer', 'checker', 'unit'].every((k) => typeof fm.owners[k] === 'string') || Object.keys(fm.owners).length !== 3)) p('front-matter', 'owners must have exactly writer, checker and unit');
  if (full) {
    if ('tier' in fm && !['runnable', 'knowledge-only'].includes(fm.tier)) p('front-matter', 'tier must be runnable or knowledge-only');
    if ('volatility' in fm && !(fm.volatility in VOLATILITY_MONTHS)) p('front-matter', 'volatility must be fast, medium or stable');
  }
  for (const t of list(fm.tools)) if (typeof t !== 'string' || !TOOL_ACCESS.test(t)) p('front-matter', `tool "${t}" must end with "(free, connected)" or "(paid, known only)"`);

  // Body: "Use when", headings, sections.
  const firstLine = body.replace(/^\n+/, '').split('\n')[0] ?? '';
  if (!/^Use when: \S/.test(firstLine)) p('use-when', 'line 1 of the body must be "Use when: ..."');
  const secs = sections(body);
  const got = secs.map((s) => s.heading);
  if (got.join('\n') !== HEADINGS.join('\n')) p('headings', `headings must be exactly, in order: ${HEADINGS.join(' | ')} (found: ${got.join(' | ') || 'none'})`);
  for (const s of secs) if (s.text.trim() === '') p('headings', `section "${s.heading}" is empty; write "None: <reason>"`);
  for (const s of secs) if (/^None:\s*$/m.test(s.text.trim())) p('headings', `section "${s.heading}" says "None:" without a reason`);
  const example = secs.find((s) => s.heading === 'Worked example');
  if (full && example) {
    if (fm.tier === 'runnable' && !new RegExp(`examples/${String(fm.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`).test(example.text)) p('worked-example', `a runnable skill links examples/${fm.id}/`);
    if (fm.tier === 'knowledge-only' && !/^None: \S/.test(example.text.trim())) p('worked-example', 'a knowledge-only skill says "None: <why there is no example>"');
  }
  const sourcesSec = secs.find((s) => s.heading === 'Sources');
  const bodyWithoutSources = secs.length ? body.slice(0, body.lastIndexOf('## Sources') >= 0 ? body.lastIndexOf('## Sources') : body.length) : body;
  if (full) {
    const n = words(bodyWithoutSources);
    if (n < MIN_WORDS || n > MAX_WORDS) p('words', `${n} body words without Sources (${MIN_WORDS} to ${MAX_WORDS})`);
  }

  // Sources and markers.
  const sourceIds = new Map();
  for (const line of (sourcesSec?.text ?? '').split('\n')) {
    const m = /^- \[(S\d+)\] (.*)$/.exec(line.trim());
    if (!m) continue;
    if (sourceIds.has(m[1])) p('sources', `source ${m[1]} is listed twice`);
    sourceIds.set(m[1], m[2]);
    if (!/https?:\/\/\S+/.test(m[2])) p('sources', `source ${m[1]} has no URL`);
    if (!/\b(version|accessed \d{4}-\d{2}-\d{2})/i.test(m[2])) p('sources', `source ${m[1]} has no version or access date`);
    if (!/\bLicence: \S/.test(m[2])) p('sources', `source ${m[1]} has no "Licence: ..."`);
  }
  for (const m of bodyWithoutSources.matchAll(/\[(S\d+)\]/g)) if (!sourceIds.has(m[1])) p('sources', `marker [${m[1]}] does not resolve to the Sources list`);

  // Voice, over the whole file (front matter included).
  const lines = text.split('\n');
  const scan = (code, test, why) => lines.forEach((l, i) => { if (test(l)) p(code, `line ${i + 1}: ${why}`); });
  scan('needs-source', (l) => /\[NEEDS SOURCE\]/i.test(l), '[NEEDS SOURCE] blocks merge');
  scan('dashes', (l) => /[\u2013\u2014]/.test(l), 'an em or en dash');
  scan('expert', (l) => /\bexperts?\b/i.test(l), '"expert"');
  for (const phrase of list(ctx.neverPhrases)) scan('never-list', (l) => l.toLowerCase().includes(phrase.toLowerCase()), `"${phrase}" is on the Never list`);
  scan('company-claim', (l) => CLAIM_PATTERNS.some((re) => re.test(l)), 'company-claim voice');
  scan('currency', (l) => CURRENCY_PATTERNS.some((re) => re.test(l)), 'a currency amount');
  scan('instruction', (l) => INSTRUCTION_PATTERNS.some((re) => re.test(l)), 'text telling an agent to change its permissions, escalation or a review');

  if (!full) return problems;

  // Roles, unit, ids, dates, evals, review rule.
  const folder = file.split('/')[1];
  if (fm.unit !== folder || fm.owners?.unit !== fm.unit) p('unit', `folder "${folder}", unit "${fm.unit}" and owners.unit "${fm.owners?.unit}" must be the same`);
  if (!ctx.activeUnits.has(fm.unit)) p('unit', `unit "${fm.unit}" is not a key-1 team in ${MAP_PATH} (an active unit; a planned unit owns no skill)`);
  const heldBy = list(fm.held_by);
  if (heldBy.length === 0) p('held-by', 'held_by is empty: a skill no role holds');
  for (const r of heldBy) if (!ctx.activeOccupants.has(r)) p('held-by', `held_by "${r}" is not a lead or member of a team in ${MAP_PATH}`);
  if (fm.owners) {
    for (const k of ['writer', 'checker']) if (!ctx.activeOccupants.has(fm.owners[k])) p('owners', `owners.${k} "${fm.owners[k]}" is not a lead or member of a team in ${MAP_PATH}`);
    if (fm.owners.writer === fm.owners.checker) p('owners', 'the writer and the checker are different roles');
  }
  const name = file.split('/').pop().replace(/\.md$/, '');
  if (typeof fm.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.id)) p('ids', `id "${fm.id}" must be lower-case words joined by hyphens`);
  else {
    if (fm.id !== name) p('ids', `id "${fm.id}" differs from the file name "${name}"`);
    if (typeof fm.unit === 'string' && `-${fm.id}-`.includes(`-${fm.unit}-`)) p('ids', `id "${fm.id}" contains the unit "${fm.unit}"; ids never encode the unit`);
  }
  if (isDate(fm.as_of) && isDate(fm.review_by) && fm.volatility in VOLATILITY_MONTHS) {
    if (fm.as_of > ctx.today) p('review-by', `as_of ${fm.as_of} is in the future`);
    const limit = addMonths(fm.as_of, VOLATILITY_MONTHS[fm.volatility]);
    if (!(fm.review_by > fm.as_of) || fm.review_by > limit) p('review-by', `review_by ${fm.review_by} must be after as_of and at most ${limit} (${fm.volatility}: ${VOLATILITY_MONTHS[fm.volatility]} months)`);
  } else p('review-by', 'as_of and review_by must be dates YYYY-MM-DD, with a valid volatility');
  if (fm.tier === 'runnable' && list(fm.eval_cases).length === 0) p('eval-cases', 'a runnable skill lists at least one eval case');
  const ruleGlob = `skills/${folder}/**`;
  const rules = list(ctx.reviewTeams?.rules).filter((r) => list(r.globs).includes(ruleGlob));
  if (!rules.some((r) => list(r.teams).length === 1 && r.teams[0] === folder)) p('review-rule', `${MAP_PATH} needs a rule "${ruleGlob}" with teams [${folder}]`);
  return problems;
}

// Checks across files: unique ids and prerequisites that exist.
export function checkAll(entries, ctx) {
  const problems = [];
  const ids = new Map();
  for (const { file, text } of entries) {
    problems.push(...checkSkill(file, text, { ...ctx, template: file === TEMPLATE_PATH }));
    if (file === TEMPLATE_PATH) continue;
    const id = splitFile(text).front?.id;
    if (typeof id !== 'string') continue;
    if (ids.has(id)) problems.push(`ids: ${file}: id "${id}" is also used by ${ids.get(id)}`);
    else ids.set(id, file);
  }
  for (const { file, text } of entries) {
    if (file === TEMPLATE_PATH) continue;
    for (const pre of list(splitFile(text).front?.prerequisites)) if (!ids.has(pre)) problems.push(`ids: ${file}: prerequisite "${pre}" is not a skill id`);
  }
  return problems;
}

// The skill files among tracked paths: skills/<unit>/<id>.md and the template.
export const skillFiles = (files) => files.filter((f) => f === TEMPLATE_PATH || /^skills\/[^/]+\/[^/]+\.md$/.test(f));

// Active units and roles come from the review teams: today every active unit
// is a review team, and the org chart's validator (when it is on main)
// asserts that its active key-1 units equal these teams, leads and members.
// Switching this to read agents/org-chart.yml changes only this function.
export function repositoryContext(read) {
  const reviewTeams = parseYaml(read(MAP_PATH));
  const teams = Array.isArray(reviewTeams.teams) ? reviewTeams.teams : [];
  return {
    neverPhrases: neverList(read(POSITIONING_PATH)),
    activeOccupants: new Set(teams.flatMap((t) => [t.lead, ...list(t.members)])),
    activeUnits: new Set(teams.filter((t) => t.key === 1).map((t) => t.id)),
    reviewTeams,
    today: new Date().toISOString().slice(0, 10),
  };
}

function main() {
  let entries, ctx;
  try {
    const read = (path) => readFileSync(path, 'utf8');
    const files = execFileSync('git', ['ls-files', '-z', SKILLS_DIR], { encoding: 'utf8' }).split('\0').filter(Boolean);
    entries = skillFiles(files).map((file) => ({ file, text: read(file) }));
    ctx = repositoryContext(read);
  } catch (e) {
    console.error(`skills: ${e.message}`);
    return 2;
  }
  const problems = checkAll(entries, ctx);
  console.log(`${entries.length} file(s) checked (${entries.filter((e) => e.file !== TEMPLATE_PATH).length} skill(s), template ${entries.some((e) => e.file === TEMPLATE_PATH) ? 'present' : 'missing'}).`);
  if (!entries.some((e) => e.file === TEMPLATE_PATH)) problems.push(`front-matter: ${TEMPLATE_PATH} is missing`);
  if (problems.length) {
    console.error(`skills: ${problems.length} problem(s):`);
    for (const m of problems) console.error(`  - ${m}`);
    return 1;
  }
  console.log('skills: every check passed.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
