import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Model pricing per million tokens (matching OpenRouter rates)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "deepseek/deepseek-chat": { input: 0.32, output: 0.89 },
  "x-ai/grok-4.1-fast": { input: 0.05, output: 0.10 },
  "qwen/qwen3-8b": { input: 0.04, output: 0.09 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.0 },
};

function estimateCost(model: string, tokens: number): number {
  // Rough estimate: assume 60% input, 40% output
  const pricing = MODEL_PRICING[model];
  if (!pricing || tokens === 0) return 0;
  const inTokens = Math.round(tokens * 0.6);
  const outTokens = tokens - inTokens;
  return (inTokens * pricing.input + outTokens * pricing.output) / 1_000_000;
}

export async function GET() {
  try {
    const supabase = createServiceClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [profiles, usageToday, usageByUser] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("usage_logs").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
      supabase.from("usage_logs").select("user_id, tokens_used, estimated_cost"),
    ]);

    // Pull real cost data from VPS events API
    let claudeCost = 0;
    let openrouterCost = 0;
    let totalTokens = 0;

    try {
      const API_URL = process.env.API_URL || "https://api.openclaw-yqar.srv1420157.hstgr.cloud";
      const API_KEY = process.env.HARV_API_KEY || "";
      const eventsRes = await fetch(`${API_URL}/api/events/recent?limit=500`, {
        headers: { "X-API-Key": API_KEY },
      });
      if (eventsRes.ok) {
        const json = await eventsRes.json();
        const events = json.events || json || [];
        for (const evt of events) {
          if (evt.action !== "api_cost") continue;
          const summary = String(evt.summary || "");
          const tokens = evt.tokens || 0;
          totalTokens += tokens;

          // Extract model name from summary: "model_name | X tokens | $Y"
          const model = summary.split("|")[0]?.trim() || "";
          const isClaudeModel = model.startsWith("claude-");

          // Calculate cost from model pricing if VPS cost is 0
          let cost = evt.cost || 0;
          if (cost === 0 && tokens > 0) {
            cost = estimateCost(model, tokens);
          }

          if (isClaudeModel) {
            claudeCost += cost;
          } else {
            openrouterCost += cost;
          }
        }
      }
    } catch {}

    // Aggregate usage per user from dashboard usage_logs
    const userUsage: Record<string, { tokens: number; cost: number; messages: number }> = {};
    for (const row of usageByUser.data || []) {
      const uid = row.user_id;
      if (!uid) continue;
      if (!userUsage[uid]) userUsage[uid] = { tokens: 0, cost: 0, messages: 0 };
      userUsage[uid].tokens += row.tokens_used || 0;
      userUsage[uid].cost += Number(row.estimated_cost) || 0;
      userUsage[uid].messages += 1;
    }

    const users = (profiles.data || []).map((p) => ({
      ...p,
      usage_tokens: userUsage[p.id]?.tokens || 0,
      usage_cost: userUsage[p.id]?.cost || 0,
      usage_messages: userUsage[p.id]?.messages || 0,
    }));

    const totalApiCost = claudeCost + openrouterCost;

    return NextResponse.json({
      users,
      stats: {
        totalUsers: users.length,
        activeTrials: users.filter((p) => p.plan_status === "trial").length,
        paidUsers: users.filter((p) => p.plan_status === "active" && p.plan !== "free" && p.role !== "owner").length,
        cancelledUsers: users.filter((p) => p.plan_status === "cancelled").length,
        totalConversations: 0,
        totalMessages: 0,
        totalDocuments: 0,
        totalProjects: 0,
        messagesToday: usageToday.count || 0,
        totalApiCost,
        claudeCost,
        openrouterCost,
        totalTokens,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
