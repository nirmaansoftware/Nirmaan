// Tests for the sitemap's lastModified filter.
// Run: node --test website/scripts/last-modified.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createLastModified } = require('./last-modified');

const at = (iso) => Date.parse(iso) / 1000;
const TODAY = Date.parse('2026-10-18T09:00:00Z');

// A filter over a fake git: `times` maps a path to its commit times, or to an
// Error to throw. Records every git call and every warning.
function fake(times) {
  const calls = [];
  const warnings = [];
  const filter = createLastModified({
    git: (path) => {
      calls.push(path);
      const t = times[path];
      if (t instanceof Error) throw t;
      return t || [];
    },
    now: () => TODAY,
    warn: (msg) => warnings.push(msg),
  });
  return { filter, calls, warnings };
}

test('a page is dated by the latest commit to its template, as a UTC day', () => {
  const { filter, warnings } = fake({ 'src/a.njk': [at('2026-10-01T10:00:00Z'), at('2026-10-14T23:30:00Z'), at('2026-09-01T00:00:00Z')] });
  assert.equal(filter('src/a.njk'), '2026-10-14');
  assert.deepEqual(warnings, []);
});

test('the day is UTC, whatever the commit time zone was', () => {
  // 2026-10-15 03:00 at UTC+5:30 is 2026-10-14 21:30 UTC.
  const { filter } = fake({ 'src/a.njk': [at('2026-10-15T03:00:00+05:30')] });
  assert.equal(filter('src/a.njk'), '2026-10-14');
});

test('a paginated page takes the later of its template and src/_data', () => {
  const { filter } = fake({ 'src/plan.njk': [at('2026-10-10T12:00:00Z')], 'src/_data': [at('2026-10-17T12:00:00Z')] });
  assert.equal(filter('src/plan.njk', { data: 'pricing.packages' }), '2026-10-17');
  const { filter: f2 } = fake({ 'src/plan.njk': [at('2026-10-17T12:00:00Z')], 'src/_data': [at('2026-10-10T12:00:00Z')] });
  assert.equal(f2('src/plan.njk', { data: 'pricing.packages' }), '2026-10-17');
});

test('a page without pagination ignores src/_data', () => {
  const { filter, calls } = fake({ 'src/a.njk': [at('2026-10-10T12:00:00Z')], 'src/_data': [at('2026-10-17T12:00:00Z')] });
  assert.equal(filter('src/a.njk'), '2026-10-10');
  assert.equal(filter('src/a.njk', undefined), '2026-10-10');
  assert.deepEqual(calls, ['src/a.njk']);
});

test('a file with no commit yet gets today, with a warning', () => {
  const { filter, warnings } = fake({});
  assert.equal(filter('src/new.njk'), '2026-10-18');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /src\/new\.njk has no commit; using today/);
});

test('a failing git call gets today, with a warning naming the error', () => {
  const { filter, warnings } = fake({ 'src/a.njk': new Error('not a git repository') });
  assert.equal(filter('src/a.njk'), '2026-10-18');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /git log failed for src\/a\.njk: not a git repository/);
  assert.match(warnings[1], /has no commit; using today/);
});

test('each path runs git once', () => {
  const { filter, calls } = fake({ 'src/plan.njk': [at('2026-10-10T12:00:00Z')], 'src/_data': [at('2026-10-11T12:00:00Z')] });
  filter('src/plan.njk', {});
  filter('src/plan.njk', {});
  filter('src/care.njk', {});
  assert.deepEqual(calls, ['src/plan.njk', 'src/_data', 'src/care.njk']);
});

test('real git: author dates of non-merge commits, unchanged by a merge', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lastmod-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', TZ: 'Pacific/Kiritimati' };
  const git = (args, date) => execFileSync('git', args, {
    cwd: dir,
    env: { ...env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
    stdio: 'pipe',
  });
  git(['init', '-q', '-b', 'main']);
  mkdirSync(join(dir, 'src', '_data'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.njk'), 'a1');
  writeFileSync(join(dir, 'src', '_data', 'd.json'), '{}');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'one'], '2026-10-01T12:00:00Z');
  git(['checkout', '-q', '-b', 'side']);
  writeFileSync(join(dir, 'src', 'a.njk'), 'a2');
  git(['commit', '-q', '-am', 'two'], '2026-10-05T23:59:00Z');
  git(['checkout', '-q', 'main']);
  writeFileSync(join(dir, 'src', '_data', 'd.json'), '{"x":1}');
  git(['commit', '-q', '-am', 'three'], '2026-10-03T00:30:00Z');
  // The merge commit is later than every change and itself edits src/a.njk
  // (as a conflict resolution would); it must not date anything.
  git(['merge', '-q', '--no-ff', '--no-commit', 'side']);
  writeFileSync(join(dir, 'src', 'a.njk'), 'a2 resolved');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'merge'], '2026-10-20T12:00:00Z');

  const warnings = [];
  const filter = createLastModified({ cwd: dir, warn: (m) => warnings.push(m), now: () => TODAY });
  assert.equal(filter('src/a.njk'), '2026-10-05');
  assert.equal(filter('src/_data'), '2026-10-03');
  assert.equal(filter('src/a.njk', {}), '2026-10-05');
  assert.equal(filter('src/missing.njk'), '2026-10-18');
  assert.equal(warnings.length, 1);
});
