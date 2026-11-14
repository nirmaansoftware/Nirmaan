import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAllowed, verifySession } from "@/lib/session";

/**
 * The gate. Every page and API route needs a valid session for an allowed
 * GitHub login, except the login page and the OAuth routes.
 *
 * FAILS CLOSED: if the auth settings are missing, nothing is served (503).
 * HQ_AUTH=off turns the gate off for running on the founder's Mac only; it is
 * never set on the deployed site.
 */
const PUBLIC = ["/login", "/api/auth/login", "/api/auth/callback"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (process.env.HQ_AUTH === "off") return NextResponse.next();

  const secret = process.env.HQ_SESSION_SECRET;
  if (!secret || secret.length < 32 || !process.env.GITHUB_CLIENT_ID || !process.env.HQ_ALLOWED_LOGINS) {
    return new NextResponse("hq is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const login = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret);
  if (login && isAllowed(login)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "sign in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except static build output and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"],
};
