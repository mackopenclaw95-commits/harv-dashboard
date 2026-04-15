import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { API_BASE as API_URL_CFG, API_KEY as API_KEY_CFG } from "@/lib/api-config";
import { getModelPricing, estimateCost as computeCost, splitLegacyTokens } from "@/lib/model-pricing";

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

    // --- Sync new api_cost events from VPS into Supabase ---
    const pricing = await getModelPricing();
    try {
      const eventsRes = await fetch(`${API_URL_CFG}/api/events/recent?limit=500`, {
        headers: { "X-API-Key": API_KEY_CFG },
        signal: AbortSignal.timeout(15000),
      });
      if (eventsRes.ok) {
        const json = await eventsRes.json();
        const events = json.events || json || [];
        const costEvents = events.filter((evt: Record<string, unknown>) =>
          evt.action === "api_cost" && !String(evt.summary || "").startsWith("claude-")
        );

        if (costEvents.length > 0) {
          // Upsert new api_cost events into Supabase (dedup by vps_event_id)
          // VPS stuffs user_id / tokens_in / etc. into the metadata JSON blob.
          const rows = costEvents.map((evt: Record<string, unknown>) => {
            const summary = String(evt.summary || "");
            const model = summary.split("|")[0]?.trim() || "";
            const tokens = (evt.tokens as number) || 0;
            const meta = (evt.metadata && typeof evt.metadata === "object"
              ? (evt.metadata as Record<string, unknown>)
              : {}) as Record<string, unknown>;
            const tokensIn = (meta.input_tokens as number) || (evt.tokens_in as number) || 0;
            const tokensOut = (meta.output_tokens as number) || (evt.tokens_out as number) || 0;
            const cachedTokens = (meta.cached_tokens as number) || 0;
            const units = (meta.units as number) || 0;
            const modality = (meta.modality as string) || "text";
            let cost = (evt.cost as number) || 0;
            if (cost === 0) {
              if (tokensIn || tokensOut) {
                cost = computeCost(pricing, model, { tokensIn, tokensOut, cachedTokens });
              } else if (tokens > 0) {
                const split = splitLegacyTokens(tokens);
                cost = computeCost(pricing, model, split);
              } else if (units > 0) {
                cost = computeCost(pricing, model, { units });
              }
            }
            return {
              vps_event_id: evt.id as number,
              model,
              tokens,
              tokens_in: tokensIn,
              tokens_out: tokensOut,
              cached_tokens: cachedTokens,
              units,
              cost,
              agent: String(evt.agent || ""),
              parent_agent: (meta.parent_agent as string) || null,
              user_id: (meta.user_id as string) || null,
              modality,
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

    // Aggregate usage per user from dashboard usage_logs + api_cost_events
    const userUsage: Record<string, { tokens: number; cost: number; messages: number }> = {};
    for (const row of usageByUser.data || []) {
      const uid = row.user_id;
      if (!uid) continue;
      if (!userUsage[uid]) userUsage[uid] = { tokens: 0, cost: 0, messages: 0 };
      userUsage[uid].tokens += row.tokens_used || 0;
      userUsage[uid].cost += Number(row.estimated_cost) || 0;
      userUsage[uid].messages += 1;
    }
    // Fold in background/agent costs from api_cost_events
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
