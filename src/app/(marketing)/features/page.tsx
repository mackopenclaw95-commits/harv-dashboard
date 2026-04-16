import {
  MessageSquare,
  Zap,
  Brain,
  BarChart3,
  Wrench,
  Calendar,
  FileText,
  Globe,
  Music,
  Shield,
  Eye,
  Layout,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features — Harv AI",
  description: "Discover Harv's platform capabilities — chat, automations, memory, analytics, integrations, and more.",
};

const PLATFORM_FEATURES = [
  {
    icon: MessageSquare,
    title: "Natural Chat Interface",
    desc: "Talk to Harv like you'd talk to a person. Ask questions, give commands, chain tasks together. Harv understands context and routes to the right agent automatically — you never need to pick one.",
    highlight: true,
  },
  {
    icon: Wrench,
    title: "Custom Agent Builder",
    desc: "Build your own agents in plain English. Describe what you need, Harv asks a few follow-up questions, and creates it. Set it on a schedule — daily briefings, weekly reports, hourly monitoring — and forget about it.",
    highlight: true,
  },
  {
    icon: Zap,
    title: "Automations & Crons",
    desc: "Schedule recurring tasks that run even when you're offline. System scans, data syncs, content posting, inbox cleanups. Pick from templates or describe your own. Background agents keep everything alive 24/7.",
    highlight: false,
  },
  {
    icon: Brain,
    title: "Memory & Journal",
    desc: "Harv builds long-term memory from every conversation. The Journal agent compresses each day into lasting context — your preferences, decisions, and patterns carry forward forever. Day 30 Harv is smarter than day 1.",
    highlight: false,
  },
  {
    icon: BarChart3,
    title: "Analytics & Cost Tracking",
    desc: "Real-time dashboards showing exactly what each agent does and costs. Daily burn rate, monthly projections, per-agent breakdowns, and budget alerts at 80%. Full transparency — no surprise bills.",
    highlight: false,
  },
  {
    icon: Globe,
    title: "Integrations",
    desc: "Google Workspace (Gmail, Calendar, Drive, Docs, Sheets), Spotify, Telegram — all connected via secure OAuth. Discord, WhatsApp, Notion, Slack, and GitHub coming soon.",
    highlight: false,
  },
  {
    icon: Layout,
    title: "Customizable Dashboard",
    desc: "Drag-and-drop widgets to build your perfect command center. Quick stats, agent activity feed, cost breakdowns, storage usage, and trial countdown — all rearrangeable to fit how you work.",
    highlight: false,
  },
  {
    icon: FileText,
    title: "Projects & Documents",
    desc: "Organize work into projects with their own conversation history and document storage. Upload files, search across documents, and give agents context about what you're working on.",
    highlight: false,
  },
  {
    icon: Calendar,
    title: "Activity Timeline",
    desc: "A full audit trail of everything your agents do. Filter by date, agent, or action type. See costs per event, token usage, and response summaries. Exportable as CSV for your records.",
    highlight: false,
  },
  {
    icon: Shield,
    title: "Budget Controls",
    desc: "Set daily, weekly, and monthly spending caps. When you approach a limit, Harv switches to a cheaper model instead of stopping. Free plan users get blocked at the limit — upgrade to keep going.",
    highlight: false,
  },
  {
    icon: Eye,
    title: "Guided Onboarding Tour",
    desc: "New to Harv? A step-by-step tour walks you through the dashboard, chat, agents, and builder. No manual needed — you'll be productive in under 2 minutes.",
    highlight: false,
  },
  {
    icon: Sparkles,
    title: "Personality System",
    desc: "Harv isn't a generic bot — it has a personality. Professional by default, with the ability to customize tone and style. There might even be a hidden Easter egg or two.",
    highlight: false,
  },
];

export default function FeaturesPage() {
  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">Platform</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5">
            More than a chatbot.<br />
            <span className="text-primary">A command center.</span>
          </h1>
          <p className="text-lg text-muted-foreground/60 max-w-2xl mx-auto leading-relaxed">
            Chat, automations, memory, analytics, integrations, custom agents, and
            a dashboard you can make your own. Here&apos;s everything Harv can do.
          </p>
        </div>

        {/* Highlighted features — larger cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {PLATFORM_FEATURES.filter(f => f.highlight).map((feat) => (
            <div
              key={feat.title}
              className="group relative rounded-2xl border border-primary/15 bg-primary/[0.03] backdrop-blur-sm p-7 hover:border-primary/25 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-48 h-48 bg-gradient-to-br from-primary/15 to-transparent rounded-full -translate-x-1/2 -translate-y-1/2 opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                  <feat.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2.5 tracking-tight">{feat.title}</h3>
                <p className="text-sm text-muted-foreground/60 leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Rest of features — standard grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {PLATFORM_FEATURES.filter(f => !f.highlight).map((feat) => (
            <div
              key={feat.title}
              className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 hover:border-white/[0.12] transition-all duration-300"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/[0.07] flex items-center justify-center mb-4 group-hover:bg-primary/[0.12] transition-colors">
                <feat.icon className="h-4.5 w-4.5 text-primary/80" />
              </div>
              <h3 className="font-semibold text-sm mb-2">{feat.title}</h3>
              <p className="text-xs text-muted-foreground/55 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center py-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">See it in action</h2>
          <p className="text-muted-foreground/60 mb-6">7-day free trial. No credit card required.</p>
          <div className="flex items-center justify-center gap-4">
            <ButtonLink href="/auth/signup" size="lg" className="h-12 px-10 text-base gap-2 shadow-[0_0_20px_-5px] shadow-primary/20">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/meet-the-agents" variant="outline" size="sm" className="gap-2 bg-white/[0.03] border-white/[0.08]">
              Meet the agents <ArrowRight className="h-3 w-3" />
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
