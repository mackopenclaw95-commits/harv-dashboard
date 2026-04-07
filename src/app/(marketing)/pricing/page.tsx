import { Check, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { PLANS, TIER_LIMITS } from "@/lib/plan-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Harv AI",
  description: "Simple, transparent pricing. Start free, upgrade when you're ready.",
};

const COMPARISON = [
  { feature: "Premium messages / day", free: "25", pro: "150", max: "400" },
  { feature: "Standard messages", free: "After limit", pro: "Unlimited", max: "Unlimited" },
  { feature: "Primary AI model", free: "Gemini Flash Lite", pro: "DeepSeek V3.2", max: "GPT-4.1" },
  { feature: "Fallback model", free: "Qwen3 8B", pro: "Gemini Flash Lite", max: "DeepSeek V3.2" },
  { feature: "Image generation", free: false, pro: "10 / day", max: "30 / day" },
  { feature: "All agents", free: false, pro: true, max: true },
  { feature: "Projects", free: "5", pro: "Unlimited", max: "Unlimited" },
  { feature: "Employee Harvs", free: false, pro: false, max: true },
  { feature: "Custom integrations", free: false, pro: false, max: true },
  { feature: "Admin dashboard", free: false, pro: false, max: true },
  { feature: "Priority support", free: false, pro: true, max: true },
];

const FAQ = [
  {
    q: "What happens after the free trial?",
    a: "After 14 days, your account switches to the free tier with 25 premium messages per day. You can upgrade anytime to get more.",
  },
  {
    q: "Can I change plans?",
    a: "Yes. Upgrade or downgrade at any time. Changes take effect immediately.",
  },
  {
    q: "What are premium vs standard messages?",
    a: "Premium messages use the best AI model for your tier. Once you hit your daily limit, Harv switches to a fast standard model so you're never cut off.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. The free trial requires no payment information.",
  },
];

export default function PricingPage() {
  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-muted-foreground/70 max-w-xl mx-auto">
            Start free. Upgrade when you&apos;re ready. No surprises.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {(Object.entries(PLANS) as [string, (typeof PLANS)[keyof typeof PLANS]][]).map(
            ([key, plan]) => {
              const isPopular = key === "pro";
              return (
                <div
                  key={key}
                  className={`relative rounded-2xl border p-6 transition-all ${
                    isPopular
                      ? "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20"
                      : "border-white/[0.06] bg-white/[0.02]"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}
                  <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-5">
                    <span className="text-4xl font-bold">
                      ${plan.price === 0 ? "0" : (plan.price / 100).toFixed(0)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-sm text-muted-foreground">/mo</span>
                    )}
                  </div>
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm text-muted-foreground/80"
                      >
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink
                    href="/auth/signup"
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                  >
                    {plan.price === 0 ? "Start Free Trial" : "Get Started"}
                  </ButtonLink>
                </div>
              );
            }
          )}
        </div>

        {/* Comparison Table */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold text-center mb-8">Compare Plans</h2>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-6 py-4 font-medium text-muted-foreground/60">
                      Feature
                    </th>
                    <th className="text-center px-4 py-4 font-semibold">Free</th>
                    <th className="text-center px-4 py-4 font-semibold text-primary">
                      Pro
                    </th>
                    <th className="text-center px-4 py-4 font-semibold text-yellow-400">
                      Max
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-b border-white/[0.03] last:border-0"
                    >
                      <td className="px-6 py-3.5 text-muted-foreground/80">
                        {row.feature}
                      </td>
                      {(["free", "pro", "max"] as const).map((tier) => {
                        const val = row[tier];
                        return (
                          <td key={tier} className="text-center px-4 py-3.5">
                            {val === true ? (
                              <Check className="h-4 w-4 text-green-400 mx-auto" />
                            ) : val === false ? (
                              <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground/70">{val}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
              >
                <h4 className="font-semibold text-sm mb-2">{item.q}</h4>
                <p className="text-sm text-muted-foreground/70 leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
