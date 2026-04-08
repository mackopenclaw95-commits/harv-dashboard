import { PLAN_RANK, PLAN_PRICES_USD, DOWNGRADE_COOLDOWN_DAYS } from "./plan-config";

export interface ProrationResult {
  type: "upgrade" | "downgrade";
  oldPlan: string;
  newPlan: string;
  oldPrice: number;
  newPrice: number;
  difference: number;
  timePercent: number;
  costPercent: number;
  consumedPercent: number;
  amount: number;          // what to charge (upgrade) or refund (downgrade)
  amountCents: number;     // amount in cents for Stripe
}

/**
 * Calculate custom proration for a plan change.
 *
 * Formula:
 *   consumed_% = min(max(days/30, api_cost/plan_price), 1.0)
 *   amount     = max(0, difference - consumed_% × old_price)
 *
 * - Upgrade:   amount = what user pays
 * - Downgrade: amount = what user gets refunded
 */
export function calculateProration({
  oldPlan,
  newPlan,
  daysSincePeriodStart,
  totalApiCostThisPeriod,
}: {
  oldPlan: string;
  newPlan: string;
  daysSincePeriodStart: number;
  totalApiCostThisPeriod: number;
}): ProrationResult {
  const oldPrice = PLAN_PRICES_USD[oldPlan] ?? 0;
  const newPrice = PLAN_PRICES_USD[newPlan] ?? 0;
  const isUpgrade = (PLAN_RANK[newPlan] ?? 0) > (PLAN_RANK[oldPlan] ?? 0);
  const difference = Math.abs(newPrice - oldPrice);

  const timePercent = Math.min(daysSincePeriodStart / 30, 1);
  const costPercent = oldPrice > 0 ? Math.min(totalApiCostThisPeriod / oldPrice, 1) : 0;
  const consumedPercent = Math.min(Math.max(timePercent, costPercent), 1);

  const amount = Math.max(0, difference - consumedPercent * oldPrice);
  const amountCents = Math.round(amount * 100);

  return {
    type: isUpgrade ? "upgrade" : "downgrade",
    oldPlan,
    newPlan,
    oldPrice,
    newPrice,
    difference,
    timePercent: Math.round(timePercent * 1000) / 1000,
    costPercent: Math.round(costPercent * 1000) / 1000,
    consumedPercent: Math.round(consumedPercent * 1000) / 1000,
    amount: Math.round(amount * 100) / 100,
    amountCents,
  };
}

/**
 * Check if downgrade cooldown is active.
 * Returns days remaining, or 0 if no cooldown.
 */
export function getDowngradeCooldownDays(lastPlanChange: string | null): number {
  if (!lastPlanChange) return 0;
  const last = new Date(lastPlanChange);
  const cooldownEnd = new Date(last.getTime() + DOWNGRADE_COOLDOWN_DAYS * 86400000);
  const remaining = (cooldownEnd.getTime() - Date.now()) / 86400000;
  return Math.max(0, Math.ceil(remaining));
}
