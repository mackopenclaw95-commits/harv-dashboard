import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Ensure a profile row exists for this user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const serviceClient = createServiceClient();
        const { data: existing } = await serviceClient
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .single();

        if (!existing) {
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + 7);

          await serviceClient.from("profiles").insert({
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || user.user_metadata?.full_name || null,
            avatar_url: user.user_metadata?.avatar_url || null,
            role: "user",
            plan: "free",
            plan_status: "trial",
            trial_ends_at: trialEnd.toISOString(),
            onboarded: false,
          });
        }
      }

      return NextResponse.redirect(new URL(next, req.url));
    }
  }

  // Auth error — redirect to login
  return NextResponse.redirect(new URL("/auth/login", req.url));
}
