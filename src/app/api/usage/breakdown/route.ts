import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * Per-user cost breakdown for the current user.
 *
 * Returns:
 *   {
 *     total_cost,           // $ across all sources
 *     total_tokens,
 *     by_agent: [{ agent, cost, messages, tokens }],
 *     by_model: [{ model, cost, tokens, calls }],
 *     days: number,
 *     period_start,
 *   }
 */
export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(c) { c.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options); } catch {} }); },
        },
      }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(req.url);
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") || 30)));
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);
    const periodStartIso = periodStart.toISOString();

    const svc = createServiceClient();

    // Frontend chat logs (usage_logs)
    const { data: usageRows } = await svc
      .from("usage_logs")
      .select("agent_name, tokens_used, estimated_cost")
      .eq("user_id", user.id)
      .gte("created_at", periodStartIso);

    // Backend agent logs (api_cost_events) — only rows explicitly attributed to this user
    const { data: costRows } = await svc
      .from("api_cost_events")
      .select("agent, model, tokens, cost")
      .eq("user_id", user.id)
      .gte("event_timestamp", periodStartIso);

    const byAgent: Record<string, { agent: string; cost: number; messages: number; tokens: number }> = {};
    const byModel: Record<string, { model: string; cost: number; tokens: number; calls: number }> = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const row of usageRows || []) {
      const agent = row.agent_name || "Harv";
      const cost = Number(row.estimated_cost) || 0;
      const tokens = row.tokens_used || 0;
      totalCost += cost;
      totalTokens += tokens;
      if (!byAgent[agent]) byAgent[agent] = { agent, cost: 0, messages: 0, tokens: 0 };
      byAgent[agent].cost += cost;
      byAgent[agent].messages += 1;
      byAgent[agent].tokens += tokens;
    }

    for (const row of costRows || []) {
      const agent = row.agent || "Unknown";
      const model = row.model || "Unknown";
      const cost = Number(row.cost) || 0;
      const tokens = row.tokens || 0;
      totalCost += cost;
      totalTokens += tokens;
      if (!byAgent[agent]) byAgent[agent] = { agent, cost: 0, messages: 0, tokens: 0 };
      byAgent[agent].cost += cost;
      byAgent[agent].tokens += tokens;
      if (!byModel[model]) byModel[model] = { model, cost: 0, tokens: 0, calls: 0 };
      byModel[model].cost += cost;
      byModel[model].tokens += tokens;
      byModel[model].calls += 1;
    }

    return NextResponse.json({
      total_cost: totalCost,
      total_tokens: totalTokens,
      by_agent: Object.values(byAgent).sort((a, b) => b.cost - a.cost),
      by_model: Object.values(byModel).sort((a, b) => b.cost - a.cost),
      days,
      period_start: periodStartIso,
    });
  } catch (err) {
    console.error("[usage/breakdown] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
