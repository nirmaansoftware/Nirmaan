// Tests for review-teams.mjs (the review-teams coverage test and the check
// that CODEOWNERS stays absent). Run: node --test .github/scripts/review-teams.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseYaml, globToRegExp, globMatch, owners, contentHits, checkMap,
  checkNoCodeowners, MAP_PATH, CODEOWNERS_PATH,
} from './review-teams.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------- YAML subset

test('yaml: mappings, lists, lists of mappings, flow lists, scalars, comments', () => {
  const doc = parseYaml([
    '# comment',
    'version: 1',
    'flag: true',
    'empty: []',
    'teams:',
    '  - id: a # trailing comment',
    '    members: [x, "y", \'z\']',
    '    nested:',
    '      - "**"',
    '      - "a # not a comment"',
    '  - id: b',
    'map:',
    '  key: "\\\\b(price)\\\\b"',
    "  quote: 'it''s'",
  ].join('\n'));
  assert.deepEqual(doc, {
    version: 1, flag: true, empty: [],
    teams: [{ id: 'a', members: ['x', 'y', 'z'], nested: ['**', 'a # not a comment'] }, { id: 'b' }],
    map: { key: '\\b(price)\\b', quote: "it's" },
  });
});

test('yaml: rejects what other parsers would read differently', () => {
  for (const bad of [
    'a: *alias', 'a: &anchor x', 'a: |', 'a: {b: 1}', 'a: @x', 'a: on', 'a: no', 'a: 1.5',
    'a: x: y', 'a:\n\tb: 1', 'a: 1\na: 2', '---\na: 1', 'a:', 'a: [b, [c]]', 'a: "unclosed',
    '  a: 1', 'a:\n  - x\n   y: 1',
  ]) {
    assert.throws(() => parseYaml(bad), undefined, bad);
  }
});

// ---------------------------------------------------------------- globs

test('globs: *, **, ?, braces', () => {
  assert.ok(globMatch('website/src/*.njk', 'website/src/index.njk'));
  assert.ok(!globMatch('website/src/*.njk', 'website/src/_includes/base.njk'));
  assert.ok(globMatch('.github/**', '.github/workflows/os.yml'));
  assert.ok(globMatch('**', 'a/b/c'));
  assert.ok(globMatch('docs/**/x.md', 'docs/x.md'));
  assert.ok(globMatch('docs/**/x.md', 'docs/a/b/x.md'));
  assert.ok(globMatch('docs/company/{mission,vision}.md', 'docs/company/vision.md'));
  assert.ok(!globMatch('docs/company/{mission,vision}.md', 'docs/company/positioning.md'));
  assert.ok(globMatch('a?.md', 'ab.md'));
  assert.ok(!globMatch('AGENTS.md', 'os/AGENTS.md'), 'globs are anchored at the root');
  assert.ok(!globMatch('a.md', 'aXmd'), 'dots are literal');
  assert.throws(() => globToRegExp('a**/b'));
  assert.throws(() => globToRegExp('{a,b'));
});

// ---------------------------------------------------------------- fixture map

const FILES = [
  'agents/lead-a/agent.md', 'agents/lead-b/agent.md', 'agents/mem-a/agent.md', 'agents/orch/agent.md',
  'src/a.js', 'src/b.js', 'docs/x.md', 'loose.txt',
  'site/src/page.njk', 'site/src/static/s.css', 'site/public/page.html', 'site/public/s.css',
  'secret/gate.ts',
];
const TEXT = { 'docs/x.md': 'Starter from ₹25,000\n', 'src/a.js': 'nothing here\n' };

