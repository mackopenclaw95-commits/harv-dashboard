"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Clock,
  BarChart3,
  MessageSquare,
  Brain,
  Zap,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  FolderOpen,
  FolderKanban,
  Activity,
  Timer,
  FileText,
  Calendar,
  DollarSign,
  Settings2,
  GripVertical,
  Check,
  Shield,
  CreditCard,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, timeAgo } from "@/lib/utils";
import { AGENT_ICONS, PLANNED_AGENTS, SUB_AGENT_MAP } from "@/lib/agent-data";
import { useAuth } from "@/components/auth-provider";
import { ensureTrialStarted, getTrialDaysRemaining, getCustomAutomations } from "@/lib/preferences";

interface QuickStats {
  agents: number;
  crons: number;
  health: string;
  totalSpend: number;
  dailyBurn: number;
  totalCalls: number;
}

interface AgentEvent {
  agent: string;
  action: string;
  status: string;
  summary: string;
  timestamp: string;
  cost: number;
  tokens: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<QuickStats>({
    agents: 0,
    crons: 0,
    health: "checking",
    totalSpend: 0,
    dailyBurn: 0,
    totalCalls: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const { profile } = useAuth();
  const [trialDays, setTrialDays] = useState(14);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    const results: Partial<QuickStats> = {};
    try {
      const [agentsRes, cronsRes, healthRes, analyticsRes, eventsRes, dashStatsRes] = await Promise.all([
        fetch("/api/proxy?path=/api/agents/list").catch(() => null),
        fetch("/api/proxy?path=/api/crons").catch(() => null),
        fetch("/api/proxy?path=/api/health/quick").catch(() => null),
        fetch("/api/proxy?path=/api/analytics/").catch(() => null),
        fetch("/api/proxy?path=/api/events/recent?limit=10").catch(() => null),
        fetch("/api/dashboard/stats").catch(() => null),
      ]);

      if (agentsRes?.ok) {
        const data = await agentsRes.json();
        const apiAgents = data.agents || [];
        // Count the same way as agents page: API agents + planned parents/sub-agents not in API
        const existingNames = new Set(apiAgents.map((a: { name: string }) => a.name));
        let total = apiAgents.length;
        // Add planned sub-agents and parents not returned by API
        for (const [parentName, children] of Object.entries(SUB_AGENT_MAP)) {
          if (!existingNames.has(parentName)) {
            const planned = PLANNED_AGENTS.find((p) => p.name === parentName);
            if (planned) total++;
          }
          for (const childName of children) {
            if (!existingNames.has(childName)) {
              const planned = PLANNED_AGENTS.find((p) => p.name === childName);
              if (planned) total++;
            }
          }
        }
        // Subtract hidden tools (Analytics, Memory, Scribe, Ledger, Drive)
        const HIDDEN = ["Analytics", "Memory", "Scribe", "Ledger", "Drive"];
        for (const h of HIDDEN) {
          if (existingNames.has(h)) total--;
        }
        results.agents = total;
      }
      if (cronsRes?.ok) {
        const data = await cronsRes.json();
        const ADMIN_CRONS = new Set(["Daily Backup", "Daily Backups", "VPS Snapshot", "VPS Snapshots", "Weekly Archive", "Weekly Archives", "Dependency Updates", "Daily Digest"]);
        const allJobs = data.jobs || [];
        results.crons = allJobs.filter((j: { name: string }) => !ADMIN_CRONS.has(j.name)).length;
      }
      if (healthRes?.ok) {
        const data = await healthRes.json();
        results.health = data.status === "ok" ? "healthy" : data.status;
      } else if (healthRes?.status === 429) {
        // Rate limited — keep previous health status
      } else {
        results.health = "unreachable";
        if (!isBackground) toast.error("Could not reach Harv API");
      }
      // Check if user is owner — owners see global VPS data, regular users see personal data
      let userIsOwner = true;
      if (dashStatsRes?.ok) {
        const dashStats = await dashStatsRes.json();
        userIsOwner = dashStats.isOwner === true;

        if (!userIsOwner) {
          // Regular user: use per-user stats from Supabase
          results.totalSpend = dashStats.totalSpend ?? 0;
          results.dailyBurn = dashStats.dailyBurn ?? 0;
          results.totalCalls = dashStats.totalCalls ?? 0;
          results.crons = 0; // Regular users don't see VPS crons
          setEvents(dashStats.recentActivity || []);
        }
      }

      if (userIsOwner) {
        // Owner: use global VPS data
        if (analyticsRes?.ok) {
          const data = await analyticsRes.json();
          results.totalSpend = data.summary?.total_cost_usd ?? data.total_spend ?? 0;
          results.dailyBurn = data.burn_rate?.daily_avg_usd ?? data.daily_burn ?? 0;
          results.totalCalls = data.summary?.total_calls ?? data.total_calls ?? 0;
        }
        if (eventsRes?.ok) {
          const data = await eventsRes.json();
          setEvents((data.events || []).slice(0, 10));
        }
      }
    } catch {
      results.health = "error";
      if (!isBackground) toast.error("Failed to load dashboard data");
    }
    setStats((prev) => ({ ...prev, ...results }));
    setLastRefreshed(new Date());
    if (!isBackground) setLoading(false);
    else setRefreshing(false);
  }, []);

