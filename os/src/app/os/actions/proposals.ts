"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/web/session";
import { can } from "@/lib/auth/permissions";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { dateOrNull, int, str } from "@/lib/web/form";
import { baseUrl } from "@/lib/web/links";
import { linesToList, parseMilestones, parsePaymentSchedule } from "@/lib/proposals/model";
import { revokeProposalLink, sendProposal, updateProposal } from "@/lib/proposals/service";

export async function saveProposalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "proposalId");
  try {
    const maintenanceName = str(form, "maintenanceName").trim();
    await updateProposal(actor, id, {
      title: str(form, "title"),
      problem: str(form, "problem"),
      solution: str(form, "solution"),
      scope: linesToList(str(form, "scope")),
      outOfScope: linesToList(str(form, "outOfScope")),
      deliverables: linesToList(str(form, "deliverables")),
      milestones: parseMilestones(str(form, "milestones")),
      technology: str(form, "technology"),
      priceTotal: int(form, "priceTotal", "Price"),
      paymentSchedule: parsePaymentSchedule(str(form, "paymentSchedule")),
      maintenance: maintenanceName
        ? { name: maintenanceName, monthly: int(form, "maintenanceMonthly", "Monthly price"), includes: linesToList(str(form, "maintenanceIncludes"), 12) }
        : null,
      assumptions: linesToList(str(form, "assumptions")),
      changePolicy: str(form, "changePolicy"),
      validUntil: dateOrNull(form, "validUntil"),
      economics: can(actor.role, "economics:read")
        ? {
            estHours: int(form, "estHours", "Estimated hours"),
            estCostHuman: int(form, "estCostHuman", "Human cost"),
            estCostAi: int(form, "estCostAi", "AI cost"),
            estCostInfra: int(form, "estCostInfra", "Infrastructure cost"),
            estCostOther: int(form, "estCostOther", "Other cost"),
          }
        : undefined,
    });
    revalidatePath(`/os/proposals/${id}`);
    return { ok: "Saved." };
  } catch (err) {
    return errorState(err);
  }
}

export async function sendProposalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "proposalId");
  try {
    const { token } = await sendProposal(actor, id);
    revalidatePath(`/os/proposals/${id}`);
    return {
      ok: "Sent. Copy this link into your email to the client now. It's shown only once; sending again issues a new link and retires this one.",
      link: `${await baseUrl()}/p/${token}`,
    };
  } catch (err) {
    return errorState(err);
  }
}

export async function revokeLinkAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "proposalId");
  try {
    await revokeProposalLink(actor, id);
    revalidatePath(`/os/proposals/${id}`);
    return { ok: "The client link no longer works." };
  } catch (err) {
    return errorState(err);
  }
}
