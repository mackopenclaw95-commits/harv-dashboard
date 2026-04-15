import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { syncCostEventsFromVPS } from "@/lib/cost-sync";

export async function GET() {
  try {
    // --- Auth check: require authenticated admin/owner ---
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
    const supabase = createServiceClient();
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!callerProfile || !["owner", "admin"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    // Trigger an on-demand sync (for freshness on admin load).
    // The cron job at /api/cron/sync-costs runs this every 5 min too.
    await syncCostEventsFromVPS(500);

    // --- Read ALL costs from Supabase (persistent, survives VPS event rotation) ---
    let claudeCost = 0;
    let openrouterCost = 0;
    let totalTokens = 0;
    let lastCostEvent: string | null = null;
    const costByModel: Record<string, { tokens: number; cost: number; calls: number }> = {};

    const { data: costRows } = await supabase
      .from("api_cost_events")
      .select("model, tokens, cost, user_id, agent, event_timestamp")
      .not("model", "like", "claude-%")
      .order("event_timestamp", { ascending: false });

    // Per-user cost from api_cost_events (background agents, digest, image gen, etc.)
    const userAgentCost: Record<string, number> = {};

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

      if (row.user_id) {
        userAgentCost[row.user_id] = (userAgentCost[row.user_id] || 0) + cost;
      }
    }

    // Aggregate per-user: messages from usage_logs, authoritative cost from
    // api_cost_events (no double-counting with usage_logs.estimated_cost).
    const userUsage: Record<string, { tokens: number; cost: number; messages: number }> = {};
    for (const row of usageByUser.data || []) {
      const uid = row.user_id;
      if (!uid) continue;
      if (!userUsage[uid]) userUsage[uid] = { tokens: 0, cost: 0, messages: 0 };
      userUsage[uid].tokens += row.tokens_used || 0;
      userUsage[uid].messages += 1;
    }
    for (const [uid, cost] of Object.entries(userAgentCost)) {
      if (!userUsage[uid]) userUsage[uid] = { tokens: 0, cost: 0, messages: 0 };
      userUsage[uid].cost += cost;
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
