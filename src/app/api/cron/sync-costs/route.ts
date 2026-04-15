import { NextRequest, NextResponse } from "next/server";
import { syncCostEventsFromVPS } from "@/lib/cost-sync";

/**
 * Vercel Cron endpoint — pulls cost events from VPS → Supabase every 5 min.
 *
 * Authentication: Vercel signs cron requests with `Authorization: Bearer <CRON_SECRET>`
 * when CRON_SECRET env var is set. Unauthenticated requests are rejected.
 *
 * Schedule in vercel.json → crons.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET || "";

  // Allow Vercel cron (Bearer <secret>) or manual trigger with ?secret=...
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") || "";

  if (secret) {
    const ok =
      auth === `Bearer ${secret}` ||
      querySecret === secret;
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  // If no CRON_SECRET is set, allow the call (useful for local dev).

  const result = await syncCostEventsFromVPS(500);
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
