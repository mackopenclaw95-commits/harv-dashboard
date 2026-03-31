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

    // Also pull real cost data from VPS events API
    let vpsCostData = { claudeCost: 0, openrouterCost: 0, totalTokens: 0 };
    try {
      const API_URL = process.env.API_URL || "https://api.openclaw-yqar.srv1420157.hstgr.cloud";
      const API_KEY = process.env.HARV_API_KEY || "";
      const eventsRes = await fetch(
        `${API_URL}/api/events/recent?limit=200`,
        { headers: { "X-API-Key": API_KEY }, next: { revalidate: 60 } }
      );
      if (eventsRes.ok) {
        const events = await eventsRes.json();
        for (const evt of events) {
          if (evt.action !== "api_cost") continue;
          const summary = evt.summary || "";
          const tokens = evt.tokens || 0;
          const cost = evt.cost || 0;

          // Determine provider from model name in summary
          const isClaudeModel = summary.includes("claude-");
          if (isClaudeModel) {
            vpsCostData.claudeCost += cost;
          } else {
            vpsCostData.openrouterCost += cost;
          }
          vpsCostData.totalTokens += tokens;
        }
      }
    } catch {}

    // Build plan lookup from profiles
    const planMap: Record<string, string> = {};
    for (const p of profiles.data || []) {
      planMap[p.id] = p.plan || "free";
    }

    // Aggregate usage per user from dashboard usage_logs
    const userUsage: Record<string, { tokens: number; cost: number; messages: number }> = {};
    let dashboardTotalCost = 0;

    for (const row of usageByUser.data || []) {
      const uid = row.user_id;
      const tokens = row.tokens_used || 0;
      const cost = Number(row.estimated_cost) || 0;
      dashboardTotalCost += cost;

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

    // Use VPS data for accurate cost split (falls back to dashboard data)
    const claudeCost = vpsCostData.claudeCost || 0;
    const openrouterCost = vpsCostData.openrouterCost || 0;
    const totalApiCost = claudeCost + openrouterCost;

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
        totalApiCost,
        claudeCost,           // included in $200 flat fee
        openrouterCost,       // real pay-per-use cost
        totalTokens: vpsCostData.totalTokens || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
