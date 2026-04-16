import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { TIER_LIMITS as STRIPE_TIERS, type TierKey } from "@/lib/stripe";
import { isAgentAvailable, TIER_LIMITS as PLAN_TIERS } from "@/lib/plan-config";

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
    const tierConfig = STRIPE_TIERS[plan] || STRIPE_TIERS.free;
    const planTier = PLAN_TIERS[plan] || PLAN_TIERS.free;
    const costCapUsd = planTier.dailyCostCapUsd;
    const weeklyCostCapUsd = planTier.weeklyCostCapUsd;
    const monthlyCostCapUsd = planTier.monthlyCostCapUsd;

    // Owner always gets unlimited — skip cost checks entirely
    if (profile?.role === "owner") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: ownerToday } = await supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", todayStart.toISOString());
      const { count: ownerImages } = await supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("agent_name", "Image Gen")
        .gte("created_at", todayStart.toISOString());
      return NextResponse.json({
        allowed: true,
        used: ownerToday || 0,
        limit: -1,
        remaining: -1,
        degraded: false,
        model_tier: "primary" as const,
        image_remaining: -1,
        images_used: ownerImages || 0,
        agent_allowed: true,
      });
    }

    // Tester goes through normal flow but is never blocked (sees same UI as real users)

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

    // Cost caps — daily, weekly, monthly
    let dailyCostUsd = 0;
    let weeklyCostUsd = 0;
    let monthlyCostUsd = 0;
    let costExceeded = false;
    let weeklyCostExceeded = false;
    let monthlyCostExceeded = false;

    const svc = createServiceClient();

    // Monthly: 1st of current calendar month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: monthlyCostRows } = await svc
      .from("api_cost_events")
      .select("cost, event_timestamp")
      .eq("user_id", user.id)
      .gte("event_timestamp", monthStart.toISOString());

    // Sum into daily/weekly/monthly buckets in one pass
    const todayMs = todayStart.getTime();
    const weekMs = weekStart.getTime();
    for (const row of monthlyCostRows || []) {
      const c = Number(row.cost) || 0;
      const ts = new Date(row.event_timestamp).getTime();
      monthlyCostUsd += c;
      if (ts >= weekMs) weeklyCostUsd += c;
      if (ts >= todayMs) dailyCostUsd += c;
    }

    if (costCapUsd > 0) costExceeded = dailyCostUsd >= costCapUsd;
    if (weeklyCostCapUsd > 0) weeklyCostExceeded = weeklyCostUsd >= weeklyCostCapUsd;
    if (monthlyCostCapUsd > 0) monthlyCostExceeded = monthlyCostUsd >= monthlyCostCapUsd;

    // Determine model tier with graceful degradation
    // Chain: primary → fallback → free → blocked
    let modelTier: "primary" | "fallback" | "free" | "blocked";
    let degraded = false;

    const isTester = profile?.role === "tester";
    const dailyCostPct = costCapUsd > 0 ? dailyCostUsd / costCapUsd : 0;

    const hasFallback = !!tierConfig.fallbackModel;

    if (monthlyCostExceeded || weeklyCostExceeded || weeklyExceeded) {
      // Hard caps (profitability guardrails) — block completely
      modelTier = isTester ? "primary" : "blocked";
      degraded = !isTester;
    } else if (costExceeded) {
      // Daily cost cap hit — degrade to free model if available, else block
      modelTier = isTester ? "primary" : (hasFallback ? "free" : "blocked");
      degraded = !isTester;
    } else if (dailyCostPct >= 0.8 || used >= primaryLimit) {
      // 80% of daily cost cap OR message limit hit — degrade if fallback exists, else block
      modelTier = isTester ? "primary" : (hasFallback ? "fallback" : "blocked");
      degraded = !isTester;
    } else {
      modelTier = "primary";
    }

    return NextResponse.json({
      allowed: isTester ? true : (modelTier !== "blocked"),
      used,
      limit: primaryLimit,
      remaining: Math.max(0, primaryLimit - used),
      degraded,
      model_tier: modelTier,
      image_remaining: imageRemaining,
      weekly_used: weeklyUsed,
      weekly_limit: weeklyLimit,
      agent_allowed: true,
      daily_cost_usd: Number(dailyCostUsd.toFixed(6)),
      daily_cost_cap_usd: costCapUsd,
      cost_exceeded: costExceeded,
      weekly_cost_usd: Number(weeklyCostUsd.toFixed(6)),
      weekly_cost_cap_usd: weeklyCostCapUsd,
      weekly_cost_exceeded: weeklyCostExceeded,
      monthly_cost_usd: Number(monthlyCostUsd.toFixed(6)),
      monthly_cost_cap_usd: monthlyCostCapUsd,
      monthly_cost_exceeded: monthlyCostExceeded,
      reason: monthlyCostExceeded ? "monthly_cost_cap" : weeklyCostExceeded ? "weekly_cost_cap" : costExceeded ? "daily_cost_cap" : weeklyExceeded ? "weekly_limit" : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
