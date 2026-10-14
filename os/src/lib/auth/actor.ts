import type { AuditActorType, Role } from "../db/enums";

/**
 * Who is doing something. Every service function takes an Actor, so the
 * audit trail and permission checks never depend on where the call came from.
 */
export interface Actor {
  type: AuditActorType;
  /** User id, agent slug, or null (public / system). */
  id: string | null;
  /** Shown in audit logs and activity feeds. */
  label: string;
  /** Present for USER actors (and for client links, as CLIENT_ADMIN). */
  role?: Role;
}

export const SYSTEM_ACTOR: Actor = { type: "SYSTEM", id: null, label: "System" };
export const PUBLIC_ACTOR: Actor = { type: "PUBLIC", id: null, label: "Website visitor" };

export function userActor(user: { id: string; name: string; role: string }): Actor {
  return { type: "USER", id: user.id, label: user.name, role: user.role as Role };
}

export function clientLinkActor(label: string): Actor {
  return { type: "CLIENT_LINK", id: null, label, role: "CLIENT_ADMIN" };
}
