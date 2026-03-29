"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users2, Shield, Wrench, Heart, Bot, Brain, ChevronRight, ChevronDown,
  Zap, ArrowRight, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn, timeAgo } from "@/lib/utils";
import { AGENT_ICONS, statusColor, PLANNED_AGENTS, SUB_AGENT_MAP, NO_CHAT_AGENTS } from "@/lib/agent-data";
import type { Agent } from "@/lib/agent-data";

// ─── Agent Profiles ─────────────────────────────────────

interface AgentProfile {
  role: string;
  bio: string;
  capabilities: string[];
}

const AGENT_PROFILES: Record<string, AgentProfile> = {
  Harv: {
    role: "Main Brain",
    bio: "The core conversational AI with the personality of Lightning McQueen. Harv handles all direct conversations and invisibly routes complex tasks to specialist agents.",
    capabilities: ["Natural conversation", "Task delegation", "Personality-driven responses", "Context awareness", "Multi-agent orchestration"],
  },
  Router: {
    role: "Task Orchestrator",
    bio: "The invisible traffic controller. Analyzes every incoming message and routes it to the best specialist agent with two-tier confidence scoring.",
    capabilities: ["Intent classification", "Confidence-based routing", "Harv fallback for ambiguous tasks", "Multi-agent dispatch"],
  },
  Journal: {
    role: "Memory Keeper",
    bio: "Compresses daily conversations into structured memory entries. Runs at 3am EST to archive the day's activity into long-term vector storage.",
    capabilities: ["Session compression", "ChromaDB vector search", "Google Drive archiving", "Memory recall", "Semantic search"],
  },
  Email: {
    role: "Email Manager",
    bio: "Your Gmail power user. Reads, sends, archives, and summarizes emails with AI-powered understanding.",
    capabilities: ["Read inbox & emails", "Compose & send drafts", "Archive & organize", "AI email summaries", "Search by sender/subject"],
  },
  Scheduler: {
    role: "Calendar Manager",
    bio: "Manages your Google Calendar — creates events, sets reminders, and keeps your schedule organized.",
    capabilities: ["Create calendar events", "Set reminders", "View schedule", "Manage recurring events"],
  },
  Research: {
    role: "Research Lead",
    bio: "Orchestrates deep research by routing to specialist sub-agents for product research, market analysis, and data visualization.",
    capabilities: ["Web search & summarization", "Fact-checking", "Research reports", "Sub-agent delegation"],
  },
  "Video Digest": {
    role: "Video Analyst",
    bio: "Transcribes and summarizes videos from YouTube, TikTok, and Twitter/X into actionable digests.",
    capabilities: ["Multi-platform transcription", "Video summaries", "Actionable breakdowns", "Playlist analysis"],
  },
  "YouTube Digest": {
    role: "YouTube Specialist",
    bio: "Deep YouTube analysis — transcripts, summaries, timestamps, and key takeaways from any video.",
    capabilities: ["Transcript extraction", "Summary generation", "Timestamp highlights", "Key takeaways"],
  },
  "Media Manager": {
    role: "Creative Director",
    bio: "Routes creative requests to the right production agent — image generation, video creation, or video editing.",
    capabilities: ["Creative routing", "Image Gen dispatch", "Video Gen dispatch", "Video Editor dispatch"],
  },
  "Image Gen": {
    role: "Image Creator",
    bio: "Generates images using Google Imagen 4.0 — profile pictures, banners, tweet graphics, and general artwork.",
    capabilities: ["AI image generation", "Profile pictures", "Social media banners", "Custom artwork"],
  },
  Learning: {
    role: "Study Coach",
    bio: "Your personal tutor — creates flashcards, quizzes, study plans, and walks you through complex topics.",
    capabilities: ["Flashcard generation", "Quiz creation", "Study plans", "Exam prep coaching"],
  },
  "Auto Marketing": {
    role: "Marketing Agent",
    bio: "Handles content strategy, social media drafts, and automated publishing to Twitter/X.",
    capabilities: ["Content strategy", "Social media drafts", "Twitter publishing", "Brand voice", "Campaign management"],
  },
  Finance: {
    role: "Finance Tracker",
    bio: "Tracks budgets, logs transactions, syncs with Plaid for bank data, and generates expense reports.",
    capabilities: ["Budget tracking", "Transaction logging", "Plaid bank sync", "Expense analysis"],
  },
  Trading: {
    role: "Trading Analyst",
    bio: "Paper trading on Polymarket and Kalshi, BTC/crypto tracking, and market analysis with DeepSeek.",
    capabilities: ["Paper trading", "Crypto tracking", "Market analysis", "Portfolio monitoring"],
  },
  Music: {
    role: "DJ",
    bio: "Controls Spotify — manages playback, creates playlists, tracks listening history, and recommends music.",
    capabilities: ["Spotify playback", "Playlist management", "Listening history", "Music recommendations"],
  },
  Fitness: {
    role: "Fitness Coach",
    bio: "Tracks workouts and health metrics through Garmin Connect integration.",
    capabilities: ["Garmin sync", "Workout tracking", "Health metrics", "Activity history"],
  },
  Travel: {
    role: "Travel Planner",
    bio: "Plans trips, builds itineraries, researches destinations, and manages travel budgets.",
    capabilities: ["Trip planning", "Itinerary building", "Destination research", "Travel budgets"],
  },
  Shopping: {
    role: "Shopping Assistant",
    bio: "Manages shopping lists, researches products, tracks purchases, and finds deals.",
    capabilities: ["Shopping lists", "Product research", "Purchase tracking", "Price comparison"],
  },
  Sports: {
    role: "Sports Reporter",
    bio: "Live scores, standings, schedules, injury reports, and team alerts via Telegram.",
    capabilities: ["Live scores", "Team standings", "Game schedules", "Injury reports"],
  },
  Guardian: {
    role: "System Monitor",
    bio: "Scans the VPS every 15 minutes — checks disk, RAM, services. Sends Telegram alerts and triggers Medic when issues are found.",
    capabilities: ["Health scanning", "Disk/RAM monitoring", "Service status checks", "Telegram alerts", "Medic dispatch"],
  },
  Medic: {
    role: "Auto-Repair",
    bio: "Called by Guardian when issues are detected. Two-tier repair: Gear 1 for scripted fixes, Gear 2 for LLM-diagnosed solutions.",
    capabilities: ["Service restart", "Disk cleanup", "Memory management", "LLM diagnosis", "Auto-remediation"],
  },
  Heartbeat: {
    role: "System Pulse",
    bio: "Runs every 90 minutes — processes the task queue, syncs data, updates the dashboard, and keeps everything alive.",
    capabilities: ["Task processing", "Data sync", "Dashboard updates", "Queue management"],
  },
};

