// Tests on the text of agents/: what the review prompts load, and title rules
// (decision record D2.5 and D6.4 to D6.9).
// Run: node --test .github/scripts/agents-text.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownSection } from './pr-review/lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('base checklist: the Knowledge PR rules load with the base key-1 checklist the review script reads', () => {
  const cfg = JSON.parse(read('.github/scripts/pr-review/config.json'));
  const section = markdownSection(read(cfg.base_checklist.file), cfg.base_checklist.heading);
  assert.ok(section, 'base checklist section found');
  assert.match(section, /\*\*Knowledge PR\*\*/);
  for (const rule of [/source marker/, /12 or more words/, /claims a level/, /does not run in CI/, /licences of the datasets, model weights and dependencies/, /permissions, its escalation or a review/, /not legal advice/]) {
    assert.match(section, rule);
  }
});

test('titles: no agent spec is titled "CTO Agent" (a human OS role)', () => {
  const specs = execFileSync('git', ['ls-files', 'agents/*/agent.md'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  for (const f of specs) assert.doesNotMatch(read(f), /CTO Agent/, f);
  assert.match(read('agents/orchestrator/agent.md'), /^# Orchestrator$/m);
});

test('client-communication: its checklist fails client text that titles an agent as a person or names its layer', () => {
  const spec = read('agents/client-communication/agent.md');
  const checklist = markdownSection(spec, 'Checklist for my team lead');
  assert.match(checklist, /titles an agent as a person or names an agent's layer/);
  assert.match(markdownSection(spec, 'Constraints'), /Never titles an agent as a person/);
});
