// Plan configuration — safe to import in client components (no Stripe SDK)

export const TIER_LIMITS = {
  free: {
    primaryMessagesPerDay: 25,
    weeklyBackstop: 100,
    imagesPerDay: 0,
    primaryModel: "gemini-flash-lite",
    fallbackModel: "qwen3-8b-free",
  },
  pro: {
    primaryMessagesPerDay: 150,
    weeklyBackstop: 750,
    imagesPerDay: 10,
    primaryModel: "deepseek-v3.2",
    fallbackModel: "gemini-flash-lite",
  },
  max: {
    primaryMessagesPerDay: 400,
    weeklyBackstop: 2000,
    imagesPerDay: 30,
    primaryModel: "gpt-4.1",
    fallbackModel: "deepseek-v3.2",
  },
} as const;

// Agents available on free plan (Router & Journal are background/auto-included)
export const FREE_PLAN_AGENTS = new Set([
  "Harv",
  "Router",
  "Journal",
  "Research",
  "Email",
  "Scheduler",
  "Learning",
]);

// Agents locked behind pro/max
export const PRO_ONLY_AGENTS = new Set([
  "Video Digest",
  "YouTube Digest",
  "Media Manager",
  "Image Gen",
]);

export function isAgentAvailable(agentName: string, plan: string): boolean {
  if (plan === "pro" || plan === "max") return true;
  return FREE_PLAN_AGENTS.has(agentName);
}

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    features: [
      "7-day free trial",
      "25 messages/day (Gemini Flash Lite)",
      "7 core agents (Harv, Research, Email, Scheduler, Learning)",
      "5 projects",
    ],
  },
  pro: {
    name: "Pro",
    price: 2000,
    features: [
      "150 messages/day (DeepSeek V3.2)",
      "Unlimited standard messages after limit",
      "All agents unlocked",
      "Image generation (10/day)",
      "Unlimited projects",
      "Priority support",
    ],
  },
  max: {
    name: "Max",
    price: 5000,
    features: [
      "400 messages/day (GPT-4.1)",
      "Unlimited DeepSeek V3.2 after limit",
      "All agents + Image gen (30/day)",
      "Employee Harvs",
      "Custom integrations",
      "Admin dashboard",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type TierKey = keyof typeof TIER_LIMITS;

// ─── Proration ─────────────────────────────────────────
export const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };
export const PLAN_PRICES_USD: Record<string, number> = { free: 0, pro: 20, max: 50 };
export const DOWNGRADE_COOLDOWN_DAYS = 7;
