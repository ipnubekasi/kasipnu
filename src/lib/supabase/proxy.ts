import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

const PUBLIC_PATHS = ["/login", "/daftar", "/lupa-password", "/auth/", "/konfigurasi", "/api/cron/", "/api/integrasi/"];

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    if (pathname === "/konfigurasi" || pathname.startsWith("/api/")) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/konfigurasi";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() memverifikasi token dan menyegarkan sesi bila perlu.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?lanjut=${encodeURIComponent(pathname + request.nextUrl.search)}` : "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  if (signedIn && (pathname === "/login" || pathname === "/daftar" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/ringkasan";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
