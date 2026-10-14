import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie → straight to the login page,
 * without rendering anything. The real check (a valid, unexpired session
 * and the right capability) happens on the server in every page and action
 * under /os, because a cookie's presence proves nothing.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("nirmaan_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/os/:path*", "/portal/:path*"],
};
