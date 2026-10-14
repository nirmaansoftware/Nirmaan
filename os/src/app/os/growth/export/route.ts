import { getCurrentUser } from "@/lib/web/session";
import { can } from "@/lib/auth/permissions";
import { userActor } from "@/lib/auth/actor";
import { messagesCsv } from "@/lib/prospecting/growth";

/** GET /os/growth/export?channel=&status=&campaign=&q= : the message log as CSV (owners only). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "growth:read")) return new Response("Not allowed.", { status: 403 });
  const p = new URL(request.url).searchParams;
  const csv = await messagesCsv(userActor(user), { channel: p.get("channel") ?? undefined, status: p.get("status") ?? undefined, campaignId: p.get("campaign") ?? undefined, q: p.get("q") ?? undefined });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nirmaan-outreach-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
