// Tests for key derivation in shadow mode (derive.mjs) on fixture charts.
// Run: node --test .github/scripts/pr-review/derive.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKeys, shadowNote } from './derive.mjs';

// founder (human)
//   orchestrator (agent apex)
//     chief-eng
//       vp-web: head-web (deputy ic-fe), head-cms, head-mobile (planned)
//       vp-data: head-data
//       vp-plat (planned): head-ci, head-cd
//       head-sec
//     chief-product: head-design, head-legal (no deputy)
const P = (id, layer, kind, reports_to, extra = {}) => ({ id, title: id, layer, kind, holder: 'agent', occupant: `${id}-agent`, status: 'active', reports_to, ...extra });
const CHART = {
  positions: [
    { id: 'founder', title: 'Founder', layer: 0, kind: 'manager', holder: 'human', status: 'active' },
    P('orchestrator', 1, 'manager', 'founder', { occupant: 'orchestrator' }),
    P('chief-eng', 2, 'manager', 'orchestrator'),
    P('chief-product', 2, 'manager', 'orchestrator'),
    P('vp-web', 3, 'manager', 'chief-eng'),
    P('vp-data', 3, 'manager', 'chief-eng'),
    P('vp-plat', 3, 'manager', 'chief-eng', { status: 'planned', occupant: undefined }),
    P('head-web', 4, 'manager', 'vp-web', { deputy: 'ic-fe' }),
    P('head-cms', 4, 'manager', 'vp-web'),
    P('head-mobile', 4, 'manager', 'vp-web', { status: 'planned', occupant: undefined }),
    P('head-data', 4, 'manager', 'vp-data'),
    P('head-ci', 4, 'manager', 'vp-plat'),
    P('head-cd', 4, 'manager', 'vp-plat'),
    P('head-sec', 4, 'manager', 'chief-eng'),
    P('head-design', 4, 'manager', 'chief-product', { deputy: 'ic-ui' }),
    P('head-legal', 4, 'manager', 'chief-product', { deputy: 'ic-counsel' }),
    P('ic-fe', 6, 'ic', 'head-web'),
    P('ic-ui', 6, 'ic', 'head-design'),
    P('ic-counsel', 6, 'ic', 'head-legal'),
  ],
  units: [
    ['web', 'head-web'], ['cms', 'head-cms'], ['mobile', 'head-mobile'], ['data', 'head-data'], ['ci', 'head-ci'], ['cd', 'head-cd'],
    ['security', 'head-sec'], ['design', 'head-design'], ['legal', 'head-legal'], ['eng-office', 'chief-eng'],
  ].map(([id, head]) => ({ id, name: id, head, status: 'active', key: 1 })),
};
const k2 = (teams, more = {}) => deriveKeys(CHART, { teams, files: ['os/src/x.ts'], ...more }, { noDeputyUnits: ['legal'] });

test('one department: key 2 is the head\'s manager', () => {
  const d = k2(['web']);
  assert.ok(d.ok);
  assert.deepEqual(d.key1.map((k) => k.position), ['head-web']);
  assert.equal(d.key2.position, 'vp-web');
});

test('siblings under one VP: the VP', () => assert.equal(k2(['web', 'cms']).key2.position, 'vp-web'));
test('across VPs: the chief', () => assert.equal(k2(['web', 'data']).key2.position, 'chief-eng'));
test('across chiefs: the agent apex', () => assert.equal(k2(['web', 'design']).key2.position, 'orchestrator'));

test('vacant head: key 1 rolls up to the nearest active manager, key 2 is above it', () => {
  const d = k2(['mobile']);
  assert.equal(d.key1[0].position, 'vp-web');
  assert.equal(d.key1[0].rolledUp, true);
  assert.equal(d.key2.position, 'chief-eng');
  assert.match(shadowNote(d, 'orchestrator'), /head vacant, rolled up/);
});

test('vacant key 2: a planned VP is skipped, key 2 rolls up', () => assert.equal(k2(['ci', 'cd']).key2.position, 'chief-eng'));

test('key 2 is never a key-1 holder: a chief holding key 1 sends key 2 above it', () => {
  const d = k2(['eng-office', 'web']);
  assert.deepEqual(d.key1.map((k) => k.position), ['chief-eng', 'head-web']);
  assert.equal(d.key2.position, 'orchestrator');
});

test('the line never makes the human founder key 2: the agent apex holds it', () => {
  const d = k2(['eng-office']);
  assert.equal(d.key2.position, 'orchestrator');
  assert.equal(k2(['web']).key2.deputy.position, 'chief-eng', 'key 2 deputy: the next active manager up');
  assert.equal(d.key2.deputy, null, 'never the founder');
});

test('apex floor: founder classes A and B and control-plane paths give the apex key 2; other classes do not', () => {
  for (const more of [{ founderClasses: ['A'] }, { founderClasses: ['B'] }, { files: ['.github/workflows/x.yml'] }, { files: ['agents/x/agent.md'] }, { files: ['.claude/settings.json'] }, { files: ['AGENTS.md'] }, { files: ['CLAUDE.md'] }]) {
    const d = k2(['web'], more);
    assert.equal(d.key2.position, 'orchestrator', JSON.stringify(more));
    assert.match(d.reason, /apex floor/);
  }
  assert.equal(k2(['web'], { founderClasses: ['C'] }).key2.position, 'vp-web');
});

test('deputies come from the chart; the legal unit has none', () => {
  assert.equal(k2(['web']).key1[0].deputy.position, 'ic-fe');
  assert.equal(k2(['legal']).key1[0].deputy, null);
  assert.equal(k2(['data']).key1[0].deputy, null, 'no deputy named');
});

test('problems are returned, never thrown: no chart, unknown team, no team', () => {
  assert.equal(deriveKeys(null, { teams: ['web'] }).ok, false);
  assert.match(k2(['nope']).error, /not a unit/);
  assert.match(k2([]).error, /no owning team/);
  assert.match(shadowNote(k2(['nope']), 'orchestrator'), /not available[\s\S]*posting is unchanged: orchestrator holds key 2/i);
});

test('shadowNote says whether the derived key 2 matches today\'s and that posting is unchanged', () => {
  const same = deriveKeys(CHART, { teams: ['web', 'design'] });
  assert.match(shadowNote(same, 'orchestrator'), /That is the same as today's key 2 \(orchestrator\); posting is unchanged/);
  assert.match(shadowNote(k2(['web']), 'orchestrator'), /vp-web-agent[\s\S]*That is not today's key 2/);
});
