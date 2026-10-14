"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { baseUrl } from "@/lib/web/links";
import { reviewRun, runArchitecture } from "@/lib/factory/architecture";
import { acceptPlan, runPlanner } from "@/lib/factory/planner";
import { runReadyTasks, setAiBudget } from "@/lib/factory/orchestrate";
import { issueCiToken } from "@/lib/factory/ci";

function refresh(form: FormData) {
  revalidatePath(`/os/projects/${str(form, "projectId")}`);
}

export async function runArchitectureAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const run = await runArchitecture(actor, str(form, "projectId"));
    refresh(form);
    return { ok: `Architecture proposed: ${run.summary} Review it below.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function runPlannerAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const run = await runPlanner(actor, str(form, "projectId"));
    refresh(form);
    return { ok: `Plan proposed: ${run.summary}. Review it below.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function reviewRunAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const decision = str(form, "decision");
  try {
    if (decision === "ACCEPT_PLAN") {
      const r = await acceptPlan(actor, str(form, "runId"));
      refresh(form);
      return { ok: `Plan accepted: created ${r.features} features and ${r.tasks} tasks.` };
    }
    if (decision !== "ACCEPTED" && decision !== "REJECTED") throw new Error("Unknown decision.");
    await reviewRun(actor, str(form, "runId"), decision, str(form, "note"));
    refresh(form);
    return { ok: decision === "ACCEPTED" ? "Accepted." : "Rejected." };
  } catch (err) {
    return errorState(err);
  }
}

export async function setBudgetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const raw = str(form, "budget").replace(/[$,\s]/g, "");
    await setAiBudget(actor, str(form, "projectId"), raw === "" ? null : Number(raw));
    refresh(form);
    return { ok: raw === "" ? "Budget cleared; automated dispatch is off." : `Budget set to $${Number(raw).toFixed(2)}.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function dispatchAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const r = await runReadyTasks(actor, str(form, "projectId"), { maxTasks: Number(str(form, "maxTasks")) || undefined });
    refresh(form);
    const list = r.dispatched.map((d) => `${d.title} → ${d.status}`).join("; ");
    return { ok: `${r.dispatched.length ? `Ran: ${list}. ` : ""}${r.stoppedBecause}` };
  } catch (err) {
    return errorState(err);
  }
}

export async function ciTokenAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const { token } = await issueCiToken(actor, str(form, "projectId"));
    refresh(form);
    return {
      ok: `CI token issued (shown once; the previous one stops working). Store it as a CI secret and post results to ${await baseUrl()}/api/ci/evidence with "Authorization: Bearer <token>".`,
      link: token,
    };
  } catch (err) {
    return errorState(err);
  }
}