  useEffect(() => {
    load(false);
    intervalRef.current = setInterval(() => load(true), 120000);
    if (profile) {
      ensureTrialStarted();
      setTrialDays(getTrialDaysRemaining());
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load, profile]);

  function timeSinceRefresh(): string {
    if (!lastRefreshed) return "";
    const sec = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  }

  // All available stat cards
  const allStatCards = [
    { id: "agents", label: "Agents", href: "/agents", icon: Bot, color: "bg-violet-500/50", textColor: "text-violet-400", value: () => stats.agents, subtitle: "registered" },
    { id: "automations", label: "Automations", href: "/crons", icon: Zap, color: "bg-amber-500/50", textColor: "text-amber-400", value: () => stats.crons + getCustomAutomations().filter(a => a.enabled).length, subtitle: "active" },
    { id: "apiCalls", label: "API Calls", href: "/analytics", icon: BarChart3, color: "bg-sky-500/50", textColor: "text-sky-400", value: () => stats.totalCalls.toLocaleString(), subtitle: "total" },
    { id: "dailyBurn", label: "Daily Burn", href: "/analytics", icon: TrendingUp, color: "bg-emerald-500/50", textColor: "text-emerald-400", value: () => `$${stats.dailyBurn.toFixed(4)}`, subtitle: `~$${(stats.dailyBurn * 30).toFixed(2)}/mo projected` },
    { id: "totalSpend", label: "Total Spend", href: "/analytics", icon: DollarSign, color: "bg-emerald-500/50", textColor: "text-emerald-400", value: () => `$${stats.totalSpend.toFixed(4)}`, subtitle: "all time" },
    { id: "systemHealth", label: "System", href: "/settings?tab=system", icon: Shield, color: "bg-green-500/50", textColor: "text-green-400", value: () => stats.health === "healthy" ? "Online" : stats.health === "checking" ? "..." : "Down", subtitle: stats.health === "healthy" ? "all systems go" : "check status" },
    { id: "projected", label: "Projected", href: "/analytics", icon: TrendingUp, color: "bg-cyan-500/50", textColor: "text-cyan-400", value: () => `$${(stats.dailyBurn * 30).toFixed(2)}`, subtitle: "monthly estimate" },
    { id: "calendar", label: "Calendar", href: "/calendar", icon: Calendar, color: "bg-rose-500/50", textColor: "text-rose-400", value: () => "—", subtitle: "upcoming events" },
    { id: "files", label: "Files", href: "/documents", icon: FolderOpen, color: "bg-orange-500/50", textColor: "text-orange-400", value: () => "—", subtitle: "documents" },
    { id: "projects", label: "Projects", href: "/projects", icon: FolderKanban, color: "bg-indigo-500/50", textColor: "text-indigo-400", value: () => "—", subtitle: "active" },
  ];

  // Configurable: which 4 cards to show (stored in localStorage)
  const defaultCards = ["agents", "automations", "apiCalls", "dailyBurn"];
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return defaultCards;
    try {
      const saved = localStorage.getItem("harv-dashboard-cards");
      return saved ? JSON.parse(saved) : defaultCards;
    } catch { return defaultCards; }
  });
  const [showCardPicker, setShowCardPicker] = useState(false);

  function toggleCard(id: string) {
    setSelectedCardIds((prev) => {
      let next: string[];
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // minimum 2 cards
        next = prev.filter((c) => c !== id);
      } else {
        if (prev.length >= 4) return prev; // maximum 4 cards
        next = [...prev, id];
      }
      localStorage.setItem("harv-dashboard-cards", JSON.stringify(next));
      return next;
    });
  }

  const visibleCards = allStatCards.filter((c) => selectedCardIds.includes(c.id));

  const allQuickLinks = [
    { id: "chat", href: "/chat", label: "Chat with Harv", description: "Start a conversation with your AI assistant", icon: MessageSquare, color: "text-sky-400", bg: "bg-sky-500/10 ring-1 ring-sky-500/20" },
    { id: "agents", href: "/agents", label: "Agents", description: "View and manage all registered agents", icon: Bot, color: "text-violet-400", bg: "bg-violet-500/10 ring-1 ring-violet-500/20" },
    { id: "automations", href: "/crons", label: "Automations", description: "Manage your scheduled automations", icon: Zap, color: "text-amber-400", bg: "bg-amber-500/10 ring-1 ring-amber-500/20" },
    { id: "analytics", href: "/analytics", label: "Analytics", description: "API costs, usage metrics, and projections", icon: BarChart3, color: "text-emerald-400", bg: "bg-emerald-500/10 ring-1 ring-emerald-500/20" },
    { id: "files", href: "/documents", label: "Files", description: "Files and media from your agents", icon: FolderOpen, color: "text-amber-400", bg: "bg-amber-500/10 ring-1 ring-amber-500/20" },
    { id: "memory", href: "/memory", label: "Memory", description: "Chat history and knowledge base", icon: Brain, color: "text-pink-400", bg: "bg-pink-500/10 ring-1 ring-pink-500/20" },
    { id: "calendar", href: "/calendar", label: "Calendar", description: "Sync and view your Google Calendar", icon: Calendar, color: "text-rose-400", bg: "bg-rose-500/10 ring-1 ring-rose-500/20" },
    { id: "integrations", href: "/integrations", label: "Integrations", description: "Connect external services to Harv", icon: Link2, color: "text-cyan-400", bg: "bg-cyan-500/10 ring-1 ring-cyan-500/20" },
    { id: "projects", href: "/projects", label: "Projects", description: "Organize work into projects", icon: FolderKanban, color: "text-indigo-400", bg: "bg-indigo-500/10 ring-1 ring-indigo-500/20" },
  ];
  const defaultQuickLinks = ["chat", "agents", "automations", "analytics", "files", "memory"];
  const [selectedQuickIds, setSelectedQuickIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return defaultQuickLinks;
    try {
      const saved = localStorage.getItem("harv-dashboard-quick-links");
      return saved ? JSON.parse(saved) : defaultQuickLinks;
    } catch { return defaultQuickLinks; }
  });
  const [showQuickPicker, setShowQuickPicker] = useState(false);

  function toggleQuickLink(id: string) {
    setSelectedQuickIds((prev) => {
      let next: string[];
      if (prev.includes(id)) {
        if (prev.length <= 3) return prev; // minimum 3
        next = prev.filter((c) => c !== id);
      } else {
        if (prev.length >= 9) return prev; // maximum all
        next = [...prev, id];
      }
      localStorage.setItem("harv-dashboard-quick-links", JSON.stringify(next));
      return next;
    });
  }
  const visibleQuickLinks = allQuickLinks.filter((l) => selectedQuickIds.includes(l.id));

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Trial Banner */}
      {profile && profile.plan === "free" && profile.plan_status === "trial" && trialDays > 0 && trialDays <= 14 && (
        <div className="flex items-center justify-between rounded-xl bg-primary/8 ring-1 ring-primary/15 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Timer className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Free Trial</span>
            <span className="font-semibold text-primary">{trialDays} days remaining</span>
          </div>
          <Link href="/settings?tab=billing" className="text-xs font-medium text-primary hover:underline">
            Upgrade
          </Link>
        </div>
      )}

      {/* Hero Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20 shadow-lg shadow-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Command Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor agents, jobs, and system health
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-[11px] text-muted-foreground/60 hidden sm:inline">
              Updated {timeSinceRefresh()}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            data-tour="dashboard-refresh"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {!loading && (
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 px-3 py-1",
                stats.health === "healthy"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : stats.health === "checking"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-red-500/10 text-red-400 border-red-500/30"
              )}
            >
              <span className="relative flex h-2 w-2">
                {stats.health === "healthy" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  stats.health === "healthy" ? "bg-emerald-500" : stats.health === "checking" ? "bg-amber-500 animate-pulse" : "bg-red-500"
                )} />
              </span>
              {stats.health === "healthy" ? "System Online" : stats.health === "checking" ? "Checking..." : "Unreachable"}
            </Badge>
          )}
        </div>
      </header>

      {/* Stats Row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Overview
          </h2>
          <button
            onClick={() => setShowCardPicker(!showCardPicker)}
            className={cn(
              "flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors rounded-lg px-2 py-1",
              showCardPicker && "bg-white/[0.04] text-foreground"
            )}
          >
            <Settings2 className="h-3 w-3" />
            Customize
          </button>
        </div>

        {/* Card picker */}
        {showCardPicker && (
          <div className="flex flex-wrap gap-2 pb-2">
            {allStatCards.map((card) => {
              const active = selectedCardIds.includes(card.id);
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  onClick={() => toggleCard(card.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ring-1",
                    active
                      ? "bg-primary/10 text-primary ring-primary/20"
                      : "bg-white/[0.02] text-muted-foreground ring-white/[0.06] hover:ring-white/[0.12]"
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                  <Icon className="h-3 w-3" />
                  {card.label}
                </button>
              );
            })}
            <span className="text-[10px] text-muted-foreground/40 self-center ml-1">
              {selectedCardIds.length}/4 selected
            </span>
          </div>
        )}

        <div data-tour="dashboard-stats" className={cn(
          "grid gap-4",
          visibleCards.length <= 2 ? "grid-cols-2" : visibleCards.length === 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        )}>
          {visibleCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.id} href={card.href}>
                <Card className="relative overflow-hidden group cursor-pointer transition-all duration-300 hover:ring-primary/15">
                  <div className={cn("absolute inset-y-0 left-0 w-[2px]", card.color)} />
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {card.label}
                    </CardTitle>
                    <Icon className={cn("h-4 w-4", card.textColor)} />
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <Skeleton className="h-9 w-16" />
                    ) : (
                      <p className="text-3xl font-bold tabular-nums">{card.value()}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick Access */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Access
          </h2>
          <button
            onClick={() => setShowQuickPicker(!showQuickPicker)}
            className={cn(
              "flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors rounded-lg px-2 py-1",
              showQuickPicker && "bg-white/[0.04] text-foreground"
            )}
          >
            <Settings2 className="h-3 w-3" />
            Customize
          </button>
        </div>

        {/* Quick link picker */}
        {showQuickPicker && (
          <div className="flex flex-wrap gap-2 pb-3">
            {allQuickLinks.map((link) => {
              const active = selectedQuickIds.includes(link.id);
              const Icon = link.icon;
              return (
                <button
                  key={link.id}
                  onClick={() => toggleQuickLink(link.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ring-1",
                    active
                      ? "bg-primary/10 text-primary ring-primary/20"
                      : "bg-white/[0.02] text-muted-foreground ring-white/[0.06] hover:ring-white/[0.12]"
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                  <Icon className="h-3 w-3" />
                  {link.label}
                </button>
              );
            })}
            <span className="text-[10px] text-muted-foreground/40 self-center ml-1">
              {selectedQuickIds.length} selected (min 3)
            </span>
          </div>
        )}

        <div data-tour="dashboard-quick-access" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleQuickLinks.map(
            ({ id, href, label, description, icon: Icon, color, bg }) => (
              <Link key={id} href={href}>
                <Card className="group cursor-pointer transition-all duration-300 hover:ring-primary/15 h-full">
                  <CardContent className="flex items-start gap-4 pt-5 pb-5">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg}`}
                    >
                      <Icon className={`h-5 w-5 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm">{label}</h3>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-300" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          )}
        </div>
      </div>

      {/* Activity Feed */}
      {events.filter((ev) => ev.agent !== "Heartbeat").length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" />
            Recent Activity
          </h2>
          <Card data-tour="dashboard-activity">
            <CardContent className="pt-4 pb-2">
              <div className="space-y-0.5">
                {events.filter((ev) => ev.agent !== "Heartbeat").map((ev, i) => {
                  const Icon = AGENT_ICONS[ev.agent] || Bot;
                  const statusColor = ev.status === "success" ? "text-emerald-400" : ev.status === "error" ? "text-red-400" : "text-foreground";
                  return (
                    <div key={`${ev.agent}-${ev.timestamp}-${i}`} className="flex items-center gap-3 py-2 rounded-lg hover:bg-white/[0.02] px-2 -mx-2 transition-colors">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs">
                          <span className="font-medium">{ev.agent}</span>
                          <span className="text-muted-foreground"> — </span>
                          <span className={cn("text-muted-foreground", statusColor)}>{ev.action}</span>
                        </p>
                        {ev.summary && (
                          <p className="text-[11px] text-muted-foreground/60 truncate">{ev.summary}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0">{timeAgo(ev.timestamp)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Link href="/activity" className="flex items-center justify-center gap-1.5 mt-2 py-2 text-xs text-muted-foreground hover:text-primary transition-colors">
            View all activity
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* System Overview */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          System Overview
        </h2>
        <Card data-tour="dashboard-system">
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">
                  API Status
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${stats.health === "healthy" ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : stats.health === "checking" ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`}
                  />
                  <p className="font-medium capitalize">{stats.health}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">
                  Total Spend
                </p>
                <p className="font-medium font-mono">
                  ${stats.totalSpend.toFixed(4)}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">
                  Infrastructure
                </p>
                <p className="font-medium">{process.env.NEXT_PUBLIC_INFRA_PROVIDER || "Hostinger KVM"}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">
                  Platform
                </p>
                <p className="font-medium">{process.env.NEXT_PUBLIC_INFRA_OS || "Ubuntu 24.04"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
