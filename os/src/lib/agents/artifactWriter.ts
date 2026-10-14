import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export function projectsRoot(): string {
  return process.env.PROJECTS_ROOT ?? path.join(process.cwd(), "..", "projects");
}

/** Absolute path to a project's directory, e.g. /projects/{artifactsPath}/. */
export function projectDir(projectId: string): string {
  return path.join(/*turbopackIgnore: true*/ projectsRoot(), projectId);
}

/**
 * Resolves a relative path against a project's directory and verifies the
 * result doesn't escape it (rejects "../" traversal). This is the one
 * checkpoint every filesystem access into /projects/{id}/ — from runAgent,
 * from the Phase 7 filesystem tools — goes through. Throws rather than
 * silently clamping, since a traversal attempt is something to know about,
 * not quietly correct.
 */
export function resolveProjectPath(projectId: string, relativePath: string): string {
  const root = projectDir(projectId);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path "${relativePath}" resolves outside project "${projectId}" — refusing.`);
  }
  return resolved;
}

/**
 * Never silently overwrite important decisions (architecture plan
 * Section 39 / 3): if the target path already exists, write a new
 * versioned path instead and leave the existing file untouched. This is
 * the ONE place that writes into /projects/{id}/ — everything else
 * (runAgent, the Phase 7 filesystem write tool) goes through this.
 */
// Artifacts live in /projects at runtime (outside the app bundle), hence the
// turbopackIgnore hints: nothing here should be traced into the build.
export function writeVersioned(projectId: string, relativePath: string, content: string): string {
  const dir = path.dirname(resolveProjectPath(projectId, relativePath));
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });

  let target = resolveProjectPath(projectId, relativePath);
  if (fs.existsSync(/*turbopackIgnore: true*/ target)) {
    const ext = path.extname(relativePath);
    const base = relativePath.slice(0, -ext.length);
    let version = 2;
    while (fs.existsSync(/*turbopackIgnore: true*/ resolveProjectPath(projectId, `${base}-v${version}${ext}`))) {
      version += 1;
    }
    target = resolveProjectPath(projectId, `${base}-v${version}${ext}`);
  }

  fs.writeFileSync(/*turbopackIgnore: true*/ target, content);
  return target;
}

/** Same never-overwrite guarantee as writeVersioned, but wraps content in YAML frontmatter first — what runAgent uses for actual agent deliverables (handoff metadata). */
export function writeVersionedArtifact(
  projectId: string,
  relativePath: string,
  frontmatter: Record<string, unknown>,
  body: string
): string {
  return writeVersioned(projectId, relativePath, matter.stringify(body, stripUndefined(frontmatter)));
}

/** js-yaml (used by gray-matter.stringify) can't dump literal `undefined` values — drop them so optional fields are simply absent from the frontmatter instead. */
export function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj) as [keyof T, T[keyof T]][]) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
