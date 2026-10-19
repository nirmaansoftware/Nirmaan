// Tests for examples.mjs and the Examples workflow.
// Run: node --test .github/scripts/examples.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleIds, plan, select, runExample, cleanEnv } from './examples.mjs';
import { parseYaml, contentHits } from './review-teams.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HASH = `--hash=sha256:${'a'.repeat(64)}`;

function nodeExample(root, id, testBody) {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: id, version: '1.0.0', private: true, scripts: { test: 'node --test' } }, null, 2));
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ name: id, version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: id, version: '1.0.0' } } }, null, 2));
  writeFileSync(join(dir, 'example.test.mjs'), `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('example', () => { ${testBody} });\n`);
  return { dir, files: ['package.json', 'package-lock.json', 'example.test.mjs'] };
}

test('ids: example folders from paths, without the README', () => {
  assert.deepEqual(exampleIds(['examples/README.md', 'examples/rag-eval/package.json', 'examples/rag-eval/a/b.js', 'examples/form-validation/x.py', 'skills/README.md']), ['form-validation', 'rag-eval']);
});

test('plan: each example needs its own lockfile; Python requirements are pinned by hash', () => {
  assert.equal(plan(['package.json', 'package-lock.json']).kind, 'node');
  assert.deepEqual(plan(['package.json', 'package-lock.json']).commands[0], ['npm', 'ci', '--ignore-scripts']);
  assert.match(plan(['package.json']).problem, /package-lock\.json/);
  assert.equal(plan(['requirements.txt'], `pytest==8.3.3 ${HASH}\n`).kind, 'python');
  assert.equal(plan(['requirements.txt'], `pytest==8.3.3 \\\n    ${HASH}\n`).kind, 'python');
  assert.match(plan(['requirements.txt'], 'pytest==8.3.3\n').problem, /pinned with --hash/);
  assert.match(plan(['requirements.txt'], '# nothing\n').problem, /empty/);
  assert.match(plan(['main.go']).problem, /no package\.json or requirements\.txt/);
});

test('run: a sample example passes and a broken one fails, with no tokens in its environment', () => {
  const root = mkdtempSync(join(tmpdir(), 'examples-test-'));
  try {
    const ok = nodeExample(root, 'good', 'assert.equal(1 + 1, 2);');
    const bad = nodeExample(root, 'broken', 'assert.equal(1 + 1, 3);');
    const env = cleanEnv({ PATH: process.env.PATH, HOME: root, GITHUB_TOKEN: 'x', ANTHROPIC_API_KEY: 'y' });
    assert.deepEqual(Object.keys(env).sort(), ['CI', 'HOME', 'PATH']);
    assert.equal(runExample(ok.dir, ok.files, { env }).status, 'pass');
    const r = runExample(bad.dir, bad.files, { env });
    assert.equal(r.status, 'fail');
    assert.match(r.detail, /npm test --ignore-scripts` exited 1/);
    assert.equal(runExample(ok.dir, ['package.json'], { env }).status, 'fail', 'no lockfile');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('select: on a PR only changed examples run; the rest are skipped but still listed', () => {
  assert.deepEqual(select(['a', 'b', 'c'], ['b'], 'changed'), [{ id: 'a', run: false }, { id: 'b', run: true }, { id: 'c', run: false }]);
  assert.deepEqual(select(['a', 'b'], [], 'all').map((x) => x.run), [true, true]);
});

test('workflow: always reports, free runner only, no secrets, pinned actions, read-only token', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/examples.yml'), 'utf8');
  const map = parseYaml(readFileSync(join(ROOT, '.github/review-teams.yml'), 'utf8'));
  const hits = text.split('\n').flatMap((l) => contentHits(map, '.github/workflows/examples.yml', l));
  assert.ok(!hits.includes('new-spending'), 'the new-spending rule finds no non-free runner or paid plan');
  assert.ok(!hits.includes('deploy-switch'));
  assert.doesNotMatch(text, /secrets\./);
  assert.doesNotMatch(text, /^\s+paths(-ignore)?:/m, 'no path filter, so the job always reports');
  assert.doesNotMatch(text, /pull_request_target/);
  assert.match(text, /^permissions:\n {2}contents: read$/m);
  for (const m of text.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${m[1]} is pinned by SHA`);
  assert.match(text, /runs-on: ubuntu-latest/);
  assert.match(text, /timeout-minutes: \d+/);
});