function fixture() {
  return parseYaml(`
teams:
  - id: exec
    name: Exec
    lead: orch
    members: []
  - id: ta
    name: Team A
    lead: lead-a
    members: [mem-a]
  - id: tb
    name: Team B
    lead: lead-b
    members: []
catch_all:
  team: ta
  allowlist: ["loose.txt"]
rules:
  - id: code
    globs: ["src/**", "agents/**"]
    exclude: ["src/b.js"]
    teams: [ta]
    checklists: [mem-a]
  - id: docs
    globs: ["docs/**", "src/b.js"]
    teams: [tb]
  - id: site
    globs: ["site/src/**"]
    teams: [tb]
  - id: gate
    globs: ["secret/gate.ts"]
    teams: [ta, tb]
named_files:
  - id: shared
    paths: ["site/src/static/s.css"]
    teams: [ta, tb]
    ip_site_impact: true
generated:
  - output: "site/public/*.html"
    source: "site/src/<name>.njk"
  - output: "site/public/**"
    mirror: "site/src/static/"
founder_classes:
  - id: A
    paths: ["agents/**"]
  - id: B
    paths: ["site/src/static/s.css", "site/public/s.css"]
  - id: C
    paths: ["docs/x.md"]
  - id: D
    paths: ["site/src/page.njk", "site/public/page.html"]
  - id: E
    paths: ["src/a.js"]
  - id: F
    paths: ["secret/gate.ts"]
content_rules:
  - id: money
    adds_teams: [tb]
    founder_class: C
    patterns: ["₹\\\\s?\\\\d"]
    examples: ["₹ 5"]
    markers:
      - file: "docs/x.md"
  - id: new-page
    adds_teams: [tb]
    trigger: added_files
    applies_to: ["site/src/*.njk"]
`);
}

const run = (map, files = FILES) => checkMap(map, files, {
  roleExists: (slug) => files.includes(`agents/${slug}/agent.md`),
  readFile: (p) => TEXT[p] ?? '',
});

test('fixture: a correct map passes', () => {
  assert.deepEqual(run(fixture()), []);
});

test('owners: union of rules, named files, generated source, catch-all', () => {
  const map = fixture();
  const tracked = new Set(FILES);
  assert.deepEqual(owners(map, 'src/a.js', tracked).teams, ['ta']);
  assert.deepEqual(owners(map, 'src/b.js', tracked).teams, ['tb'], 'exclude removes a file from one rule');
  assert.deepEqual(owners(map, 'secret/gate.ts', tracked).teams.sort(), ['ta', 'tb']);
  const css = owners(map, 'site/public/s.css', tracked);
  assert.equal(css.generatedFrom, 'site/src/static/s.css');
  assert.deepEqual(css.teams.sort(), ['ta', 'tb']);
  assert.equal(css.ipSiteImpact, true);
  assert.equal(owners(map, 'site/public/page.html', tracked).generatedFrom, 'site/src/page.njk');
  const loose = owners(map, 'loose.txt', tracked);
  assert.deepEqual([loose.teams, loose.viaCatchAll], [['ta'], true]);
  assert.deepEqual(owners(map, 'agents/orch/agent.md', tracked).founder, ['A']);
});

test('content rules: patterns and added-file triggers', () => {
  const map = fixture();
  assert.deepEqual(contentHits(map, 'any.md', 'costs ₹5'), ['money']);
  assert.deepEqual(contentHits(map, 'any.md', 'costs nothing'), []);
  assert.deepEqual(contentHits(map, 'site/src/new.njk', null, { addedFile: true }), ['new-page']);
  assert.deepEqual(contentHits(map, 'docs/new.md', null, { addedFile: true }), []);
});

test('coverage: an unmapped file fails; the allowlist and catch-all are honest', () => {
  assert.match(run(fixture(), [...FILES, 'other/file.txt']).join('\n'), /other\/file\.txt: maps to no team/);
  const map = fixture();
  map.catch_all.allowlist.push('src/a.js');
  assert.match(run(map).join('\n'), /src\/a\.js: on the catch-all allowlist but matched by a rule/);
  map.catch_all.allowlist = ['nothing/**'];
  const out = run(map).join('\n');
  assert.match(out, /allowlist: "nothing\/\*\*" matches no tracked file/);
  assert.match(out, /loose\.txt: maps to no team/);
});

test('coverage: dead globs fail everywhere they can appear', () => {
  const map = fixture();
  map.rules[0].globs.push('src/gone/**');
  map.rules[0].exclude.push('src/gone.js');
  map.named_files[0].paths.push('site/src/static/gone.css');
  map.generated.unshift({ output: 'site/public/gone/*.html', source: 'site/src/gone.njk' });
  map.founder_classes[0].paths.push('gone.md');
  map.content_rules[1].applies_to.push('gone/*.njk');
  const out = run(map).join('\n');
  for (const want of [
    /rule code: "src\/gone\/\*\*" matches no tracked file/,
    /rule code exclude: "src\/gone\.js" matches no tracked file/,
    /named file shared: "site\/src\/static\/gone\.css" is not a tracked file/,
    /generated site\/public\/gone\/\*\.html: "site\/public\/gone\/\*\.html" matches no tracked file/,
    /founder class A: "gone\.md" matches no tracked file/,
    /content rule new-page applies_to: "gone\/\*\.njk" matches no tracked file/,
  ]) assert.match(out, want);
});

