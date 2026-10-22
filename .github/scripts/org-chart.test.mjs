// Tests for org-chart.mjs: one fixture that must fail for each check, the
// real chart against the repository, and the README drift test.
// Run: node --test .github/scripts/org-chart.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './review-teams.mjs';
import {
  checkChart, teamTable, readmeTable, writeReadmeTable, repositoryContext, constList, roleLabels,
  reviewedBy, memberSentence, CHART_PATH, README_PATH, TABLE_START, TABLE_END,
} from './org-chart.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------- fixture

// A small valid chart: founder, apex, one staff role, an interim unit A whose
// members move to a planned head T, and two active units B and C.
function fixture() {
  const pos = (id, layer, kind, extra = {}) => ({ id, title: extra.title ?? `Title ${id}`, layer, kind, holder: 'agent', status: 'active', ...extra });
  const ics = (unit, head, extra = {}) => [1, 2, 3].map((n) => pos(`ic-${unit}${n}`, 6, 'ic', { occupant: `m-${unit}${n}`, reports_to: head, ...extra }));
  const chart = {
    version: 1,
    legal_entity: 'undetermined',
    positions: [
      { id: 'founder', title: 'Founder', layer: 0, kind: 'manager', holder: 'human', status: 'active' },
      pos('apex', 1, 'manager', { title: 'Apex', occupant: 'apex', reports_to: 'founder' }),
      pos('staff-x', 2, 'staff', { title: 'Staff X', occupant: 'staffer', reports_to: 'apex' }),
      pos('head-a', 4, 'manager', { title: 'Head of A (interim)', occupant: 'lead-a', reports_to: 'apex', interim: true, deputy: 'ic-a1' }),
      ...ics('a', 'head-a', { target_reports_to: 'head-t' }),
      pos('head-b', 4, 'manager', { title: 'Head of B', occupant: 'lead-b', reports_to: 'apex', deputy: 'ic-b1' }),
      ...ics('b', 'head-b'),
      pos('head-c', 4, 'manager', { title: 'Head of C', occupant: 'lead-c', reports_to: 'apex', deputy: 'ic-c1' }),
      ...ics('c', 'head-c'),
      pos('head-t', 4, 'manager', { title: 'Head of T', status: 'planned', reports_to: 'apex' }),
    ],
    units: [
      { id: 'a', name: 'A', head: 'head-a', status: 'active', interim: true, key: 1, members: ['ic-a1', 'ic-a2', 'ic-a3'] },
      { id: 'b', name: 'B', head: 'head-b', status: 'active', key: 1, members: ['ic-b1', 'ic-b2', 'ic-b3'] },
      { id: 'c', name: 'C', head: 'head-c', status: 'active', key: 1, members: ['ic-c1', 'ic-c2', 'ic-c3'] },
      { id: 't', name: 'T', head: 'head-t', status: 'planned', members: ['ic-a1', 'ic-a2', 'ic-a3'] },
    ],
    stages: [
      { id: 's-lead', kind: 'lead', statuses: ['NEW', 'WON'], owner: 'b', client_voice: 'b', target_owner: 't' },
      { id: 's-project', kind: 'project', statuses: ['LEAD', 'BUILD'], owner: 'a', client_voice: 'b' },
    ],
    exceptions: [],
  };
  const reviewTeams = {
    teams: [
      { id: 'exec', name: 'Exec', lead: 'apex', key: 2, members: [] },
      { id: 'a', name: 'A', lead: 'lead-a', key: 1, members: ['m-a1', 'm-a2', 'm-a3'] },
      { id: 'b', name: 'B', lead: 'lead-b', key: 1, members: ['m-b1', 'm-b2', 'm-b3'] },
      { id: 'c', name: 'C', lead: 'lead-c', key: 1, members: ['m-c1', 'm-c2', 'm-c3'] },
    ],
    no_key_roles: ['m-c3'],
    catch_all: { team: 'a' },
    rules: [{ id: 'r1', globs: ['x/**'], teams: ['a'], checklists: ['m-a1'] }],
    named_files: [{ id: 'n1', paths: ['y'], teams: ['a', 'b'] }],
    content_rules: [{ id: 'c1', adds_teams: ['c'], checklists: ['lead-c'] }],
  };
  const slugs = chart.positions.map((p) => p.occupant).filter(Boolean);
  const specs = new Map(slugs.map((s) => [s, '---\nslug: x\nreviewed_by: human\n---\n# Spec\n']));
  specs.set('m-a1', '---\nslug: m-a1\nreviewed_by: lead-a, human\n---\n# Spec\n\nI am a member of A in [`.github/review-teams.yml`](../../.github/review-teams.yml); I hold no key.\n');
  const ctx = {
    specs, reviewTeams, osRoleLabels: ['Founder / Admin', 'CTO', 'Project manager'],
    leadStatuses: ['NEW', 'WON'], projectStages: ['LEAD', 'BUILD'], today: '2026-10-20', readme: null,
  };
  const regen = () => { ctx.readme = `# Agents\n\n${TABLE_START}\n${teamTable(chart, reviewTeams)}\n${TABLE_END}\n`; };
  regen();
  return { chart, ctx, regen, at: (id) => chart.positions.find((p) => p.id === id), unit: (id) => chart.units.find((u) => u.id === id), team: (id) => reviewTeams.teams.find((t) => t.id === id) };
}