// ─── Org Chart Groups ───────────────────────────────────

const ORG_GROUPS = [
  {
    label: "Productivity",
    agents: ["Email", "Scheduler", "Journal"],
  },
  {
    label: "Creative",
    agents: ["Media Manager", "Video Digest", "Image Gen"],
  },
  {
    label: "Research",
    agents: ["Research", "Learning"],
  },
];

const SYSTEM_AGENTS = ["Guardian", "Medic", "Heartbeat"];
const COMING_SOON_TEAM = new Set([
  "Music", "Fitness", "Finance", "Shopping", "Sports", "Trading", "Travel", "Auto Marketing",
]);

// ─── Helpers ────────────────────────────────────────────

function simplifyModel(m: string) {
  if (!m || m === "none" || m === "tbd") return "—";
  return m.split("/").pop()?.split(":")[0] || m;
}

// ─── Main Page ──────────────────────────────────────────

export default function TeamPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventStats, setEventStats] = useState<Record<string, { count: number; successRate: number; lastActive: string }>>({});
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const profileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, eventsRes] = await Promise.all([
          fetch("/api/proxy?path=/api/agents/list"),
          fetch("/api/proxy?path=/api/events/recent?limit=200"),
        ]);

        let agentList: Agent[] = [];
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          agentList = data.agents || [];
        }

        // Merge events + compute stats
        const events = eventsRes.ok ? (await eventsRes.json()).events || [] : [];
        const statsMap: Record<string, { count: number; success: number; lastActive: string }> = {};
        const eventMap = new Map<string, Agent["last_event"]>();

        for (const ev of events) {
          const name = ev.agent || "";
          if (!eventMap.has(name)) eventMap.set(name, ev);
          if (!statsMap[name]) statsMap[name] = { count: 0, success: 0, lastActive: "" };
          statsMap[name].count++;
          if (ev.status === "success") statsMap[name].success++;
          if (!statsMap[name].lastActive) statsMap[name].lastActive = ev.timestamp;
        }

        const computedStats: Record<string, { count: number; successRate: number; lastActive: string }> = {};
        for (const [name, s] of Object.entries(statsMap)) {
          computedStats[name] = {
            count: s.count,
            successRate: s.count > 0 ? Math.round((s.success / s.count) * 100) : 0,
            lastActive: s.lastActive,
          };
        }
        setEventStats(computedStats);

        agentList = agentList.map((a) => ({
          ...a,
          last_event: a.last_event || eventMap.get(a.name) || null,
        }));

        // Merge planned agents
        const existingNames = new Set(agentList.map((a) => a.name));
        for (const planned of PLANNED_AGENTS) {
          if (!existingNames.has(planned.name)) agentList.push(planned);
        }
        for (const parent of Object.keys(SUB_AGENT_MAP)) {
          if (!existingNames.has(parent)) {
            const planned = PLANNED_AGENTS.find((a) => a.name === parent);
            if (planned && !agentList.find((a) => a.name === parent)) agentList.push(planned);
          }
        }

        setAgents(agentList);
      } catch {
        toast.error("Could not load agents");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function openAgentPopup(name: string) {
    const agent = agents.find((a) => a.name === name);
    if (agent) setSelectedAgent(agent);
  }

  function getAgent(name: string) {
    return agents.find((a) => a.name === name);
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20">
          <Users2 className="h-6 w-6 text-primary animate-pulse" />
        </div>
        <div className="space-y-2 text-center">
          <Skeleton className="h-5 w-40 mx-auto" />
          <Skeleton className="h-3 w-56 mx-auto" />
        </div>
      </div>
    );
  }

  const coreAgents = agents.filter((a) => a.type !== "tool" && !COMING_SOON_TEAM.has(a.name) && !SYSTEM_AGENTS.includes(a.name));
  const systemAgents = agents.filter((a) => SYSTEM_AGENTS.includes(a.name));

  return (
    <div className="flex-1 p-6 md:p-8 max-w-6xl mx-auto space-y-10">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
            <Users2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Meet the Team</h1>
            <p className="text-sm text-muted-foreground">{agents.filter((a) => a.type !== "tool").length} agents powering Harv</p>
          </div>
        </div>
      </header>

      {/* ─── Org Chart ─── */}
      <section className="space-y-6">
        {/* System perimeter */}
        <div className="relative rounded-2xl border border-purple-500/20 bg-purple-500/[0.02] p-6 pt-8">
          {/* System label */}
          <div className="absolute -top-3 left-6 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-500/15 ring-1 ring-purple-500/30 text-[10px] font-semibold uppercase tracking-wider text-purple-400">
            <Shield className="h-3 w-3" />
            System Protection Layer
          </div>

          {/* System agent icons on the perimeter */}
          <div className="absolute -top-3 right-6 flex items-center gap-2">
            {systemAgents.map((a) => {
              const Icon = AGENT_ICONS[a.name] || Bot;
              return (
                <button
                  key={a.name}
                  onClick={() => openAgentPopup(a.name)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/15 ring-1 ring-purple-500/30 hover:bg-purple-500/25 transition-colors"
                  title={a.name}
                >
                  <Icon className="h-3 w-3 text-purple-400" />
                </button>
              );
            })}
          </div>

          {/* Inner org chart */}
          <div className="space-y-8">
            {/* Harv — top center */}
            <div className="flex justify-center">
              <button
                onClick={() => openAgentPopup("Harv")}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-2 ring-primary/30 group-hover:ring-primary/50 transition-all">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">Harv</p>
                  <p className="text-[10px] text-muted-foreground">Main Brain</p>
                </div>
              </button>
            </div>

            {/* Connection line */}
            <div className="flex justify-center">
              <div className="w-px h-6 bg-white/[0.1]" />
            </div>

            {/* Router */}
            <div className="flex justify-center">
              <button
                onClick={() => openAgentPopup("Router")}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 group-hover:ring-primary/40 transition-all">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold">Router</p>
                  <p className="text-[10px] text-muted-foreground">Orchestrator</p>
                </div>
              </button>
            </div>

            {/* Connection lines fanning out */}
            <div className="flex justify-center">
              <div className="w-px h-4 bg-white/[0.1]" />
            </div>

            {/* Agent groups */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ORG_GROUPS.map((group) => (
                <div key={group.label} className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">{group.label}</p>
                  <div className="space-y-2">
                    {group.agents.map((name) => {
                      const agent = getAgent(name);
                      const Icon = AGENT_ICONS[name] || Bot;
                      const profile = AGENT_PROFILES[name];
                      return (
                        <button
                          key={name}
                          onClick={() => openAgentPopup(name)}
                          className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 hover:bg-white/[0.04] transition-colors group text-left"
                        >
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{profile?.role || ""}</p>
                          </div>
                          {agent && (
                            <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", agent.status === "LIVE" ? "bg-emerald-400" : "bg-slate-400")} />
                          )}
                          <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Agent Profiles (collapsible) ─── */}
      <section className="space-y-4">
        <button
          onClick={() => setProfilesOpen(!profilesOpen)}
          className="flex items-center gap-2 group cursor-pointer select-none"
        >
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Agent Profiles</h2>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {[...coreAgents, ...systemAgents].length}
          </Badge>
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground ml-1 transition-transform duration-300",
            profilesOpen && "rotate-180"
          )} />
        </button>

        <div className="collapsible-grid" data-open={profilesOpen}>
          <div>
            <div className="space-y-4">
              {[...coreAgents, ...systemAgents].map((agent) => {
            const Icon = AGENT_ICONS[agent.name] || Bot;
            const profile = AGENT_PROFILES[agent.name];
            const stats = eventStats[agent.name];
            if (!profile) return null;

            return (
              <div
                key={agent.name}
                ref={(el) => { profileRefs.current[agent.name] = el; }}
              >
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row">
                      {/* Left — Bio */}
                      <div className="flex-1 p-5 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-semibold">{agent.name}</h3>
                              <Badge variant="outline" className={cn("text-[10px]", statusColor(agent.status))}>
                                {agent.status}
                              </Badge>
                              {SYSTEM_AGENTS.includes(agent.name) && (
                                <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-400 border-purple-500/30">
                                  SYSTEM
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{profile.role}</p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.capabilities.map((cap) => (
                            <span key={cap} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] ring-1 ring-white/[0.06] text-muted-foreground">
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Right — Stats */}
                      <div className="md:w-64 p-5 md:border-l border-t md:border-t-0 border-white/[0.06] bg-white/[0.01] space-y-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Performance</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">Tasks</p>
                            <p className="font-semibold text-lg">{stats?.count || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Success</p>
                            <p className="font-semibold text-lg">{stats?.successRate || 0}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Model</p>
                            <p className="font-medium truncate">{simplifyModel(agent.model)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Provider</p>
                            <p className="font-medium capitalize truncate">{agent.provider === "none" ? "—" : agent.provider}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Cost/Call</p>
                            <p className="font-medium">{agent.cost_per_call > 0 ? `$${agent.cost_per_call.toFixed(4)}` : "Free"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Last Active</p>
                            <p className="font-medium truncate">{stats?.lastActive ? timeAgo(stats.lastActive) : "—"}</p>
                          </div>
                        </div>

                        {/* Chat link */}
                        {!SYSTEM_AGENTS.includes(agent.name) && !NO_CHAT_AGENTS.has(agent.name) && (
                          <Link
                            href={`/agents/${encodeURIComponent(agent.name)}`}
                            className="flex items-center justify-center gap-2 mt-2 text-xs text-primary hover:underline font-medium py-2 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors"
                          >
                            Chat with {agent.name} <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Agent Popup Modal ─── */}
      {selectedAgent && (() => {
        const Icon = AGENT_ICONS[selectedAgent.name] || Bot;
        const profile = AGENT_PROFILES[selectedAgent.name];
        const stats = eventStats[selectedAgent.name];
        if (!profile) return null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAgent(null)} />
            <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col rounded-2xl border border-white/[0.08] bg-background/95 backdrop-blur-xl shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold tracking-tight">{selectedAgent.name}</h2>
                      <Badge variant="outline" className={cn("text-[10px]", statusColor(selectedAgent.status))}>
                        {selectedAgent.status}
                      </Badge>
                      {SYSTEM_AGENTS.includes(selectedAgent.name) && (
                        <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-400 border-purple-500/30">
                          SYSTEM
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{profile.role}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAgent(null)} className="rounded-lg p-1.5 hover:bg-white/[0.06] transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Bio */}
                <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1.5">
                  {profile.capabilities.map((cap) => (
                    <span key={cap} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] ring-1 ring-white/[0.06] text-muted-foreground">
                      {cap}
                    </span>
                  ))}
                </div>

                {/* Stats grid */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Performance</p>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-muted-foreground">Tasks</p>
                      <p className="font-semibold text-lg">{stats?.count || 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Success Rate</p>
                      <p className="font-semibold text-lg">{stats?.successRate || 0}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Active</p>
                      <p className="font-medium">{stats?.lastActive ? timeAgo(stats.lastActive) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Model</p>
                      <p className="font-medium truncate">{simplifyModel(selectedAgent.model)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Provider</p>
                      <p className="font-medium capitalize truncate">{selectedAgent.provider === "none" ? "—" : selectedAgent.provider}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Cost/Call</p>
                      <p className="font-medium">{selectedAgent.cost_per_call > 0 ? `$${selectedAgent.cost_per_call.toFixed(4)}` : "Free"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              {!SYSTEM_AGENTS.includes(selectedAgent.name) && !NO_CHAT_AGENTS.has(selectedAgent.name) && (
                <div className="px-6 py-3 border-t border-white/[0.06]">
                  <Link
                    href={`/agents/${encodeURIComponent(selectedAgent.name)}`}
                    className="flex items-center justify-center gap-2 text-xs text-primary hover:underline font-medium py-2 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors"
                    onClick={() => setSelectedAgent(null)}
                  >
                    Chat with {selectedAgent.name} <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
