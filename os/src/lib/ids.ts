import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db/client";

/**
 * Human-readable, never-reused ids for every object in the project knowledge
 * graph: REQ-104, FEAT-027, TASK-088, TEST-031, DEPLOY-012, ...
 *
 * One Counter row per prefix, incremented in a single UPDATE, so two
 * concurrent allocations can never hand out the same number. Numbers are
 * zero-padded to three digits and simply grow past 999 (REQ-1000).
 */
export const ID_PREFIXES = ["LEAD", "REQ", "FEAT", "TASK", "TEST", "PROP", "CR", "PRJ", "DEPLOY", "INV", "SUB", "IP", "SR", "PROS", "CAMP"] as const;
export type IdPrefix = (typeof ID_PREFIXES)[number];

type Db = PrismaClient | Prisma.TransactionClient;

export async function nextCode(prefix: IdPrefix, db: Db = prisma): Promise<string> {
  const row = await db.counter.upsert({
    where: { key: prefix },
    create: { key: prefix, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatCode(prefix, row.value);
}

export function formatCode(prefix: IdPrefix, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/** The prefix of a code, or null if it isn't one of ours ("REQ-104" -> "REQ"). */
export function prefixOf(code: string): IdPrefix | null {
  const match = /^([A-Z]+)-\d{3,}$/.exec(code);
  if (!match) return null;
  return (ID_PREFIXES as readonly string[]).includes(match[1]) ? (match[1] as IdPrefix) : null;
}
