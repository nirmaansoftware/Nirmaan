import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { AgentDefinition, AgentPermissions } from "./types";

/**
 * /agents lives at the repo root, one level up from /os (which is this
 * package's cwd when run via npm scripts). Overridable via AGENTS_ROOT for
 * tests or alternate layouts.
 */
export function agentsRoot(): string {
  return process.env.AGENTS_ROOT ?? path.join(process.cwd(), "..", "agents");
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Load and parse one agent's agent.md (frontmatter + markdown body) into a
 * structured AgentDefinition. Throws if the agent doesn't exist — callers
 * should not silently fall back to a missing agent.
 */
export function loadAgent(slug: string): AgentDefinition {
  const file = path.join(agentsRoot(), slug, "agent.md");
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) {
    throw new Error(
      `No agent.md found for slug "${slug}" at ${file}. Check /agents/README.md for the expected layout.`
    );
  }

  const raw = fs.readFileSync(/*turbopackIgnore: true*/ file, "utf-8");
  const { data, content } = matter(raw);

  return {
    slug: typeof data.slug === "string" ? data.slug : slug,
    role: typeof data.role === "string" ? data.role : "",
    reviewedBy: toStringList(data.reviewed_by),
    permissions: (data.permissions ?? {}) as AgentPermissions,
    body: content.trim(),
  };
}

/** List every agent slug currently defined under /agents (dirs containing an agent.md). */
export function listAgentSlugs(): string[] {
  const root = agentsRoot();
  // /agents lives outside the app and is read at runtime by explicit path;
  // tell Turbopack not to trace the whole project because of this listing.
  if (!fs.existsSync(/*turbopackIgnore: true*/ root)) return [];
  return fs
    .readdirSync(/*turbopackIgnore: true*/ root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(root, entry.name, "agent.md")))
    .map((entry) => entry.name);
}
