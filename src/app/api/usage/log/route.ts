import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * Log a usage event — tracks MESSAGE COUNT for tier limits only.
 *
 * Cost is no longer logged here to avoid double-counting: VPS-side
 * log_api_cost() already writes to api_cost_events with user_id via
 * contextvar, and that's the authoritative source of truth.
 *
 * This endpoint still inserts into usage_logs so /api/usage/check can
 * gate daily/weekly message counts per tier. The estimated_cost column
 * is set to 0; real costs come from api_cost_events in /api/usage/breakdown.
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
    const tokensIn: number = body.tokens_in || 0;
    const tokensOut: number = body.tokens_out || 0;
    const totalTokens = tokensIn + tokensOut || body.tokens_used || 0;

    const serviceClient = createServiceClient();
    // estimated_cost intentionally 0 — authoritative costs live in
    // api_cost_events (written by VPS with proper user_id attribution)
    const { error } = await serviceClient.from("usage_logs").insert({
      user_id: user.id,
      agent_name,
      tokens_used: totalTokens,
      estimated_cost: 0,
    });

    if (error) {
      console.error("Usage log insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logged: true, tokens_used: totalTokens });
  } catch (err) {
    console.error("Usage log error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
