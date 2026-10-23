import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/**
 * Explicit skill loading (decision record D6.3,
 * docs/operations/capability-hierarchy-decisions.md). Skill ids are named by
 * the caller; there is no tag or semantic matching. The file format and its
 * checks live in skills/README.md and .github/scripts/skills.mjs.
 */

/** At most this many skills per call (K = 3). */
export const MAX_SKILLS = 3;
/** Per-file cap, the same number as MAX_BYTES in .github/scripts/skills.mjs. */
export const MAX_SKILL_BYTES = 16 * 1024;

export interface LoadedSkill {
  id: string;
  /** Git blob SHA of the file, the same SHA that capability records bind to. */
  sha: string;
  heldBy: string[];
  /** The whole file, front matter included, as it is on disk. */
  text: string;
}

/** skills/ lives at the repo root next to /agents; SKILLS_ROOT overrides it (the runtime image, tests). */
export function skillsRoot(): string {
  return process.env.SKILLS_ROOT ?? path.join(process.cwd(), "..", "skills");
}

/** Git's blob SHA-1 of a file's bytes, so a skill's id@sha matches `git hash-object`. */
export function gitBlobSha(bytes: Buffer): string {
  return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function findSkillFile(id: string): string | undefined {
  const root = skillsRoot();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || !fs.existsSync(/*turbopackIgnore: true*/ root)) return undefined;
  for (const entry of fs.readdirSync(/*turbopackIgnore: true*/ root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, `${id}.md`);
    if (fs.existsSync(/*turbopackIgnore: true*/ file)) return file;
  }
  return undefined;
}

/**
 * Load the named skills for one role. Throws on more than MAX_SKILLS ids, an
 * unknown id, a file over the cap, or a skill the role does not hold
 * (`held_by`). No ids means no skills.
 */
export function loadSkills(slug: string, ids: string[] = []): LoadedSkill[] {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_SKILLS) throw new Error(`At most ${MAX_SKILLS} skills per call; ${slug} was given ${unique.length}.`);
  return unique.map((id) => {
    const file = findSkillFile(id);
    if (!file) throw new Error(`No skill "${id}" under ${skillsRoot()}.`);
    const bytes = fs.readFileSync(/*turbopackIgnore: true*/ file);
    if (bytes.length > MAX_SKILL_BYTES) throw new Error(`Skill "${id}" is ${bytes.length} bytes, over ${MAX_SKILL_BYTES}.`);
    const text = bytes.toString("utf-8");
    const data = matter(text).data as { held_by?: unknown };
    const heldBy = Array.isArray(data.held_by) ? data.held_by.map(String) : [];
    if (!heldBy.includes(slug)) throw new Error(`${slug} does not hold the skill "${id}" (held_by: ${heldBy.join(", ") || "none"}).`);
    return { id, sha: gitBlobSha(bytes), heldBy, text };
  });
}
