import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * Export the authenticated user's usage logs as a CSV download.
 *
 * Query params:
 *   days: lookback window in days (default 30, max 365)
 */
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
      return new Response("Not authenticated", { status: 401 });
    }

    const daysParam = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
    const days = Math.max(1, Math.min(365, isNaN(daysParam) ? 30 : daysParam));

    const since = new Date();
    since.setDate(since.getDate() - days);

    const service = createServiceClient();
    const { data: logs, error } = await service
      .from("usage_logs")
      .select("created_at, agent_name, message_count, tokens_used, estimated_cost")
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(`Query failed: ${error.message}`, { status: 500 });
    }

    // Build CSV
    const header = "timestamp,agent,messages,tokens,estimated_cost_usd\n";
    const escape = (v: unknown): string => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const rows = (logs || []).map((row) =>
      [
        escape(row.created_at),
        escape(row.agent_name || ""),
        escape(row.message_count ?? 0),
        escape(row.tokens_used ?? 0),
        escape(row.estimated_cost ?? 0),
      ].join(","),
    );
    const csv = header + rows.join("\n") + "\n";

    const today = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="harv-usage-${today}-${days}d.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[usage export] error:", e);
    return new Response(String(e), { status: 500 });
  }
}
