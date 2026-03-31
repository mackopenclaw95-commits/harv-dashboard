import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServiceClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [profiles, convos, msgs, docs, projects, usageToday, usageAll] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("conversations").select("id", { count: "exact", head: true }),
      supabase.from("messages").select("id", { count: "exact", head: true }),
      supabase.from("documents").select("id", { count: "exact", head: true }),
      supabase.from("projects").select("id", { count: "exact", head: true }),
      supabase.from("usage_logs").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
      supabase.from("usage_logs").select("tokens_used, estimated_cost"),
    ]);

    const users = profiles.data || [];

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
        totalApiCost: (usageAll.data || []).reduce((sum, r) => sum + (Number(r.estimated_cost) || 0), 0),
        totalTokens: (usageAll.data || []).reduce((sum, r) => sum + (r.tokens_used || 0), 0),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
