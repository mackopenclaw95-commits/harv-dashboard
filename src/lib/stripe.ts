import Stripe from "stripe";

// Server-side Stripe client
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2026-03-25.dahlia",
});

// Model tier limits per plan
export const TIER_LIMITS = {
  free: {
    primaryMessagesPerDay: 25,
    weeklyBackstop: 100,
    imagesPerDay: 0,
    primaryModel: "gemini-flash-lite",
    fallbackModel: "llama-3.3-70b-free",
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

// Plan configuration
export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    priceId: null, // No Stripe price — trial is free
    features: [
      "7-day free trial",
      "25 messages/day (Gemini Flash Lite)",
      "7 core agents (Harv, Research, Email, Scheduler, Learning)",
      "5 projects",
    ],
    limits: { messagesPerDay: 25, projects: 5 },
  },
  pro: {
    name: "Pro",
    price: 2000, // $20.00 in cents
    priceId: process.env.STRIPE_PRO_PRICE_ID || "price_pro_placeholder",
    features: [
      "150 messages/day (DeepSeek V3.2)",
      "Unlimited standard messages after limit",
      "All agents unlocked",
      "Image generation (10/day)",
      "Unlimited projects",
      "Priority support",
    ],
    limits: { messagesPerDay: -1, projects: -1 }, // -1 = unlimited
  },
  max: {
    name: "Max",
    price: 5000, // $50.00 in cents
    priceId: process.env.STRIPE_MAX_PRICE_ID || process.env.STRIPE_BUSINESS_PRICE_ID || "price_max_placeholder",
    features: [
      "400 messages/day (Premium model)",
      "Unlimited standard messages after limit",
      "All agents + Image gen (30/day)",
      "Custom integrations",
      "Priority support",
    ],
    limits: { messagesPerDay: -1, projects: -1 },
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type TierKey = keyof typeof TIER_LIMITS;