test('roles: every lead, member and checklist needs agents/<role>/agent.md and a team', () => {
  const map = fixture();
  map.teams[1].members.push('ghost');
  map.teams[2].lead = 'phantom';
  map.rules[1].checklists = ['mem-a'];
  map.rules[2].checklists = ['nobody'];
  const out = run(map).join('\n');
  assert.match(out, /team ta: role ghost has no agents\/ghost\/agent\.md/);
  assert.match(out, /team tb: role phantom has no agents\/phantom\/agent\.md/);
  assert.match(out, /rule docs: checklist role mem-a is not in the teams it names/);
  assert.match(out, /rule site: checklist role nobody has no agents\/nobody\/agent\.md/);
  const unknown = fixture();
  unknown.rules[0].teams = ['nope'];
  assert.match(run(unknown).join('\n'), /rule code: unknown team nope/);
});

test('generated: missing source, founder-class drift and direct rules fail', () => {
  assert.match(run(fixture(), [...FILES, 'site/public/orphan.html']).join('\n'),
    /site\/public\/orphan\.html: generated from site\/src\/orphan\.njk, which is not tracked/);
  const drift = fixture();
  drift.founder_classes[3].paths = ['site/src/page.njk'];
  assert.match(run(drift).join('\n'), /site\/public\/page\.html: founder class "" differs from its source site\/src\/page\.njk \("D"\)/);
  const direct = fixture();
  direct.rules[2].globs.push('site/public/page.html');
  assert.match(run(direct).join('\n'), /site\/public\/page\.html: generated files follow their source/);
});

test('founder classes: all of A to F', () => {
  const map = fixture();
  map.founder_classes.pop();
  const out = run(map).join('\n');
  assert.match(out, /founder class F is missing/);
});

test('content rules: bad pattern, failing example, stale marker, unknown class', () => {
  const map = fixture();
  map.content_rules[0].examples.push('five rupees');
  map.content_rules[0].markers.push({ file: 'src/a.js' });
  map.content_rules[0].founder_class = 'Z';
  map.content_rules.push({ id: 'broken', adds_teams: ['tb'], patterns: ['('], examples: ['x'] });
  map.content_rules.push({ id: 'untested', adds_teams: ['tb'], patterns: ['x'] });
  const out = run(map).join('\n');
  assert.match(out, /content rule money: example "five rupees" matches no pattern/);
  assert.match(out, /content rule money: marker src\/a\.js no longer contains a match/);
  assert.match(out, /content rule money: unknown founder class Z/);
  assert.match(out, /content rule broken: Invalid regular expression/);
  assert.match(out, /content rule untested: needs at least one example/);
});

// ---------------------------------------------------------------- CODEOWNERS

test('codeowners: none, at any of the places GitHub reads one', () => {
  assert.deepEqual(checkNoCodeowners(['a.js', '.github/review-teams.yml']), []);
  for (const p of ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']) {
    assert.match(checkNoCodeowners(['a.js', p]).join('\n'), new RegExp(`${p.replace(/\./g, '\\.')} exists: founder classes are reviewed by the Founder Proxy`));
  }
});

// ---------------------------------------------------------------- the real files

test('repository: review-teams.yml passes against git ls-files, and there is no CODEOWNERS file', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const map = parseYaml(readFileSync(join(ROOT, MAP_PATH), 'utf8'));
  const problems = checkMap(map, files, {
    roleExists: (slug) => files.includes(`agents/${slug}/agent.md`),
    readFile: (p) => readFileSync(join(ROOT, p), 'utf8'),
  });
  problems.push(...checkNoCodeowners(files));
  assert.ok(!files.includes(CODEOWNERS_PATH));
  assert.deepEqual(problems, []);
  assert.deepEqual(map.founder_classes.map((c) => c.id), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(map.catch_all.team, 'engineering');
  const shared = map.named_files.find((n) => n.ip_site_impact === true);
  assert.deepEqual(shared.paths, ['website/src/static/styles.css', 'website/src/static/site.js', 'website/src/static/hero.js']);
});

