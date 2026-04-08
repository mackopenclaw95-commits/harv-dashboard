import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found" }, { status: 404 });
    }

    // Create a portal config that only allows payment method updates
    // (cancel/downgrade is handled by our custom proration system)
    const config = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "Manage your HarvAI subscription",
      },
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        subscription_cancel: { enabled: false },
        subscription_update: { enabled: false },
      },
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      configuration: config.id,
      return_url: `${req.headers.get("origin") || "http://localhost:3000"}/settings?tab=billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Portal error:", err);
    return NextResponse.json({ error: "Portal creation failed" }, { status: 500 });
  }
}
