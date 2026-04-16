// Plan configuration — safe to import in client components (no Stripe SDK)

export const TIER_LIMITS = {
  free: {
    primaryMessagesPerDay: 25,
    weeklyBackstop: 100,
    imagesPerDay: 0,
    videosPerDay: 0,
    primaryModel: "gemini-flash-lite",
    fallbackModel: "llama-3.3-70b-free",
    freeModel: "llama-3.3-70b-free",
    // Daily cost: 80% → fallback, 100% → free model
    dailyCostCapUsd: 0.10,
    // Weekly/monthly — hard block (profitability guardrail)
    weeklyCostCapUsd: 0.50,
    monthlyCostCapUsd: 2.00,
  },
  pro: {
    primaryMessagesPerDay: 150,
    weeklyBackstop: 750,
    imagesPerDay: 10,
    videosPerDay: 0,
    primaryModel: "deepseek-v3.2",
    fallbackModel: "gemini-flash-lite",
    freeModel: "llama-3.3-70b-free",
    dailyCostCapUsd: 1.50,
    weeklyCostCapUsd: 2.50,
    monthlyCostCapUsd: 10.00,
  },
  max: {
    primaryMessagesPerDay: 400,
    weeklyBackstop: 2000,
    imagesPerDay: 30,
    videosPerDay: 5,
    primaryModel: "gpt-4.1",
    fallbackModel: "deepseek-v3.2",
    freeModel: "gemini-flash-lite",
    dailyCostCapUsd: 5.00,
    weeklyCostCapUsd: 6.25,
    monthlyCostCapUsd: 25.00,
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

// Agents locked behind pro/max (Video Gen is MAX_ONLY, not listed here)
export const PRO_ONLY_AGENTS = new Set([
  "Video Digest",
  "YouTube Digest",
  "TikTok Digest",
  "Twitter Digest",
  "Media Manager",
  "Image Gen",
  "Image Editor",
  "Video Editor",
  "Product Research",
  "Market Research",
  "Marketing",
  "Finance",
  "Travel",
  "Sports",
  "Music",
]);

// Agents locked behind max only
export const MAX_ONLY_AGENTS = new Set([
  "Video Gen",
]);

export function isAgentAvailable(agentName: string, plan: string): boolean {
  if (MAX_ONLY_AGENTS.has(agentName)) return plan === "max";
  if (plan === "pro" || plan === "max") return true;
  return FREE_PLAN_AGENTS.has(agentName);
}

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    features: [
      "7-day free trial",
      "25 messages/day (Lite model)",
      "7 core agents (Harv, Research, Email, Scheduler, Learning)",
      "5 projects",
    ],
  },
  pro: {
    name: "Pro",
    price: 2000,
    features: [
      "150 messages/day (Standard model)",
      "Unlimited lite messages after limit",
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
      "400 messages/day (Premium model)",
      "Unlimited standard messages after limit",
      "All agents + Image gen (30/day) + Video gen (5/day)",
      "Employee Harvs",
      "Custom integrations",
      "Admin dashboard",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type TierKey = keyof typeof TIER_LIMITS;

// ─── User-facing model names (hide provider brands) ───
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Premium tier
  "gpt-4.1": "Premium",
  "deepseek-r1": "Premium Reasoning",
  "grok-4.1": "Premium Search",
  "grok-3": "Premium Search",
  // Standard tier
  "deepseek-v3.2": "Standard",
  "deepseek-chat": "Standard",
  "minimax-m2.1": "Standard Fast",
  // Lite tier
  "gemini-flash-lite": "Lite",
  "llama-3.3-70b-free": "Lite",
  "qwen3-8b": "Lite",
  "gemma-3-4b": "Lite",
  "qwen2.5": "Lite",
  // Media
  "imagen-4": "Image Engine",
  "imagen-4.0": "Image Engine",
  "dall-e-3": "Image Engine",
  "whisper": "Audio Engine",
  "seedance": "Video Engine",
};

/** Convert internal model ID to user-friendly display name */
export function displayModelName(model: string): string {
  if (!model || model === "none" || model === "tbd") return model;
  const m = model.toLowerCase();
  for (const [key, label] of Object.entries(MODEL_DISPLAY_NAMES)) {
    if (m.includes(key)) return label;
  }
  // Fallback: generic label so we never leak provider names
  return "Standard";
}

// ─── Proration ─────────────────────────────────────────
export const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };
export const PLAN_PRICES_USD: Record<string, number> = { free: 0, pro: 20, max: 50 };
export const DOWNGRADE_COOLDOWN_DAYS = 7;
