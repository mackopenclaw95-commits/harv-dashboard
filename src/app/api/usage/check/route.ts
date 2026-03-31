import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const TIER_LIMITS: Record<string, number> = {
  free: 50,
  pro: -1,
  business: -1,
};

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(c) { c.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options); } catch {} }); },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ allowed: false, reason: "Not authenticated" }, { status: 401 });
    }

    // Get user's plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, role")
      .eq("id", user.id)
      .single();

    const plan = profile?.plan || "free";

    // Owner always allowed
    if (profile?.role === "owner") {
      return NextResponse.json({ allowed: true, used: 0, limit: -1, remaining: -1 });
    }

    const limit = TIER_LIMITS[plan] ?? TIER_LIMITS.free;
    if (limit === -1) {
      return NextResponse.json({ allowed: true, used: 0, limit: -1, remaining: -1 });
    }

    // Count today's usage
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", todayStart.toISOString());

    const used = count || 0;
    const allowed = used < limit;

    return NextResponse.json({
      allowed,
      used,
      limit,
      remaining: Math.max(0, limit - used),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
