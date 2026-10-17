// Tests for check-migrations.mjs and secret-scan.mjs.
// Run: node --test .github/scripts/repo-checks.test.mjs
//
// Fake secrets are assembled from pieces so this file itself never contains a
// string the secret scan would flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseNameStatus, migrationProblems } from './check-migrations.mjs';
import { addedLines, scanLines, scanPaths } from './secret-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLIED = new Set(['20260921153106_init', '20260927010000_access_requests', 'migration_lock.toml']);
const M = 'os/prisma/migrations/';

test('migrations: a new folder passes; other changes outside migrations are ignored', () => {
  const entries = parseNameStatus(`A\t${M}20261020000000_new/migration.sql\nM\tos/prisma/schema.prisma\nD\tdocs/x.md\n`);
  assert.deepEqual(migrationProblems(entries, APPLIED), []);
});

test('migrations: M, D and R on an applied migration fail; so do lock changes', () => {
  const entries = parseNameStatus([
    `M\t${M}20260921153106_init/migration.sql`,
    `D\t${M}20260927010000_access_requests/migration.sql`,
    `R100\t${M}20260921153106_init/migration.sql\t${M}20261020000000_init/migration.sql`,
    `R090\tos/elsewhere.sql\t${M}20260921153106_init/extra.sql`,
    `M\t${M}migration_lock.toml`,
    `D\t${M}migration_lock.toml`,
  ].join('\n'));
  const problems = migrationProblems(entries, APPLIED);
  assert.equal(problems.length, 6);
  assert.match(problems[0], /^M .*applied migrations are history/);
});

test('migrations: adding a file to an applied folder fails; a loose file fails', () => {
  const entries = parseNameStatus(`A\t${M}20260921153106_init/fix.sql\nA\t${M}loose.sql\n`);
  const problems = migrationProblems(entries, APPLIED);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /applied migration 20260921153106_init/);
  assert.match(problems[1], /own new folder/);
});

const fake = {
  aws: 'AKIA' + 'Q'.repeat(16),
  github: 'gh' + 'p_' + 'a1B2'.repeat(9),
  anthropic: 'sk-' + 'ant-' + 'api03-' + 'x'.repeat(40),
  google: 'AI' + 'za' + 'S'.repeat(35),
  oauth: 'GOC' + 'SPX-' + 'k'.repeat(28),
  pem: '-----BEGIN ' + 'RSA PRIVATE' + ' KEY-----',
  ssh: '-----BEGIN ' + 'OPENSSH PRIVATE' + ' KEY-----',
  slack: 'xo' + 'xb-' + '1234567890-abcdef',
  stripe: 'sk' + '_live_' + 'Z'.repeat(24),
};

function diffFor(file, lines, start = 1) {
  return [
    `diff --git a/${file} b/${file}`,
    'index 0000000..1111111 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -0,0 +${start},${lines.length} @@`,
    ...lines.map((l) => `+${l}`),
  ].join('\n');
}

test('secret scan: each planted format is found with its file and line', () => {
  const values = Object.values(fake);
  const diff = diffFor('os/src/config.ts', values.map((v) => `const k = "${v}";`), 10);
  const findings = scanLines(addedLines(diff));
  assert.equal(findings.length, values.length);
  assert.equal(findings[0], 'os/src/config.ts:10: AWS access key id');
  for (const f of findings) assert.ok(!values.some((v) => f.includes(v)), 'a finding must not print the secret');
});

test('secret scan: removed and context lines are not scanned; clean lines pass', () => {
  const diff = [
    'diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1,2 +1,2 @@',
    `-const old = "${fake.aws}";`, ` // ${fake.github}`, '+const key = process.env.ANTHROPIC_API_KEY;',
    '+// sk-ant- is the prefix Anthropic keys use',
  ].join('\n');
  const lines = addedLines(diff);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => l.line), [2, 3]);
  assert.deepEqual(scanLines(lines), []);
});

test('secret scan: added .env, key and database files fail; examples pass', () => {
  const entries = parseNameStatus([
    'A\tos/.env.local', 'A\t.env', 'A\tdeploy/server.pem', 'A\tid_ed25519',
    'A\tos/prisma/dev.db', 'R100\tnotes.txt\tos/.env.production',
    'A\tos/.env.example', 'M\tos/.env', 'D\told/.env.local', 'A\tos/src/env.ts',
  ].join('\n'));
  const findings = scanPaths(entries);
  assert.equal(findings.length, 6);
  assert.match(findings[0], /^os\/\.env\.local: \.env file added/);
});

// End to end: run both scripts against a scratch git repository.
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'repo-checks-'));
  const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'test@example.test');
  g('config', 'user.name', 'test');
  const write = (path, body) => {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  };
  write(`${M}20260921153106_init/migration.sql`, 'CREATE TABLE a (id INTEGER);\n');
  write(`${M}migration_lock.toml`, 'provider = "sqlite"\n');
  write('README.md', 'hello\n');
  g('add', '-A');
  g('commit', '-qm', 'base');
  g('checkout', '-qb', 'pr');
  return { dir, g, write };
}

function run(script, dir) {
  const r = spawnSync(process.execPath, [join(HERE, script), 'main'], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('end to end: a clean PR passes both scripts', () => {
  const { dir, g, write } = repo();
  try {
    write(`${M}20261020000000_add_b/migration.sql`, 'CREATE TABLE b (id INTEGER);\n');
    write('README.md', 'hello again\n');
    g('add', '-A');
    g('commit', '-qm', 'clean');
    assert.equal(run('check-migrations.mjs', dir).code, 0);
    assert.equal(run('secret-scan.mjs', dir).code, 0);
  } finally { rmSync(dir, { recursive: true }); }
});

test('end to end: an edited, renamed or deleted applied migration fails (S14)', () => {
  for (const change of ['edit', 'rename', 'delete', 'lock']) {
    const { dir, g, write } = repo();
    try {
      const sql = `${M}20260921153106_init/migration.sql`;
      if (change === 'edit') write(sql, 'CREATE TABLE a (id INTEGER, name TEXT);\n');
      if (change === 'rename') renameSync(join(dir, `${M}20260921153106_init`), join(dir, `${M}20260921153107_init`));
      if (change === 'delete') rmSync(join(dir, sql));
      if (change === 'lock') write(`${M}migration_lock.toml`, 'provider = "postgresql"\n');
      g('add', '-A');
      g('commit', '-qm', change);
      const r = run('check-migrations.mjs', dir);
      assert.equal(r.code, 1, `${change}: ${r.out}`);
      assert.match(r.out, /FAIL /);
    } finally { rmSync(dir, { recursive: true }); }
  }
});

test('end to end: a planted secret fails (S13)', () => {
  const { dir, g, write } = repo();
  try {
    write('os/src/lib/client.ts', `export const key = "${fake.anthropic}";\n`);
    g('add', '-A');
    g('commit', '-qm', 'secret');
    const r = run('secret-scan.mjs', dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /SECRET os\/src\/lib\/client\.ts:1: Anthropic key or token/);
    assert.ok(!r.out.includes(fake.anthropic));
  } finally { rmSync(dir, { recursive: true }); }
});
