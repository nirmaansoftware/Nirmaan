import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readProjectFileTool, listProjectFilesTool, writeProjectArtifactTool } from "./filesystemTools";

function withTempProjectsRoot<T>(fn: (projectsRoot: string) => Promise<T>): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agency-os-fstools-test-"));
  const prev = process.env.PROJECTS_ROOT;
  process.env.PROJECTS_ROOT = tmp;
  return fn(tmp).finally(() => {
    if (prev === undefined) delete process.env.PROJECTS_ROOT;
    else process.env.PROJECTS_ROOT = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  });
}

test("readProjectFileTool reads an existing file", async () => {
  await withTempProjectsRoot(async (root) => {
    fs.mkdirSync(path.join(root, "proj-a", "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "proj-a", "docs", "note.md"), "hello world");

    const result = await readProjectFileTool.handler({ projectId: "proj-a", path: "docs/note.md" });
    assert.equal(result.ok, true);
    assert.equal(result.output, "hello world");
  });
});

test("readProjectFileTool returns ok:false for a missing file, not a throw", async () => {
  await withTempProjectsRoot(async (root) => {
    fs.mkdirSync(path.join(root, "proj-a"), { recursive: true });
    const result = await readProjectFileTool.handler({ projectId: "proj-a", path: "nope.md" });
    assert.equal(result.ok, false);
  });
});

test("readProjectFileTool refuses to read outside the project directory (path traversal)", async () => {
  await withTempProjectsRoot(async (root) => {
    fs.mkdirSync(path.join(root, "proj-a"), { recursive: true });
    fs.writeFileSync(path.join(root, "secret.txt"), "should never be readable via proj-a");

    await assert.rejects(
      () => readProjectFileTool.handler({ projectId: "proj-a", path: "../secret.txt" }),
      /resolves outside project/
    );
  });
});

test("listProjectFilesTool lists entries at the project root and a subdirectory", async () => {
  await withTempProjectsRoot(async (root) => {
    fs.mkdirSync(path.join(root, "proj-a", "requirements"), { recursive: true });
    fs.writeFileSync(path.join(root, "proj-a", "project.md"), "x");
    fs.writeFileSync(path.join(root, "proj-a", "requirements", "prd.md"), "x");

    const rootListing = await listProjectFilesTool.handler({ projectId: "proj-a" });
    assert.match(rootListing.output, /project\.md/);
    assert.match(rootListing.output, /requirements/);

    const subListing = await listProjectFilesTool.handler({ projectId: "proj-a", path: "requirements" });
    assert.match(subListing.output, /prd\.md/);
  });
});

test("writeProjectArtifactTool writes a new file and versions instead of overwriting on a second write", async () => {
  await withTempProjectsRoot(async (root) => {
    const first = await writeProjectArtifactTool.handler({ projectId: "proj-a", path: "notes/scratch.md", content: "v1" });
    assert.equal(first.ok, true);
    assert.equal(fs.readFileSync(path.join(root, "proj-a", "notes", "scratch.md"), "utf-8"), "v1");

    const second = await writeProjectArtifactTool.handler({ projectId: "proj-a", path: "notes/scratch.md", content: "v2" });
    assert.equal(second.ok, true);
    assert.match(second.output, /scratch-v2\.md/);
    assert.equal(fs.readFileSync(path.join(root, "proj-a", "notes", "scratch.md"), "utf-8"), "v1", "original must be untouched");
    assert.equal(fs.readFileSync(path.join(root, "proj-a", "notes", "scratch-v2.md"), "utf-8"), "v2");
  });
});
