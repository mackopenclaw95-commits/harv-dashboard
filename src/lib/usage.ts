import { supabase } from "./supabase";
import { TIER_LIMITS as PLAN_TIER_LIMITS, type TierKey } from "./plan-config";

const DAILY_LIMITS: Record<string, number> = {
  free: PLAN_TIER_LIMITS.free.primaryMessagesPerDay,
  pro: PLAN_TIER_LIMITS.pro.primaryMessagesPerDay,
  max: PLAN_TIER_LIMITS.max.primaryMessagesPerDay,
};

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Get today's usage count for the current user */
export async function getTodayUsage(): Promise<number> {
  const userId = await getUserId();
  if (!userId) return 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", todayStart.toISOString());

  return count || 0;
}

/** Check if user is within their daily limit */
export async function checkUsageLimit(plan: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}> {
  const limit = DAILY_LIMITS[plan] ?? DAILY_LIMITS.free;
  if (limit === -1) {
    return { allowed: true, used: 0, limit: -1, remaining: -1 };
  }

  const used = await getTodayUsage();
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

/** Log a message usage event */
export async function logUsage(
  agentName: string = "Harv",
  tokensUsed: number = 0,
  estimatedCost: number = 0
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase.from("usage_logs").insert({
    user_id: userId,
    agent_name: agentName,
    tokens_used: tokensUsed,
    estimated_cost: estimatedCost,
  });
}

/** Get usage summary for a user (for admin) */
export async function getUserUsageSummary(userId: string): Promise<{
  today: number;
  thisWeek: number;
  thisMonth: number;
  totalTokens: number;
  totalCost: number;
}> {
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [todayRes, weekRes, monthRes, totalsRes] = await Promise.all([
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", weekStart.toISOString()),
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("usage_logs")
      .select("tokens_used, estimated_cost")
      .eq("user_id", userId),
  ]);

  const totals = (totalsRes.data || []).reduce(
    (acc, row) => ({
      tokens: acc.tokens + (row.tokens_used || 0),
      cost: acc.cost + (Number(row.estimated_cost) || 0),
    }),
    { tokens: 0, cost: 0 }
  );

  return {
    today: todayRes.count || 0,
    thisWeek: weekRes.count || 0,
    thisMonth: monthRes.count || 0,
    totalTokens: totals.tokens,
    totalCost: totals.cost,
  };
}
