"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PLANS, type PlanKey } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Sparkles, Building2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PLAN_ICONS: Record<string, React.ElementType> = {
  free: Zap,
  pro: Sparkles,
  business: Building2,
};

export default function BillingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const currentPlan = (profile?.plan || "free") as PlanKey;
  const planStatus = profile?.plan_status || "trial";

  async function handleCheckout(plan: PlanKey) {
    if (!user) return;
    setLoading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          userId: user.id,
          promoCode: promoCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Checkout failed");
      }
    } catch {
      toast.error("Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  async function handlePortal() {
    if (!user) return;
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("No billing account found");
      }
    } catch {
      toast.error("Failed to open billing portal");
    } finally {
      setLoading(null);
    }
  }

  const trialDaysLeft = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your plan and payment method
        </p>
      </div>

      {/* Current plan status */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{PLANS[currentPlan].name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    planStatus === "active" && "text-green-400 border-green-500/30 bg-green-500/10",
                    planStatus === "trial" && "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
                    planStatus === "cancelled" && "text-red-400 border-red-500/30 bg-red-500/10",
                    planStatus === "expired" && "text-red-400 border-red-500/30 bg-red-500/10"
                  )}
                >
                  {planStatus === "trial" ? `Trial · ${trialDaysLeft} days left` : planStatus}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {currentPlan === "free"
                  ? "Upgrade to unlock all features"
                  : "Thank you for subscribing"}
              </p>
            </div>
            {profile?.stripe_customer_id && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handlePortal}
                disabled={loading === "portal"}
              >
                <CreditCard className="h-3.5 w-3.5" />
                Manage Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Promo code */}
      <div className="flex gap-2 items-center">
        <Input
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value)}
          placeholder="Have a promo code?"
          className="max-w-xs h-9 bg-white/[0.03] border-white/[0.08] text-sm"
        />
        {promoCode && (
          <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/10">
            Code: {promoCode}
          </Badge>
        )}
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.entries(PLANS) as [PlanKey, (typeof PLANS)[PlanKey]][]).map(
          ([key, plan]) => {
            const Icon = PLAN_ICONS[key] || Zap;
            const isCurrent = key === currentPlan;
            const isPopular = key === "pro";

            return (
              <Card
                key={key}
                className={cn(
                  "relative transition-all",
                  isPopular && "ring-1 ring-primary/30 shadow-lg shadow-primary/10",
                  isCurrent && "ring-1 ring-green-500/30"
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-[10px]">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{plan.name}</CardTitle>
                      <p className="text-lg font-bold">
                        {plan.price === 0 ? "Free" : `$${plan.price / 100}/mo`}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="outline" size="sm" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : key === "free" ? null : (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleCheckout(key)}
                      disabled={loading !== null}
                    >
                      {loading === key ? "Loading..." : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          }
        )}
      </div>
    </div>
  );
}
