"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Search,
  Calendar,
  DollarSign,
  Bot,
  Clock,
  Lightbulb,
  CheckCircle,
  AlertCircle,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  getJournalEntries,
  searchJournal,
  getJournalStats,
  type JournalEntry,
} from "@/lib/supabase-journal";

function formatJournalDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [stats, setStats] = useState({
    totalEntries: 0,
    totalCost: 0,
    agentsUsed: [] as string[],
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load entries and stats on mount
  useEffect(() => {
    async function load() {
      try {
        const [entriesData, statsData] = await Promise.all([
          getJournalEntries(),
          getJournalStats(),
        ]);
        setEntries(entriesData);
        setStats(statsData);
      } catch (e) {
        console.error("Failed to load journal:", e);
        toast.error("Failed to load journal entries");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Date filter
  const handleDateFilter = useCallback(
    async (start: string, end: string) => {
      if (!start && !end) {
        setLoading(true);
        try {
          const data = await getJournalEntries();
          setEntries(data);
        } catch {
          toast.error("Failed to load entries");
        } finally {
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const data = await getJournalEntries(
          start || undefined,
          end || undefined
        );
        setEntries(data);
      } catch {
        toast.error("Failed to filter entries");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Search with debounce
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!query.trim()) {
        handleDateFilter(startDate, endDate);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const results = await searchJournal(query.trim());
          setEntries(results);
        } catch {
          toast.error("Search failed");
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [startDate, endDate, handleDateFilter]
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Daily Journal
            </h1>
            <p className="text-sm text-muted-foreground">
              {stats.totalEntries} entries recorded
              {stats.totalEntries > 0 && (
                <span className="ml-1 text-muted-foreground/60">
                  &middot; auto-generated at 3am EST
                </span>
              )}
            </p>
          </div>
        </div>
      </header>

      {/* Stats row */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Layers className="h-3.5 w-3.5 text-primary/60" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Entries
              </p>
            </div>
            <p className="text-2xl font-bold">{stats.totalEntries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-yellow-400/60" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Total Cost
              </p>
            </div>
            <p className="text-2xl font-bold text-yellow-400">
              ${stats.totalCost.toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Bot className="h-3.5 w-3.5 text-blue-400/60" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Agents Used
              </p>
            </div>
            <p className="text-2xl font-bold text-blue-400">
              {stats.agentsUsed.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Date filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Search journal entries..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground animate-pulse">
              Searching...
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <Calendar className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              handleDateFilter(e.target.value, endDate);
            }}
            className="w-full sm:w-[140px] text-xs"
            placeholder="Start"
          />
          <span className="text-muted-foreground/40 text-xs">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              handleDateFilter(startDate, e.target.value);
            }}
            className="w-full sm:w-[140px] text-xs"
            placeholder="End"
          />
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-6">
                <div className="h-5 w-48 bg-white/[0.06] rounded mb-3" />
                <div className="h-3 w-full bg-white/[0.04] rounded mb-2" />
                <div className="h-3 w-3/4 bg-white/[0.04] rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : entries.length === 0 ? (
        /* Empty state */
        <Card className="py-16">
          <CardContent className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15 mb-4">
              <FileText className="h-8 w-8 text-primary/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery.trim() ? `No entries matching "${searchQuery}"` : "No journal entries yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Journal entries are created automatically at 3am EST each day.
              They capture a compressed summary of all conversations, decisions,
              and activity across every agent.
            </p>
            <div className="flex items-center gap-1.5 mt-4 text-xs text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              <span>Next entry generates after midnight activity</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Entry cards */
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry.id} className="transition-all duration-200 hover:ring-primary/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Date circle */}
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15 shrink-0">
                      <span className="text-[10px] text-primary/70 uppercase font-medium leading-none">
                        {new Date(entry.date + "T12:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short" }
                        )}
                      </span>
                      <span className="text-lg font-bold text-primary leading-none mt-0.5">
                        {new Date(entry.date + "T12:00:00").getDate()}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {formatJournalDate(entry.date)}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
                        {entry.session_id}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[11px]"
                  >
                    <DollarSign className="h-3 w-3 mr-0.5" />
                    {(entry.total_cost_usd || 0).toFixed(4)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                {/* Summary */}
                {entry.summary && (
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {entry.summary}
                  </p>
                )}

                {/* Accomplishments */}
                {entry.accomplishments?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide">
                        Accomplishments
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {entry.accomplishments.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-foreground/70"
                        >
                          <span className="text-emerald-500/50 mt-1.5 text-[8px]">
                            ●
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Info */}
                {entry.key_info?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
                        Key Info
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {entry.key_info.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-foreground/70"
                        >
                          <span className="text-amber-500/50 mt-1.5 text-[8px]">
                            ●
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Pending Tasks */}
                {entry.pending_tasks?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertCircle className="h-3.5 w-3.5 text-orange-400" />
                      <span className="text-[11px] font-semibold text-orange-400 uppercase tracking-wide">
                        Pending
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {entry.pending_tasks.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-foreground/70"
                        >
                          <span className="text-orange-500/50 mt-1.5 text-[8px]">
                            ●
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Agents used */}
                {entry.agents_used?.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    <div className="flex flex-wrap gap-1.5">
                      {entry.agents_used.map((agent) => (
                        <Badge
                          key={agent}
                          variant="outline"
                          className="bg-blue-500/8 text-blue-400/80 border-blue-500/20 text-[10px] px-1.5 py-0"
                        >
                          {agent}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
