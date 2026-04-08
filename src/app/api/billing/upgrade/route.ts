import { NextRequest, NextResponse } from "next/server";
import { stripe, PLANS, type PlanKey } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { plan, userId } = await req.json();

    if (!plan || !userId) {
      return NextResponse.json({ error: "Missing plan or userId" }, { status: 400 });
    }

    const planConfig = PLANS[plan as PlanKey];
    if (!planConfig || !planConfig.priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, stripe_subscription_id, plan")
      .eq("id", userId)
      .single();

    if (!profile?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription to upgrade" }, { status: 400 });
    }

    // Get the current subscription to find the item ID
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const subscriptionItemId = subscription.items.data[0]?.id;

    if (!subscriptionItemId) {
      return NextResponse.json({ error: "Could not find subscription item" }, { status: 400 });
    }

    // Update the subscription with proration (Stripe handles the credit automatically)
    const updated = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{
        id: subscriptionItemId,
        price: planConfig.priceId,
      }],
      proration_behavior: "create_prorations",
    });

    // Update the profile
    await supabase
      .from("profiles")
      .update({
        plan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    return NextResponse.json({
      success: true,
      plan,
      status: updated.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Upgrade error:", message);
    return NextResponse.json({ error: "Upgrade failed", detail: message }, { status: 500 });
  }
}
