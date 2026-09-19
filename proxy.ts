import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = [
  "/",
  "/search",
  "/library",
  "/quiz",
  "/tutor",
  "/subjects",
  "/topics",
  "/profile",
  "/admin",
  "/onboarding",
];

// Routes that must stay reachable even for a signed-in user who hasn't
// finished onboarding (picked a course, accepted the terms) - otherwise
// they could never reach the page that lets them finish it, or sign out.
const ONBOARDING_EXEMPT_PREFIXES = ["/onboarding", "/login", "/signup", "/auth", "/terms", "/api"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")));
}

function isProtected(pathname: string) {
  return matchesPrefix(pathname, PROTECTED_PREFIXES);
}

function isOnboardingExempt(pathname: string) {
  return matchesPrefix(pathname, ONBOARDING_EXEMPT_PREFIXES);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && !isOnboardingExempt(request.nextUrl.pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("course_id, terms_accepted_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && (!profile.course_id || !profile.terms_accepted_at)) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
