"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Bot, Filter, Search, ChevronDown, ChevronUp, Calendar, ChevronLeft, ChevronRight, X, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AGENT_ICONS, COMING_SOON_AGENTS } from "@/lib/agent-data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

const BACKGROUND_AGENTS = new Set(["Heartbeat", "Guardian", "Medic"]);
const TOOL_AGENTS = new Set(["Ledger", "Drive"]);
const HIDDEN_AGENTS = new Set(["twitter_client", "social_metrics"]);
const INITIAL_VISIBLE = 7;

interface AgentEvent {
  agent: string;
  action: string;
  status: string;
  summary: string;
  timestamp: string;
  cost: number;
  tokens: number;
}

function parseEventDate(ts: string): Date {
  // Strip timezone abbreviation first — backend says "EST" but means local time
  const stripped = ts.replace(/\s+[A-Z]{2,5}$/, "");
  const d = new Date(stripped);
  if (!isNaN(d.getTime())) return d;
  // Try original string
  const d2 = new Date(ts);
  if (!isNaN(d2.getTime())) return d2;
  // Fallback: replace first space with T for ISO-ish formats
  const bare = ts.replace(" ", "T");
  return new Date(bare);
}


function formatTime(ts: string): string {
  const d = parseEventDate(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
}


// ─── Calendar Date Picker (Airbnb-style popup) ─────────────
function DatePickerPopup({
  countsByDate,
  selectedDate,
  onSelect,
  onClose,
}: {
  countsByDate: Map<string, number>;
  selectedDate: string | null;
  onSelect: (date: string | null) => void;
  onClose: () => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const days: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const maxCount = Math.max(1, ...countsByDate.values());

  return (
    <div ref={ref} className="absolute top-full mt-2 left-0 z-50 w-[320px] rounded-2xl border border-white/[0.08] bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewMonth(new Date(year, month - 1))} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">
          {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => setViewMonth(new Date(year, month + 1))}
          disabled={year >= today.getFullYear() && month >= today.getMonth()}
          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="text-[10px] text-muted-foreground/50 text-center font-medium">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const count = countsByDate.get(key) || 0;
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const isFuture = new Date(year, month, day) > today;
          const intensity = count > 0 ? Math.max(0.15, count / maxCount) : 0;
          return (
            <button
              key={key}
              disabled={isFuture || count === 0}
              onClick={() => { onSelect(isSelected ? null : key); onClose(); }}
              className={cn(
                "relative h-9 w-full rounded-lg text-xs font-medium transition-all",
                isSelected && "ring-2 ring-primary text-primary",
                isToday && !isSelected && "ring-1 ring-primary/40",
                isFuture && "opacity-20 cursor-not-allowed",
                count === 0 && !isFuture && "text-muted-foreground/30 cursor-default",
                count > 0 && !isSelected && "hover:bg-white/[0.06] text-foreground",
              )}
            >
              {count > 0 && (
                <div
                  className="absolute inset-0.5 rounded-md bg-primary/20"
                  style={{ opacity: intensity }}
                />
              )}
              <span className="relative">{day}</span>
              {count > 0 && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] text-primary/70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
        <button
          onClick={() => { onSelect(null); onClose(); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear date
        </button>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
          <div className="h-2.5 w-2.5 rounded-sm bg-primary/20" /> few
          <div className="h-2.5 w-2.5 rounded-sm bg-primary/60" /> many
        </div>
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const { isAdmin } = useAuth();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [dailyCounts, setDailyCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [excludedAgents, setExcludedAgents] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [pickerDate, setPickerDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Fetch daily counts for heat map (once) — owner only (VPS events are global)
  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    async function loadCounts() {
      try {
        const res = await fetch("/api/proxy?path=/api/events/daily-counts?days=90");
        if (res.ok) {
          const data = await res.json();
          setDailyCounts(new Map(Object.entries(data.counts || {})));
        }
      } catch { /* silent */ }
    }
    loadCounts();
  }, [isAdmin]);

  // Fetch events for selected date — owner only
  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    async function loadDate() {
      setLoading(true);
      try {
        const res = await fetch(`/api/proxy?path=/api/events/by-date?date=${pickerDate}`);
        if (res.ok) {
          const data = await res.json();
          setEvents((data.events || []).filter((e: AgentEvent) => !HIDDEN_AGENTS.has(e.agent)));
        }
      } catch {
        toast.error("Could not load activity");
      } finally {
        setLoading(false);
      }
    }
    loadDate();
  }, [pickerDate, isAdmin]);

  const allAgentNames = [...new Set(events.map((e) => e.agent))].sort();

  function getAgentType(name: string): "agent" | "background" | "tool" {
    if (BACKGROUND_AGENTS.has(name)) return "background";
    if (TOOL_AGENTS.has(name)) return "tool";
    return "agent";
  }

  function agentIconColor(name: string): string {
    if (BACKGROUND_AGENTS.has(name)) return "text-purple-400";
    if (TOOL_AGENTS.has(name)) return "text-purple-400";
    return "text-blue-400";
  }

  const agentsByType = {
    agent: allAgentNames.filter((n) => getAgentType(n) === "agent"),
    background: allAgentNames.filter((n) => getAgentType(n) === "background"),
    tool: allAgentNames.filter((n) => getAgentType(n) === "tool"),
  };

  function toggleAgent(name: string) {
    setExcludedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleGroup(agents: string[]) {
    const allExcluded = agents.every((a) => excludedAgents.has(a));
    setExcludedAgents((prev) => {
      const next = new Set(prev);
      if (allExcluded) {
        agents.forEach((a) => next.delete(a));
      } else {
        agents.forEach((a) => next.add(a));
      }
      return next;
    });
  }

  const filtered = events.filter((ev) => {
    if (excludedAgents.has(ev.agent)) return false;
    if (statusFilter !== "all" && ev.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return (
        ev.agent.toLowerCase().includes(q) ||
        ev.action.toLowerCase().includes(q) ||
        (ev.summary || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedDateLabel = useMemo(() => {
    const d = new Date(pickerDate + "T12:00:00");
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (pickerDate === today) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    if (pickerDate === yesterdayKey) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }, [pickerDate]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
            <p className="text-sm text-muted-foreground">
              {events.length} events recorded
            </p>
          </div>
        </div>
      </header>

      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activity..."
            className="pl-10 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg bg-card/50 ring-1 ring-white/[0.08] border-0 px-3 py-2 text-sm text-foreground focus:ring-primary/30 focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="running">Running</option>
        </select>
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ring-1 bg-primary/10 text-primary ring-primary/20"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(pickerDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </button>
          {showPicker && (
            <DatePickerPopup
              countsByDate={dailyCounts}
              selectedDate={pickerDate}
              onSelect={(d) => { if (d) { setPickerDate(d); setShowAll(false); } }}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ring-1",
            showFilters ? "bg-primary/10 text-primary ring-primary/20" : "bg-card/50 text-muted-foreground ring-white/[0.08] hover:text-foreground"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
          {excludedAgents.size > 0 && (
            <Badge variant="outline" className="ml-1 text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
              {allAgentNames.length - excludedAgents.size}/{allAgentNames.length}
            </Badge>
          )}
          {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Agent filter chips grouped by type */}
      {showFilters && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            {/* Agents */}
            {agentsByType.agent.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold">Agents</span>
                  <button onClick={() => toggleGroup(agentsByType.agent)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    {agentsByType.agent.every((a) => excludedAgents.has(a)) ? "Select all" : "Deselect all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {agentsByType.agent.map((name) => {
                    const Icon = AGENT_ICONS[name] || Bot;
                    const active = !excludedAgents.has(name);
                    return (
                      <button
                        key={name}
                        onClick={() => toggleAgent(name)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ring-1",
                          active
                            ? "bg-blue-500/10 text-blue-400 ring-blue-500/20"
                            : "bg-white/[0.02] text-muted-foreground/40 ring-white/[0.04] line-through"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Background */}
            {agentsByType.background.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold">System</span>
                  <button onClick={() => toggleGroup(agentsByType.background)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    {agentsByType.background.every((a) => excludedAgents.has(a)) ? "Select all" : "Deselect all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {agentsByType.background.map((name) => {
                    const Icon = AGENT_ICONS[name] || Bot;
                    const active = !excludedAgents.has(name);
                    return (
                      <button
                        key={name}
                        onClick={() => toggleAgent(name)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ring-1",
                          active
                            ? "bg-purple-500/10 text-purple-400 ring-purple-500/20"
                            : "bg-white/[0.02] text-muted-foreground/40 ring-white/[0.04] line-through"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tools */}
            {agentsByType.tool.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold">Tools</span>
                  <button onClick={() => toggleGroup(agentsByType.tool)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    {agentsByType.tool.every((a) => excludedAgents.has(a)) ? "Select all" : "Deselect all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {agentsByType.tool.map((name) => {
                    const Icon = AGENT_ICONS[name] || Bot;
                    const active = !excludedAgents.has(name);
                    return (
                      <button
                        key={name}
                        onClick={() => toggleAgent(name)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ring-1",
                          active
                            ? "bg-purple-500/10 text-purple-400 ring-purple-500/20"
                            : "bg-white/[0.02] text-muted-foreground/40 ring-white/[0.04] line-through"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {excludedAgents.size > 0 && (
              <button
                onClick={() => setExcludedAgents(new Set())}
                className="text-xs text-primary hover:underline"
              >
                Reset all filters
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Date label + count */}
      <div className="flex items-center gap-3">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-xs font-medium text-muted-foreground">{selectedDateLabel}</span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-white/[0.03] text-muted-foreground/60 border-white/[0.06]">
          {filtered.length}
        </Badge>
      </div>

      {/* Event list */}
      {loading ? (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2.5 w-60" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5 ring-1 ring-primary/10 mb-4">
              <Activity className="h-7 w-7 text-primary/30" />
            </div>
            <p className="font-medium">No activity</p>
            <p className="text-sm text-muted-foreground mt-1">
              No events recorded for {selectedDateLabel.toLowerCase()}
            </p>
          </CardContent>
        </Card>
      ) : (() => {
        const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
        const remaining = filtered.length - INITIAL_VISIBLE;
        return (
          <Card>
            <CardContent className="pt-3 pb-2">
              <div className="divide-y divide-white/[0.04]">
                {visible.map((ev, i) => {
                  const Icon = AGENT_ICONS[ev.agent] || Bot;
                  const isSuccess = ev.status === "success";
                  const isError = ev.status === "error";
                  return (
                    <div
                      key={`${ev.agent}-${ev.timestamp}-${i}`}
                      className="flex items-center gap-3 py-3 hover:bg-white/[0.02] px-2 -mx-2 rounded-lg transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                        <Icon className={cn("h-4 w-4", agentIconColor(ev.agent))} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{ev.agent}</span>
                          <span className="text-xs text-muted-foreground">—</span>
                          <span className={cn(
                            "text-xs",
                            isSuccess ? "text-emerald-400" : isError ? "text-red-400" : "text-muted-foreground"
                          )}>
                            {ev.action}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] px-1.5 py-0",
                              isSuccess ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              isError ? "bg-red-500/10 text-red-400 border-red-500/20" :
                              "bg-white/[0.04] text-muted-foreground border-white/[0.06]"
                            )}
                          >
                            {ev.status}
                          </Badge>
                        </div>
                        {ev.summary && (
                          <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-1">{ev.summary}</p>
                        )}
                        {(ev.tokens > 0 || ev.cost > 0) && (
                          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground/40">
                            {ev.tokens > 0 && <span>{ev.tokens.toLocaleString()} tokens</span>}
                            {ev.cost > 0 && <span>${ev.cost.toFixed(4)}</span>}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0 whitespace-nowrap">
                        {formatTime(ev.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {remaining > 0 && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="w-full mt-1 py-2 text-xs text-primary hover:text-primary/80 transition-colors flex items-center justify-center gap-1.5"
                >
                  {showAll ? (
                    <>Show less <ChevronUp className="h-3 w-3" /></>
                  ) : (
                    <>Show {remaining} more event{remaining !== 1 ? "s" : ""} <ChevronDown className="h-3 w-3" /></>
                  )}
                </button>
              )}
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
