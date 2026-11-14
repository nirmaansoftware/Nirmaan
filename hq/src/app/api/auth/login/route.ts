import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, safeNext } from "@/lib/session";

/** Step 1: send the founder to GitHub with a one-time state (CSRF guard). */
export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return new NextResponse("hq is not configured.", { status: 503 });
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", new URL("/api/auth/callback", request.url).toString());
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "false");
  // No scope: only the public profile (the login) is read.
  const res = NextResponse.redirect(authorize);
  res.cookies.set(STATE_COOKIE, `${state}|${next}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth", maxAge: 600 });
  return res;
}
