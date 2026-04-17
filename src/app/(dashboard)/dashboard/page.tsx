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
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Wraps children with dnd-kit sortable bindings. Drag handle is the whole
 * wrapper in edit mode — the parent disables the inner Link so clicks don't
 * fire while dragging.
 */
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      {children}
    </div>
  );
}

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

  // Fetch dashboard data once on mount + poll every 2min.
  // Note: DO NOT add `profile` to deps — profile object identity changes
  // multiple times during auth bootstrap, which used to cause 4x duplicate
  // fetches to /api/proxy on every dashboard load.
  useEffect(() => {
    load(false);
    intervalRef.current = setInterval(() => load(true), 120000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  // Trial days — runs whenever the profile resolves.
  useEffect(() => {
    if (profile) {
      ensureTrialStarted();
      setTrialDays(getTrialDaysRemaining());
    }
  }, [profile]);

  function timeSinceRefresh(): string {
    if (!lastRefreshed) return "";
    const sec = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  }

  // Stat cards — all accents mapped to chart-1..5 (teal/green/purple/amber/pink)
  // per AWESOME_DESIGN.md §3. Tokens repeat when cards > 5.
  const allStatCards = [
    { id: "agents", label: "Agents", href: "/agents", icon: Bot, color: "bg-chart-3", textColor: "text-chart-3", value: () => stats.agents, subtitle: "registered" },
    { id: "automations", label: "Automations", href: "/crons", icon: Zap, color: "bg-chart-4", textColor: "text-chart-4", value: () => stats.crons + getCustomAutomations().filter(a => a.enabled).length, subtitle: "active" },
    { id: "apiCalls", label: "API Calls", href: "/analytics", icon: BarChart3, color: "bg-chart-1", textColor: "text-chart-1", value: () => stats.totalCalls.toLocaleString(), subtitle: "total" },
    { id: "dailyBurn", label: "Daily Burn", href: "/analytics", icon: TrendingUp, color: "bg-chart-2", textColor: "text-chart-2", value: () => `$${stats.dailyBurn.toFixed(4)}`, subtitle: `~$${(stats.dailyBurn * 30).toFixed(2)}/mo projected` },
    { id: "totalSpend", label: "Total Spend", href: "/analytics", icon: DollarSign, color: "bg-chart-2", textColor: "text-chart-2", value: () => `$${stats.totalSpend.toFixed(4)}`, subtitle: "all time" },
    { id: "systemHealth", label: "System", href: "/settings?tab=system", icon: Shield, color: "bg-chart-2", textColor: "text-chart-2", value: () => stats.health === "healthy" ? "Online" : stats.health === "checking" ? "..." : "Down", subtitle: stats.health === "healthy" ? "all systems go" : "check status" },
    { id: "projected", label: "Projected", href: "/analytics", icon: TrendingUp, color: "bg-chart-1", textColor: "text-chart-1", value: () => `$${(stats.dailyBurn * 30).toFixed(2)}`, subtitle: "monthly estimate" },
    { id: "calendar", label: "Calendar", href: "/calendar", icon: Calendar, color: "bg-chart-5", textColor: "text-chart-5", value: () => "—", subtitle: "upcoming events" },
    { id: "files", label: "Files", href: "/documents", icon: FolderOpen, color: "bg-chart-4", textColor: "text-chart-4", value: () => "—", subtitle: "documents" },
    { id: "projects", label: "Projects", href: "/projects", icon: FolderKanban, color: "bg-chart-3", textColor: "text-chart-3", value: () => "—", subtitle: "active" },
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

  // Preserve the user's chosen order by mapping IDs -> cards (instead of filter,
  // which would force the definition order from allStatCards).
  const visibleCards = selectedCardIds
    .map((id) => allStatCards.find((c) => c.id === id))
    .filter((c): c is (typeof allStatCards)[number] => Boolean(c));

  function handleCardDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSelectedCardIds((prev) => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      localStorage.setItem("harv-dashboard-cards", JSON.stringify(next));
      return next;
    });
  }

  // Quick links — accents mapped to chart-1..5 palette. Tokens repeat when > 5.
  const allQuickLinks = [
    { id: "chat", href: "/chat", label: "Chat with Harv", description: "Start a conversation with your AI assistant", icon: MessageSquare, color: "text-chart-1", bg: "bg-chart-1/10 ring-1 ring-chart-1/20" },
    { id: "agents", href: "/agents", label: "Agents", description: "View and manage all registered agents", icon: Bot, color: "text-chart-3", bg: "bg-chart-3/10 ring-1 ring-chart-3/20" },
    { id: "automations", href: "/crons", label: "Automations", description: "Manage your scheduled automations", icon: Zap, color: "text-chart-4", bg: "bg-chart-4/10 ring-1 ring-chart-4/20" },
    { id: "analytics", href: "/analytics", label: "Analytics", description: "API costs, usage metrics, and projections", icon: BarChart3, color: "text-chart-2", bg: "bg-chart-2/10 ring-1 ring-chart-2/20" },
    { id: "files", href: "/documents", label: "Files", description: "Files and media from your agents", icon: FolderOpen, color: "text-chart-4", bg: "bg-chart-4/10 ring-1 ring-chart-4/20" },
    { id: "memory", href: "/memory", label: "Memory", description: "Chat history and knowledge base", icon: Brain, color: "text-chart-5", bg: "bg-chart-5/10 ring-1 ring-chart-5/20" },
    { id: "calendar", href: "/calendar", label: "Calendar", description: "Sync and view your Google Calendar", icon: Calendar, color: "text-chart-5", bg: "bg-chart-5/10 ring-1 ring-chart-5/20" },
    { id: "integrations", href: "/integrations", label: "Integrations", description: "Connect external services to Harv", icon: Link2, color: "text-chart-1", bg: "bg-chart-1/10 ring-1 ring-chart-1/20" },
    { id: "projects", href: "/projects", label: "Projects", description: "Organize work into projects", icon: FolderKanban, color: "text-chart-3", bg: "bg-chart-3/10 ring-1 ring-chart-3/20" },
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
  const visibleQuickLinks = selectedQuickIds
    .map((id) => allQuickLinks.find((l) => l.id === id))
    .filter((l): l is (typeof allQuickLinks)[number] => Boolean(l));

  function handleQuickDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSelectedQuickIds((prev) => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      localStorage.setItem("harv-dashboard-quick-links", JSON.stringify(next));
      return next;
    });
  }

  // dnd-kit sensors — distance 6px to avoid snagging clicks as drags
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20 shadow-lg shadow-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              Command Center
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              Monitor agents, jobs, and system health
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCardDragEnd}>
          <SortableContext items={selectedCardIds} strategy={rectSortingStrategy} disabled={!showCardPicker}>
            <div data-tour="dashboard-stats" className={cn(
              "grid gap-4",
              visibleCards.length <= 2 ? "grid-cols-2" : visibleCards.length === 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            )}>
              {visibleCards.map((card) => {
                const Icon = card.icon;
                const cardBody = (
                  <Card className={cn(
                    "relative overflow-hidden group transition-all duration-300",
                    showCardPicker
                      ? "cursor-grab active:cursor-grabbing ring-1 ring-primary/30"
                      : "cursor-pointer hover:ring-primary/15"
                  )}>
                    <div className={cn("absolute inset-y-0 left-0 w-[2px]", card.color)} />
                    {showCardPicker && (
                      <div className="absolute right-2 top-2 text-primary/40">
                        <GripVertical className="h-3.5 w-3.5" />
                      </div>
                    )}
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
                        <p className="text-2xl md:text-3xl font-bold tabular-nums truncate">{card.value()}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
                    </CardContent>
                  </Card>
                );
                return showCardPicker ? (
                  <SortableItem key={card.id} id={card.id}>{cardBody}</SortableItem>
                ) : (
                  <Link key={card.id} href={card.href}>{cardBody}</Link>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
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

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleQuickDragEnd}>
          <SortableContext items={selectedQuickIds} strategy={rectSortingStrategy} disabled={!showQuickPicker}>
            <div data-tour="dashboard-quick-access" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleQuickLinks.map(
                ({ id, href, label, description, icon: Icon, color, bg }) => {
                  const tileBody = (
                    <Card className={cn(
                      "group transition-all duration-300 h-full",
                      showQuickPicker
                        ? "cursor-grab active:cursor-grabbing ring-1 ring-primary/30"
                        : "cursor-pointer hover:ring-primary/15"
                    )}>
                      <CardContent className="flex items-start gap-4 pt-5 pb-5">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg}`}
                        >
                          <Icon className={`h-5 w-5 ${color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm">{label}</h3>
                            {showQuickPicker ? (
                              <GripVertical className="h-4 w-4 text-primary/40" />
                            ) : (
                              <ArrowRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-300" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                  return showQuickPicker ? (
                    <SortableItem key={id} id={id}>{tileBody}</SortableItem>
                  ) : (
                    <Link key={id} href={href}>{tileBody}</Link>
                  );
                }
              )}
            </div>
          </SortableContext>
        </DndContext>
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
