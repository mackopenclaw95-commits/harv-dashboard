import { NextRequest, NextResponse } from "next/server";
import { stripe, PLANS, type PlanKey } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";
import { calculateProration } from "@/lib/proration";

export async function POST(req: NextRequest) {
  try {
    const { plan: newPlan, userId } = await req.json();

    if (!newPlan || !userId) {
      return NextResponse.json({ error: "Missing plan or userId" }, { status: 400 });
    }

    const planConfig = PLANS[newPlan as PlanKey];
    if (!planConfig || !planConfig.priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, stripe_customer_id, stripe_subscription_id")
      .eq("id", userId)
      .single();

    if (!profile?.stripe_subscription_id || !profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No active subscription to upgrade" }, { status: 400 });
    }

    const oldPlan = profile.plan || "free";

    // Get billing period from Stripe
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const subscriptionItemId = subscription.items.data[0]?.id;
    if (!subscriptionItemId) {
      return NextResponse.json({ error: "Could not find subscription item" }, { status: 400 });
    }

    const sub = subscription as unknown as { current_period_start: number };
    const periodStart = new Date(sub.current_period_start * 1000);
    const daysSincePeriodStart = (Date.now() - periodStart.getTime()) / 86400000;

    // Get total API cost this billing period
    const { data: costData } = await supabase
      .from("usage_logs")
      .select("estimated_cost")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString());

    const totalApiCost = (costData || []).reduce(
      (sum, row) => sum + (Number(row.estimated_cost) || 0), 0
    );

    // Calculate custom proration
    const proration = calculateProration({
      oldPlan,
      newPlan,
      daysSincePeriodStart,
      totalApiCostThisPeriod: totalApiCost,
    });

    // Update subscription WITHOUT Stripe's auto-proration
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: subscriptionItemId, price: planConfig.priceId }],
      proration_behavior: "none",
    });

    // Add our custom charge as an invoice item
    if (proration.amountCents > 0) {
      await stripe.invoiceItems.create({
        customer: profile.stripe_customer_id,
        amount: proration.amountCents,
        currency: "usd",
        description: `Plan upgrade: ${oldPlan} → ${newPlan} (prorated)`,
      });
    }

    // Update profile
    await supabase
      .from("profiles")
      .update({
        plan: newPlan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    return NextResponse.json({
      success: true,
      plan: newPlan,
      charged: proration.amount,
      consumedPercent: proration.consumedPercent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Upgrade error:", message);
    return NextResponse.json({ error: "Upgrade failed", detail: message }, { status: 500 });
  }
}
