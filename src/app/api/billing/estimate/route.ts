import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";
import { PLAN_RANK } from "@/lib/plan-config";
import { calculateProration, getDowngradeCooldownDays } from "@/lib/proration";

export async function POST(req: NextRequest) {
  try {
    const { newPlan, userId } = await req.json();
    if (!newPlan || !userId) {
      return NextResponse.json({ error: "Missing newPlan or userId" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, stripe_subscription_id, updated_at")
      .eq("id", userId)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const oldPlan = profile.plan || "free";
    if (oldPlan === newPlan) {
      return NextResponse.json({ error: "Already on this plan" }, { status: 400 });
    }

    const isUpgrade = (PLAN_RANK[newPlan] ?? 0) > (PLAN_RANK[oldPlan] ?? 0);

    // Check downgrade cooldown
    if (!isUpgrade) {
      const cooldownDays = getDowngradeCooldownDays(profile.updated_at);
      if (cooldownDays > 0) {
        return NextResponse.json({
          error: "cooldown",
          cooldownDays,
          message: `You can downgrade in ${cooldownDays} day${cooldownDays > 1 ? "s" : ""}`,
        }, { status: 429 });
      }
    }

    // Get billing period start from Stripe
    let daysSincePeriodStart = 0;
    if (profile.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
        const subData = sub as unknown as { current_period_start: number };
        const periodStart = new Date(subData.current_period_start * 1000);
        daysSincePeriodStart = (Date.now() - periodStart.getTime()) / 86400000;
      } catch {
        // If subscription not found, use 0 days
      }
    }

    // Get total API cost this billing period
    const periodStartDate = new Date();
    periodStartDate.setDate(periodStartDate.getDate() - Math.floor(daysSincePeriodStart));
    periodStartDate.setHours(0, 0, 0, 0);

    const { data: costData } = await supabase
      .from("usage_logs")
      .select("estimated_cost")
      .eq("user_id", userId)
      .gte("created_at", periodStartDate.toISOString());

    const totalApiCost = (costData || []).reduce(
      (sum, row) => sum + (Number(row.estimated_cost) || 0), 0
    );

    const result = calculateProration({
      oldPlan,
      newPlan,
      daysSincePeriodStart,
      totalApiCostThisPeriod: totalApiCost,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Estimate failed", detail: message }, { status: 500 });
  }
}
