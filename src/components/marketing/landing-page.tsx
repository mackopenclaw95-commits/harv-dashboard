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
  Music,
  Activity,
  FileText,
  BookOpen,
  Plane,
  MessageSquare,
  Globe,
  Smartphone,
  Lock,
  Layers,
  Clock,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { MarketingNav } from "./marketing-nav";
import { Footer } from "./footer";
import { PLANS } from "@/lib/plan-config";

/* ─── Agent roster — ordered by "wow" factor, no admin-only agents ─── */
const AGENT_ROSTER = [
  {
    name: "Harv",
    icon: Bot,
    desc: "Your main AI — talk naturally, ask anything, and Harv routes to the right specialist automatically",
    tag: "Core",
  },
  {
    name: "Research",
    icon: Search,
    desc: "Ask any question and get deep, multi-source answers — product comparisons, market analysis, fact-checking",
    tag: "Popular",
  },
  {
    name: "Email",
    icon: Mail,
    desc: "Reads your inbox, drafts replies, summarizes threads, sends emails, and archives junk — all hands-free",
    tag: "Everyday",
  },
  {
    name: "Scheduler",
    icon: Calendar,
    desc: "Manages your Google Calendar — checks availability, books meetings, sets reminders, never double-books",
    tag: "Everyday",
  },
  {
    name: "Music",
    icon: Music,
    desc: "Controls your Spotify — play songs, build playlists, discover new music, check your top tracks",
    tag: "Fun",
  },
  {
    name: "Finance",
    icon: TrendingUp,
    desc: "Track spending, log transactions, set budgets, get weekly summaries — your personal bookkeeper",
    tag: "Useful",
  },
  {
    name: "Sports",
    icon: Activity,
    desc: "Live scores, standings, schedules, injury reports — ask about any team, any league, any time",
    tag: "Fun",
  },
  {
    name: "Travel",
    icon: Plane,
    desc: "Plan trips, build itineraries, compare destinations, get local tips — like a travel agent in your pocket",
    tag: "Useful",
  },
  {
    name: "Learning",
    icon: BookOpen,
    desc: "Research any topic, get tutoring, create flashcards, quiz yourself — your personal study buddy",
    tag: "Growth",
  },
  {
    name: "Image Gen",
    icon: Image,
    desc: "Describe what you want and get AI-generated images — logos, art, social posts, profile pics",
    tag: "Creative",
  },
  {
    name: "Journal",
    icon: FileText,
    desc: "Keeps a running memory of your conversations, decisions, and preferences — Harv never forgets",
    tag: "Smart",
  },
];

const STATS = [
  { value: "20+", label: "AI Agents" },
  { value: "24/7", label: "Always On" },
  { value: "<2s", label: "Avg Response" },
  { value: "$0", label: "To Start" },
];

const VALUE_PROPS = [
  {
    icon: Bot,
    title: "One AI. Every Task.",
    desc: "Stop copy-pasting between ChatGPT, Google, Spotify, and your calendar. Tell Harv what you need — in plain English — and the right agent handles it. Research a topic, schedule a meeting, and draft an email, all in one conversation.",
    accent: "from-primary/20 to-primary/5",
  },
  {
    icon: Zap,
    title: "Works While You Sleep",
    desc: "Background agents run 24/7. Guardian monitors your systems for issues. Medic auto-fixes bugs before you notice. Heartbeat keeps your data synced across every integration. Wake up to a status report, not a fire drill.",
    accent: "from-cyan-500/20 to-cyan-500/5",
  },
  {
    icon: Brain,
    title: "Remembers Everything",
    desc: "Most AI tools forget you after every conversation. Harv doesn't. The Journal agent builds a memory of your preferences, past decisions, and context over time. Day 30 Harv knows you better than day 1.",
    accent: "from-teal-400/20 to-teal-400/5",
  },
  {
    icon: Shield,
    title: "Your Data. Your Control.",
    desc: "Per-user encryption, no training on your data, and full cost transparency. You see exactly what every agent costs, set your own spending limits, and can export or delete everything at any time.",
    accent: "from-sky-500/20 to-sky-500/5",
  },
];

