import { prisma } from "./client";
import { redactSecrets } from "../security/redact";
import type { Event } from "@prisma/client";

/**
 * The one function anything in this codebase should use to write an
 * Event row. Events are durable and dashboard-visible, so every message
 * goes through redactSecrets first — cheap insurance against an agent's
 * output (echoing back a secret it found while reviewing code, for
 * instance) ending up logged in the clear. See security/redact.ts for
 * what it catches and its limits.
 */
export async function logEvent(
  projectId: string,
  agentSlug: string | null,
  taskId: string | null,
  message: string
): Promise<Event> {
  return prisma.event.create({ data: { projectId, agentSlug, taskId, message: redactSecrets(message) } });
}
