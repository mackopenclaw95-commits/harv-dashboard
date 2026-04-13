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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Search,
  Calendar,
  Clock,
  Lightbulb,
  CheckCircle,
  AlertCircle,
  Layers,
  ChevronDown,
  PanelLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getJournalEntries,
  searchJournal,
  getJournalStats,
  type JournalEntry,
} from "@/lib/supabase-journal";

const RECENT_COUNT = 10;

function formatSidebarDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
        ? "nd"
        : day === 3 || day === 23
          ? "rd"
          : "th";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  return `${weekday}, ${month} ${day}${suffix}`;
}

function formatJournalDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Entry Card (full or collapsed) ───────────────────────────────
function JournalEntryCard({
  entry,
  collapsed,
  onToggle,
  entryRef,
}: {
  entry: JournalEntry;
  collapsed: boolean;
  onToggle: () => void;
  entryRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={entryRef}>
      <Card
        className={cn(
          "transition-all duration-200",
          collapsed
            ? "cursor-pointer hover:ring-primary/15"
            : "hover:ring-primary/10"
        )}
        onClick={collapsed ? onToggle : undefined}
      >
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
            {collapsed && (
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-300" />
            )}
          </div>
          {/* Collapsed: show summary preview */}
          {collapsed && entry.summary && (
            <p className="text-sm text-muted-foreground/60 mt-2 line-clamp-1">
              {entry.summary}
            </p>
          )}
        </CardHeader>

        {/* Expandable content */}
        <div className="collapsible-grid" data-open={!collapsed}>
          <div>
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

              {/* Collapse button for expanded older entries */}
              {!collapsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors pt-1"
                >
                  <ChevronDown className="h-3 w-3 rotate-180" />
                  Collapse
                </button>
              )}
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
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
  const [collapsedEntries, setCollapsedEntries] = useState<Set<string>>(
    new Set()
  );
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Initialize collapsed state: older than RECENT_COUNT are collapsed
  useEffect(() => {
    if (entries.length > RECENT_COUNT) {
      const olderDates = entries
        .slice(RECENT_COUNT)
        .map((e) => e.date);
      setCollapsedEntries(new Set(olderDates));
    } else {
      setCollapsedEntries(new Set());
    }
  }, [entries]);

  // Load entries and stats on mount
  useEffect(() => {
    async function load() {
      try {
        const [entriesData, statsData] = await Promise.all([
          getJournalEntries(undefined, undefined, 100),
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
          const data = await getJournalEntries(undefined, undefined, 100);
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
          end || undefined,
          100
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

  // Scroll to entry and highlight in sidebar
  function scrollToEntry(date: string) {
    setActiveDate(date);
    // Expand if collapsed
    setCollapsedEntries((prev) => {
      const next = new Set(prev);
      next.delete(date);
      return next;
    });
    // Scroll after a tick to allow expand animation
    setTimeout(() => {
      entryRefs.current[date]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
    // Close mobile sidebar
    setSidebarOpen(false);
  }

  function toggleCollapse(date: string) {
    setCollapsedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  const recentEntries = entries.slice(0, RECENT_COUNT);
  const olderEntries = entries.slice(RECENT_COUNT);

  return (
    <div className="flex h-full">
      {/* ─── Mobile sidebar toggle ─── */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-20 left-16 md:left-56 z-20 lg:hidden flex h-8 w-8 items-center justify-center rounded-lg bg-card/80 backdrop-blur-xl ring-1 ring-white/[0.08] hover:bg-white/[0.06] transition-colors"
      >
        <PanelLeft className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* ─── Date Sidebar ─── */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-16 md:left-56 z-10 h-full w-64 border-r border-white/[0.06] bg-card/50 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 shrink-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-14 pb-4 border-b border-white/[0.06]">
          <Calendar className="h-4 w-4 text-primary/60" />
          <span className="text-sm font-medium">Journal Dates</span>
          <Badge variant="outline" className="ml-auto text-[10px] px-1.5">
            {entries.length}
          </Badge>
        </div>
        <ScrollArea className="h-[calc(100%-49px)]">
          <div className="p-2">
            {/* Recent section */}
            {recentEntries.length > 0 && (
              <div className="mb-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium px-2 py-1.5">
                  Recent
                </p>
                {recentEntries.map((entry) => (
                  <button
                    key={entry.date}
                    onClick={() => scrollToEntry(entry.date)}
                    className={cn(
                      "w-full text-left rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200 mb-1 ring-1",
                      activeDate === entry.date
                        ? "bg-primary/10 text-primary ring-primary/25"
                        : "text-foreground/70 ring-white/[0.06] hover:bg-white/[0.05] hover:ring-white/[0.1] hover:text-foreground"
                    )}
                  >
                    {formatSidebarDate(entry.date)}
                  </button>
                ))}
              </div>
            )}

            {/* Older section */}
            {olderEntries.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-2 py-2 mt-1">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">
                    Older
                  </span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
                {olderEntries.map((entry) => (
                  <button
                    key={entry.date}
                    onClick={() => scrollToEntry(entry.date)}
                    className={cn(
                      "w-full text-left rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200 mb-1 ring-1",
                      activeDate === entry.date
                        ? "bg-primary/10 text-primary ring-primary/25"
                        : "text-foreground/50 ring-white/[0.04] hover:bg-white/[0.05] hover:ring-white/[0.1] hover:text-foreground/70"
                    )}
                  >
                    {formatSidebarDate(entry.date)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* ─── Backdrop for mobile sidebar ─── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[9] bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Main Content ─── */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto">
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
                  {searchQuery.trim()
                    ? `No entries matching "${searchQuery}"`
                    : "No journal entries yet"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Journal entries are created automatically at 3am EST each day.
                  They capture a compressed summary of all conversations,
                  decisions, and activity across every agent.
                </p>
                <div className="flex items-center gap-1.5 mt-4 text-xs text-muted-foreground/60">
                  <Clock className="h-3 w-3" />
                  <span>Next entry generates after midnight activity</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Recent entries (expanded) */}
              {recentEntries.map((entry) => (
                <JournalEntryCard
                  key={entry.id}
                  entry={entry}
                  collapsed={collapsedEntries.has(entry.date)}
                  onToggle={() => toggleCollapse(entry.date)}
                  entryRef={(el) => {
                    entryRefs.current[entry.date] = el;
                  }}
                />
              ))}

              {/* Older entries divider */}
              {olderEntries.length > 0 && (
                <>
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-white/[0.06]" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/40 font-medium">
                      Older entries
                    </span>
                    <div className="flex-1 h-px bg-white/[0.06]" />
                  </div>

                  {/* Older entries (collapsed by default) */}
                  {olderEntries.map((entry) => (
                    <JournalEntryCard
                      key={entry.id}
                      entry={entry}
                      collapsed={collapsedEntries.has(entry.date)}
                      onToggle={() => toggleCollapse(entry.date)}
                      entryRef={(el) => {
                        entryRefs.current[entry.date] = el;
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
