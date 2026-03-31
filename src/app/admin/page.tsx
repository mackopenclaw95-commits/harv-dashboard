"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { Profile } from "@/components/auth-provider";

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
  totalTokens: number;
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
  const [filterPlan, setFilterPlan] = useState<"all" | "free" | "pro" | "business">("all");

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
        <Button variant="outline" size="sm" className="gap-2" onClick={() => { setLoading(true); load(); }}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
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
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Conversations</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.totalConversations || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Messages</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.totalMessages || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Documents</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.totalDocuments || 0}</p>
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
              {(["all", "free", "pro", "business"] as const).map((p) => (
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
                  <Link
                    key={u.id}
                    href={`/admin/users/${u.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
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
                            u.plan === "business" && "text-yellow-400 border-yellow-500/30",
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
                  </Link>
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

          {/* Quick stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                Cancelled
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {stats?.cancelledUsers || 0}
              </p>
              <p className="text-xs text-muted-foreground">
                Total API cost: ${(stats?.totalApiCost || 0).toFixed(4)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