const INTEGRATIONS = [
  {
    name: "Google Workspace",
    icon: Globe,
    items: ["Gmail", "Calendar", "Drive", "Docs", "Sheets"],
    status: "live",
    desc: "Full access to your Google ecosystem — read emails, schedule events, manage files",
  },
  {
    name: "Spotify",
    icon: Music,
    items: ["Playlists", "Playback", "Discovery", "Library"],
    status: "live",
    desc: "Control your music hands-free — play songs, build playlists, find new artists",
  },
  {
    name: "Telegram",
    icon: MessageSquare,
    items: ["Chat", "Commands", "Notifications"],
    status: "live",
    desc: "Message Harv from your phone — get answers, run commands, receive alerts on the go",
  },
  {
    name: "Discord",
    icon: MessageSquare,
    items: ["DMs", "Server Bot", "Agent Channels"],
    status: "coming soon",
    desc: "Add the Harv bot to your server — each agent gets its own channel",
  },
  {
    name: "WhatsApp",
    icon: Smartphone,
    items: ["Chat", "Forwarding", "Summaries"],
    status: "coming soon",
    desc: "Text Harv like a friend — forward messages, get summaries, stay connected",
  },
  {
    name: "Notion, Slack, GitHub",
    icon: Layers,
    items: ["Pages", "Messages", "Repos"],
    status: "coming soon",
    desc: "Your productivity stack — we're building connectors for the tools you already use",
  },
];

