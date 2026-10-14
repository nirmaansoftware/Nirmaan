"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { bool, int, str } from "@/lib/web/form";
import { baseUrl } from "@/lib/web/links";
import { decideGate, issueStatusLink, moveToNextStage, requestGate } from "@/lib/projects/service";
import { addFeature, addTask, addTestCase, link, recordDeployment, recordEvidence } from "@/lib/trace/service";
import { assessChangeRequest, convertInScope, createChangeRequest, decideChangeRequest } from "@/lib/changes/service";

type Handler = (actor: Awaited<ReturnType<typeof requireActor>>, form: FormData) => Promise<ActionState | void>;

/** Shared shape: resolve the actor, run, refresh the project page, report plainly. */
function projectAction(fn: Handler, ok: string) {
  return async (_: ActionState, form: FormData): Promise<ActionState> => {
    const actor = await requireActor();
    try {
      const result = await fn(actor, form);
      revalidatePath(`/os/projects/${str(form, "projectId")}`);
      revalidatePath("/os/approvals");
      return result ?? { ok };
    } catch (err) {
      return errorState(err);
    }
  };
}

export const moveStageAction = projectAction(async (a, f) => {
  const p = await moveToNextStage(a, str(f, "projectId"));
  return { ok: `Moved to ${p.stage.replace("_", " ").toLowerCase()}.` };
}, "Moved.");

export const requestGateAction = projectAction(async (a, f) => {
  await requestGate(a, str(f, "projectId"), str(f, "gate"));
}, "Requested. It's waiting in Approvals.");

export const statusLinkAction = projectAction(async (a, f) => {
  const { token } = await issueStatusLink(a, str(f, "projectId"));
  return { ok: "New client status link (shown once; the previous link stops working):", link: `${await baseUrl()}/status/${token}` };
}, "");

export const addFeatureAction = projectAction(async (a, f) => {
  const feat = await addFeature(a, str(f, "projectId"), { title: str(f, "title"), requirementCode: str(f, "requirementCode") });
  return { ok: `Created ${feat.code}.` };
}, "");

export const addTaskAction = projectAction(async (a, f) => {
  const t = await addTask(a, str(f, "projectId"), { title: str(f, "title"), featureCode: str(f, "featureCode") });
  return { ok: `Created ${t.code}.` };
}, "");

export const addTestAction = projectAction(async (a, f) => {
  const t = await addTestCase(a, str(f, "projectId"), { title: str(f, "title"), level: str(f, "level"), verifiesCode: str(f, "verifiesCode") });
  return { ok: `Created ${t.code}.` };
}, "");

export const linkAction = projectAction(async (a, f) => {
  const e = await link(a, str(f, "projectId"), str(f, "from"), str(f, "to"));
  return { ok: `Linked ${e.fromCode} → ${e.toCode} (${e.relation.replace("_", " ").toLowerCase()}).` };
}, "");

export const evidenceAction = projectAction(async (a, f) => {
  const ev = await recordEvidence(a, str(f, "testCaseId"), {
    passed: int(f, "passed", "Passed"),
    total: int(f, "total", "Total"),
    summary: str(f, "summary"),
    link: str(f, "link"),
  });
  return { ok: `Recorded ${ev.passed}/${ev.total}: ${ev.result}.` };
}, "");

export const deploymentAction = projectAction(async (a, f) => {
  const d = await recordDeployment(a, str(f, "projectId"), {
    environment: str(f, "environment"),
    succeeded: str(f, "outcome") === "SUCCEEDED",
    rollbackPlan: str(f, "rollbackPlan"),
  });
  return { ok: `Recorded ${d.code}.` };
}, "");

export const createChangeAction = projectAction(async (a, f) => {
  const cr = await createChangeRequest(a, str(f, "projectId"), { requestedBy: str(f, "requestedBy"), description: str(f, "description") });
  return { ok: `Logged ${cr.code}. Assess it against the approved scope next.` };
}, "");

export const assessChangeAction = projectAction(async (a, f) => {
  await assessChangeRequest(a, str(f, "changeId"), {
    inScope: bool(f, "inScope"),
    impact: str(f, "impact"),
    costDelta: int(f, "costDelta", "Additional cost"),
    timelineDelta: int(f, "timelineDelta", "Additional days"),
  });
}, "Assessed.");

export const convertChangeAction = projectAction(async (a, f) => {
  await convertInScope(a, str(f, "changeId"));
}, "Added to the backlog as a task.");

export const decideChangeAction = projectAction(async (a, f) => {
  const d = str(f, "decision");
  if (d !== "APPROVED" && d !== "REJECTED") throw new Error("Unknown decision.");
  await decideChangeRequest(a, str(f, "changeId"), d);
}, "Decision recorded.");

export async function decideGateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const status = str(form, "decision");
  try {
    if (status !== "APPROVED" && status !== "REJECTED") throw new Error("Unknown decision.");
    const a = await decideGate(actor, str(form, "approvalId"), status);
    revalidatePath("/os/approvals");
    revalidatePath(`/os/projects/${a.projectId}`);
    return { ok: `${a.gate} ${status.toLowerCase()}.` };
  } catch (err) {
    return errorState(err);
  }
}
