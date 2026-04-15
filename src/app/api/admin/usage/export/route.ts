import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

/**
 * Admin-only: export ALL users' usage logs as a CSV download.
 *
 * Use this to keep up with API cost across all users for tax/bookkeeping.
 *
 * Query params:
 *   month: YYYY-MM (e.g. 2026-04) — exports a single calendar month
 *   days:  lookback window in days (used if month not provided, default 30, max 365)
 */
export async function GET(req: NextRequest) {
  try {
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
      return new Response("Not authenticated", { status: 401 });
    }

    const service = createServiceClient();

    // Admin gate
    const { data: callerProfile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!callerProfile || !["owner", "admin"].includes(callerProfile.role)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Resolve date range
    const monthParam = req.nextUrl.searchParams.get("month");
    let since: Date;
    let until: Date;
    let labelForFilename: string;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      since = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      until = new Date(Date.UTC(y, m, 1, 0, 0, 0)); // first day of next month
      labelForFilename = monthParam;
    } else {
      const daysParam = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
      const days = Math.max(1, Math.min(365, isNaN(daysParam) ? 30 : daysParam));
      since = new Date();
      since.setDate(since.getDate() - days);
      until = new Date();
      labelForFilename = `${days}d`;
    }

    // Pull usage logs across all users in the window
    const { data: logs, error } = await service
      .from("usage_logs")
      .select("created_at, user_id, agent_name, message_count, tokens_used, estimated_cost")
      .gte("created_at", since.toISOString())
      .lt("created_at", until.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(`Query failed: ${error.message}`, { status: 500 });
    }

    // Resolve user_id -> email/name in one shot
    const userIds = Array.from(new Set((logs || []).map((r) => r.user_id).filter(Boolean)));
    const userMap = new Map<string, { email: string; name: string }>();
    if (userIds.length > 0) {
      const { data: profiles } = await service
        .from("profiles")
        .select("id, email, name")
        .in("id", userIds);
      for (const p of profiles || []) {
        userMap.set(p.id, { email: p.email || "", name: p.name || "" });
      }
    }

    // Build CSV
    const header = "timestamp,user_email,user_name,agent,messages,tokens,estimated_cost_usd\n";
    const escape = (v: unknown): string => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    let totalCost = 0;
    let totalTokens = 0;
    let totalMessages = 0;

    const rows = (logs || []).map((row) => {
      const info = row.user_id ? userMap.get(row.user_id) : undefined;
      const cost = Number(row.estimated_cost) || 0;
      const tokens = Number(row.tokens_used) || 0;
      const messages = Number(row.message_count) || 0;
      totalCost += cost;
      totalTokens += tokens;
      totalMessages += messages;
      return [
        escape(row.created_at),
        escape(info?.email || row.user_id || ""),
        escape(info?.name || ""),
        escape(row.agent_name || ""),
        escape(messages),
        escape(tokens),
        escape(cost.toFixed(6)),
      ].join(",");
    });

    // Append totals row so you can see the month's cost at a glance
    const totalsRow = [
      "TOTAL",
      "",
      "",
      "",
      String(totalMessages),
      String(totalTokens),
      totalCost.toFixed(6),
    ].join(",");

    const csv = header + rows.join("\n") + (rows.length ? "\n" : "") + totalsRow + "\n";

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="harv-admin-usage-${labelForFilename}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[admin usage export] error:", e);
    return new Response(String(e), { status: 500 });
  }
}
