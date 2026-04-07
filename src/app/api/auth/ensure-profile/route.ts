import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function POST() {
  try {
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
              try {
                cookieStore.set(name, value, options);
              } catch {}
            });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const serviceClient = createServiceClient();

    // Check if profile already exists
    const { data: existing } = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (existing) {
      return NextResponse.json({ profile: existing });
    }

    // Create new profile
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    const { data: newProfile, error } = await serviceClient
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        role: "user",
        plan: "free",
        plan_status: "trial",
        trial_ends_at: trialEnd.toISOString(),
        onboarded: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: newProfile });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
