import Link from "next/link";
import {
  Zap,
  Bot,
  Brain,
  BarChart3,
  MessageSquare,
  Calendar,
  Mail,
  Search,
  TrendingUp,
  Shield,
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "./marketing-nav";
import { Footer } from "./footer";
import { PLANS } from "@/lib/plan-config";

const AGENTS = [
  { name: "Research", icon: Search, desc: "Deep web research with multi-source analysis" },
  { name: "Finance", icon: TrendingUp, desc: "Budget tracking, transaction logging, bank sync" },
  { name: "Scheduler", icon: Calendar, desc: "Calendar management and smart reminders" },
  { name: "Email", icon: Mail, desc: "Read, send, and archive with AI summarization" },
  { name: "Trading", icon: BarChart3, desc: "Paper trading, crypto tracking, market analysis" },
  { name: "Auto Marketing", icon: Sparkles, desc: "Content strategy, social media, auto-posting" },
];

const VALUE_PROPS = [
  {
    icon: Bot,
    title: "AI Agent Team",
    desc: "20+ specialized agents handle research, finance, scheduling, email, and more — all coordinated by Harv.",
  },
  {
    icon: Zap,
    title: "Smart Automation",
    desc: "Set it and forget it. Background agents monitor your systems, scan for issues, and keep everything running.",
  },
  {
    icon: Brain,
    title: "Always Learning",
    desc: "Harv remembers your preferences, builds context over time, and gets smarter the more you use it.",
  },
  {
    icon: Shield,
    title: "Your Command Center",
    desc: "One dashboard to monitor everything. Chat, analytics, activity logs, and admin tools in one place.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-6">
            <Sparkles className="h-3 w-3" />
            Meet your AI team
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Your AI-Powered
            <br />
            <span className="text-primary">Command Center</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground/80 max-w-2xl mx-auto mb-10 leading-relaxed">
            Harv coordinates a team of specialized AI agents to manage your
            digital life — research, finance, scheduling, email, and more. All
            from one dashboard.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button size="lg" className="h-12 px-8 text-base gap-2" asChild>
              <Link href="/auth/signup">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-8 text-base bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]"
              asChild
            >
              <Link href="/features">See Features</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-20 px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Everything you need, one AI away
            </h2>
            <p className="text-muted-foreground/70 max-w-xl mx-auto">
              Stop juggling dozens of apps. Harv brings it all together.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {VALUE_PROPS.map((prop) => (
              <div
                key={prop.title}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <prop.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{prop.title}</h3>
                <p className="text-sm text-muted-foreground/70 leading-relaxed">
                  {prop.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Showcase */}
      <section className="py-20 px-6 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Meet the agents
            </h2>
            <p className="text-muted-foreground/70 max-w-xl mx-auto">
              Each agent is a specialist. Together, they&apos;re your team.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map((agent) => (
              <div
                key={agent.name}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-primary/20 transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <agent.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{agent.name}</h4>
                    <span className="text-[10px] text-green-400 font-medium uppercase tracking-wider">
                      Live
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/60 leading-relaxed">
                  {agent.desc}
                </p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Button variant="outline" size="sm" className="gap-2 bg-white/[0.03] border-white/[0.08]" asChild>
              <Link href="/features">
                View all 20+ agents
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Simple, transparent pricing
            </h2>
            <p className="text-muted-foreground/70 max-w-xl mx-auto">
              Start free. Upgrade when you&apos;re ready.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                      <span className="text-3xl font-bold">
                        ${plan.price === 0 ? "0" : (plan.price / 100).toFixed(0)}
                      </span>
                      {plan.price > 0 && (
                        <span className="text-sm text-muted-foreground">/mo</span>
                      )}
                    </div>
                    <ul className="space-y-2.5 mb-6">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground/80">
                          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={isPopular ? "default" : "outline"}
                      asChild
                    >
                      <Link href="/auth/signup">
                        {plan.price === 0 ? "Start Free Trial" : "Get Started"}
                      </Link>
                    </Button>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 border-t border-white/[0.04]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Ready to meet your AI team?
          </h2>
          <p className="text-muted-foreground/70 mb-8">
            Start your free trial today. No credit card required.
          </p>
          <Button size="lg" className="h-12 px-10 text-base gap-2" asChild>
            <Link href="/auth/signup">
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
