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

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    features: [
      "14-day free trial",
      "25 premium messages/day",
      "Standard model after limit",
      "Basic agents",
      "5 projects",
    ],
  },
  pro: {
    name: "Pro",
    price: 2000,
    features: [
      "150 premium messages/day",
      "Unlimited standard messages",
      "All agents",
      "Image generation (10/day)",
      "Unlimited projects",
      "Priority support",
    ],
  },
  max: {
    name: "Max",
    price: 5000,
    features: [
      "400 premium messages/day (GPT-4.1)",
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
