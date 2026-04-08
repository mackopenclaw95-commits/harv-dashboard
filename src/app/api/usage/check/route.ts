import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { TIER_LIMITS, type TierKey } from "@/lib/stripe";
import { isAgentAvailable } from "@/lib/plan-config";

export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get("agent");
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
      .select("plan, role, plan_status, trial_ends_at")
      .eq("id", user.id)
      .single();

    const plan = (profile?.plan || "free") as TierKey;
    const tierConfig = TIER_LIMITS[plan] || TIER_LIMITS.free;

    // Owner/tester always gets primary tier, unlimited
    if (profile?.role === "owner" || profile?.role === "tester") {
      return NextResponse.json({
        allowed: true,
        used: 0,
        limit: -1,
        remaining: -1,
        degraded: false,
        model_tier: "primary" as const,
        image_remaining: -1,
        agent_allowed: true,
      });
    }

    // Agent gating — check if agent is available on user's plan
    if (agent && !isAgentAvailable(agent, plan)) {
      return NextResponse.json({
        allowed: false,
        reason: "agent_locked",
        agent,
        plan,
        agent_allowed: false,
      });
    }

    // Trial expiry check — free users with expired trial are blocked
    if (plan === "free" && profile?.plan_status === "trial" && profile?.trial_ends_at) {
      const trialEnd = new Date(profile.trial_ends_at);
      if (new Date() > trialEnd) {
        // Auto-update plan_status to expired
        await supabase
          .from("profiles")
          .update({ plan_status: "expired" })
          .eq("id", user.id);

        return NextResponse.json({
          allowed: false,
          reason: "trial_expired",
          plan,
          trial_ended: profile.trial_ends_at,
        });
      }
    }

    // Expired free users are blocked until they upgrade
    if (plan === "free" && profile?.plan_status === "expired") {
      return NextResponse.json({
        allowed: false,
        reason: "trial_expired",
        plan,
      });
    }

    // Count today's messages
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", todayStart.toISOString());

    const used = todayCount || 0;
    const primaryLimit = tierConfig.primaryMessagesPerDay;

    // Weekly backstop check
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const { count: weekCount } = await supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", weekStart.toISOString());

    const weeklyUsed = weekCount || 0;
    const weeklyLimit = tierConfig.weeklyBackstop;
    const weeklyExceeded = weeklyLimit > 0 && weeklyUsed >= weeklyLimit;

    // Image generation count today
    const { count: imageCount } = await supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("agent_name", "Image Gen")
      .gte("created_at", todayStart.toISOString());

    const imagesUsed = imageCount || 0;
    const imageLimit = tierConfig.imagesPerDay;
    const imageRemaining = imageLimit <= 0 ? 0 : Math.max(0, imageLimit - imagesUsed);

    // Determine model tier
    let modelTier: "primary" | "fallback" | "blocked";
    let degraded = false;

    if (weeklyExceeded) {
      // Weekly backstop hit — block completely
      modelTier = "blocked";
      degraded = true;
    } else if (used >= primaryLimit) {
      // Past daily primary limit — degrade to fallback model
      modelTier = "fallback";
      degraded = true;
    } else {
      modelTier = "primary";
    }

    return NextResponse.json({
      allowed: modelTier !== "blocked",
      used,
      limit: primaryLimit,
      remaining: Math.max(0, primaryLimit - used),
      degraded,
      model_tier: modelTier,
      image_remaining: imageRemaining,
      weekly_used: weeklyUsed,
      weekly_limit: weeklyLimit,
      agent_allowed: true,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
