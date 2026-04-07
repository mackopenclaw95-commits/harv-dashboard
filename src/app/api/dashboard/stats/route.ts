import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
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

    // Check if owner — owners get global VPS data on the main dashboard
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isOwner = profile?.role === "owner" || profile?.role === "admin";

    if (isOwner) {
      // Owner: return marker so frontend knows to use VPS data
      return NextResponse.json({ isOwner: true });
    }

    // Regular user: return per-user stats from Supabase
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const [usageAll, usageToday, usageWeek, recentConvos] = await Promise.all([
      // Total spend + total calls (all time)
      supabase
        .from("usage_logs")
        .select("estimated_cost, tokens_used")
        .eq("user_id", user.id),
      // Messages today
      supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", todayStart.toISOString()),
      // Messages this week (for daily average)
      supabase
        .from("usage_logs")
        .select("estimated_cost")
        .eq("user_id", user.id)
        .gte("created_at", weekAgo.toISOString()),
      // Recent conversations with last message
      supabase
        .from("messages")
        .select("id, role, content, created_at, conversation_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Aggregate total spend and calls
    let totalSpend = 0;
    let totalCalls = 0;
    for (const row of usageAll.data || []) {
      totalSpend += Number(row.estimated_cost) || 0;
      totalCalls += 1;
    }

    // Weekly spend for daily burn average
    let weeklySpend = 0;
    for (const row of usageWeek.data || []) {
      weeklySpend += Number(row.estimated_cost) || 0;
    }
    const dailyBurn = weeklySpend / 7;

    // Format recent activity from messages
    const recentActivity = (recentConvos.data || [])
      .filter((m) => m.role === "assistant")
      .slice(0, 10)
      .map((m) => ({
        agent: "Harv",
        action: "conversation",
        summary: `${(m.content || "").slice(0, 80)}${(m.content || "").length > 80 ? "..." : ""}`,
        timestamp: m.created_at,
        status: "success",
      }));

    return NextResponse.json({
      isOwner: false,
      totalSpend,
      totalCalls,
      dailyBurn,
      messagesToday: usageToday.count || 0,
      recentActivity,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
