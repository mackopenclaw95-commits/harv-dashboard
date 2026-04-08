"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, DollarSign, Zap, TrendingDown, Clock, PieChart, RefreshCw, WifiOff, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import dynamic from "next/dynamic";

const AreaChart = dynamic(() => import("recharts").then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then(m => m.Area), { ssr: false });
const BarChart = dynamic(() => import("recharts").then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then(m => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false });
import { cn } from "@/lib/utils";
import { SUB_AGENT_MAP, CORE_AGENTS } from "@/lib/agent-data";

interface AgentStats {
  total_cost: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  avg_cost_per_call: number;
  token_ratio: number;
}

interface ApiResponse {
  summary: {
    total_cost_usd: number;
    total_calls: number;
    paid_calls: number;
    free_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  burn_rate: {
    daily_avg_usd: number;
    projected_monthly: number;
    projected_weekly: number;
  };
  by_agent: Record<string, AgentStats>;
  daily_last_30: Array<{ date: string; cost: number; calls: number }>;
  credits: {
    budget_usd: number;
    remaining_usd: number;
    paid_spent_usd: number;
    days_remaining: number;
    sources?: Array<{ name: string; amount: number; spent?: number; remaining?: number }>;
  };
}

interface AnalyticsData {
  total_spend: number;
  daily_burn: number;
  projected_monthly: number;
  total_calls: number;
  cost_by_agent: Record<string, number>;
  recent_costs: Array<{ date: string; cost: number }>;
  credits: { budget_usd: number; remaining_usd: number; days_remaining: number; sources?: Array<{ name: string; amount: number; remaining?: number }> };
}

// Agents excluded from cost breakdown (system/internal)
const EXCLUDED_FROM_COSTS = new Set([
  "twitter_client", "social_metrics", "Analytics",
  "Guardian", "Heartbeat", "Medic", "Ledger", "Drive",
]);

// Build reverse map: child → parent
const CHILD_TO_PARENT: Record<string, string> = {};
for (const [parent, children] of Object.entries(SUB_AGENT_MAP)) {
  for (const child of children) {
    CHILD_TO_PARENT[child] = parent;
  }
}

function transformApiResponse(raw: ApiResponse): AnalyticsData {
  // Roll up sub-agent costs into parent agents, show only CORE_AGENTS
  const rolled: Record<string, number> = {};
  // Initialize all core agents to 0
  for (const name of CORE_AGENTS) rolled[name] = 0;
  for (const [name, stats] of Object.entries(raw.by_agent || {})) {
    if (EXCLUDED_FROM_COSTS.has(name)) continue;
    const parent = CHILD_TO_PARENT[name] || name;
    // Only count if the resolved name is a core agent
    if (CORE_AGENTS.has(parent)) {
      rolled[parent] = (rolled[parent] || 0) + stats.total_cost;
    } else if (CORE_AGENTS.has(name)) {
      rolled[name] = (rolled[name] || 0) + stats.total_cost;
    }
  }
  const cost_by_agent: Record<string, number> = {};
  for (const [name, cost] of Object.entries(rolled)) {
    cost_by_agent[name] = cost;
  }

  return {
    total_spend: raw.summary.total_cost_usd,
    daily_burn: raw.burn_rate.daily_avg_usd,
    projected_monthly: raw.burn_rate.projected_monthly,
    total_calls: raw.summary.total_calls,
    cost_by_agent,
    recent_costs: (() => {
      const data = raw.daily_last_30 || [];
      const map = new Map(data.map((d) => [d.date, d.cost]));
      const days: Array<{ date: string; cost: number }> = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        days.push({ date: key, cost: map.get(key) || 0 });
      }
      return days;
    })(),
    credits: raw.credits,
  };
}

function formatCost(val: number) {
  return `$${val.toFixed(4)}`;
}

