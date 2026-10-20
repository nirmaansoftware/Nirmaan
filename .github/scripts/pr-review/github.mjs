// GitHub access for the review script: a small REST client, the review App's
// short-lived installation token, and the fallback (the caller's gh login,
// dry run only). The model never sees any of this.

import { createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = 'https://api.github.com';

// Environment variables the review App (tracker T21) provides. With APP_ID and
// one of the key sources set, the script posts check runs as the App;
// otherwise it falls back to a dry run with the caller's gh login.
export const APP_ENV = {
  appId: 'NIRMAAN_REVIEW_APP_ID',
  installationId: 'NIRMAAN_REVIEW_APP_INSTALLATION_ID', // optional; looked up per repository when unset
  keyFile: 'NIRMAAN_REVIEW_APP_PRIVATE_KEY_FILE', // path to the PEM, outside every repository
  keychainService: 'NIRMAAN_REVIEW_APP_KEYCHAIN_SERVICE', // or: macOS Keychain generic password holding the PEM
};

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function appJwt(appId, pem, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: String(appId) }));
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(sign.sign(pem))}`;
}

export function appConfigFromEnv(env = process.env) {
  const appId = env[APP_ENV.appId];
  if (!appId) return null;
  const keyFile = env[APP_ENV.keyFile];
  const keychainService = env[APP_ENV.keychainService];
  if (!keyFile && !keychainService) return null;
  return { appId, installationId: env[APP_ENV.installationId] || null, keyFile, keychainService };
}

export function readAppKey(cfg) {
  if (cfg.keyFile) return readFileSync(cfg.keyFile, 'utf8');
  return execFileSync('security', ['find-generic-password', '-s', cfg.keychainService, '-w'], { encoding: 'utf8' }).trim();
}

async function call(fetchImpl, method, url, token, body, scheme = 'token') {
  const res = await fetchImpl(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `${scheme} ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'nirmaan-pr-review',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${method} ${url.replace(API, '')}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// A token scoped to one repository with only what posting needs.
export async function installationToken(cfg, repo, { fetchImpl = fetch, pem = readAppKey(cfg) } = {}) {
  const jwt = appJwt(cfg.appId, pem);
  let id = cfg.installationId;
  if (!id) id = (await call(fetchImpl, 'GET', `${API}/repos/${repo}/installation`, jwt, null, 'Bearer')).id;
  const name = repo.split('/')[1];
  const r = await call(fetchImpl, 'POST', `${API}/app/installations/${id}/access_tokens`, jwt, {
    repositories: [name],
    permissions: { checks: 'write', pull_requests: 'write', contents: 'read', metadata: 'read' },
  }, 'Bearer');
  return r.token;
}

export function ghToken() {
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
}

// The client the review script uses. Every method returns plain data.
export function createClient({ repo, token, fetchImpl = fetch }) {
  const get = (path) => call(fetchImpl, 'GET', `${API}/repos/${repo}${path}`, token);
  const post = (path, body) => call(fetchImpl, 'POST', `${API}/repos/${repo}${path}`, token, body);
  const patch = (path, body) => call(fetchImpl, 'PATCH', `${API}/repos/${repo}${path}`, token, body);
  const paged = async (path, key) => {
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const r = await get(`${path}${sep}per_page=100&page=${page}`);
      const items = key ? r[key] : r;
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  };
  const pullData = (p) => ({
    number: p.number, state: p.state, draft: p.draft, title: p.title, body: p.body ?? '',
    author: p.user?.login, labels: (p.labels ?? []).map((l) => l.name),
    headSha: p.head.sha, headRef: p.head.ref, headRepo: p.head.repo?.full_name ?? null,
    baseRef: p.base.ref, baseRepo: p.base.repo.full_name,
    // Only on a single-PR read; null while GitHub is still computing it.
    mergeable: p.mergeable ?? null, mergeableState: p.mergeable_state ?? null,
    // For the loop's "merged" log line.
    merged: p.merged ?? null, mergedAt: p.merged_at ?? null, mergeSha: p.merge_commit_sha ?? null,
  });
  return {
    async getPull(n) {
      return pullData(await get(`/pulls/${n}`));
    },
    // Open PRs, oldest first (used by the automated loop, pr-loop).
    async listOpenPulls() {
      return (await paged('/pulls?state=open&sort=created&direction=asc')).map(pullData);
    },
    // The PR body, for the founder-class block only (pull_requests: write).
    async updatePullBody(n, body) {
      await patch(`/pulls/${n}`, { body });
    },
    async addLabels(n, labels) {
      await post(`/issues/${n}/labels`, { labels });
    },
    async listReviews(n) {
      return (await paged(`/pulls/${n}/reviews`)).map((r) => ({ login: r.user?.login, state: r.state, commitId: r.commit_id }));
    },
    async listCheckRuns(sha) {
      return (await paged(`/commits/${sha}/check-runs`, 'check_runs')).map((c) => ({
        id: c.id, name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url, app: c.app?.slug ?? null,
        title: c.output?.title ?? null, startedAt: c.started_at, completedAt: c.completed_at,
      }));
    },
    async listComments(n) {
      return (await paged(`/issues/${n}/comments`)).map((c) => ({ body: c.body ?? '', url: c.html_url, author: c.user?.login ?? null }));
    },
    async createComment(n, body) {
      const r = await post(`/issues/${n}/comments`, { body });
      return { url: r.html_url };
    },
    async createCheckRun({ name, headSha, state, title, summary, detailsUrl }) {
      const body = { name, head_sha: headSha, output: { title, summary } };
      if (detailsUrl) body.details_url = detailsUrl;
      if (state === 'pending') body.status = 'in_progress';
      // action_required: terminal, and (unlike neutral) never satisfies a
      // required check. Used when CI failed and no review ran.
      else { body.status = 'completed'; body.conclusion = state === 'success' ? 'success' : state === 'action_required' ? 'action_required' : 'failure'; }
      await post('/check-runs', body);
    },
    async createStatus({ sha, context, state, description, targetUrl }) {
      await post(`/statuses/${sha}`, { context, state, description, target_url: targetUrl });
    },
  };
}
