import { NextRequest, NextResponse } from "next/server";
import { stripe, PLANS, type PlanKey } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";
import { PLAN_RANK } from "@/lib/plan-config";
import { calculateProration, getDowngradeCooldownDays } from "@/lib/proration";

export async function POST(req: NextRequest) {
  try {
    const { plan: newPlan, userId } = await req.json();

    if (!newPlan || !userId) {
      return NextResponse.json({ error: "Missing plan or userId" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, stripe_customer_id, stripe_subscription_id, updated_at")
      .eq("id", userId)
      .single();

    if (!profile?.stripe_subscription_id || !profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    const oldPlan = profile.plan || "free";

    // Verify this is actually a downgrade
    if ((PLAN_RANK[newPlan] ?? 0) >= (PLAN_RANK[oldPlan] ?? 0)) {
      return NextResponse.json({ error: "Not a downgrade — use upgrade endpoint" }, { status: 400 });
    }

    // Check 7-day cooldown
    const cooldownDays = getDowngradeCooldownDays(profile.updated_at);
    if (cooldownDays > 0) {
      return NextResponse.json({
        error: "cooldown",
        cooldownDays,
        message: `You can downgrade in ${cooldownDays} day${cooldownDays > 1 ? "s" : ""}`,
      }, { status: 429 });
    }

    // Get billing period from Stripe
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const subscriptionItemId = subscription.items.data[0]?.id;
    if (!subscriptionItemId) {
      return NextResponse.json({ error: "Could not find subscription item" }, { status: 400 });
    }

    const raw = (subscription as Record<string, unknown>).current_period_start;
    const periodStart = typeof raw === "number"
      ? new Date(raw > 1e12 ? raw : raw * 1000)
      : new Date(String(raw));
    const daysSincePeriodStart = isNaN(periodStart.getTime()) ? 0 : (Date.now() - periodStart.getTime()) / 86400000;

    // Get total API cost this billing period
    const { data: costData } = await supabase
      .from("usage_logs")
      .select("estimated_cost")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString());

    const totalApiCost = (costData || []).reduce(
      (sum, row) => sum + (Number(row.estimated_cost) || 0), 0
    );

    // Calculate custom proration (refund amount)
    const proration = calculateProration({
      oldPlan,
      newPlan,
      daysSincePeriodStart,
      totalApiCostThisPeriod: totalApiCost,
    });

    if (newPlan === "free") {
      // Downgrade to free = cancel subscription
      await stripe.subscriptions.cancel(profile.stripe_subscription_id);

      // Apply refund as credit to customer balance
      if (proration.amountCents > 0) {
        await stripe.customers.update(profile.stripe_customer_id, {
          balance: -(proration.amountCents),
        });
      }

      await supabase
        .from("profiles")
        .update({
          plan: "free",
          plan_status: "cancelled",
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    } else {
      // Downgrade to lower paid plan (Max → Pro)
      const newPlanConfig = PLANS[newPlan as PlanKey];
      if (!newPlanConfig?.priceId) {
        return NextResponse.json({ error: "Invalid target plan" }, { status: 400 });
      }

      // Update subscription without Stripe proration
      await stripe.subscriptions.update(profile.stripe_subscription_id, {
        items: [{ id: subscriptionItemId, price: newPlanConfig.priceId }],
        proration_behavior: "none",
      });

      // Apply refund as credit on next invoice
      if (proration.amountCents > 0) {
        await stripe.invoiceItems.create({
          customer: profile.stripe_customer_id,
          amount: -(proration.amountCents),
          currency: "usd",
          description: `Plan downgrade credit: ${oldPlan} → ${newPlan} (prorated)`,
        });
      }

      await supabase
        .from("profiles")
        .update({
          plan: newPlan,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    return NextResponse.json({
      success: true,
      plan: newPlan,
      refunded: proration.amount,
      consumedPercent: proration.consumedPercent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Downgrade error:", message);
    return NextResponse.json({ error: "Downgrade failed", detail: message }, { status: 500 });
  }
}
