import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET() {
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

    const service = createServiceClient();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch last 30 days of usage logs
    const { data: logs, error } = await service
      .from("usage_logs")
      .select("agent_name, tokens_used, estimated_cost, created_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = logs || [];

    // 1. Messages per day (last 30 days)
    const messagesByDay: Record<string, number> = {};
    const tokensByDay: Record<string, number> = {};
    for (const row of rows) {
      const d = new Date(row.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      messagesByDay[key] = (messagesByDay[key] || 0) + 1;
      tokensByDay[key] = (tokensByDay[key] || 0) + (row.tokens_used || 0);
    }

    // Fill missing days with 0
    const dailyMessages: { date: string; messages: number; tokens: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dailyMessages.push({
        date: key,
        messages: messagesByDay[key] || 0,
        tokens: tokensByDay[key] || 0,
      });
    }

    // 2. Top agents by message count
    const agentCounts: Record<string, { messages: number; tokens: number; cost: number }> = {};
    for (const row of rows) {
      const name = row.agent_name || "Harv";
      if (!agentCounts[name]) agentCounts[name] = { messages: 0, tokens: 0, cost: 0 };
      agentCounts[name].messages += 1;
      agentCounts[name].tokens += row.tokens_used || 0;
      agentCounts[name].cost += Number(row.estimated_cost) || 0;
    }
    const topAgents = Object.entries(agentCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.messages - a.messages);

    // 3. Usage by hour of day
    const hourly = new Array(24).fill(0);
    for (const row of rows) {
      const h = new Date(row.created_at).getHours();
      hourly[h]++;
    }
    const usageByHour = hourly.map((count, hour) => ({ hour, messages: count }));

    // 4. Summary stats
    const totalMessages = rows.length;
    const totalTokens = rows.reduce((sum, r) => sum + (r.tokens_used || 0), 0);
    const totalCost = rows.reduce((sum, r) => sum + (Number(r.estimated_cost) || 0), 0);
    const avgPerDay = totalMessages / 30;
    const uniqueAgents = Object.keys(agentCounts).length;

    // 5. Streak (consecutive days with messages)
    let streak = 0;
    for (let i = dailyMessages.length - 1; i >= 0; i--) {
      if (dailyMessages[i].messages > 0) streak++;
      else break;
    }

    return NextResponse.json({
      daily_messages: dailyMessages,
      top_agents: topAgents,
      usage_by_hour: usageByHour,
      summary: {
        total_messages: totalMessages,
        total_tokens: totalTokens,
        total_cost: totalCost,
        avg_per_day: Math.round(avgPerDay * 10) / 10,
        unique_agents: uniqueAgents,
        streak,
      },
    });
  } catch (err) {
    console.error("Usage analytics error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
