import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Model pricing per million tokens (matching OpenRouter rates)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "deepseek/deepseek-chat": { input: 0.32, output: 0.89 },
  "deepseek/deepseek-v3.2": { input: 0.26, output: 0.38 },
  "x-ai/grok-4.1-fast": { input: 0.05, output: 0.10 },
  "qwen/qwen3-8b": { input: 0.04, output: 0.09 },
  "google/gemini-2.0-flash-lite-001": { input: 0.075, output: 0.30 },
  "openai/gpt-4.1": { input: 2.0, output: 8.0 },
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

    // Backfill: create profile rows for any auth users missing one
    try {
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
      if (authUsers && authUsers.length > 0) {
        const { data: existingProfiles } = await supabase
          .from("profiles")
          .select("id");
        const existingIds = new Set((existingProfiles || []).map((p) => p.id));

        const missing = authUsers.filter((u) => !existingIds.has(u.id));
        if (missing.length > 0) {
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + 7);

          const rows = missing.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.user_metadata?.name || u.user_metadata?.full_name || null,
            avatar_url: u.user_metadata?.avatar_url || null,
            role: "user",
            plan: "free",
            plan_status: "trial",
            trial_ends_at: trialEnd.toISOString(),
            onboarded: false,
          }));

          await supabase.from("profiles").insert(rows);
        }
      }
    } catch (err) {
      console.error("[admin/stats] Profile backfill error:", err);
    }

    const [profiles, usageToday, usageByUser] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("usage_logs").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
      supabase.from("usage_logs").select("user_id, tokens_used, estimated_cost"),
    ]);

    // --- Sync new api_cost events from VPS into Supabase ---
    try {
      const API_URL = process.env.API_URL || "https://api.openclaw-yqar.srv1420157.hstgr.cloud";
      const API_KEY = process.env.HARV_API_KEY || "";
      const eventsRes = await fetch(`${API_URL}/api/events/recent?limit=500`, {
        headers: { "X-API-Key": API_KEY },
      });
      if (eventsRes.ok) {
        const json = await eventsRes.json();
        const events = json.events || json || [];
        const costEvents = events.filter((evt: Record<string, unknown>) => evt.action === "api_cost");

        if (costEvents.length > 0) {
          // Upsert new api_cost events into Supabase (dedup by vps_event_id)
          const rows = costEvents.map((evt: Record<string, unknown>) => {
            const summary = String(evt.summary || "");
            const model = summary.split("|")[0]?.trim() || "";
            const tokens = (evt.tokens as number) || 0;
            let cost = (evt.cost as number) || 0;
            if (cost === 0 && tokens > 0) {
              cost = estimateCost(model, tokens);
            }
            return {
              vps_event_id: evt.id as number,
              model,
              tokens,
              cost,
              agent: String(evt.agent || ""),
              summary,
              event_timestamp: evt.timestamp as string,
            };
          });

          await supabase
            .from("api_cost_events")
            .upsert(rows, { onConflict: "vps_event_id", ignoreDuplicates: true });
        }
      } else {
        console.error("[admin/stats] VPS events API returned", eventsRes.status);
      }
    } catch (err) {
      console.error("[admin/stats] Failed to sync VPS events:", err);
    }

    // --- Read ALL costs from Supabase (persistent, survives VPS event rotation) ---
    let claudeCost = 0;
    let openrouterCost = 0;
    let totalTokens = 0;
    let lastCostEvent: string | null = null;
    const costByModel: Record<string, { tokens: number; cost: number; calls: number }> = {};

    const { data: costRows } = await supabase
      .from("api_cost_events")
      .select("model, tokens, cost, event_timestamp")
      .order("event_timestamp", { ascending: false });

    for (const row of costRows || []) {
      const model = row.model || "";
      const tokens = row.tokens || 0;
      const cost = Number(row.cost) || 0;

      if (!lastCostEvent) lastCostEvent = row.event_timestamp;

      totalTokens += tokens;

      const isClaudeModel = model.startsWith("claude-");
      if (isClaudeModel) {
        claudeCost += cost;
      } else {
        openrouterCost += cost;
      }

      if (model) {
        if (!costByModel[model]) costByModel[model] = { tokens: 0, cost: 0, calls: 0 };
        costByModel[model].tokens += tokens;
        costByModel[model].cost += cost;
        costByModel[model].calls += 1;
      }
    }

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
        paidUsers: users.filter((p) => p.plan_status === "active" && p.plan !== "free" && p.role !== "owner" && p.role !== "tester").length,
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
        costByModel,
        lastCostEvent,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
