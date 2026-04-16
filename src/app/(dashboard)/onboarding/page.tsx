"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  ChevronRight,
  Check,
  Sparkles,
  Building2,
  Zap,
  ArrowRight,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { PLANS, type PlanKey } from "@/lib/stripe";

const STEPS = ["Welcome", "Choose Plan", "Setup", "Done"];

const PLAN_ICONS: Record<string, React.ElementType> = {
  free: Zap,
  pro: Sparkles,
  business: Building2,
};

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("free");
  const [promoCode, setPromoCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePlanSelect() {
    if (selectedPlan === "free") {
      // Free trial — skip checkout, go to setup
      setStep(2);
      return;
    }

    // Paid plan — redirect to Stripe checkout
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          userId: user.id,
          promoCode: promoCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Checkout failed");
        setLoading(false);
      }
    } catch {
      toast.error("Failed to start checkout");
      setLoading(false);
    }
  }

  async function handleComplete() {
    // Mark profile as onboarded
    try {
      const { supabase } = await import("@/lib/supabase");
      if (user) {
        await supabase
          .from("profiles")
          .update({ onboarded: true, updated_at: new Date().toISOString() })
          .eq("id", user.id);
      }
      await refreshProfile();
    } catch {}
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary ring-2 ring-primary/30"
                      : "bg-white/[0.05] text-muted-foreground/50"
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-8 h-0.5", i < step ? "bg-primary" : "bg-white/[0.06]")} />
              )}
            </div>
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Welcome to Harv AI</h1>
              <p className="text-muted-foreground mt-2">
                Your personal AI assistant that actually does things.
                Let&apos;s get you set up in 60 seconds.
              </p>
            </div>
            <Button onClick={() => setStep(1)} className="gap-2">
              Get Started <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 1: Choose Plan */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold">Choose your plan</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Start free, upgrade anytime
              </p>
            </div>

            <div className="grid gap-3">
              {(Object.entries(PLANS) as [PlanKey, (typeof PLANS)[PlanKey]][]).map(
                ([key, plan]) => {
                  const Icon = PLAN_ICONS[key] || Zap;
                  const selected = selectedPlan === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedPlan(key)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl text-left transition-all ring-1",
                        selected
                          ? "bg-primary/10 ring-primary/30"
                          : "bg-white/[0.02] ring-white/[0.06] hover:ring-white/[0.12]"
                      )}
                    >
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center",
                        selected ? "bg-primary/20" : "bg-white/[0.05]"
                      )}>
                        <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{plan.name}</span>
                          {key === "pro" && (
                            <Badge className="text-[9px] bg-primary/20 text-primary border-0">
                              Popular
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {plan.price === 0 ? "7-day free trial" : `$${plan.price / 100}/month`}
                        </p>
                      </div>
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                        selected ? "border-primary bg-primary" : "border-white/[0.15]"
                      )}>
                        {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                    </button>
                  );
                }
              )}
            </div>

            {/* Promo code */}
            <div className="flex gap-2 items-center">
              <Ticket className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              <Input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Promo code (optional)"
                className="h-9 bg-white/[0.03] border-white/[0.08] text-sm"
              />
            </div>

            <Button
              onClick={handlePlanSelect}
              className="w-full gap-2"
              disabled={loading}
            >
              {loading
                ? "Loading..."
                : selectedPlan === "free"
                  ? "Start Free Trial"
                  : `Continue to Checkout`}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Setup */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold">You&apos;re all set!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Harv is ready to work for you
              </p>
            </div>

            <Card>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-400" />
                  <span className="text-sm">Account created</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-400" />
                  <span className="text-sm">
                    {selectedPlan === "free" ? "7-day trial activated" : `${PLANS[selectedPlan].name} plan active`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-400" />
                  <span className="text-sm">Harv AI ready to chat</span>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              You can connect Google Calendar, customize agents, and explore all features from the Settings page.
            </p>

            <Button onClick={handleComplete} className="w-full gap-2">
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
