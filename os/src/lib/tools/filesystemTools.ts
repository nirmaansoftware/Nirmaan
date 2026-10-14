import fs from "node:fs";
import path from "node:path";
import { resolveProjectPath, projectDir, writeVersioned } from "../agents/artifactWriter";
import type { ToolDefinition } from "./types";

const MAX_READ_BYTES = 200_000; // matches commandRunner's cap — enough for any real artifact, not enough to be an exfiltration vector for something that shouldn't be there

interface ReadFileInput {
  projectId: string;
  path: string;
}

export const readProjectFileTool: ToolDefinition<ReadFileInput> = {
  name: "read_project_file",
  description: "Read a file from /projects/{projectId}/. Path is relative to the project's own directory; cannot escape it.",
  requiresPermission: "read",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project's artifactsPath, e.g. \"demo-project\"." },
      path: { type: "string", description: "Path relative to the project directory, e.g. \"requirements/prd.md\"." },
    },
    required: ["projectId", "path"],
  },
  handler: async ({ projectId, path: relativePath }) => {
    const target = resolveProjectPath(projectId, relativePath);
    if (!fs.existsSync(target)) {
      return { ok: false, output: `No file at "${relativePath}" in project "${projectId}".` };
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      return { ok: false, output: `"${relativePath}" is a directory, not a file — use list_project_files instead.` };
    }
    const buf = fs.readFileSync(target);
    const truncated = buf.byteLength > MAX_READ_BYTES;
    const text = buf.subarray(0, MAX_READ_BYTES).toString("utf-8");
    return { ok: true, output: truncated ? `${text}\n\n[truncated at ${MAX_READ_BYTES} bytes]` : text };
  },
};

interface ListFilesInput {
  projectId: string;
  path?: string;
}

export const listProjectFilesTool: ToolDefinition<ListFilesInput> = {
  name: "list_project_files",
  description: "List files and directories under /projects/{projectId}/ (optionally a subdirectory). Not recursive.",
  requiresPermission: "read",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      path: { type: "string", description: "Subdirectory relative to the project root; omit for the project root." },
    },
    required: ["projectId"],
  },
  handler: async ({ projectId, path: relativePath }) => {
    const target = relativePath ? resolveProjectPath(projectId, relativePath) : projectDir(projectId);
    if (!fs.existsSync(target)) {
      return { ok: false, output: `No directory at "${relativePath ?? "."}" in project "${projectId}".` };
    }
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const lines = entries.map((e) => `${e.isDirectory() ? "d" : "f"}  ${e.name}`).sort();
    return { ok: true, output: lines.length > 0 ? lines.join("\n") : "(empty)" };
  },
};

interface WriteArtifactInput {
  projectId: string;
  path: string;
  content: string;
}

export const writeProjectArtifactTool: ToolDefinition<WriteArtifactInput> = {
  name: "write_project_artifact",
  description:
    "Write a file into /projects/{projectId}/. Never overwrites an existing file in place — if the target path already exists, writes a new versioned path instead (e.g. prd.md -> prd-v2.md) and returns the actual path written.",
  requiresPermission: "write",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      path: { type: "string", description: "Path relative to the project directory to write to." },
      content: { type: "string", description: "The file content (plain text/markdown — no frontmatter required for this tool)." },
    },
    required: ["projectId", "path", "content"],
  },
  handler: async ({ projectId, path: relativePath, content }) => {
    // No handoff-metadata frontmatter required here — that's runAgent's
    // job for actual agent deliverables. This tool is for incidental
    // writes (notes, scratch files) an agent's tool use might produce
    // mid-task; it still goes through the same never-overwrite-in-place
    // writer so the guarantee is uniform everywhere something writes into
    // /projects/{id}/.
    const written = writeVersioned(projectId, relativePath, content);
    const relativeToProject = path.relative(projectDir(projectId), written);
    return { ok: true, output: `Wrote ${relativeToProject}` };
  },
};

// Type-erased to ToolDefinition<any> for storage in a heterogeneous
// registry (registry.ts) — each export above keeps its specific input
// type for direct use (e.g. in tests). Function parameters are
// contravariant, so a homogeneous array of differently-typed tools needs
// this; it's a narrow, deliberate use of `any`, not a general escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FILESYSTEM_TOOLS: ToolDefinition<any>[] = [readProjectFileTool, listProjectFilesTool, writeProjectArtifactTool];
