import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [profileRes, convosRes, docsRes, projectsRes, usageTodayRes, usageAllRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).single(),
      supabase
        .from("conversations")
        .select("id, title, agent_name, status, updated_at, messages(count)")
        .eq("user_id", id)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("documents")
        .select("id, filename, file_type, file_size, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("projects")
        .select("id, name, created_at, updated_at")
        .eq("user_id", id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", id)
        .gte("created_at", todayStart.toISOString()),
      supabase
        .from("usage_logs")
        .select("tokens_used, estimated_cost, agent_name, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const usageLogs = usageAllRes.data || [];
    const usage = {
      today: usageTodayRes.count || 0,
      total: usageLogs.length,
      totalTokens: usageLogs.reduce((s, r) => s + (r.tokens_used || 0), 0),
      totalCost: usageLogs.reduce((s, r) => s + (Number(r.estimated_cost) || 0), 0),
    };

    return NextResponse.json({
      profile: profileRes.data,
      conversations: convosRes.data || [],
      documents: docsRes.data || [],
      projects: projectsRes.data || [],
      usage,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