const codes = (problems) => [...new Set(problems.map((x) => x.split(':')[0]))].sort();
function mustFail(code, mutate) {
  const f = fixture();
  mutate(f);
  const problems = checkChart(f.chart, f.ctx);
  assert.ok(codes(problems).includes(code), `expected a "${code}" problem, got:\n${problems.join('\n') || '(none)'}`);
  return problems;
}

test('fixture: the valid chart passes every check', () => {
  const { chart, ctx } = fixture();
  assert.deepEqual(checkChart(chart, ctx), []);
});

// ---------------------------------------------------------------- one failing fixture per check

test('schema: duplicate ids and bad values fail', () => {
  mustFail('schema', (f) => f.chart.positions.push({ ...f.at('ic-b1') }));
  mustFail('schema', (f) => { f.at('ic-b1').kind = 'boss'; });
  mustFail('schema', (f) => { f.at('head-t').occupant = 'm-b1'; });
  mustFail('schema', (f) => { delete f.at('ic-b2').occupant; });
});

test('legal-entity: the field is required', () => {
  mustFail('legal-entity', (f) => { delete f.chart.legal_entity; });
});

test('root: one root, and it is the founder', () => {
  mustFail('root', (f) => { delete f.at('apex').reports_to; });
  mustFail('root', (f) => { f.chart.positions[0].holder = 'agent'; });
});

test('reports-to: an unknown manager, or an active position under a planned one, fails', () => {
  mustFail('reports-to', (f) => { f.at('ic-b1').reports_to = 'nobody'; });
  mustFail('reports-to', (f) => { f.at('ic-b1').reports_to = 'head-t'; });
  mustFail('reports-to', (f) => { f.at('ic-b1').target_reports_to = 'head-a'; });
});

test('cycle: a loop in the line fails', () => {
  mustFail('cycle', (f) => { f.at('head-b').reports_to = 'head-c'; f.at('head-c').reports_to = 'head-b'; });
});

test('depth: more than 6 layers below the founder fails', () => {
  mustFail('depth', (f) => {
    let parent = 'apex';
    for (let i = 2; i <= 7; i++) { f.chart.positions.push({ id: `d${i}`, title: `D${i}`, layer: i, kind: 'manager', holder: 'agent', status: 'planned', reports_to: parent }); parent = `d${i}`; }
  });
});

test('layer: a report not strictly below its manager fails', () => {
  mustFail('layer', (f) => { f.at('ic-b1').layer = 4; });
});

test('no-reports: a staff or ic position with reports fails', () => {
  mustFail('no-reports', (f) => { f.chart.positions.push({ id: 'under-staff', title: 'U', layer: 6, kind: 'ic', holder: 'agent', status: 'planned', reports_to: 'staff-x' }); });
});

test('staff-key: a staff position holding a key fails', () => {
  mustFail('staff-key', (f) => { f.team('b').lead = 'staffer'; });
});

