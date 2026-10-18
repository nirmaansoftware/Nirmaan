/*
  The sitemap's <lastmod>: the UTC day of the last commit that changed a page.

  createLastModified() returns the `lastModified` filter .eleventy.js
  registers: {{ p.inputPath | lastModified(p.data.pagination) }} gives
  "2026-10-17". A page is dated by its template; a page generated from data
  (paginated) also counts anything under src/_data and takes the later day.

  It uses author dates of non-merge commits: a rebase, an amend or a merge
  keeps them, so every full-history checkout builds the same sitemap. A file
  with no commit yet (a new page before its first commit), or a git call that
  fails, gets today, with a warning; build again after committing. In a
  shallow clone every file looks last changed by the one commit fetched.

  Tests: os/src/lib/website/lastModified.test.ts (npm test in os/).
*/
const { execFileSync } = require('node:child_process');

const DATA_DIR = 'src/_data';

// Unix seconds of every non-merge commit that touched `path`, newest first.
function gitAuthorTimes(path, cwd) {
  const out = execFileSync('git', ['log', '--no-merges', '--format=%at', '--', path], { encoding: 'utf8', cwd });
  return out.split('\n').filter(Boolean).map(Number);
}

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * @param {{ cwd?: string, git?: (path: string, cwd?: string) => number[], now?: () => number, warn?: (msg: string) => void }} [options]
 * @returns {(inputPath: string, pagination?: unknown) => string}
 */
function createLastModified({ cwd, git = gitAuthorTimes, now = Date.now, warn = console.warn } = {}) {
  const days = new Map();
  const gitDay = (path) => {
    if (!days.has(path)) {
      let latest = 0;
      try {
        latest = Math.max(0, ...git(path, cwd));
      } catch (err) {
        warn(`[lastModified] git log failed for ${path}: ${err.message}`);
      }
      if (!latest) warn(`[lastModified] ${path} has no commit; using today. Build again after committing it.`);
      days.set(path, utcDay(latest ? latest * 1000 : now()));
    }
    return days.get(path);
  };
  return (inputPath, pagination) => {
    const found = [gitDay(inputPath)];
    if (pagination) found.push(gitDay(DATA_DIR));
    return found.sort().pop();
  };
}

module.exports = { createLastModified, gitAuthorTimes, utcDay, DATA_DIR };
