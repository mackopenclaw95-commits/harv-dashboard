import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

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
