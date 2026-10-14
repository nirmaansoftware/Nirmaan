"use server";

import { headers } from "next/headers";
import { recordClientDecision, type ClientDecision } from "@/lib/proposals/service";
import { createRateLimiter } from "@/lib/http/rateLimit";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { baseUrl } from "@/lib/web/links";
import { str } from "@/lib/web/form";

const allow = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

/** The client's decision. No account: the unguessable link itself is the capability. */
export async function clientDecisionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(ip).ok) return { error: "Too many attempts from your network. Please wait a few minutes." };
  const decision = str(form, "decision") as ClientDecision;
  if (!["APPROVE", "REJECT", "CLARIFY"].includes(decision)) return { error: "Choose approve, request changes, or decline." };
  try {
    const r = await recordClientDecision(str(form, "token"), decision, { name: str(form, "name"), note: str(form, "note") });
    if (r.status === "APPROVED") {
      return {
        ok: `Thank you. The project is confirmed (${r.projectCode}). Nirmaan will be in touch about kick-off. Bookmark this link to follow progress at any time:`,
        link: `${await baseUrl()}/status/${r.statusToken}`,
      };
    }
    return {
      ok:
        r.status === "CLARIFICATION_REQUESTED"
          ? "Thanks. We've received your questions and will reply with an updated proposal."
          : "Thanks for letting us know. We've recorded your decision.",
    };
  } catch (err) {
    return errorState(err);
  }
}