test('span: under 3 line reports or over 8 in all, with no exception, fails', () => {
  mustFail('span', (f) => { f.chart.positions = f.chart.positions.filter((p) => p.id !== 'ic-c3'); f.unit('c').members.pop(); f.team('c').members.pop(); f.ctx.specs.delete('m-c3'); });
  mustFail('span', (f) => {
    for (let i = 4; i <= 9; i++) {
      f.chart.positions.push({ id: `ic-c${i}`, title: `C${i}`, layer: 6, kind: 'ic', holder: 'agent', status: 'active', occupant: `m-c${i}`, reports_to: 'head-c' });
      f.unit('c').members.push(`ic-c${i}`); f.team('c').members.push(`m-c${i}`); f.ctx.specs.set(`m-c${i}`, '# Spec\n');
    }
  });
});

test('target-span: a target manager with under 3 reports fails', () => {
  mustFail('target-span', (f) => { f.at('ic-a3').target_reports_to = 'head-b'; });
});

test('exception: malformed exceptions fail; a span exception excuses a short span', () => {
  mustFail('exception', (f) => { f.chart.exceptions.push({ position: 'head-b', rule: 'span', reason: 'x', review_by: 'soon' }); });
  mustFail('exception', (f) => { f.chart.exceptions.push({ position: 'nobody', rule: 'span', reason: 'x', review_by: '2027-01-01' }); });
  const f = fixture();
  f.chart.positions = f.chart.positions.filter((p) => p.id !== 'ic-c3');
  f.unit('c').members.pop(); f.team('c').members.pop(); f.ctx.specs.delete('m-c3');
  f.chart.exceptions.push({ position: 'head-c', rule: 'span', reason: 'two members until a hire', review_by: '2027-01-01' });
  f.regen();
  assert.deepEqual(checkChart(f.chart, f.ctx), []);
});

test('exception-expired: an exception past its review_by date fails', () => {
  mustFail('exception-expired', (f) => {
    f.chart.positions = f.chart.positions.filter((p) => p.id !== 'ic-c3');
    f.unit('c').members.pop(); f.team('c').members.pop(); f.ctx.specs.delete('m-c3');
    f.chart.exceptions.push({ position: 'head-c', rule: 'span', reason: 'two members until a hire', review_by: '2026-10-19' });
  });
});

test('exception-unused: an exception that excuses nothing fails', () => {
  mustFail('exception-unused', (f) => { f.chart.exceptions.push({ position: 'head-b', rule: 'span', reason: 'x', review_by: '2027-01-01' }); });
});

test('spec-position: a spec with no position, or with two, fails', () => {
  mustFail('spec-position', (f) => { f.ctx.specs.set('ghost', '# Ghost\n'); });
  mustFail('spec-position', (f) => { f.at('head-t').status = 'active'; f.at('head-t').occupant = 'm-b1'; });
});

test('unplaced: an unplaced spec needs a reason, a spec, and no position', () => {
  const ok = fixture();
  ok.ctx.specs.set('proxy', '# Proxy\n');
  ok.chart.unplaced = [{ slug: 'proxy', reason: 'waits for a founder decision' }];
  assert.deepEqual(checkChart(ok.chart, ok.ctx), []);
  mustFail('spec-position', (f) => { f.ctx.specs.set('proxy', '# Proxy\n'); });
  mustFail('unplaced', (f) => { f.ctx.specs.set('proxy', '# Proxy\n'); f.chart.unplaced = [{ slug: 'proxy' }]; });
  mustFail('unplaced', (f) => { f.chart.unplaced = [{ slug: 'ghost', reason: 'x' }]; });
  mustFail('unplaced', (f) => { f.chart.unplaced = [{ slug: 'm-b1', reason: 'x' }]; });
});

test('occupant-spec: an occupant or target_occupant without a spec fails', () => {
  mustFail('occupant-spec', (f) => { f.ctx.specs.delete('m-b2'); });
  mustFail('occupant-spec', (f) => { f.at('head-t').target_occupant = 'not-hired'; });
});

test('unit-status: a unit whose status differs from its head fails', () => {
  mustFail('unit-status', (f) => { f.unit('t').status = 'active'; });
});

test('unit-members: members that differ from the positions under the head fail', () => {
  mustFail('unit-members', (f) => { f.unit('b').members.pop(); });
  mustFail('unit-members', (f) => { f.unit('t').members.pop(); });
});

test('planned-owns: a planned unit owning a path, a review team or a stage fails', () => {
  mustFail('planned-owns', (f) => { f.ctx.reviewTeams.rules[0].teams = ['t']; delete f.ctx.reviewTeams.rules[0].checklists; });
  mustFail('planned-owns', (f) => { f.chart.stages[0].owner = 't'; });
});

