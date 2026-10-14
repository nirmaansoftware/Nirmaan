import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { GOOGLE_COOKIE, finishSignIn, googleConfigured, publicUrl, userForGoogleEmail } from "@/lib/auth/google";
import { startSession } from "@/lib/web/session";
import { audit } from "@/lib/audit";
import { userActor, PUBLIC_ACTOR } from "@/lib/auth/actor";
import { isClientRole } from "@/lib/db/enums";
import { createRateLimiter } from "@/lib/http/rateLimit";
import { recordRefusal } from "@/lib/team/accessRequests";

const allow = createRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });

/** Only paths inside the user's own area, never another site. */
function safeNext(value: string, home: "/os" | "/portal"): string {
  const pattern = home === "/os" ? /^\/os(\/[\w\-/]*)?$/ : /^\/portal(\/[\w\-/]*)?$/;
  return pattern.test(value) ? value : home;
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** GET /api/auth/google/callback?code=…&state=… : back from Google. */
export async function GET(request: NextRequest) {
  const fail = (reason: string, email?: string) => {
    const res = NextResponse.redirect(publicUrl(`/login?error=${reason}${email ? `&as=${encodeURIComponent(email)}` : ""}`, request.nextUrl.origin));
    res.cookies.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
    return res;
  };
  if (!googleConfigured()) return fail("google-off");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(ip).ok) return fail("google-busy");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("google-cancelled");
  let saved: { state?: string; verifier?: string; next?: string };
  try {
    saved = JSON.parse(request.cookies.get(GOOGLE_COOKIE)?.value ?? "{}");
  } catch {
    saved = {};
  }
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  if (!saved.state || !saved.verifier || !code || !sameString(state, saved.state)) return fail("google-expired");

  let email: string;
  try {
    email = await finishSignIn({ code, verifier: saved.verifier, origin: request.nextUrl.origin });
  } catch {
    return fail("google-failed");
  }
  const user = await userForGoogleEmail(email);
  if (!user) {
    await audit(PUBLIC_ACTOR, "auth.google_refused", "User", email, "No active OS account with this email");
    // Not on the team: record an access request and tell the owners (rate-limited).
    let outcome: "requested" | "declined" | "inactive" = "requested";
    try {
      outcome = await recordRefusal(email);
    } catch {
      // Still refuse; the request just isn't recorded this time.
    }
    return fail(outcome === "inactive" ? "google-inactive" : outcome === "declined" ? "google-declined" : "google-not-allowed", email);
  }

  await startSession(user.id);
  await audit(userActor(user), "auth.login", "User", user.id, "Signed in with Google");
  const res = NextResponse.redirect(publicUrl(safeNext(saved.next ?? "", isClientRole(user.role) ? "/portal" : "/os"), request.nextUrl.origin));
  res.cookies.delete({ name: GOOGLE_COOKIE, path: "/api/auth/google" });
  return res;
}