// Classification fixtures for the split OS rules (os-app, os-ai, os-lib, os)
// and the website-frontend rule, against the real map and tracked files.
function realMap() {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  return { map: parseYaml(readFileSync(join(ROOT, MAP_PATH), 'utf8')), files, tracked: new Set(files) };
}
const ruleIds = (map, file) => map.rules.filter((r) => r.globs.some((g) => globMatch(g, file)) && !(r.exclude ?? []).some((g) => globMatch(g, file))).map((r) => r.id);

test('classification: an OS screen is os-app, adds Design key 1 and runs the ux-designer and frontend-engineer checklists', () => {
  const { map, tracked } = realMap();
  for (const file of ['os/src/app/os/approvals/page.tsx', 'os/src/app/_components/ui.tsx']) {
    const o = owners(map, file, tracked);
    assert.deepEqual(ruleIds(map, file), ['os-app'], file);
    assert.deepEqual(o.teams.sort(), ['design', 'engineering'], file);
    assert.deepEqual(o.checklists.sort(), ['frontend-engineer', 'ux-designer'], file);
  }
});

test('classification: os-ai covers lib/ai, lib/agents and lib/evaluation only', () => {
  const { map, tracked } = realMap();
  for (const file of ['os/src/lib/ai/callModel.ts', 'os/src/lib/agents/runAgent.ts', 'os/src/lib/evaluation/checkers.ts']) {
    assert.deepEqual(ruleIds(map, file), ['os-ai'], file);
    assert.deepEqual(owners(map, file, tracked).teams, ['engineering'], file);
  }
});

test('classification: os-lib is the rest of lib, never the AI areas', () => {
  const { map, tracked } = realMap();
  assert.deepEqual(ruleIds(map, 'os/src/lib/leads/intake.ts'), ['os-lib']);
  assert.deepEqual(owners(map, 'os/src/lib/leads/intake.ts', tracked).teams, ['engineering']);
  // Narrower rules still add to it.
  assert.deepEqual(ruleIds(map, 'os/src/lib/finance/invoices.ts').sort(), ['os-finance', 'os-lib']);
});

test('classification: os keeps the rest of os/ (API routes, scripts, config), with no Design key', () => {
  const { map, files, tracked } = realMap();
  for (const file of ['os/src/app/api/intake/route.ts', 'os/scripts/create-user.ts', 'os/tsconfig.json']) {
    assert.deepEqual(ruleIds(map, file), ['os'], file);
    assert.deepEqual(owners(map, file, tracked).teams, ['engineering'], file);
  }
  // Every tracked OS file still has an explicit rule (no reliance on the catch-all).
  for (const f of files.filter((x) => x.startsWith('os/'))) assert.ok(ruleIds(map, f).length > 0 || (map.named_files ?? []).some((n) => n.paths.includes(f)), f);
});

test('classification: a dated record in docs/operations is a frozen decision record (Product)', () => {
  const { map, tracked } = realMap();
  const file = 'docs/operations/2026-10-20-founder-proxy-widened.md';
  assert.deepEqual(ruleIds(map, file), ['decision-records']);
  assert.deepEqual(owners(map, file, tracked).teams, ['product']);
  assert.equal(map.rules.find((r) => r.id === 'decision-records').frozen, true);
  // An undated operations doc is not caught by the dated glob.
  assert.ok(!ruleIds(map, 'docs/operations/pr-review.md').includes('decision-records'));
});

test('classification: a website page-only change runs the frontend-engineer checklist (website-frontend)', () => {
  const { map, tracked } = realMap();
  const page = owners(map, 'website/src/index.njk', tracked);
  assert.ok(ruleIds(map, 'website/src/index.njk').includes('website-frontend'));
  assert.ok(page.teams.includes('engineering'));
  assert.ok(page.checklists.includes('frontend-engineer'));
  // Its generated output follows the source.
  assert.ok(owners(map, 'website/public/index.html', tracked).checklists.includes('frontend-engineer'));
  // A page that already has three owners is excluded, so it stays at three.
  const price = owners(map, 'website/src/pricing.njk', tracked);
  assert.ok(!price.teams.includes('engineering'));
  assert.equal(price.teams.length, 3);
});

test('repository: no tracked file is owned by more than three teams (a PR with more is split, and one file cannot be)', () => {
  const { map, files, tracked } = realMap();
  const over = files.map((f) => [f, owners(map, f, tracked).teams]).filter(([, t]) => t.length > 3).map(([f, t]) => `${f}: ${t.join(', ')}`);
  assert.deepEqual(over, []);
});
