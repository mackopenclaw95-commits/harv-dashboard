import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServiceClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [profiles, convos, msgs, docs, projects, usageToday, usageByUser] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("conversations").select("id", { count: "exact", head: true }),
      supabase.from("messages").select("id", { count: "exact", head: true }),
      supabase.from("documents").select("id", { count: "exact", head: true }),
      supabase.from("projects").select("id", { count: "exact", head: true }),
      supabase.from("usage_logs").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
      supabase.from("usage_logs").select("user_id, tokens_used, estimated_cost"),
    ]);

    // Build plan lookup from profiles
    const planMap: Record<string, string> = {};
    for (const p of profiles.data || []) {
      planMap[p.id] = p.plan || "free";
    }

    // Aggregate usage per user + split costs by provider
    const userUsage: Record<string, { tokens: number; cost: number; messages: number }> = {};
    let totalApiCost = 0;       // ALL usage cost
    let claudeCost = 0;         // Claude usage (included in $200 flat fee)
    let openrouterCost = 0;     // OpenRouter usage (real pay-per-use cost)
    let totalTokens = 0;

    for (const row of usageByUser.data || []) {
      const uid = row.user_id;
      const tokens = row.tokens_used || 0;
      const cost = Number(row.estimated_cost) || 0;
      totalApiCost += cost;
      totalTokens += tokens;

      // Pro/owner/business users use Claude (included in flat fee)
      // Free users use DeepSeek via OpenRouter (real cost)
      const userPlan = uid ? (planMap[uid] || "free") : "free";
      if (userPlan === "pro" || userPlan === "business" || userPlan === "owner") {
        claudeCost += cost;
      } else {
        openrouterCost += cost;
      }

      if (!uid) continue;
      if (!userUsage[uid]) userUsage[uid] = { tokens: 0, cost: 0, messages: 0 };
      userUsage[uid].tokens += tokens;
      userUsage[uid].cost += cost;
      userUsage[uid].messages += 1;
    }

    const users = (profiles.data || []).map((p) => ({
      ...p,
      usage_tokens: userUsage[p.id]?.tokens || 0,
      usage_cost: userUsage[p.id]?.cost || 0,
      usage_messages: userUsage[p.id]?.messages || 0,
    }));

    return NextResponse.json({
      users,
      stats: {
        totalUsers: users.length,
        activeTrials: users.filter((p) => p.plan_status === "trial").length,
        paidUsers: users.filter((p) => p.plan_status === "active" && p.plan !== "free" && p.role !== "owner").length,
        cancelledUsers: users.filter((p) => p.plan_status === "cancelled").length,
        totalConversations: convos.count || 0,
        totalMessages: msgs.count || 0,
        totalDocuments: docs.count || 0,
        totalProjects: projects.count || 0,
        messagesToday: usageToday.count || 0,
        totalApiCost,         // all usage combined
        claudeCost,           // included in $200 flat fee
        openrouterCost,       // real pay-per-use cost (variable overhead)
        totalTokens,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
