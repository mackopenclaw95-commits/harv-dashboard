import Stripe from "stripe";

// Server-side Stripe client
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2026-03-25.dahlia",
});

// Plan configuration
export const PLANS = {
  free: {
    name: "Free Trial",
    price: 0,
    priceId: null, // No Stripe price — trial is free
    features: [
      "14-day free trial",
      "Harv AI chat",
      "Basic agents (when available)",
      "5 projects",
      "100 messages/day",
    ],
    limits: { messagesPerDay: 100, projects: 5 },
  },
  pro: {
    name: "Pro",
    price: 2000, // $20.00 in cents
    priceId: process.env.STRIPE_PRO_PRICE_ID || "price_pro_placeholder",
    features: [
      "Unlimited messages",
      "All agents",
      "Unlimited projects",
      "Priority support",
      "Advanced analytics",
      "Better LLM (Claude Sonnet)",
    ],
    limits: { messagesPerDay: -1, projects: -1 }, // -1 = unlimited
  },
  business: {
    name: "Business",
    price: 5000, // $50.00 in cents
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID || "price_business_placeholder",
    features: [
      "Everything in Pro",
      "Dedicated instance",
      "Employee Harvs",
      "Custom integrations",
      "Dedicated support",
      "Admin dashboard",
    ],
    limits: { messagesPerDay: -1, projects: -1 },
  },
} as const;

export type PlanKey = keyof typeof PLANS;