const USE_CASES = [
  {
    emoji: "7:00 AM",
    title: "Morning Briefing",
    desc: "\"Harv, what's my day look like?\" — Get your calendar, unread emails, sports scores, and weather in one response.",
  },
  {
    emoji: "12:30 PM",
    title: "Quick Research",
    desc: "\"Compare the top 5 noise-canceling headphones under $300\" — Research agent delivers a sourced breakdown in seconds.",
  },
  {
    emoji: "3:00 PM",
    title: "Inbox Zero",
    desc: "\"Summarize my unread emails and draft replies\" — Email agent reads, prioritizes, and writes responses for your approval.",
  },
  {
    emoji: "6:00 PM",
    title: "Unwind",
    desc: "\"Play something chill on Spotify\" — Music agent queues up a playlist based on your listening history.",
  },
  {
    emoji: "9:00 PM",
    title: "Plan Tomorrow",
    desc: "\"Schedule a dentist appointment Thursday at 2pm and remind me to prep for the Friday meeting\" — Done in one message.",
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

      {/* Dot grid texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, oklch(1 0 0) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <MarketingNav />

      {/* ═══════════════════════════════════════
          HERO
         ═══════════════════════════════════════ */}
      <section className="relative pt-36 md:pt-44 pb-24 md:pb-32 px-6">
        <div className="max-w-5xl mx-auto">
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

          <h1
            className="text-center text-5xl sm:text-6xl md:text-8xl font-bold tracking-tight leading-[0.95] mb-8"
            style={{ animation: "landing-fade-up 0.7s ease-out 0.1s both" }}
          >
            <span className="block">One AI That</span>
            <span className="block text-primary mt-2 md:mt-3">
              Runs Your Life
            </span>
          </h1>

          <p
            className="text-center text-lg md:text-xl text-muted-foreground/70 max-w-2xl mx-auto mb-12 leading-relaxed"
            style={{ animation: "landing-fade-up 0.7s ease-out 0.2s both" }}
          >
            Harv is your personal AI command center. Research anything, manage
            your inbox, control Spotify, track finances, plan trips, and more
            — all by just asking.
          </p>

          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
            style={{ animation: "landing-fade-up 0.7s ease-out 0.3s both" }}
          >
            <ButtonLink
              href="/auth/signup"
              size="lg"
              className="h-13 px-10 text-base gap-2.5 shadow-[0_0_30px_-5px] shadow-primary/25 hover:shadow-primary/40 transition-shadow"
            >
              Start Free — No Card Required
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink
              href="/features"
              variant="outline"
              size="lg"
              className="h-13 px-10 text-base bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] backdrop-blur-sm"
            >
              See All Features
            </ButtonLink>
          </div>

          {/* Stats */}
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
          "A DAY WITH HARV" — Use case timeline
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">
              How It Works
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              A day with Harv
            </h2>
            <p className="text-muted-foreground/60 max-w-lg mx-auto">
              Just talk to Harv like you&apos;d talk to a personal assistant.
              Here&apos;s what a typical day looks like.
            </p>
          </div>

          <div className="space-y-4">
            {USE_CASES.map((uc, i) => (
              <div
                key={uc.title}
                className="group flex gap-5 md:gap-6 items-start rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5 md:p-6 hover:border-white/[0.12] transition-all duration-300"
                style={{ animation: `landing-fade-up 0.5s ease-out ${0.08 * i}s both` }}
              >
                <div className="shrink-0 w-16 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80">
                    {uc.emoji}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold mb-1 text-sm md:text-base">{uc.title}</h3>
                  <p className="text-sm text-muted-foreground/60 leading-relaxed italic">
                    {uc.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          VALUE PROPS
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">
              Why Harv
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Not just another
              <span className="text-primary"> chatbot</span>
            </h2>
            <p className="text-muted-foreground/60 max-w-lg mx-auto">
              ChatGPT answers questions. Harv actually does things.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {VALUE_PROPS.map((prop, i) => (
              <div
                key={prop.title}
                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-7 md:p-8 hover:border-white/[0.12] transition-all duration-300 overflow-hidden"
                style={{ animation: `landing-fade-up 0.6s ease-out ${0.1 * i}s both` }}
              >
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
          AGENT ROSTER — Status board
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
              Every agent is a specialist. You talk to Harv — he delegates to
              the right one automatically. Or talk to any agent directly.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] backdrop-blur-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] md:grid-cols-[180px_1fr_80px_80px] gap-4 px-5 md:px-6 py-3 border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
              <span>Agent</span>
              <span className="hidden md:block">What It Does</span>
              <span className="hidden md:block text-center">Type</span>
              <span className="text-right">Status</span>
            </div>

            {AGENT_ROSTER.map((agent, i) => (
              <div
                key={agent.name}
                className={`group grid grid-cols-[1fr_auto] md:grid-cols-[180px_1fr_80px_80px] gap-4 px-5 md:px-6 py-3.5 items-center hover:bg-white/[0.02] transition-colors ${
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
                <span className="hidden md:flex justify-center">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground/50 border border-white/[0.06]">
                    {agent.tag}
                  </span>
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

          <p className="text-center text-xs text-muted-foreground/40 mt-4">
            + background agents (Guardian, Medic, Heartbeat) running 24/7
          </p>

          <div className="text-center mt-6">
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
          INTEGRATIONS — What Harv connects to
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">
              Integrations
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Plugs into your
              <span className="text-primary"> real life</span>
            </h2>
            <p className="text-muted-foreground/60 max-w-lg mx-auto">
              Harv isn&apos;t just a chatbot in a browser tab. Connect your
              accounts and let it work across the tools you already use.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {INTEGRATIONS.map((intg, i) => (
              <div
                key={intg.name}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 hover:border-white/[0.12] transition-all duration-300"
                style={{ animation: `landing-fade-up 0.5s ease-out ${0.08 * i}s both` }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/[0.07] flex items-center justify-center group-hover:bg-primary/[0.12] transition-colors">
                      <intg.icon className="h-4 w-4 text-primary/80" />
                    </div>
                    <h3 className="font-semibold text-sm">{intg.name}</h3>
                  </div>
                  {intg.status === "live" ? (
                    <span className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" style={{ animationDuration: "2s" }} />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">Live</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 px-2 py-0.5 rounded-full border border-white/[0.06]">
                      Soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground/50 mb-4 leading-relaxed">
                  {intg.desc}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {intg.items.map((item) => (
                    <span
                      key={item}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground/50 border border-white/[0.04]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          PRICING
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">
              Pricing
            </p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Start free. Upgrade
              <span className="text-primary"> when you&apos;re ready</span>
            </h2>
            <p className="text-muted-foreground/60 max-w-lg mx-auto">
              No hidden fees. No credit card to start. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {(
              Object.entries(PLANS) as [string, (typeof PLANS)[keyof typeof PLANS]][]
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
                      <span className="text-sm text-muted-foreground/60">/mo</span>
                    )}
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground/70">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink
                    href="/auth/signup"
                    className={`w-full ${isPopular ? "shadow-[0_0_20px_-5px] shadow-primary/20" : ""}`}
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
          FINAL CTA
         ═══════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/15 mb-8">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-5">
            Stop switching tabs.
            <br />
            <span className="text-primary">Start delegating.</span>
          </h2>
          <p className="text-muted-foreground/60 mb-10 text-lg max-w-xl mx-auto">
            Your AI team is ready. 7-day free trial, no credit card, cancel
            anytime. What would you do with 20 agents working for you?
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