test('deputy: missing, outside the unit, not active, a no-key role, or deputising twice fails', () => {
  mustFail('deputy', (f) => { delete f.at('head-c').deputy; });
  mustFail('deputy', (f) => { f.at('head-b').deputy = 'ic-c2'; });
  mustFail('deputy', (f) => { f.at('head-c').deputy = 'ic-c3'; });
  mustFail('deputy', (f) => { f.at('head-t').deputy = 'ic-a1'; });
  mustFail('deputy', (f) => { f.at('head-b').deputy = 'head-c'; });
  const ok = fixture();
  delete ok.at('head-c').deputy;
  ok.chart.exceptions.push({ position: 'head-c', rule: 'deputy', reason: 'no deputy decided', review_by: '2027-01-01' });
  ok.regen();
  assert.deepEqual(checkChart(ok.chart, ok.ctx), []);
});

test('teams: review teams must equal the active key-1 units, leads equal heads', () => {
  mustFail('teams', (f) => { f.team('b').lead = 'm-b1'; });
  mustFail('teams', (f) => { f.team('b').members.pop(); });
  mustFail('teams', (f) => { f.ctx.reviewTeams.teams.push({ id: 'z', name: 'Z', lead: 'lead-b', key: 1, members: [] }); });
  mustFail('teams', (f) => { f.team('exec').lead = 'lead-a'; });
  mustFail('teams', (f) => { f.team('b').name = 'Bee'; });
});

test('checklist: a checklist role outside the entry teams fails; staff need an allowance', () => {
  mustFail('checklist', (f) => { f.ctx.reviewTeams.rules[0].checklists = ['m-b1']; });
  mustFail('checklist', (f) => { f.ctx.reviewTeams.rules[0].checklists = ['staffer']; });
  const ok = fixture();
  ok.ctx.reviewTeams.rules[0].checklists = ['staffer'];
  ok.at('staff-x').checklist_allowance = ['r1'];
  assert.deepEqual(checkChart(ok.chart, ok.ctx), []);
});

test('paths: a rule, named file, content rule or catch-all naming no active unit fails', () => {
  mustFail('paths', (f) => { f.ctx.reviewTeams.rules[0].teams = ['zzz']; delete f.ctx.reviewTeams.rules[0].checklists; });
  mustFail('paths', (f) => { f.ctx.reviewTeams.catch_all.team = 'zzz'; });
  mustFail('paths', (f) => { f.ctx.reviewTeams.content_rules[0].adds_teams = ['zzz']; delete f.ctx.reviewTeams.content_rules[0].checklists; });
});

test('stages: every status exactly once, owners active', () => {
  mustFail('stages', (f) => { f.chart.stages[0].statuses = ['NEW']; });
  mustFail('stages', (f) => { f.chart.stages[1].statuses.push('LEAD'); });
  mustFail('stages', (f) => { f.chart.stages[1].statuses.push('LAUNCH'); });
  mustFail('stages', (f) => { f.chart.stages[1].client_voice = 'nobody'; });
});

test('title: OS role labels, layer words, banned titles and the legal suffix', () => {
  mustFail('title', (f) => { f.at('apex').title = 'CTO'; });
  mustFail('title', (f) => { f.at('ic-b1').title = 'Project manager (interim)'; });
  mustFail('title', (f) => { f.at('head-b').title = 'VP B'; });
  mustFail('title', (f) => { f.at('ic-b1').title = 'Head of B1'; });
  mustFail('title', (f) => { f.at('head-b').title = 'Lead B'; });
  mustFail('title', (f) => { f.at('ic-b1').title = 'General Counsel'; });
  mustFail('title', (f) => { f.at('ic-b1').title = 'Legal Counsel'; });
});

test('plannable: only on ic and staff positions, and only a boolean', () => {
  mustFail('plannable', (f) => { f.at('head-b').plannable = false; });
  mustFail('plannable', (f) => { f.at('ic-b1').plannable = 'no'; });
});

test('reviewed-by: a reviewed_by role with no spec fails', () => {
  mustFail('reviewed-by', (f) => { f.ctx.specs.set('m-b1', '---\nreviewed_by: nobody\n---\n'); });
});

