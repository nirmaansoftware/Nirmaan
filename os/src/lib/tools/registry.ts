/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous tool registry: function parameters are contravariant, so a homogeneous array of differently-typed ToolDefinition<T> handlers needs type erasure here. Each tool keeps its specific input type at its own definition (filesystemTools.ts, testTool.ts) for type-safe direct use. */
import { loadAgent } from "../agents/loadAgent";
import { FILESYSTEM_TOOLS, readProjectFileTool, listProjectFilesTool, writeProjectArtifactTool } from "./filesystemTools";
import { runProjectTestsTool } from "./testTool";
import type { ToolDefinition } from "./types";

/**
 * Every tool that exists in this codebase. This list IS the enforcement
 * mechanism for the riskiest permissions: DevOps Engineer declares
 * deploy: true in its agent.md frontmatter (architecture plan Section 26
 * — a future capability, gated on an approval-gate runtime that doesn't
 * exist yet), but there is no deploy tool anywhere in this file. No git
 * write tool exists either. Declaring a permission in agent.md describes
 * intended future capability; it does not, by itself, grant anything —
 * a tool has to actually exist and be registered here.
 */
const ALL_TOOLS: ToolDefinition<any>[] = [...FILESYSTEM_TOOLS, runProjectTestsTool];

/**
 * Returns the tools a given agent is allowed to use, based on its
 * declared permissions in agent.md. Read tools require a non-empty
 * `read` permission (effectively all agents); the write tool requires a
 * non-empty `write` permission; the test-runner tool requires
 * `execute: true` specifically — matching the allowlist Phase 4's own
 * regression test (allAgentsLoad.test.ts) already checks against the
 * agent roster.
 */
export function toolsForAgent(agentSlug: string): ToolDefinition<any>[] {
  const agent = loadAgent(agentSlug); // throws with a clear error for an unknown slug — same behavior as everywhere else in this codebase
  const tools: ToolDefinition<any>[] = [];

  if (agent.permissions.read) {
    tools.push(readProjectFileTool, listProjectFilesTool);
  }
  if (agent.permissions.write) {
    tools.push(writeProjectArtifactTool);
  }
  if (agent.permissions.execute === true) {
    tools.push(runProjectTestsTool);
  }

  return tools;
}

export { ALL_TOOLS };
