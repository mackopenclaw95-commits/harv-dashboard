import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
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

    const date = req.nextUrl.searchParams.get("date"); // YYYY-MM-DD
    const mode = req.nextUrl.searchParams.get("mode"); // "events" | "counts"

    const service = createServiceClient();

    if (mode === "counts") {
      // Return daily counts for last 90 days
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - 90);

      const { data, error } = await service
        .from("usage_logs")
        .select("created_at")
        .gte("created_at", daysAgo.toISOString())
        .order("created_at", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const counts: Record<string, number> = {};
      for (const row of data || []) {
        const d = new Date(row.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        counts[key] = (counts[key] || 0) + 1;
      }

      return NextResponse.json({ counts });
    }

    // Default: return events for a specific date
    if (!date) {
      return NextResponse.json({ error: "date parameter required" }, { status: 400 });
    }

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const { data, error } = await service
      .from("usage_logs")
      .select("*")
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events = (data || []).map((row) => ({
      agent: row.agent_name || "Harv",
      action: "chat",
      status: "success" as const,
      summary: `Dashboard conversation`,
      timestamp: row.created_at,
      cost: row.estimated_cost || 0,
      tokens: row.tokens_used || 0,
      source: "dashboard" as const,
    }));

    return NextResponse.json({ events });
  } catch (err) {
    console.error("Dashboard activity error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
