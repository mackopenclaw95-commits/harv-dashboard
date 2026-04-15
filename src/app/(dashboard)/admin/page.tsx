"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield,
  Users,
  DollarSign,
  Activity,
  MessageSquare,
  FileText,
  Search,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Ban,
  Play,
  FolderKanban,
  CreditCard,
  User,
  Download,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import type { Profile } from "@/components/auth-provider";

interface ModelCost {
  tokens: number;
  cost: number;
  calls: number;
}

interface AdminStats {
  totalUsers: number;
  activeTrials: number;
  paidUsers: number;
  cancelledUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
  totalProjects: number;
  messagesToday: number;
  totalApiCost: number;
  claudeCost: number;
  openrouterCost: number;
  totalTokens: number;
  costByModel: Record<string, ModelCost>;
  lastCostEvent: string | null;
}

interface VPSHealth {
  status: string;
  uptime_seconds: number;
  api_uptime_seconds: number;
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [vpsHealth, setVpsHealth] = useState<VPSHealth | null>(null);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"joined" | "tokens" | "cost">("joined");
  const [filterPlan, setFilterPlan] = useState<"all" | "free" | "pro" | "max">("all");
  const [costDetailOpen, setCostDetailOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [userDetailId, setUserDetailId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<{
    profile: Profile;
    conversations: Array<{ id: string; title: string | null; agent_name: string; status: string; updated_at: string; messages: { count: number }[] }>;
    documents: Record<string, unknown>[];
    projects: Record<string, unknown>[];
    usage: { today: number; total: number; totalTokens: number; totalCost: number } | null;
  } | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [costDetailTab, setCostDetailTab] = useState<"model" | "agent" | "daily">("model");
  const [vpsAnalytics, setVpsAnalytics] = useState<{
    by_agent: Record<string, { total_cost: number; calls: number; input_tokens: number; output_tokens: number }>;
    daily_last_30: Array<{ date: string; cost: number; calls: number }>;
    burn_rate: { daily_avg_usd: number; projected_monthly: number };
  } | null>(null);

  const load = useCallback(async () => {
    try {
      // Fetch from server-side API route (has service role access)
      const adminRes = await fetch("/api/admin/stats");
      if (adminRes.ok) {
        const data = await adminRes.json();
        setUsers(data.users || []);
        setStats(data.stats || null);
      }

      // VPS health
      try {
        const healthRes = await fetch("/api/proxy?path=/api/health/quick");
        if (healthRes.ok) setVpsHealth(await healthRes.json());
      } catch {}

      // VPS analytics (per-agent costs, daily costs)
      try {
        const analyticsRes = await fetch("/api/proxy?path=/api/analytics/");
        if (analyticsRes.ok) {
          const aData = await analyticsRes.json();
          setVpsAnalytics({
            by_agent: aData.by_agent || {},
            daily_last_30: aData.daily_last_30 || [],
            burn_rate: aData.burn_rate || { daily_avg_usd: 0, projected_monthly: 0 },
          });
        }
      } catch {}

      // Recent events
      try {
        const eventsRes = await fetch(
          "/api/proxy?path=" + encodeURIComponent("/api/events/recent?limit=10")
        );
        if (eventsRes.ok) {
          const evData = await eventsRes.json();
          setEvents(Array.isArray(evData) ? evData : []);
        }
      } catch {}
    } catch (err) {
      console.error("Admin load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openUserDetail(userId: string) {
    setUserDetailId(userId);
    setUserDetail(null);
    setUserDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setUserDetail(data);
      }
    } catch {}
    setUserDetailLoading(false);
  }

  async function toggleUserStatus(userId: string, action: "ban" | "activate") {
    try {
      const res = await fetch(`/api/admin/users/${userId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update in the modal
        setUserDetail((prev) => prev ? { ...prev, profile: { ...prev.profile, plan_status: data.status } } : null);
        // Update in the user list
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, plan_status: data.status } : u));
        toast.success(action === "ban" ? "User suspended" : "User activated");
      }
    } catch {
      toast.error("Action failed");
    }
  }

  const filteredUsers = users
    .filter((u) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!u.email?.toLowerCase().includes(q) && !u.name?.toLowerCase().includes(q)) return false;
      }
      if (filterPlan !== "all" && u.plan !== filterPlan) return false;
      return true;
    })
    .sort((a, b) => {
      const au = a as Profile & { usage_tokens?: number; usage_cost?: number };
      const bu = b as Profile & { usage_tokens?: number; usage_cost?: number };
      if (sortBy === "tokens") return (bu.usage_tokens || 0) - (au.usage_tokens || 0);
      if (sortBy === "cost") return (bu.usage_cost || 0) - (au.usage_cost || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Hub</h1>
            <p className="text-sm text-muted-foreground">God mode — see everything</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Month picker + export button for admin usage CSV (tax/bookkeeping) */}
          <input
            type="month"
            value={exportMonth}
            onChange={(e) => setExportMonth(e.target.value)}
            className="h-8 rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] px-2 text-xs text-foreground/80 hover:bg-white/[0.08] focus:outline-none focus:ring-primary/40 [color-scheme:dark]"
          />
          <a
            href={`/api/admin/usage/export?month=${exportMonth}`}
            download
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <Download className="h-3.5 w-3.5" />
            Export Usage
          </a>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setLoading(true); load(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Users</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.totalUsers || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Active Trials</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.activeTrials || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Paid Users</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.paidUsers || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Revenue (MRR)</span>
            </div>
            <p className="text-2xl font-bold mt-1">${((stats?.paidUsers || 0) * 20).toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">{stats?.paidUsers || 0} paid users</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all" onClick={() => setCostDetailOpen(true)}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-yellow-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">API Cost</span>
              <span className="text-[9px] text-primary/60 ml-auto">Details →</span>
            </div>
            <p className="text-2xl font-bold mt-1">${(stats?.totalApiCost || 0).toFixed(4)}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              OpenRouter (pay-per-use)
            </p>
            {stats?.lastCostEvent && (
              <p className="text-[9px] text-muted-foreground/30 mt-0.5">
                Last tracked: {timeAgo(stats.lastCostEvent)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-red-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Monthly Overhead</span>
            </div>
            <p className="text-2xl font-bold mt-1">${(17.99 + (stats?.totalApiCost || 0)).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">$17.99 VPS + OpenRouter API</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Cancelled</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.cancelledUsers || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">VPS Status</span>
            </div>
            <p className="text-sm font-medium mt-1.5">
              {vpsHealth ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                  Online · {Math.round((vpsHealth.uptime_seconds || 0) / 3600)}h uptime
                </span>
              ) : (
                <span className="text-red-400">Unreachable</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters row */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold mr-auto">Users</h2>
            {/* Plan filter */}
            <div className="flex gap-1">
              {(["all", "free", "pro", "max"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPlan(p)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors",
                    filterPlan === p
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/[0.04]"
                  )}
                >
                  {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            {/* Sort */}
            <div className="flex gap-1">
              {([
                { key: "joined", label: "Joined" },
                { key: "tokens", label: "Tokens" },
                { key: "cost", label: "Cost" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors",
                    sortBy === key
                      ? "bg-white/[0.08] text-foreground"
                      : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/[0.04]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="pl-8 h-8 w-36 text-xs bg-white/[0.03] border-white/[0.06]"
              />
            </div>
          </div>

          <Card>
            <ScrollArea className="max-h-[500px]">
              <div className="divide-y divide-white/[0.06]">
                {filteredUsers.map((u) => {
                  const uu = u as Profile & { usage_tokens?: number; usage_cost?: number; usage_messages?: number };
                  return (
                  <button
                    key={u.id}
                    onClick={() => openUserDetail(u.id)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors w-full text-left"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {(u.name || u.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {u.name || "Unnamed"}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1.5",
                            u.plan === "pro" && "text-primary border-primary/30",
                            u.plan === "max" && "text-yellow-400 border-yellow-500/30",
                            u.plan === "free" && "text-muted-foreground border-white/[0.1]"
                          )}
                        >
                          {u.plan}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1.5",
                            u.plan_status === "active" && "text-green-400 border-green-500/30",
                            u.plan_status === "trial" && "text-yellow-400 border-yellow-500/30",
                            u.plan_status === "cancelled" && "text-red-400 border-red-500/30"
                          )}
                        >
                          {u.plan_status}
                        </Badge>
                        {u.role === "owner" && (
                          <Badge className="text-[9px] px-1.5 bg-primary/20 text-primary border-0">
                            owner
                          </Badge>
                        )}
                        {u.role === "tester" && (
                          <Badge className="text-[9px] px-1.5 bg-orange-400/20 text-orange-400 border-0">
                            tester
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 truncate">
                        {u.email} · joined {timeAgo(u.created_at)}
                      </p>
                    </div>
                    {/* Usage stats inline */}
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-xs font-mono font-medium">
                        {(uu.usage_tokens || 0).toLocaleString()} <span className="text-[9px] text-muted-foreground/50">tok</span>
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/60">
                        ${(uu.usage_cost || 0).toFixed(4)}
                      </p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                  </button>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground/50">
                    {searchQuery ? "No matching users" : "No users yet"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Recent events */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Events</h2>
          <Card>
            <ScrollArea className="max-h-[500px]">
              <div className="divide-y divide-white/[0.06]">
                {events.map((evt, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          evt.status === "success" ? "bg-green-400" :
                          evt.status === "error" ? "bg-red-400" : "bg-yellow-400"
                        )}
                      />
                      <span className="text-xs font-medium truncate">
                        {String(evt.agent || "Unknown")}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1.5 ml-auto shrink-0">
                        {String(evt.action || "").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-1">
                      {String(evt.summary || "")}
                    </p>
                    <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                      {evt.timestamp ? timeAgo(String(evt.timestamp)) : ""}
                    </p>
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground/50">
                    No events
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>

          {/* Profit/Loss quick calc */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Profit / Loss
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold", ((stats?.paidUsers || 0) * 20 - 17.99 - (stats?.totalApiCost || 0)) >= 0 ? "text-green-400" : "text-red-400")}>
                ${((stats?.paidUsers || 0) * 20 - 17.99 - (stats?.totalApiCost || 0)).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                Revenue - Overhead ($17.99 VPS + API)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* API Cost Detail Dialog */}
      <Dialog open={costDetailOpen} onOpenChange={setCostDetailOpen}>
        <DialogContent className="max-w-lg bg-card/95 backdrop-blur-2xl border-white/[0.08]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-yellow-400" />
              API Cost Breakdown
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-white/[0.03] p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Cost</p>
                <p className="text-lg font-bold text-yellow-400">${(stats?.totalApiCost || 0).toFixed(4)}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily Avg</p>
                <p className="text-lg font-bold text-primary">${(vpsAnalytics?.burn_rate.daily_avg_usd || 0).toFixed(4)}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Proj. Monthly</p>
                <p className="text-lg font-bold text-primary">${(vpsAnalytics?.burn_rate.projected_monthly || 0).toFixed(4)}</p>
              </div>
            </div>

            {/* Tab buttons */}
            <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03]">
              {(["model", "agent", "daily"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCostDetailTab(tab)}
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize",
                    costDetailTab === tab
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "model" ? "By Model" : tab === "agent" ? "By Agent" : "Daily"}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="h-64 overflow-y-auto rounded-lg border border-white/[0.04]">
              <div className="space-y-1.5">
                {costDetailTab === "model" && (
                  <>
                    {stats?.costByModel && Object.entries(stats.costByModel)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([model, data]) => {
                        const shortName = model.split("/").pop() || model;
                        return (
                          <div key={model} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{shortName}</p>
                              <p className="text-[10px] text-muted-foreground/50">
                                {data.calls} calls · {data.tokens.toLocaleString()} tokens
                              </p>
                            </div>
                            <p className="text-xs font-mono font-medium text-yellow-400 shrink-0">
                              ${data.cost.toFixed(4)}
                            </p>
                          </div>
                        );
                      })}
                    {(!stats?.costByModel || Object.keys(stats.costByModel).length === 0) && (
                      <p className="text-xs text-muted-foreground/50 text-center py-4">No data</p>
                    )}
                  </>
                )}

                {costDetailTab === "agent" && (
                  <>
                    {vpsAnalytics?.by_agent && Object.entries(vpsAnalytics.by_agent)
                      .filter(([, a]) => a.total_cost > 0 || a.calls > 0)
                      .sort(([, a], [, b]) => b.total_cost - a.total_cost)
                      .map(([agent, data]) => (
                        <div key={agent} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{agent}</p>
                            <p className="text-[10px] text-muted-foreground/50">
                              {data.calls} calls · {(data.input_tokens + data.output_tokens).toLocaleString()} tokens
                            </p>
                          </div>
                          <p className="text-xs font-mono font-medium text-yellow-400 shrink-0">
                            ${data.total_cost.toFixed(4)}
                          </p>
                        </div>
                      ))}
                    {!vpsAnalytics?.by_agent && (
                      <p className="text-xs text-muted-foreground/50 text-center py-4">No data</p>
                    )}
                  </>
                )}

                {costDetailTab === "daily" && (
                  <>
                    {vpsAnalytics?.daily_last_30 && [...vpsAnalytics.daily_last_30]
                      .reverse()
                      .map((day) => {
                        const d = new Date(day.date + "T12:00:00");
                        const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                        return (
                          <div key={day.date} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium">{label}</p>
                              <p className="text-[10px] text-muted-foreground/50">
                                {day.calls} calls
                              </p>
                            </div>
                            <p className="text-xs font-mono font-medium text-yellow-400 shrink-0">
                              ${day.cost.toFixed(4)}
                            </p>
                          </div>
                        );
                      })}
                    {!vpsAnalytics?.daily_last_30?.length && (
                      <p className="text-xs text-muted-foreground/50 text-center py-4">No data</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Monthly overhead</span>
              <span className="text-sm font-bold font-mono">${(17.99 + (stats?.totalApiCost || 0)).toFixed(2)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Detail Modal */}
      <Dialog open={!!userDetailId} onOpenChange={(open) => { if (!open) { setUserDetailId(null); setUserDetail(null); } }}>
        <DialogContent className="w-[90vw] !max-w-5xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/[0.08]">
          {userDetailLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-12 w-48" />
              <Skeleton className="h-20 rounded-xl" />
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </div>
            </div>
          ) : userDetail?.profile ? (
            <>
              {/* Header */}
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                    {(userDetail.profile.name || userDetail.profile.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <DialogTitle className="text-base">{userDetail.profile.name || "Unnamed"}</DialogTitle>
                      <Badge variant="outline" className={cn("text-[9px]", userDetail.profile.plan === "pro" && "text-primary border-primary/30", userDetail.profile.plan === "max" && "text-yellow-400 border-yellow-500/30")}>
                        {userDetail.profile.plan}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[9px]", userDetail.profile.plan_status === "active" && "text-green-400 border-green-500/30", userDetail.profile.plan_status === "trial" && "text-yellow-400 border-yellow-500/30", userDetail.profile.plan_status === "cancelled" && "text-red-400 border-red-500/30")}>
                        {userDetail.profile.plan_status}
                      </Badge>
                      {userDetail.profile.role !== "user" && (
                        <Badge className="text-[9px] bg-primary/20 text-primary border-0">{userDetail.profile.role}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{userDetail.profile.email}</p>
                  </div>
                  <div className="shrink-0 mr-8">
                    {userDetail.profile.plan_status !== "cancelled" ? (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => userDetailId && toggleUserStatus(userDetailId, "ban")}>
                        <Ban className="h-3 w-3" /> Suspend
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10" onClick={() => userDetailId && toggleUserStatus(userDetailId, "activate")}>
                        <Play className="h-3 w-3" /> Activate
                      </Button>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {/* Details grid */}
              <div className="grid grid-cols-5 gap-3 text-xs rounded-xl bg-white/[0.02] p-3">
                <div><p className="text-[9px] text-muted-foreground uppercase">Joined</p><p className="font-medium mt-0.5">{timeAgo(userDetail.profile.created_at)}</p></div>
                <div><p className="text-[9px] text-muted-foreground uppercase">Role</p><p className="font-medium mt-0.5">{userDetail.profile.role}</p></div>
                <div><p className="text-[9px] text-muted-foreground uppercase">Stripe</p><p className="font-mono text-[10px] mt-0.5 truncate">{userDetail.profile.stripe_customer_id || "—"}</p></div>
                <div><p className="text-[9px] text-muted-foreground uppercase">Onboarded</p><p className="font-medium mt-0.5">{userDetail.profile.onboarded ? "Yes" : "No"}</p></div>
                <div><p className="text-[9px] text-muted-foreground uppercase">Promo</p><p className="font-medium mt-0.5">{userDetail.profile.promo_code || "—"}</p></div>
              </div>

              {/* Usage stats */}
              {userDetail.usage && (
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg bg-white/[0.03] p-3">
                    <p className="text-[9px] text-muted-foreground uppercase">Today</p>
                    <p className="text-lg font-bold mt-0.5">{userDetail.usage.today}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-3">
                    <p className="text-[9px] text-muted-foreground uppercase">All Time</p>
                    <p className="text-lg font-bold mt-0.5">{userDetail.usage.total}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-3">
                    <p className="text-[9px] text-muted-foreground uppercase">Tokens</p>
                    <p className="text-lg font-bold mt-0.5">{userDetail.usage.totalTokens.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-3">
                    <p className="text-[9px] text-muted-foreground uppercase">API Cost</p>
                    <p className="text-lg font-bold mt-0.5">${userDetail.usage.totalCost.toFixed(4)}</p>
                  </div>
                </div>
              )}

              {/* Data sections */}
              <div className="grid grid-cols-3 gap-4">
                {/* Conversations */}
                <div>
                  <p className="text-xs font-semibold flex items-center gap-1.5 mb-2"><MessageSquare className="h-3.5 w-3.5 text-primary" /> Conversations ({userDetail.conversations?.length || 0})</p>
                  <ScrollArea className="max-h-52">
                    <div className="space-y-1">
                      {(userDetail.conversations || []).map((c) => (
                        <div key={c.id} className="px-2 py-1.5 rounded-lg hover:bg-white/[0.03] text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium truncate flex-1">{c.title || "Untitled"}</span>
                            <Badge variant="outline" className="text-[8px] px-1">{c.agent_name}</Badge>
                          </div>
                          <p className="text-[9px] text-muted-foreground/50">{c.messages?.[0]?.count || 0} msgs · {timeAgo(c.updated_at)}</p>
                        </div>
                      ))}
                      {(!userDetail.conversations || userDetail.conversations.length === 0) && (
                        <p className="text-[10px] text-muted-foreground/40 text-center py-3">None</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Files */}
                <div>
                  <p className="text-xs font-semibold flex items-center gap-1.5 mb-2"><FileText className="h-3.5 w-3.5 text-blue-400" /> Files ({userDetail.documents?.length || 0})</p>
                  <ScrollArea className="max-h-52">
                    <div className="space-y-1">
                      {(userDetail.documents || []).map((d) => (
                        <div key={String(d.id)} className="px-2 py-1.5 rounded-lg hover:bg-white/[0.03] text-[11px]">
                          <span className="font-medium truncate block">{String(d.filename)}</span>
                          <p className="text-[9px] text-muted-foreground/50">{String(d.file_type)} · {timeAgo(String(d.created_at))}</p>
                        </div>
                      ))}
                      {(!userDetail.documents || userDetail.documents.length === 0) && (
                        <p className="text-[10px] text-muted-foreground/40 text-center py-3">None</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Projects */}
                <div>
                  <p className="text-xs font-semibold flex items-center gap-1.5 mb-2"><FolderKanban className="h-3.5 w-3.5 text-yellow-400" /> Projects ({userDetail.projects?.length || 0})</p>
                  <ScrollArea className="max-h-52">
                    <div className="space-y-1">
                      {(userDetail.projects || []).map((p) => (
                        <div key={String(p.id)} className="px-2 py-1.5 rounded-lg hover:bg-white/[0.03] text-[11px]">
                          <span className="font-medium truncate block">{String(p.name)}</span>
                          <p className="text-[9px] text-muted-foreground/50">{timeAgo(String(p.updated_at))}</p>
                        </div>
                      ))}
                      {(!userDetail.projects || userDetail.projects.length === 0) && (
                        <p className="text-[10px] text-muted-foreground/40 text-center py-3">None</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">User not found</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
