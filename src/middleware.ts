import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_USER_COOKIE, SESSION_ROLE_COOKIE, parseSessionRoleCookie } from "@/lib/session-cookies";
import { canAccessPathname, getRoleHomePath, rbacForbiddenResponse } from "@/lib/rbac";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  /** RSC / Server Actions / assets: no aplicar auth (evita respuestas 302 inesperadas en POST de acciones). */
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname.startsWith("/_vercel")) {
    return NextResponse.next();
  }

  /** Diagnóstico temporal (solo desarrollo o ENABLE_DEBUG_API=true). */
  if (pathname === "/api/debug-users" || pathname === "/api/debug-db") {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_API !== "true") {
      return rbacForbiddenResponse();
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/login")) {
    /** Server Actions del formulario de login (POST con Next-Action) no deben redirigir a /login. */
    if (req.headers.get("next-action") ?? req.headers.get("Next-Action")) {
      return NextResponse.next();
    }
    if (req.nextUrl.searchParams.get("error") === "role") {
      const res = NextResponse.next();
      res.cookies.delete(SESSION_USER_COOKIE);
      res.cookies.delete(SESSION_ROLE_COOKIE);
      return res;
    }
    return NextResponse.next();
  }

  const uid = req.cookies.get(SESSION_USER_COOKIE)?.value;
  if (!uid) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = parseSessionRoleCookie(req.cookies.get(SESSION_ROLE_COOKIE)?.value);
  if (role == null) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "role");
    const res = NextResponse.redirect(url);
    res.cookies.delete(SESSION_USER_COOKIE);
    res.cookies.delete(SESSION_ROLE_COOKIE);
    return res;
  }

  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = getRoleHomePath(role);
    return NextResponse.redirect(url);
  }

  if (!canAccessPathname(role, pathname)) {
    return rbacForbiddenResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
