import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadAgent, listAgentSlugs } from "./loadAgent";
import { composeSystemPrompt, skillRefs, MAX_SYSTEM_PROMPT_BYTES } from "./composePrompt";
import { MAX_SKILLS, MAX_SKILL_BYTES } from "./skills";
import { yourLine } from "./orgChart";

// A throwaway skills/ tree. Skill files here only need front matter with
// held_by; the format itself is checked by .github/scripts/skills.mjs.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
const previous = process.env.SKILLS_ROOT;
process.env.SKILLS_ROOT = root;
after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (previous === undefined) delete process.env.SKILLS_ROOT;
  else process.env.SKILLS_ROOT = previous;
});

function writeSkill(unit: string, id: string, heldBy: string[], filler = "Use when: a test needs a skill.\n"): string {
  fs.mkdirSync(path.join(root, unit), { recursive: true });
  const file = path.join(root, unit, `${id}.md`);
  const head = `---\nid: ${id}\nunit: ${unit}\nheld_by: [${heldBy.join(", ")}]\n---\n`;
  fs.writeFileSync(file, head + filler);
  return file;
}

const contract = "## Output contract\n\nReply with JSON.";

test("no named skill means no skill text", () => {
  const agent = loadAgent("product-manager");
  assert.deepEqual(agent.skills, []);
  const prompt = composeSystemPrompt({ agent, intro: "You are the Product Manager agent at Nirmaan.", contract });
  assert.ok(!prompt.includes("## Reference skills"));
  assert.ok(!prompt.includes("<skill "));
  assert.ok(prompt.startsWith("You are the Product Manager agent at Nirmaan.\n\n" + agent.body));
  assert.ok(prompt.endsWith(contract));
});

test("a named, held skill is loaded in a delimited block and recorded as id@sha", () => {
  const file = writeSkill("engineering", "api-error-shapes", ["backend-engineer"]);
  const agent = loadAgent("backend-engineer", { skills: ["api-error-shapes"] });
  const sha = execFileSync("git", ["hash-object", file], { encoding: "utf8" }).trim();
  assert.deepEqual(skillRefs(agent), [`api-error-shapes@${sha}`]);
  const prompt = composeSystemPrompt({ agent, intro: "You are the Backend Engineer agent.", contract });
  assert.ok(prompt.includes(`<skill id="api-error-shapes" sha="${sha}">`));
  assert.ok(prompt.indexOf("## Reference skills") > prompt.indexOf(agent.body));
  assert.ok(prompt.endsWith(contract));
});

test("a skill the role does not hold, an unknown id, or more than three ids throws", () => {
  writeSkill("engineering", "schema-review", ["database-engineer"]);
  assert.throws(() => loadAgent("backend-engineer", { skills: ["schema-review"] }), /does not hold/);
  assert.throws(() => loadAgent("backend-engineer", { skills: ["no-such-skill"] }), /No skill/);
  assert.throws(() => loadAgent("backend-engineer", { skills: ["../agents/orchestrator"] }), /No skill/);
  const four = ["s-one", "s-two", "s-three", "s-four"];
  for (const id of four) writeSkill("engineering", id, ["backend-engineer"]);
  assert.throws(() => loadAgent("backend-engineer", { skills: four }), /At most 3/);
});

test("byte budget: every role spec plus the largest allowed skill set fits in 64 KiB", () => {
  // Worst case per role: K skills at the per-file cap, and a contract larger
  // than any call site's (each is under 2 KiB today).
  const bigContract = "x".repeat(4 * 1024);
  for (const slug of listAgentSlugs()) {
    const ids = Array.from({ length: MAX_SKILLS }, (_, i) => `budget-${slug}-${i}`);
    for (const id of ids) {
      const head = `---\nid: ${id}\nunit: budget\nheld_by: [${slug}]\n---\n`;
      writeSkill("budget", id, [slug], "y".repeat(MAX_SKILL_BYTES - Buffer.byteLength(head)));
    }
    const agent = loadAgent(slug, { skills: ids });
    const prompt = composeSystemPrompt({ agent, intro: `You are the ${agent.role} agent at Nirmaan, acting as delivery planner.`, contract: bigContract });
    const bytes = Buffer.byteLength(prompt, "utf8");
    assert.ok(bytes <= MAX_SYSTEM_PROMPT_BYTES, `${slug}: ${bytes} bytes`);
  }
});

test("the composer refuses a prompt over the budget", () => {
  const agent = loadAgent("product-manager");
  assert.throws(() => composeSystemPrompt({ agent, intro: "x", contract: "z".repeat(MAX_SYSTEM_PROMPT_BYTES) }), /byte budget/);
});

test("the Your line block comes from the chart", () => {
  const line = yourLine("backend-engineer");
  assert.match(line, /^## Your line/);
  assert.match(line, /Reports to: Head of Engineering \(interim\) \(principal-architect\)/);
  assert.match(line, /You are the deputy of: Head of Engineering \(interim\)/);
  assert.match(line, /Escalation rung: .*Orchestrator \(orchestrator\), then Founder \(human\)\./);
  assert.equal(yourLine("founder-proxy"), "", "an unplaced spec gets no line");
  assert.ok(composeSystemPrompt({ agent: loadAgent("backend-engineer"), intro: "i", contract }).includes(line));
});

test("all four call sites build their system prompt with the composer", () => {
  const src = path.join(__dirname, "..");
  for (const rel of ["agents/runAgent.ts", "factory/planner.ts", "factory/architecture.ts", "discovery/runDiscovery.ts"]) {
    const text = fs.readFileSync(path.join(src, rel), "utf8");
    assert.ok(text.includes("composeSystemPrompt("), `${rel}: does not use composeSystemPrompt`);
    assert.ok(!/\.body\b/.test(text), `${rel}: reads a spec body directly`);
  }
});
