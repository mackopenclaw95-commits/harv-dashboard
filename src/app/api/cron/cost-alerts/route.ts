import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { TIER_LIMITS } from "@/lib/plan-config";
import { sendCostAlert } from "@/lib/email";

type TierKey = keyof typeof TIER_LIMITS;
type AlertType = "weekly_80" | "weekly_100" | "monthly_80" | "monthly_100";

/**
 * Hourly cron — checks all active users' cost against weekly/monthly caps.
 * Inserts into cost_alerts (dedup by user + type + period) and sends email.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET || "";
  const querySecret = new URL(req.url).searchParams.get("secret") || "";

  if (secret) {
    const ok = auth === `Bearer ${secret}` || querySecret === secret;
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();

  // Get all active users (not owner/tester, not expired)
  const { data: users } = await svc
    .from("profiles")
    .select("id, email, plan, role, plan_status")
    .not("role", "in", "(owner,tester)")
    .not("plan_status", "eq", "expired");

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, alerts: 0 });
  }

  // Time boundaries
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  // Period keys for dedup
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // ISO week number
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  const weekKey = `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;

  let alertCount = 0;

  for (const user of users) {
    const plan = (user.plan || "free") as TierKey;
    const tier = TIER_LIMITS[plan] || TIER_LIMITS.free;
    const weeklyCap = tier.weeklyCostCapUsd;
    const monthlyCap = tier.monthlyCostCapUsd;

    if (weeklyCap <= 0 && monthlyCap <= 0) continue;

    // Sum costs for this user from month start (covers both weekly + monthly)
    const { data: costRows } = await svc
      .from("api_cost_events")
      .select("cost, event_timestamp")
      .eq("user_id", user.id)
      .gte("event_timestamp", monthStart.toISOString());

    let weeklyCost = 0;
    let monthlyCost = 0;
    const weekMs = weekStart.getTime();
    for (const row of costRows || []) {
      const c = Number(row.cost) || 0;
      monthlyCost += c;
      if (new Date(row.event_timestamp).getTime() >= weekMs) weeklyCost += c;
    }

    // Check thresholds and insert alerts
    const checks: { type: AlertType; spent: number; cap: number; periodKey: string; sendEmail: boolean }[] = [];

    if (weeklyCap > 0) {
      if (weeklyCost >= weeklyCap) {
        checks.push({ type: "weekly_100", spent: weeklyCost, cap: weeklyCap, periodKey: weekKey, sendEmail: true });
      } else if (weeklyCost / weeklyCap >= 0.8) {
        checks.push({ type: "weekly_80", spent: weeklyCost, cap: weeklyCap, periodKey: weekKey, sendEmail: false });
      }
    }
    if (monthlyCap > 0) {
      if (monthlyCost >= monthlyCap) {
        checks.push({ type: "monthly_100", spent: monthlyCost, cap: monthlyCap, periodKey: monthKey, sendEmail: true });
      } else if (monthlyCost / monthlyCap >= 0.8) {
        checks.push({ type: "monthly_80", spent: monthlyCost, cap: monthlyCap, periodKey: monthKey, sendEmail: true });
      }
    }

    for (const check of checks) {
      // Upsert — unique constraint prevents duplicates
      const { data: inserted } = await svc
        .from("cost_alerts")
        .upsert(
          {
            user_id: user.id,
            alert_type: check.type,
            period_key: check.periodKey,
            cost_usd: check.spent,
            cap_usd: check.cap,
            email_sent: false,
          },
          { onConflict: "user_id,alert_type,period_key", ignoreDuplicates: true }
        )
        .select("id, email_sent")
        .single();

      // Only send email if this is a new alert (not a duplicate)
      if (inserted && !inserted.email_sent && check.sendEmail && user.email) {
        const sent = await sendCostAlert(user.email, check.type, check.spent, check.cap);
        if (sent) {
          await svc
            .from("cost_alerts")
            .update({ email_sent: true })
            .eq("id", inserted.id);
        }
        alertCount++;
      }
    }
  }

  return NextResponse.json({ ok: true, checked: users.length, alerts: alertCount });
}
