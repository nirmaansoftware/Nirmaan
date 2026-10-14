import { prisma } from "../db/client";
import { audit } from "../audit";
import { logEvent } from "../db/logEvent";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { generateToken, hashToken, looksLikeToken } from "../auth/tokens";
import { prefixOf } from "../ids";

/**
 * Evidence from CI: a project's pipeline posts its test results, keyed by
 * TEST-### codes, and they're recorded as Evidence. Nobody has to retype
 * "14/14 passed". Authenticated by a per-project token (stored hashed,
 * shown once). Re-posting the same run is idempotent (runRef).
 *
 *   POST /api/ci/evidence
 *   Authorization: Bearer <project CI token>
 *   { "run": { "id": "412", "url": "https://ci.example/run/412" },
 *     "results": [ { "code": "TEST-031", "passed": 14, "total": 14, "summary": "unit" } ] }
 */
export async function issueCiToken(actor: Actor, projectId: string) {
  assertCan(actor.role, "project:write");
  const token = generateToken();
  await prisma.project.update({ where: { id: projectId }, data: { ciTokenHash: hashToken(token) } });
  await audit(actor, "ci.token_issued", "Project", projectId);
  return { token };
}

export interface CiPayload {
  run?: { id?: unknown; url?: unknown };
  results?: unknown;
}

export interface CiIngestResult {
  recorded: number;
  duplicates: number;
  rejected: { code: string; reason: string }[];
}

const MAX_RESULTS = 500;

export async function ingestCiResults(token: string | undefined, payload: CiPayload): Promise<CiIngestResult> {
  if (!looksLikeToken(token)) throw new CiAuthError();
  const project = await prisma.project.findUnique({ where: { ciTokenHash: hashToken(token) } });
  if (!project) throw new CiAuthError();

  const runId = typeof payload.run?.id === "string" || typeof payload.run?.id === "number" ? String(payload.run.id).slice(0, 100) : "";
  if (!runId) throw new CiPayloadError('"run.id" is required, so re-posting the same run doesn\'t double-count.');
  const runUrl = typeof payload.run?.url === "string" && /^https?:\/\//.test(payload.run.url) ? payload.run.url.slice(0, 500) : null;
  if (!Array.isArray(payload.results) || !payload.results.length) throw new CiPayloadError('"results" must be a non-empty list.');
  if (payload.results.length > MAX_RESULTS) throw new CiPayloadError(`At most ${MAX_RESULTS} results per post.`);

  const tests = await prisma.testCase.findMany({ where: { projectId: project.id }, select: { id: true, code: true } });
  const byCode = new Map(tests.map((t) => [t.code, t.id]));
  const result: CiIngestResult = { recorded: 0, duplicates: 0, rejected: [] };

  for (const raw of payload.results as Record<string, unknown>[]) {
    const code = typeof raw?.code === "string" ? raw.code.trim().toUpperCase() : "";
    const passed = Number(raw?.passed);
    const total = Number(raw?.total);
    if (prefixOf(code) !== "TEST") { result.rejected.push({ code: code || "(missing)", reason: "not a TEST- code" }); continue; }
    const testCaseId = byCode.get(code);
    if (!testCaseId) { result.rejected.push({ code, reason: "no such test on this project" }); continue; }
    if (!Number.isInteger(total) || total < 1 || !Number.isInteger(passed) || passed < 0 || passed > total) {
      result.rejected.push({ code, reason: "passed/total must be whole numbers with 0 ≤ passed ≤ total, total ≥ 1" });
      continue;
    }
    const summary = (typeof raw?.summary === "string" && raw.summary.trim() ? raw.summary.trim() : `CI run ${runId}`).slice(0, 300);
    try {
      await prisma.evidence.create({
        data: {
          testCaseId,
          passed,
          total,
          result: passed === total ? "PASS" : "FAIL",
          summary,
          link: runUrl,
          source: "CI",
          runRef: runId,
          recordedBy: `CI (run ${runId})`,
        },
      });
      result.recorded++;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") result.duplicates++;
      else throw err;
    }
  }

  if (result.recorded) {
    await logEvent(project.id, null, null, `CI run ${runId} recorded ${result.recorded} evidence result(s)${result.rejected.length ? `, rejected ${result.rejected.length}` : ""}.`);
  }
  return result;
}

export class CiAuthError extends Error {
  constructor() {
    super("Invalid or missing CI token.");
    this.name = "CiAuthError";
  }
}

/** A payload the caller can fix; its message is safe to send back. */
export class CiPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CiPayloadError";
  }
}
