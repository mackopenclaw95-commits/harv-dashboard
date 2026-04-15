import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

// TypeScript port of scripts/vps_patches/weekly_pricing_drift.py.
// Same detection logic (zombies / mis-flagged free / rate drift), exposed
// on-demand so owner/admin doesn't have to wait for the Monday Telegram ping.
//
// 0.1¢ / million tokens — matches DRIFT_THRESHOLD_USD_PER_MILLION on VPS.
const DRIFT_THRESHOLD_USD_PER_MILLION = 0.001;

interface PricingRow {
  model: string;
  input_per_million: number | null;
  output_per_million: number | null;
  unit: string | null;
  is_free: boolean | null;
  provider: string | null;
}

interface LiveModel {
  prompt: number;
  completion: number;
}

interface DriftReport {
  ok: boolean;
  checked_at: string;
  rows_checked: number;
  live_models: number;
  zombies: string[];
  free_wrong: { model: string; live_in: number; live_out: number }[];
  drifts: {
    model: string;
    our_in: number;
    our_out: number;
    live_in: number;
    live_out: number;
  }[];
}

export async function GET() {
  try {
    // --- Auth: owner / admin only ---
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

    // --- Fetch our token-priced rows ---
    const { data: oursRaw, error: pricingErr } = await supabase
      .from("model_pricing")
      .select("model,input_per_million,output_per_million,unit,is_free,provider")
      .eq("unit", "tokens");

    if (pricingErr) {
      return NextResponse.json(
        { error: `model_pricing read failed: ${pricingErr.message}` },
        { status: 500 }
      );
    }
    const ours = (oursRaw || []) as PricingRow[];

    // --- Fetch OpenRouter live /v1/models ---
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY missing from env" },
        { status: 500 }
      );
    }
    let live: Record<string, LiveModel> = {};
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${orKey}` },
        // Avoid Vercel caching stale pricing — drift check needs fresh data.
        cache: "no-store",
      });
      if (!r.ok) {
        return NextResponse.json(
          { error: `OpenRouter /v1/models returned ${r.status}` },
          { status: 502 }
        );
      }
      const data = (await r.json()) as { data?: Array<{ id: string; pricing?: { prompt?: string | number; completion?: string | number } }> };
      for (const m of data.data || []) {
        const p = m.pricing || {};
        const prompt = Number(p.prompt) || 0;
        const completion = Number(p.completion) || 0;
        live[m.id] = { prompt, completion };
      }
    } catch (e) {
      return NextResponse.json(
        { error: `OpenRouter fetch failed: ${String(e)}` },
        { status: 502 }
      );
    }

    // --- Detect issues (matches weekly_pricing_drift.detect_issues) ---
    const zombies: string[] = [];
    const free_wrong: DriftReport["free_wrong"] = [];
    const drifts: DriftReport["drifts"] = [];

    let rowsChecked = 0;
    for (const row of ours) {
      if (row.provider !== "openrouter") continue;
      rowsChecked++;
      const mid = row.model;
      const liveRow = live[mid];
      if (!liveRow) {
        zombies.push(mid);
        continue;
      }
      const ourIn = Number(row.input_per_million) || 0;
      const ourOut = Number(row.output_per_million) || 0;
      const liveIn = liveRow.prompt * 1_000_000;
      const liveOut = liveRow.completion * 1_000_000;

      if (row.is_free && (liveIn > 0 || liveOut > 0)) {
        free_wrong.push({ model: mid, live_in: liveIn, live_out: liveOut });
        continue;
      }
      const inDiff = Math.abs(ourIn - liveIn);
      const outDiff = Math.abs(ourOut - liveOut);
      if (
        inDiff > DRIFT_THRESHOLD_USD_PER_MILLION ||
        outDiff > DRIFT_THRESHOLD_USD_PER_MILLION
      ) {
        drifts.push({
          model: mid,
          our_in: ourIn,
          our_out: ourOut,
          live_in: liveIn,
          live_out: liveOut,
        });
      }
    }

    const report: DriftReport = {
      ok: zombies.length === 0 && free_wrong.length === 0 && drifts.length === 0,
      checked_at: new Date().toISOString(),
      rows_checked: rowsChecked,
      live_models: Object.keys(live).length,
      zombies,
      free_wrong,
      drifts,
    };

    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
