// A fixed per-team key-1 context. review.test.mjs builds today's key-1
// prompts from it and compares them byte for byte with key1-per-team.golden.txt,
// so key1_mode "per-team" is shown to build exactly the per-team prompts. A PR
// that changes the prompts on purpose rewrites the golden file in the same
// diff (the quoted-snippet rule did), so the change is visible to review.
export const GOLDEN_CTX = {
  repo: 'nirmaansoftware/Nirmaan', pr: 7, company: 'Nirmaan',
  headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), mainSha: 'c'.repeat(40), mainDir: '/tmp/main',
  nonce: '0123456789abcdef01234567', prText: '1 | Title\n2 | Body', diff: 'diff --git a/x b/x\n+line',
  diffTruncated: false, maxDiffBytes: 200000, key: 1, team: 'engineering',
  classification: { teams: ['engineering', 'platform-quality'], checklists: ['database-engineer'], founder: { A: ['path .github/x.yml'] }, contentHits: [], ipSiteImpact: false, notify: [] },
  founderBlock: null,
  ci: [{ name: 'repo-checks', conclusion: 'success', url: 'https://ci/x' }],
  files: [{ status: 'M', path: 'os/app.js' }, { status: 'A', path: '.github/x.yml' }],
  team: { id: 'engineering', name: 'Engineering' }, lead: 'principal-architect',
  leadSpec: '# principal-architect\nLEAD SPEC', checklists: [{ name: 'key1-base', text: 'BASE' }, { name: 'engineering', text: 'ENG' }],
  memberSpecs: [{ role: 'database-engineer', text: 'DB CHECKLIST' }],
};
