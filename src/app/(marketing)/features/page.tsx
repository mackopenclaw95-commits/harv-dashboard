import {
  Bot,
  Search,
  TrendingUp,
  Calendar,
  Mail,
  BarChart3,
  Sparkles,
  Brain,
  FileText,
  Music,
  Dumbbell,
  MessageSquare,
  Image,
  Video,
  Shield,
  Heart,
  Activity,
  Plane,
  BookOpen,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features — Harv AI",
  description: "Discover Harv's 20+ specialized AI agents and platform capabilities.",
};

const LIVE_AGENTS = [
  { name: "Harv", icon: Bot, desc: "Main brain — coordinates all agents with personality and context awareness", model: "Standard" },
  { name: "Research", icon: Search, desc: "Deep web research, product comparisons, market analysis", model: "Premium Search" },
  { name: "Finance", icon: TrendingUp, desc: "Budget tracking, transaction logging, Plaid bank sync", model: "Standard" },
  { name: "Trading", icon: BarChart3, desc: "Polymarket + Kalshi paper trading, crypto tracking", model: "Standard" },
  { name: "Scheduler", icon: Calendar, desc: "Calendar and reminder management with Google Calendar integration", model: "Standard Fast" },
  { name: "Email", icon: Mail, desc: "Reads, sends, and archives Gmail with AI summarization", model: "Standard Fast" },
  { name: "Journal", icon: FileText, desc: "Daily memory — session compression, context building over time", model: "Standard Fast" },
  { name: "Music", icon: Music, desc: "Spotify API — playback, playlists, recommendations", model: "Standard" },
  { name: "Sports", icon: Activity, desc: "Live scores, standings, schedules, injury reports", model: "Standard" },
  { name: "Learning", icon: BookOpen, desc: "Research assistant, tutor, flashcards, quizzes", model: "Standard" },
  { name: "Travel", icon: Plane, desc: "Trip planning, itineraries, destination research", model: "Standard Fast" },
  { name: "Auto Marketing", icon: Sparkles, desc: "Content strategy, social media, Twitter auto-posting", model: "Standard" },
  { name: "Image Gen", icon: Image, desc: "AI image generation", model: "Image Engine" },
  { name: "Video Digest", icon: Video, desc: "Video transcripts, digests, and actionable breakdowns", model: "Standard" },
  { name: "YouTube Digest", icon: Video, desc: "YouTube video summaries and implementation notes", model: "Standard" },
];

const BACKGROUND_AGENTS = [
  { name: "Guardian", icon: Shield, desc: "System monitor — 24/7 health checks and alerting", model: "Lite" },
  { name: "Medic", icon: Heart, desc: "Error scanner — auto-detects and fixes bugs every 6 hours", model: "Lite" },
  { name: "Heartbeat", icon: Activity, desc: "System pulse — processes tasks and syncs data", model: "Lite" },
];

const PLANNED_AGENTS = [
  { name: "Product Research", desc: "Product comparisons, reviews, purchase recommendations" },
  { name: "Market Research", desc: "Competitor tracking and trend reports" },
  { name: "Data Viz", desc: "Charts and visual reports from raw data" },
  { name: "Video Gen", desc: "AI video generation from text prompts" },
  { name: "Video Editor", desc: "Automated editing and post-production" },
];

const CAPABILITIES = [
  { icon: MessageSquare, title: "Chat Interface", desc: "Talk to Harv naturally. Ask questions, give commands, or just chat. Harv routes to the right agent automatically." },
  { icon: Zap, title: "Automations", desc: "Schedule recurring tasks — system scans, data syncs, content posting. Set it once, Harv handles the rest." },
  { icon: Brain, title: "Memory & Context", desc: "Harv builds a knowledge base over time. Journal entries, conversation history, and learned preferences." },
  { icon: BarChart3, title: "Analytics", desc: "Track API costs, usage metrics, and agent performance. Know exactly what your AI team is doing." },
];

export default function FeaturesPage() {
  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Meet Your AI Team
          </h1>
          <p className="text-lg text-muted-foreground/70 max-w-2xl mx-auto">
            {LIVE_AGENTS.length} live agents, {BACKGROUND_AGENTS.length} background
            workers, and more on the way.
          </p>
        </div>

        {/* Live Agents */}
        <div className="mb-16">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            Live Agents
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LIVE_AGENTS.map((agent) => (
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
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                      {agent.model}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/60 leading-relaxed">
                  {agent.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Background Agents */}
        <div className="mb-16">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            Background Workers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {BACKGROUND_AGENTS.map((agent) => (
              <div
                key={agent.name}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-9 w-9 rounded-lg bg-yellow-400/10 flex items-center justify-center">
                    <agent.icon className="h-4 w-4 text-yellow-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{agent.name}</h4>
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                      {agent.model}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/60 leading-relaxed">
                  {agent.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Coming Soon */}
        <div className="mb-20">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            Coming Soon
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLANNED_AGENTS.map((agent) => (
              <div
                key={agent.name}
                className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5 opacity-60"
              >
                <h4 className="font-semibold text-sm mb-2">{agent.name}</h4>
                <p className="text-xs text-muted-foreground/50 leading-relaxed">
                  {agent.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Capabilities */}
        <div>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              Platform Capabilities
            </h2>
            <p className="text-muted-foreground/70">
              More than just agents — a full command center.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <cap.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{cap.title}</h3>
                <p className="text-sm text-muted-foreground/70 leading-relaxed">
                  {cap.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
