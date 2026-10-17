#!/usr/bin/env node
// Migration rule (AGENTS.md: applied migrations are history).
//
// Compares <base>...HEAD and fails when a change touches an existing path under
// os/prisma/migrations/: any status other than A (added) fails, so M, R, D, C
// and T all fail, as does a change to migration_lock.toml. An added file passes
// only inside a new migration folder (one that does not exist at <base>):
// adding a file to an applied folder changes that migration too.
//
// Usage: node .github/scripts/check-migrations.mjs <base-ref>
// Exit 0 when the rule holds, 1 when it is broken, 2 on a usage or git error.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS = 'os/prisma/migrations/';
export const LOCK = 'migration_lock.toml';

// Parses `git diff --name-status` output into { status, paths } entries
// (two paths for renames and copies: old, then new).
export function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status, paths };
  });
}

// entries: parsed name-status; foldersAtBase: names (not paths) of the entries
// directly under os/prisma/migrations/ at the base commit.
export function migrationProblems(entries, foldersAtBase) {
  const problems = [];
  for (const { status, paths } of entries) {
    const inside = paths.filter((p) => p.startsWith(MIGRATIONS));
    if (inside.length === 0) continue;
    const letter = status[0];
    const shown = `${status} ${paths.join(' -> ')}`;
    if (letter !== 'A') {
      problems.push(`${shown}: applied migrations are history; add a new migration folder instead`);
      continue;
    }
    const rest = inside[0].slice(MIGRATIONS.length);
    const [folder, ...below] = rest.split('/');
    if (below.length === 0) {
      if (folder === LOCK) continue; // a lock file where none existed
      problems.push(`${shown}: a migration must sit in its own new folder`);
    } else if (foldersAtBase.has(folder)) {
      problems.push(`${shown}: adds a file to the applied migration ${folder}; add a new migration folder instead`);
    }
  }
  return problems;
}

function git(args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function main(argv) {
  const base = argv[2];
  if (!base) {
    console.error('usage: check-migrations.mjs <base-ref>');
    return 2;
  }
  const entries = parseNameStatus(git(['diff', '--name-status', '-M', `${base}...HEAD`]));
  const folders = new Set(
    git(['ls-tree', '--name-only', base, MIGRATIONS])
      .split('\n').filter(Boolean).map((p) => p.slice(MIGRATIONS.length)),
  );
  const problems = migrationProblems(entries, folders);
  for (const p of problems) console.log(`FAIL ${p}`);
  const touched = entries.filter((e) => e.paths.some((p) => p.startsWith(MIGRATIONS))).length;
  console.log(`check-migrations: ${touched} change(s) under ${MIGRATIONS}, ${problems.length} problem(s)`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    console.error(`check-migrations: ${err.message}`);
    process.exitCode = 2;
  }
}
