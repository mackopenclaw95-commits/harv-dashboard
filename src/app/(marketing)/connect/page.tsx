import {
  Globe, Music, MessageSquare, Smartphone, Layers,
  ArrowRight, Check, Clock,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Integrations — Harv AI",
  description: "Connect Harv to Google, Spotify, Telegram, Discord, and more. Your AI works with the tools you already use.",
};

const LIVE_INTEGRATIONS = [
  {
    name: "Google Workspace",
    icon: Globe,
    desc: "Your full Google ecosystem — connected through secure OAuth. Harv reads your emails, manages your calendar, accesses your Drive, and works with Docs and Sheets.",
    capabilities: [
      "Read and send Gmail — inbox summaries, draft replies, archive junk",
      "Google Calendar — view events, check availability, book meetings, set reminders",
      "Google Drive — search files, create documents, organize folders",
      "Google Docs & Sheets — read content, create new documents, update spreadsheets",
    ],
    scopes: ["Gmail", "Calendar", "Drive", "Docs", "Sheets"],
  },
  {
    name: "Spotify",
    icon: Music,
    desc: "Full Spotify integration — control playback, build playlists, discover new music, and browse your library. All from a chat message.",
    capabilities: [
      "Play any song, artist, album, or playlist by name",
      "Build playlists from vibes — \"make a chill Sunday morning playlist\"",
      "Get personalized recommendations based on your listening history",
      "View your top tracks, recently played, and saved albums",
    ],
    scopes: ["Playback", "Playlists", "Library", "History"],
  },
  {
    name: "Telegram",
    icon: MessageSquare,
    desc: "Take Harv with you. Message the Telegram bot from your phone to chat, run commands, and receive real-time notifications and alerts.",
    capabilities: [
      "Chat with Harv directly in Telegram — same personality, full context",
      "Receive alerts from Guardian when system issues are detected",
      "Run quick commands — check calendar, get sports scores, log expenses",
      "Get daily briefing summaries pushed to your phone automatically",
    ],
    scopes: ["Chat", "Commands", "Notifications", "Alerts"],
  },
];

const COMING_INTEGRATIONS = [
  {
    name: "Discord",
    icon: MessageSquare,
    desc: "Add the Harv bot to your own Discord server. Each agent gets a dedicated channel — ask Research in #research, check Finance in #finance.",
    capabilities: ["DM Harv for private conversations", "Server bot with per-agent channels", "Slash commands for quick actions"],
    eta: "Q2 2026",
  },
  {
    name: "WhatsApp",
    icon: Smartphone,
    desc: "Text Harv like you'd text a friend. Forward messages for processing, get summaries, and stay connected wherever you are.",
    capabilities: ["Chat via dedicated WhatsApp number", "Forward messages for Harv to process", "Receive summaries and alerts"],
    eta: "Q3 2026",
  },
  {
    name: "Notion",
    icon: Layers,
    desc: "Sync your Notion workspace with Harv. Search pages, create notes from chat, and pull data from your databases.",
    capabilities: ["Sync pages and databases", "Create and update notes from chat", "Search across your workspace"],
    eta: "Q3 2026",
  },
  {
    name: "Slack",
    icon: MessageSquare,
    desc: "Bring Harv into your Slack workspace. Slash commands, threaded replies, and channel-based agent routing.",
    capabilities: ["Slash commands for quick tasks", "Threaded conversations with agents", "Channel notifications"],
    eta: "Q4 2026",
  },
  {
    name: "GitHub",
    icon: Layers,
    desc: "Track repos, issues, and pull requests. Get notified on changes, review PRs, and manage projects from chat.",
    capabilities: ["Track repos and issues", "PR notifications and reviews", "Project management from chat"],
    eta: "Q3 2026",
  },
];

export default function IntegrationsPage() {
  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-3">Integrations</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5">
            Plugs into your <span className="text-primary">real life</span>
          </h1>
          <p className="text-lg text-muted-foreground/60 max-w-2xl mx-auto leading-relaxed">
            Harv isn&apos;t trapped in a browser tab. Connect your real accounts
            and Harv works across the tools you use every day.
          </p>
        </div>

        {/* Live Integrations */}
        <div className="mb-20">
          <div className="flex items-center gap-3 mb-8">
            <h2 className="text-2xl font-bold">Connected</h2>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" style={{ animationDuration: "2s" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-medium text-emerald-400">Live</span>
            </span>
          </div>

          <div className="space-y-6">
            {LIVE_INTEGRATIONS.map((intg) => (
              <div key={intg.name} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-7 md:p-8 hover:border-white/[0.12] transition-all duration-300">
                <div className="flex items-center gap-4 mb-5">
                  <div className="h-12 w-12 rounded-xl bg-primary/[0.07] flex items-center justify-center">
                    <intg.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{intg.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {intg.scopes.map((s) => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground/50 border border-white/[0.04]">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground/60 mb-5 leading-relaxed">{intg.desc}</p>
                <ul className="space-y-2">
                  {intg.capabilities.map((cap) => (
                    <li key={cap} className="flex items-start gap-2.5 text-xs text-muted-foreground/55">
                      <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Coming Soon */}
        <div className="mb-20">
          <div className="flex items-center gap-3 mb-8">
            <h2 className="text-2xl font-bold">Coming Soon</h2>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
              <Clock className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-[10px] font-medium text-muted-foreground/40">In Development</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {COMING_INTEGRATIONS.map((intg) => (
              <div key={intg.name} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 opacity-80">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                      <intg.icon className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                    <h3 className="font-semibold text-sm">{intg.name}</h3>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground/40 px-2 py-0.5 rounded-full border border-white/[0.06]">{intg.eta}</span>
                </div>
                <p className="text-xs text-muted-foreground/50 mb-4 leading-relaxed">{intg.desc}</p>
                <ul className="space-y-1.5">
                  {intg.capabilities.map((cap) => (
                    <li key={cap} className="flex items-start gap-2 text-[11px] text-muted-foreground/40">
                      <Check className="h-3 w-3 text-muted-foreground/30 shrink-0 mt-0.5" />
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-12 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Connect your tools today</h2>
          <p className="text-muted-foreground/60 mb-6">Google, Spotify, and Telegram are ready to go. More coming every month.</p>
          <ButtonLink href="/auth/signup" size="lg" className="h-12 px-10 text-base gap-2 shadow-[0_0_20px_-5px] shadow-primary/20">
            Get Started Free <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
