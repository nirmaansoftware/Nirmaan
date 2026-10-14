import { prisma } from "./db/client";
import { redactSecrets } from "./security/redact";
import type { Actor } from "./auth/actor";

/**
 * Append-only record of security- and business-relevant actions: who did
 * what, to which object. Details pass through the same secret redaction as
 * Event messages.
 */
export async function audit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  detail?: string
) {
  return prisma.auditLog.create({
    data: {
      actorType: actor.type,
      actorId: actor.id,
      actorLabel: actor.label,
      action,
      entityType,
      entityId,
      detail: detail ? redactSecrets(detail) : null,
    },
  });
}
