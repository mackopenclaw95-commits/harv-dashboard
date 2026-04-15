import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { getModelPricing, estimateCost, splitLegacyTokens } from "@/lib/model-pricing";

/**
 * Log a usage event. Accepts either:
 *  - { tokens_in, tokens_out, model, agent_name }  ← preferred, accurate cost
 *  - { tokens_used, model, agent_name }            ← legacy, 60/40 split fallback
 *
 * `estimated_cost` in the body is now ignored — cost is always computed server-side
 * from the central model_pricing table to prevent frontend/backend drift.
 */
export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const agent_name: string = body.agent_name || "Harv";
    const model: string = body.model || "";
    const tokensIn: number = body.tokens_in || 0;
    const tokensOut: number = body.tokens_out || 0;
    const cachedTokens: number = body.cached_tokens || 0;
    const legacyTotal: number = body.tokens_used || 0;

    // Compute authoritative tokens + cost
    let inTok = tokensIn;
    let outTok = tokensOut;
    if (!inTok && !outTok && legacyTotal > 0) {
      const split = splitLegacyTokens(legacyTotal);
      inTok = split.tokensIn;
      outTok = split.tokensOut;
    }
    const totalTokens = inTok + outTok;

    let cost = 0;
    if (model && totalTokens > 0) {
      const pricing = await getModelPricing();
      cost = estimateCost(pricing, model, {
        tokensIn: inTok,
        tokensOut: outTok,
        cachedTokens,
      });
    } else if (typeof body.estimated_cost === "number") {
      // Legacy path — accept client-supplied cost only when we can't compute
      cost = Number(body.estimated_cost) || 0;
    }

    const serviceClient = createServiceClient();
    const { error } = await serviceClient.from("usage_logs").insert({
      user_id: user.id,
      agent_name,
      tokens_used: totalTokens,
      estimated_cost: cost,
    });

    if (error) {
      console.error("Usage log insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      logged: true,
      tokens_used: totalTokens,
      cost,
      source: model && totalTokens > 0 ? "computed" : "fallback",
    });
  } catch (err) {
    console.error("Usage log error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