test('member-sentence: "I am a member of X" must match the chart', () => {
  mustFail('member-sentence', (f) => { f.ctx.specs.set('m-a1', f.ctx.specs.get('m-a1').replace('member of A', 'member of B')); });
});

test('readme: a hand edit of the generated table fails', () => {
  mustFail('readme', (f) => { f.ctx.readme = f.ctx.readme.replace('| B |', '| Bee |'); });
  mustFail('readme', (f) => { f.ctx.readme = '# Agents\n'; });
});

// ---------------------------------------------------------------- helpers

test('helpers: TS const lists, role labels, frontmatter and the member sentence', () => {
  assert.deepEqual(constList('export const X = [\n  "A",\n  "B",\n] as const;', 'X'), ['A', 'B']);
  assert.throws(() => constList('const Y = []', 'X'));
  assert.deepEqual(roleLabels('export const ROLE_LABELS: Record<Role, string> = {\n  FOUNDER: "Founder / Admin",\n  CTO: "CTO",\n};'), ['Founder / Admin', 'CTO']);
  assert.deepEqual(reviewedBy('---\nslug: a\nreviewed_by: b, c\n---\n'), ['b', 'c']);
  assert.equal(memberSentence('I am a member of Brand and Content in [`.github/review-teams.yml`](x)'), 'Brand and Content');
  assert.equal(memberSentence('no sentence'), null);
  const readme = `a\n${TABLE_START}\nold\n${TABLE_END}\nb\n`;
  assert.equal(readmeTable(writeReadmeTable(readme, 'new')), 'new');
});

// ---------------------------------------------------------------- the real files

function real() {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  const chart = parseYaml(read(CHART_PATH));
  return { chart, ctx: repositoryContext(read, files), files };
}

test('repository: agents/org-chart.yml passes every check against the repository', () => {
  const { chart, ctx } = real();
  assert.deepEqual(checkChart(chart, ctx), []);
  assert.equal(chart.legal_entity, 'undetermined');
});

test('repository: review-teams.yml teams equal the active key-1 units, and each lead is the head', () => {
  const { chart, ctx } = real();
  const positions = new Map(chart.positions.map((p) => [p.id, p]));
  const units = chart.units.filter((u) => u.status === 'active' && u.key === 1);
  const teams = ctx.reviewTeams.teams.filter((t) => t.key === 1);
  assert.deepEqual(teams.map((t) => t.id).sort(), units.map((u) => u.id).sort());
  for (const u of units) assert.equal(teams.find((t) => t.id === u.id).lead, positions.get(u.head).occupant, u.id);
  assert.equal(ctx.reviewTeams.teams.find((t) => t.key === 2).lead, 'orchestrator');
});

test('repository: the README team table drifts on a hand edit', () => {
  const { chart, ctx } = real();
  const edited = ctx.readme.replace('| Design |', '| Design team |');
  assert.notEqual(edited, ctx.readme);
  assert.ok(checkChart(chart, { ...ctx, readme: edited }).some((x) => x.startsWith('readme:')));
});

test('repository: every agent spec holds exactly one position, except the unplaced ones', () => {
  const { chart, files } = real();
  const unplaced = (chart.unplaced ?? []).map((u) => u.slug);
  const slugs = files.map((f) => /^agents\/([^/]+)\/agent\.md$/.exec(f)?.[1]).filter(Boolean).filter((s) => !unplaced.includes(s)).sort();
  const occupants = chart.positions.map((p) => p.occupant).filter(Boolean).sort();
  assert.deepEqual(occupants, slugs);
  assert.deepEqual(unplaced, ['founder-proxy']);
});

test('repository: README_PATH and CHART_PATH are tracked', () => {
  const { files } = real();
  assert.ok(files.includes(README_PATH));
  assert.ok(files.includes(CHART_PATH));
});

test('repository: the key-1 deputy derived for Platform and Quality is appsec-engineer (hire H1, decision record D2.2)', async () => {
  const { deriveKeys } = await import('./pr-review/derive.mjs');
  const { chart } = real();
  const d = deriveKeys(chart, { teams: ['platform-quality'] });
  assert.ok(d.ok, d.error);
  assert.equal(d.key1[0].occupant, 'security-engineer');
  assert.equal(d.key1[0].deputy?.occupant, 'appsec-engineer');
});
