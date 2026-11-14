import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, STATE_COOKIE, isAllowed, safeNext, sameText, signSession } from "@/lib/session";

/**
 * Step 2: GitHub sends the founder back with a code. Check the state, swap the
 * code for a token, read the login once, and drop the token. Only an allowed
 * login gets a session.
 */
export async function GET(request: NextRequest) {
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
    return res;
  };
  const { GITHUB_CLIENT_ID: id, GITHUB_CLIENT_SECRET: secret, HQ_SESSION_SECRET: sessionSecret } = process.env;
  if (!id || !secret || !sessionSecret || sessionSecret.length < 32) return new NextResponse("hq is not configured.", { status: 503 });

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const [expected = "", next = "/"] = (request.cookies.get(STATE_COOKIE)?.value ?? "").split("|");
  if (!code || !expected || !sameText(state, expected)) return fail("state");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: new URL("/api/auth/callback", request.url).toString() }),
    cache: "no-store",
  });
  const { access_token: token } = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  if (!token) return fail("github");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "nirmaan-hq" },
    cache: "no-store",
  });
  const { login } = (await userRes.json().catch(() => ({}))) as { login?: string };
  if (!login || !isAllowed(login)) return fail("denied");

  const res = NextResponse.redirect(new URL(safeNext(next), request.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
  res.cookies.set(SESSION_COOKIE, await signSession(login, sessionSecret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
