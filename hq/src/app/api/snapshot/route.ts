import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/data";

/** The live view polls this. Never cached: every request is the latest snapshot. */
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getSnapshot();
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
