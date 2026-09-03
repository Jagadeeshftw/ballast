import { NextResponse, type NextRequest } from "next/server";

/**
 * The dashboard's 404 needs to be two things at once, and a page alone cannot be both.
 *
 * Rendering it through the catch-all keeps the sidebar, so someone who mistypes a URL can
 * navigate out instead of landing on a page that looks like a different site. But the
 * dashboard layout awaits a chain read, so the response has already begun streaming by the
 * time `notFound()` throws and the status is committed as 200 -- an unknown URL that claims
 * to be fine.
 *
 * Rewriting here happens before any rendering starts, so the status is still ours to set.
 * The reader gets the in-shell page; the status line tells the truth.
 */
const VIEWS = new Set(["/app", "/app/cover", "/app/policy", "/app/funds", "/app/engine", "/app/activity"]);

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/\/+$/, "") || "/app";
  if (!VIEWS.has(path)) {
    return NextResponse.rewrite(new URL("/app/not-found-view", req.url), { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/app/:path*" };