function formatHourLabel(h: number) {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function chartDateLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (dateStr === todayKey) return "Today";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function AnalyticsPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [chartView, setChartView] = useState<"monthly" | "daily">("monthly");
  const [chartDate, setChartDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [hourlyData, setHourlyData] = useState<Array<{ hour: number; cost: number; calls: number }>>([]);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [showAllAgents, setShowAllAgents] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/proxy?path=/api/analytics/");
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const json = await res.json();
      setData(transformApiResponse(json));
    } catch {
      toast.error("Analytics unavailable");
      setData(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Wait for auth to resolve before loading
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) { setLoading(false); setData(null); return; }
    load();
  }, [isAdmin, authLoading]);

  useEffect(() => {
    if (chartView !== "daily" || !isAdmin || authLoading) return;
    async function loadHourly() {
      setHourlyLoading(true);
      try {
        const res = await fetch(`/api/proxy?path=/api/events/hourly-costs?date=${chartDate}`);
        if (res.ok) {
          const json = await res.json();
          setHourlyData(json.hours || []);
        }
      } catch { /* silent */ }
      finally { setHourlyLoading(false); }
    }
    loadHourly();
  }, [chartView, chartDate, isAdmin]);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <header>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <BarChart3 className="h-5 w-5 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
              <p className="text-sm text-muted-foreground">Loading metrics...</p>
            </div>
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="relative overflow-hidden">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-28" /></CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-4 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-64 w-full rounded-lg" /></CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardContent className="pt-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</CardContent></Card>
          <Card><CardContent className="pt-6 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</CardContent></Card>
        </div>
      </div>
    );
  }

  if (!isAdmin && !authLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <BarChart3 className="h-7 w-7 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Admin Only</h2>
              <p className="text-sm text-muted-foreground">Analytics are only available to admin accounts.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
              <WifiOff className="h-7 w-7 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Analytics Unavailable</h2>
              <p className="text-sm text-muted-foreground">Could not connect to the Harv API. Check your connection and try again.</p>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-sm font-medium transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const projectedMonthly = data.projected_monthly ?? data.daily_burn * 30;
  const maxAgentCost = Math.max(...Object.values(data.cost_by_agent || {}), 0.001);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <BarChart3 className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">API cost tracking and usage metrics</p>
          </div>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-[2px] bg-emerald-500/50" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCost(data.total_spend)}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-[2px] bg-amber-500/50" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Daily Burn</CardTitle>
            <TrendingDown className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCost(data.daily_burn)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ~{formatCost(projectedMonthly)}/mo projected
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-[2px] bg-sky-500/50" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">API Calls</CardTitle>
            <Zap className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{data.total_calls.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-[2px] bg-violet-500/50" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Cost/Call</CardTitle>
            <PieChart className="h-4 w-4 text-violet-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {data.total_calls > 0
                ? formatCost(data.total_spend / data.total_calls)
                : "$0.00"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Over Time Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              Cost Over Time
            </CardTitle>
            <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5">
              <button
                onClick={() => setChartView("monthly")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  chartView === "monthly" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                30 Days
              </button>
              <button
                onClick={() => setChartView("daily")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  chartView === "daily" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Daily
              </button>
            </div>
          </div>
          {chartView === "daily" && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => {
                  const d = new Date(chartDate + "T12:00:00");
                  d.setDate(d.getDate() - 1);
                  setChartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                }}
                className="p-1 rounded-md hover:bg-white/[0.06] transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-xs font-medium text-muted-foreground min-w-[100px] text-center">
                {chartDateLabel(chartDate)}
              </span>
              <button
                onClick={() => {
                  const d = new Date(chartDate + "T12:00:00");
                  d.setDate(d.getDate() + 1);
                  const now = new Date();
                  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                  const nextKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  if (nextKey <= todayKey) setChartDate(nextKey);
                }}
                className="p-1 rounded-md hover:bg-white/[0.06] transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {chartView === "monthly" ? (
              data.recent_costs && data.recent_costs.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.recent_costs}>
                    <defs>
                      <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.78 0.145 192)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.78 0.145 192)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.65 0.015 265)" }} axisLine={{ stroke: "oklch(1 0 0 / 8%)" }} tickLine={false} interval={4} tickFormatter={(d: string) => { const p = d.split("-"); return `${parseInt(p[1])}/${parseInt(p[2])}`; }} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.65 0.015 265)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(3)}`} width={60} />
                    <Tooltip
                      cursor={{ stroke: "oklch(1 0 0 / 8%)", strokeWidth: 1 }}
                      contentStyle={{ backgroundColor: "oklch(0.13 0.015 265 / 90%)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: "0.75rem", backdropFilter: "blur(12px)", color: "oklch(0.95 0.005 265)", fontSize: "12px" }}
                      formatter={(value) => [formatCost(Number(value)), "Cost"]}
                    />
                    <Area type="monotone" dataKey="cost" stroke="oklch(0.78 0.145 192)" strokeWidth={2} fill="url(#costGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No cost data yet</div>
              )
            ) : hourlyLoading ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "oklch(0.65 0.015 265)" }}
                    axisLine={{ stroke: "oklch(1 0 0 / 8%)" }}
                    tickLine={false}
                    tickFormatter={formatHourLabel}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "oklch(0.65 0.015 265)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${v.toFixed(4)}`}
                    width={65}
                  />
                  <Tooltip
                    cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                    contentStyle={{ backgroundColor: "oklch(0.13 0.015 265 / 90%)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: "0.75rem", backdropFilter: "blur(12px)", color: "oklch(0.95 0.005 265)", fontSize: "12px" }}
                    labelFormatter={(h) => formatHourLabel(Number(h))}
                    formatter={(value, name) => {
                      if (name === "cost") return [formatCost(Number(value)), "Cost"];
                      return [value, "Calls"];
                    }}
                  />
                  <Bar dataKey="cost" fill="oklch(0.78 0.145 192)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cost by agent + Budget */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              Cost by Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {(() => {
              const sorted = Object.entries(data.cost_by_agent || {}).sort(([, a], [, b]) => b - a);
              if (sorted.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No agent costs recorded yet</p>;
              const visible = showAllAgents ? sorted : sorted.slice(0, 3);
              const remaining = sorted.length - 3;
              return (
                <div className="space-y-3">
                  {visible.map(([agent, cost]) => (
                    <div key={agent} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{agent}</span>
                        <span className="font-mono text-muted-foreground text-xs">
                          {formatCost(cost)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60 transition-all duration-500"
                          style={{
                            width: `${Math.max(2, (cost / maxAgentCost) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <button
                      onClick={() => setShowAllAgents(!showAllAgents)}
                      className="w-full pt-1 text-xs text-primary hover:text-primary/80 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {showAllAgents ? (
                        <>Show less <ChevronUp className="h-3 w-3" /></>
                      ) : (
                        <>Show {remaining} more agent{remaining !== 1 ? "s" : ""} <ChevronDown className="h-3 w-3" /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {data.credits && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-sky-400" />
                Budget
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Remaining</span>
                    <span className="font-mono font-medium">{formatCost(data.credits.remaining_usd)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/60 transition-all duration-500"
                      style={{
                        width: `${(data.credits.remaining_usd / data.credits.budget_usd) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCost(data.credits.remaining_usd)} of {formatCost(data.credits.budget_usd)} budget
                  </p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Days remaining</span>
                  <Badge variant="outline" className="font-mono">
                    ~{Math.round(data.credits.days_remaining)}d
                  </Badge>
                </div>
                {data.credits.sources && data.credits.sources.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-white/[0.06] space-y-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Credits</span>
                    {data.credits.sources.map((s) => (
                      <div key={s.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{s.name}</span>
                          <span className="font-mono text-xs">{formatCost(s.remaining ?? s.amount)}</span>
                        </div>
                        {s.remaining != null && (
                          <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500/50 transition-all duration-500"
                              style={{ width: `${(s.remaining / s.amount) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
