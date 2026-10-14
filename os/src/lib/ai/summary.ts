import { prisma } from "../db/client";

/** The AI usage ledger, aggregated for the cost-governance screen. */
export async function aiUsageSummary(now = new Date(), days = 30) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [byTask, byModel, recent] = await Promise.all([
    prisma.aiUsage.groupBy({ by: ["task"], where: { createdAt: { gte: since } }, _count: true, _sum: { costUsd: true }, _avg: { latencyMs: true } }),
    prisma.aiUsage.groupBy({
      by: ["model", "provider"],
      where: { createdAt: { gte: since } },
      _count: true,
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    }),
    prisma.aiUsage.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { byTask, byModel, recent };
}
