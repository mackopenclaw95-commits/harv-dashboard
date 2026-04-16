import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Public routes that don't require auth
  const publicPaths = ["/auth/login", "/auth/signup", "/auth/callback", "/features", "/pricing", "/about", "/meet-the-agents", "/connect"];
  const isPublic =
    req.nextUrl.pathname === "/" ||
    publicPaths.some((p) => req.nextUrl.pathname.startsWith(p));

  // API routes handle their own auth
  const isApi = req.nextUrl.pathname.startsWith("/api/");

  // Only skip auth if explicitly disabled via env var (for local dev)
  const SKIP_AUTH = process.env.SKIP_AUTH === "true";
  if (!session && !isPublic && !isApi && !SKIP_AUTH) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("next", req.nextUrl.pathname === "/" ? "/dashboard" : req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes — check role
  if (req.nextUrl.pathname.startsWith("/admin") && session) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (profile?.role !== "owner" && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    // Match all routes except static files and _next
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
