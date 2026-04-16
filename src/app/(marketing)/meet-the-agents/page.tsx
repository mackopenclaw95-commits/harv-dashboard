import {
  Bot, Search, Mail, Calendar, Music, TrendingUp, Activity,
  Plane, BookOpen, Image, FileText, Shield, Heart, Zap,
  ArrowRight, MessageSquare, Wrench, Clock, Puzzle, Check,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents — Harv AI",
  description: "Meet the 20+ AI agents that power Harv. Research, email, scheduling, music, finance, and more — all working together.",
};

const AGENTS = [
  { name: "Harv", icon: Bot, desc: "Your main AI — talk naturally, ask anything, and Harv routes to the right specialist automatically. He coordinates the entire team, remembers your preferences, and gets smarter over time.", tag: "Core", color: "text-primary" },
  { name: "Research", icon: Search, desc: "Ask any question and get deep, multi-source answers. Product comparisons, market analysis, fact-checking, academic research — with sources cited.", tag: "Popular", color: "text-blue-400" },
  { name: "Email", icon: Mail, desc: "Reads your Gmail inbox, summarizes threads, drafts replies in your tone, sends on your approval, and archives junk. Inbox zero without lifting a finger.", tag: "Everyday", color: "text-emerald-400" },
  { name: "Scheduler", icon: Calendar, desc: "Full Google Calendar integration — checks availability, books meetings, sets reminders, prevents double-bookings, and gives you daily schedule briefings.", tag: "Everyday", color: "text-amber-400" },
  { name: "Music", icon: Music, desc: "Controls your Spotify — play songs by name, build playlists from vibes, discover new artists, check your top tracks, and queue up the perfect mood.", tag: "Fun", color: "text-green-400" },
  { name: "Finance", icon: TrendingUp, desc: "Track spending, log transactions, set budgets, categorize expenses, and get weekly financial summaries. Your personal bookkeeper that never misses a cent.", tag: "Useful", color: "text-cyan-400" },
  { name: "Sports", icon: Activity, desc: "Live scores, standings, schedules, injury reports, and game previews — for any team, any league, any sport. Ask before the game or check results after.", tag: "Fun", color: "text-orange-400" },
  { name: "Travel", icon: Plane, desc: "Plan trips end-to-end — destination research, day-by-day itineraries, cost estimates, local tips, weather forecasts, and packing lists.", tag: "Useful", color: "text-sky-400" },
  { name: "Learning", icon: BookOpen, desc: "Research any topic in depth, get tutored through complex subjects, create flashcards, take quizzes, and track your progress over time.", tag: "Growth", color: "text-purple-400" },
  { name: "Image Gen", icon: Image, desc: "Describe what you want and get AI-generated images — logos, social media graphics, profile pictures, concept art, or anything you can imagine.", tag: "Creative", color: "text-pink-400" },
  { name: "Journal", icon: FileText, desc: "Automatically compresses each day's conversations into lasting memory entries. Your preferences, decisions, and context carry forward — Harv never forgets.", tag: "Smart", color: "text-teal-400" },
];

const BACKGROUND_AGENTS = [
  { name: "Guardian", icon: Shield, desc: "Monitors system health every 15 minutes — disk, RAM, services. Sends Telegram alerts when issues are detected and triggers Medic for auto-repair.", schedule: "Every 15 min" },
  { name: "Medic", icon: Heart, desc: "Two-tier auto-repair: scripted fixes for common issues, LLM-powered diagnosis for complex ones. Service restarts, disk cleanup, memory management.", schedule: "On demand" },
  { name: "Heartbeat", icon: Zap, desc: "System pulse that runs every 90 minutes — processes the task queue, syncs data across integrations, and keeps everything alive in the background.", schedule: "Every 90 min" },
];

const BUILDER_STEPS = [
  { icon: MessageSquare, title: "Describe what you need", desc: "Tell Harv in plain English: \"I want an agent that checks competitor prices every Monday and sends me a summary.\"" },
  { icon: Wrench, title: "Harv asks smart questions", desc: "Harv clarifies scope, schedule, and preferences with a few follow-up questions — like talking to a colleague." },
  { icon: Clock, title: "Set a schedule", desc: "Run it once, daily, weekly, or on-demand. Automations run even when you're offline — Harv handles it in the background." },
  { icon: Puzzle, title: "Or start from a template", desc: "Pre-built templates: Daily Briefing, Inbox Cleanup, Weekly Report, Social Post Scheduler, Calendar Reminders, Data Backups." },
];

export default function AgentsPage() {
  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">The Team</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5">
            Meet your <span className="text-primary">AI agents</span>
          </h1>
          <p className="text-lg text-muted-foreground/60 max-w-2xl mx-auto leading-relaxed">
            11 live agents. 3 background workers. Infinite custom agents you can build yourself.
            Talk to Harv and he routes to the right specialist — or talk to any agent directly.
          </p>
        </div>

        {/* Live Agents */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-8">Live Agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {AGENTS.map((agent) => (
              <div key={agent.name} className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 hover:border-white/[0.12] transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/[0.07] flex items-center justify-center group-hover:bg-primary/[0.12] transition-colors">
                      <agent.icon className={`h-4.5 w-4.5 ${agent.color}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground/50 border border-white/[0.06]">{agent.tag}</span>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" style={{ animationDuration: "2s" }} />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/80">Live</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/55 leading-relaxed">{agent.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Background Agents */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-3">Background Workers</h2>
          <p className="text-sm text-muted-foreground/50 mb-8">These agents run automatically behind the scenes — no interaction needed.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {BACKGROUND_AGENTS.map((agent) => (
              <div key={agent.name} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                    <agent.icon className="h-4.5 w-4.5 text-muted-foreground/60" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{agent.name}</h3>
                    <span className="text-[10px] text-muted-foreground/40">{agent.schedule}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/50 leading-relaxed">{agent.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Builder */}
        <div className="mb-12">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Build your own agents</h2>
            <p className="text-muted-foreground/60 max-w-lg mx-auto">No code. No config files. Just describe what you want and Harv builds it in under a minute.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {BUILDER_STEPS.map((step, i) => (
              <div key={step.title} className="flex gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">{i + 1}</div>
                <div>
                  <h3 className="font-semibold text-sm mb-1.5">{step.title}</h3>
                  <p className="text-xs text-muted-foreground/55 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-12 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to meet the team?</h2>
          <p className="text-muted-foreground/60 mb-6">7-day free trial. No credit card required.</p>
          <ButtonLink href="/auth/signup" size="lg" className="h-12 px-10 text-base gap-2 shadow-[0_0_20px_-5px] shadow-primary/20">
            Get Started Free <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
