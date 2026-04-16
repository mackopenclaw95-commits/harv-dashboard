import Link from "next/link";
import {
  Zap,
  Bot,
  Brain,
  BarChart3,
  Calendar,
  Mail,
  Search,
  TrendingUp,
  Shield,
  ArrowRight,
  Check,
  Sparkles,
  Image,
  Video,
  Music,
  Activity,
  FileText,
  BookOpen,
  Plane,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { MarketingNav } from "./marketing-nav";
import { Footer } from "./footer";
import { PLANS } from "@/lib/plan-config";

/* ─── Agent roster for the showcase ─── */
const AGENT_ROSTER = [
  { name: "Research", icon: Search, desc: "Deep web research with multi-source analysis", status: "live" },
  { name: "Finance", icon: TrendingUp, desc: "Budget tracking, transaction logging, bank sync", status: "live" },
  { name: "Scheduler", icon: Calendar, desc: "Calendar management and smart reminders", status: "live" },
  { name: "Email", icon: Mail, desc: "Read, send, and archive with AI summarization", status: "live" },
  { name: "Marketing", icon: Sparkles, desc: "Content strategy, social media, auto-posting", status: "live" },
  { name: "Music", icon: Music, desc: "Spotify playback, playlists, recommendations", status: "live" },
  { name: "Sports", icon: Activity, desc: "Live scores, standings, schedules, injury reports", status: "live" },
  { name: "Learning", icon: BookOpen, desc: "Research assistant, tutor, flashcards", status: "live" },
  { name: "Travel", icon: Plane, desc: "Trip planning, itineraries, destination research", status: "live" },
  { name: "Image Gen", icon: Image, desc: "AI image generation on demand", status: "live" },
  { name: "Video Digest", icon: Video, desc: "Video transcripts, digests, actionable breakdowns", status: "live" },
  { name: "Journal", icon: FileText, desc: "Daily memory, session compression, context", status: "live" },
];

const STATS = [
  { value: "20+", label: "AI Agents" },
  { value: "24/7", label: "Background Monitoring" },
  { value: "<2s", label: "Average Response" },
  { value: "$0", label: "To Start" },
];

const VALUE_PROPS = [
  {
    icon: Bot,
    title: "Your AI Team",
    desc: "20+ specialized agents work together under Harv's coordination. Research, finance, scheduling, email, trading, marketing — each handled by a purpose-built specialist.",
    accent: "from-primary/20 to-primary/5",
  },
  {
    icon: Zap,
    title: "Runs While You Sleep",
    desc: "Background agents monitor your systems around the clock. Guardian watches for issues, Medic auto-fixes bugs, Heartbeat keeps data flowing. Set it and forget it.",
    accent: "from-cyan-500/20 to-cyan-500/5",
  },
  {
    icon: Brain,
    title: "Gets Smarter Over Time",
    desc: "Harv builds a memory of your preferences, context, and patterns. The Journal agent compresses daily interactions into lasting knowledge. Day 30 is better than day 1.",
    accent: "from-teal-400/20 to-teal-400/5",
  },
  {
    icon: Shield,
    title: "One Command Center",
    desc: "Stop tab-switching between a dozen apps. Chat, analytics, activity logs, cost tracking, and admin tools — all unified behind a single glassmorphic dashboard.",
    accent: "from-sky-500/20 to-sky-500/5",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Subtle dot grid texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, oklch(1 0 0) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <MarketingNav />

      {/* ═══════════════════════════════════════
          HERO — Confident, dramatic, spacious
         ═══════════════════════════════════════ */}
      <section className="relative pt-36 md:pt-44 pb-24 md:pb-32 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Badge */}
          <div
            className="flex justify-center mb-8"
            style={{ animation: "landing-fade-up 0.6s ease-out both" }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/[0.08] border border-primary/20 text-xs font-medium text-primary backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              20+ agents live and operational
            </div>
          </div>

          {/* Headline */}
          <h1
            className="text-center text-5xl sm:text-6xl md:text-8xl font-bold tracking-tight leading-[0.95] mb-8"
            style={{ animation: "landing-fade-up 0.7s ease-out 0.1s both" }}
          >
            <span className="block">Your AI-Powered</span>
            <span className="block text-primary mt-2 md:mt-3" style={{ WebkitTextStroke: "0" }}>
              Command Center
            </span>
          </h1>

          {/* Subheading */}
          <p
            className="text-center text-lg md:text-xl text-muted-foreground/70 max-w-2xl mx-auto mb-12 leading-relaxed"
            style={{ animation: "landing-fade-up 0.7s ease-out 0.2s both" }}
          >
            Harv coordinates a team of specialized AI agents to run your digital
            life. Research, finance, scheduling, email, media — all orchestrated
            from one dashboard.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
            style={{ animation: "landing-fade-up 0.7s ease-out 0.3s both" }}
          >
            <ButtonLink
              href="/auth/signup"
              size="lg"
              className="h-13 px-10 text-base gap-2.5 shadow-[0_0_30px_-5px] shadow-primary/25 hover:shadow-primary/40 transition-shadow"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink
              href="/features"
              variant="outline"
              size="lg"
              className="h-13 px-10 text-base bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] backdrop-blur-sm"
            >
              Explore Features
            </ButtonLink>
          </div>

          {/* Stats bar */}
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 max-w-3xl mx-auto"
            style={{ animation: "landing-fade-up 0.7s ease-out 0.45s both" }}
          >
            {STATS.map((stat, i) => (
              <div
                key={stat.label}
                className={`text-center py-4 ${
                  i < STATS.length - 1 ? "md:border-r md:border-white/[0.06]" : ""
                }`}
              >
                <div className="text-2xl md:text-3xl font-bold text-primary tracking-tight">
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground/50 mt-1 uppercase tracking-wider font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          VALUE PROPS — Glassmorphic feature cards
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">
              Why Harv
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Everything you need,
              <br className="hidden md:block" />
              <span className="text-primary"> one AI away</span>
            </h2>
            <p className="text-muted-foreground/60 max-w-lg mx-auto">
              Stop juggling a dozen apps. Harv brings it all together under one
              intelligent system.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {VALUE_PROPS.map((prop, i) => (
              <div
                key={prop.title}
                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-7 md:p-8 hover:border-white/[0.12] transition-all duration-300 overflow-hidden"
                style={{ animation: `landing-fade-up 0.6s ease-out ${0.1 * i}s both` }}
              >
                {/* Gradient accent top-left */}
                <div className={`absolute top-0 left-0 w-48 h-48 bg-gradient-to-br ${prop.accent} rounded-full -translate-x-1/2 -translate-y-1/2 opacity-60 group-hover:opacity-100 transition-opacity duration-500`} />

                <div className="relative">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 group-hover:border-primary/20 transition-all duration-300">
                    <prop.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2.5 tracking-tight">
                    {prop.title}
                  </h3>
                  <p className="text-sm text-muted-foreground/60 leading-relaxed">
                    {prop.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          AGENT SHOWCASE — Status board roster
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">
              The Team
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Meet your agents
            </h2>
            <p className="text-muted-foreground/60 max-w-lg mx-auto">
              Each agent is a specialist. Together, they&apos;re an unstoppable team
              — all coordinated by Harv.
            </p>
          </div>

          {/* Agent grid — status board style */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] backdrop-blur-sm overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto] md:grid-cols-[200px_1fr_100px] gap-4 px-5 md:px-6 py-3 border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
              <span>Agent</span>
              <span className="hidden md:block">Capability</span>
              <span className="text-right">Status</span>
            </div>

            {/* Agent rows */}
            {AGENT_ROSTER.map((agent, i) => (
              <div
                key={agent.name}
                className={`group grid grid-cols-[1fr_auto] md:grid-cols-[200px_1fr_100px] gap-4 px-5 md:px-6 py-3.5 items-center hover:bg-white/[0.02] transition-colors ${
                  i < AGENT_ROSTER.length - 1 ? "border-b border-white/[0.03]" : ""
                }`}
                style={{ animation: `landing-fade-up 0.4s ease-out ${0.03 * i}s both` }}
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/[0.07] flex items-center justify-center shrink-0 group-hover:bg-primary/[0.12] transition-colors">
                    <agent.icon className="h-3.5 w-3.5 text-primary/80" />
                  </div>
                  <span className="text-sm font-medium">{agent.name}</span>
                </div>
                <span className="hidden md:block text-xs text-muted-foreground/50">
                  {agent.desc}
                </span>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" style={{ animationDuration: "2s" }} />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">
                    Live
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <ButtonLink
              href="/features"
              variant="outline"
              size="sm"
              className="gap-2 bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]"
            >
              View all agents &amp; capabilities
              <ArrowRight className="h-3 w-3" />
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          PRICING — Clean three-column layout
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">
              Pricing
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-muted-foreground/60 max-w-lg mx-auto">
              Start free. Upgrade when you&apos;re ready. No surprises, no hidden
              fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {(
              Object.entries(PLANS) as [
                string,
                (typeof PLANS)[keyof typeof PLANS],
              ][]
            ).map(([key, plan], i) => {
              const isPopular = key === "pro";
              return (
                <div
                  key={key}
                  className={`relative rounded-2xl border p-7 transition-all duration-300 ${
                    isPopular
                      ? "border-primary/30 bg-primary/[0.04] ring-1 ring-primary/15 scale-[1.02] md:scale-105 z-10"
                      : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]"
                  }`}
                  style={{ animation: `landing-fade-up 0.6s ease-out ${0.1 * i}s both` }}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}
                  <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-bold tracking-tight">
                      ${plan.price === 0 ? "0" : (plan.price / 100).toFixed(0)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-sm text-muted-foreground/60">
                        /mo
                      </span>
                    )}
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2.5 text-sm text-muted-foreground/70"
                      >
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink
                    href="/auth/signup"
                    className={`w-full ${
                      isPopular
                        ? "shadow-[0_0_20px_-5px] shadow-primary/20"
                        : ""
                    }`}
                    variant={isPopular ? "default" : "outline"}
                  >
                    {plan.price === 0 ? "Start Free Trial" : "Get Started"}
                  </ButtonLink>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          FINAL CTA — Minimal, confident close
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/15 mb-8">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-5">
            Ready to put your
            <br />
            <span className="text-primary">AI team to work?</span>
          </h2>
          <p className="text-muted-foreground/60 mb-10 text-lg">
            7-day free trial. No credit card required.
          </p>
          <ButtonLink
            href="/auth/signup"
            size="lg"
            className="h-13 px-12 text-base gap-2.5 shadow-[0_0_30px_-5px] shadow-primary/25 hover:shadow-primary/40 transition-shadow"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </section>

      <Footer />
    </div>
  );
}
