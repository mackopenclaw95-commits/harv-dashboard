"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  List,
  Grid3X3,
  Clock,
  MapPin,
  ExternalLink,
  Unplug,
  Plug,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  isGoogleConnected,
  getGoogleAuthUrl,
  getMonthEvents,
  getCalendarEvents,
  disconnectGoogle,
  storeTokens,
  type CalendarEvent,
} from "@/lib/google-calendar";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const EVENT_COLORS: Record<string, string> = {
  "1": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "2": "bg-green-500/20 text-green-300 border-green-500/30",
  "3": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "4": "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "5": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "6": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "7": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  cron: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  default: "bg-primary/15 text-primary border-primary/30",
};

// ─── Cron Job Types ──────────────────────────────────────
interface CronJob {
  name: string;
  description: string;
  group: string;
  schedule: string;
  log_file: string | null;
  last_log: string | null;
  last_log_time: string | null;
}

interface CronCalendarEvent {
  id: string;
  summary: string;
  description: string;
  isCron: true;
  schedule: string;
  group: string;
}

// ─── Helpers ─────────────────────────────────────────────
function getEventColor(colorId?: string): string {
  return EVENT_COLORS[colorId || ""] || EVENT_COLORS.default;
}

function formatEventTime(event: CalendarEvent): string {
  const start = event.start.dateTime || event.start.date || "";
  if (!event.start.dateTime) return "All day";
  return new Date(start).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getEventDateKey(event: CalendarEvent): string {
  const dt = event.start.dateTime || event.start.date || "";
  return dt.slice(0, 10);
}

function getEventHour(event: CalendarEvent): number {
  const dt = event.start.dateTime;
  if (!dt) return 0;
  return new Date(dt).getHours();
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

/** Parse cron schedule to get daily run times (simplified). */
function parseCronTimes(schedule: string): string[] {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return [schedule];

  const [min, hour] = parts;

  if (hour === "*" && min.startsWith("*/")) {
    const interval = parseInt(min.slice(2));
    return [`Every ${interval} min`];
  }
  // Comma-separated hours (e.g. "0,3,6,9,12,15,18,21") = every N hours
  if (hour.includes(",")) {
    const hours = hour.split(",").map(Number);
    if (hours.length >= 2) {
      const diff = hours[1] - hours[0];
      return [`Every ${diff} hr`];
    }
  }
  if (hour !== "*" && !hour.includes("/")) {
    const h = parseInt(hour);
    const m = min === "0" ? "00" : min;
    return [`${formatHour(h)}:${m.padStart(2, "0")}`];
  }
  if (hour.startsWith("*/")) {
    const interval = parseInt(hour.slice(2));
    return [`Every ${interval} hr`];
  }
  return [schedule];
}

/** Get the week's start — today, so we always show today + next 6 days. */
function getWeekStart(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── View Modes ──────────────────────────────────────────
type ViewMode = "month" | "week" | "day" | "agenda";

const VIEW_ICONS: Record<ViewMode, React.ElementType> = {
  month: Grid3X3,
  week: CalendarDays,
  day: CalendarIcon,
  agenda: List,
};

// ─── Main Component ──────────────────────────────────────
export default function CalendarPage() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [showCrons, setShowCrons] = useState(true);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>("week");

  const today = new Date();
  const todayKey = dateKey(today);

  // ─── Load scheduled tasks ──────────────────────────────────
  useEffect(() => {
    async function loadCrons() {
      try {
        const res = await fetch("/api/proxy?path=/api/crons/");
        if (res.ok) {
          const data = await res.json();
          const HIDDEN_TASKS = new Set(["Daily Backup", "Daily Backups", "VPS Snapshot", "VPS Snapshots", "Weekly Archive", "Weekly Archives", "Dependency Updates", "Daily Digest"]);
          const SCHEDULE_OVERRIDES: Record<string, string> = { Heartbeat: "*/90 * * * *", Medic: "0 */6 * * *" };
          let allJobs = (data.jobs || data.crons || [])
            .filter((j: CronJob) => !HIDDEN_TASKS.has(j.name))
            .map((j: CronJob) => SCHEDULE_OVERRIDES[j.name] ? { ...j, schedule: SCHEDULE_OVERRIDES[j.name] } : j);
          // Ensure Medic always present
          if (!allJobs.some((j: CronJob) => j.name === "Medic")) {
            allJobs = [...allJobs, { name: "Medic", description: "Called by Guardian", group: "System", schedule: "on-demand", last_log_time: null }];
          }
          setCronJobs(allJobs);
        }
      } catch {
        // silent
      }
    }
    loadCrons();
  }, []);

  // ─── OAuth callback ──────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokensParam = params.get("tokens");
    const error = params.get("error");

    if (error) {
      toast.error(`Google auth failed: ${error}`);
      window.history.replaceState({}, "", "/calendar");
      return;
    }

    if (tokensParam) {
      try {
        const tokens = JSON.parse(decodeURIComponent(tokensParam));
        storeTokens(tokens);
        setConnected(true);
        toast.success("Google Calendar connected!");
      } catch {
        toast.error("Failed to parse auth tokens");
      }
      window.history.replaceState({}, "", "/calendar");
    } else {
      setConnected(isGoogleConnected());
    }
  }, []);

  // ─── Load events ─────────────────────────────────────
  const loadEvents = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      if (view === "month") {
        const data = await getMonthEvents(year, month);
        setEvents(data);
      } else if (view === "week") {
        const ws = getWeekStart(focusDate);
        const we = new Date(ws);
        we.setDate(we.getDate() + 7);
        const data = await getCalendarEvents(ws.toISOString(), we.toISOString());
        setEvents(data);
      } else if (view === "day") {
        const ds = new Date(focusDate);
        ds.setHours(0, 0, 0, 0);
        const de = new Date(ds);
        de.setDate(de.getDate() + 1);
        const data = await getCalendarEvents(ds.toISOString(), de.toISOString());
        setEvents(data);
      } else {
        const data = await getMonthEvents(year, month);
        setEvents(data);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load events";
      toast.error(msg);
      if (msg.includes("reconnect")) setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [connected, year, month, view, focusDate]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // ─── Navigation ──────────────────────────────────────
  function handleConnect() {
    window.location.href = getGoogleAuthUrl();
  }

  function handleDisconnect() {
    disconnectGoogle();
    setConnected(false);
    setEvents([]);
    toast.success("Google Calendar disconnected");
  }

  function navigatePrev() {
    if (view === "month") {
      if (month === 0) { setMonth(11); setYear(year - 1); }
      else setMonth(month - 1);
      setSelectedDate(null);
    } else if (view === "week") {
      const d = new Date(focusDate);
      d.setDate(d.getDate() - 7);
      setFocusDate(d);
    } else if (view === "day") {
      const d = new Date(focusDate);
      d.setDate(d.getDate() - 1);
      setFocusDate(d);
    } else {
      if (month === 0) { setMonth(11); setYear(year - 1); }
      else setMonth(month - 1);
    }
  }

  function navigateNext() {
    if (view === "month") {
      if (month === 11) { setMonth(0); setYear(year + 1); }
      else setMonth(month + 1);
      setSelectedDate(null);
    } else if (view === "week") {
      const d = new Date(focusDate);
      d.setDate(d.getDate() + 7);
      setFocusDate(d);
    } else if (view === "day") {
      const d = new Date(focusDate);
      d.setDate(d.getDate() + 1);
      setFocusDate(d);
    } else {
      if (month === 11) { setMonth(0); setYear(year + 1); }
      else setMonth(month + 1);
    }
  }

  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setFocusDate(now);
    setSelectedDate(todayKey);
  }

  // ─── Navigation title ────────────────────────────────
  function getNavTitle(): string {
    if (view === "month" || view === "agenda") return `${MONTH_NAMES[month]} ${year}`;
    if (view === "week") {
      const ws = getWeekStart(focusDate);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(ws)} \u2013 ${fmt(we)}, ${we.getFullYear()}`;
    }
    return focusDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  // ─── Group events by date ────────────────────────────
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = getEventDateKey(ev);
    if (!eventsByDate[key]) eventsByDate[key] = [];
    eventsByDate[key].push(ev);
  }

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];
  const sortedDates = Object.keys(eventsByDate).sort();

  // ─── Month grid data ─────────────────────────────────
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // ─── Week data ───────────────────────────────────────
  const weekStart = getWeekStart(focusDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // ─── Event count — background tasks don't count ──────
  const BACKGROUND_TASKS = new Set(["Heartbeat", "System Health", "Medic"]);
  const userTasks = cronJobs.filter((j) => !BACKGROUND_TASKS.has(j.name));
  const totalItems = events.length + (showCrons ? userTasks.length : 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <CalendarIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
              <p className="text-sm text-muted-foreground">
                {connected
                  ? `${totalItems} items`
                  : `${userTasks.length} scheduled tasks`}
                {showCrons && userTasks.length > 0 && (
                  <span className="text-cyan-400/60"> ({userTasks.length} tasks)</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg ring-1 ring-white/[0.08] overflow-hidden">
              {(["month", "week", "day", "agenda"] as ViewMode[]).map((v) => {
                const Icon = VIEW_ICONS[v];
                return (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    title={v.charAt(0).toUpperCase() + v.slice(1)}
                    className={cn(
                      "px-2.5 py-1.5 text-xs font-medium transition-colors",
                      view === v
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-white/[0.04]"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>

            {/* Cron toggle */}
            <button
              onClick={() => setShowCrons(!showCrons)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium ring-1 ring-white/[0.08] transition-colors",
                showCrons
                  ? "bg-cyan-500/15 text-cyan-400"
                  : "text-muted-foreground hover:bg-white/[0.04]"
              )}
              title="Toggle scheduled tasks"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            {connected ? (
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="text-xs">
                <Unplug className="h-3 w-3 mr-1.5" />
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnect}>
                <Plug className="h-3 w-3 mr-1.5" />
                Connect Google
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Navigation bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={navigatePrev} className="p-2 rounded-lg hover:bg-white/[0.04] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={navigateNext} className="p-2 rounded-lg hover:bg-white/[0.04] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-xs font-medium ring-1 ring-white/[0.08] hover:bg-white/[0.04] text-muted-foreground hover:text-foreground transition-colors">
            Today
          </button>
        </div>
        <h2 className="text-lg font-semibold">{getNavTitle()}</h2>
      </div>

      {loading ? (
        <Card className="animate-pulse">
          <CardContent className="py-20 text-center text-muted-foreground">Loading...</CardContent>
        </Card>
      ) : view === "month" ? (
        /* ─── MONTH VIEW ──────────────────────────────── */
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square p-1" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dk = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate[dk] || [];
                  const isToday = dk === todayKey;
                  const isSelected = dk === selectedDate;
                  const hasCrons = showCrons && cronJobs.length > 0;
                  return (
                    <button
                      key={day}
                      onClick={() => {
                        setSelectedDate(selectedDate === dk ? null : dk);
                        setFocusDate(new Date(year, month, day));
                      }}
                      className={cn(
                        "aspect-square p-1 rounded-lg transition-all duration-150 relative",
                        "hover:bg-white/[0.04]",
                        isSelected && "bg-primary/10 ring-1 ring-primary/25",
                        isToday && !isSelected && "ring-1 ring-primary/15"
                      )}
                    >
                      <span className={cn("text-xs font-medium", isToday ? "text-primary font-bold" : "text-foreground/70")}>{day}</span>
                      {(dayEvents.length > 0 || hasCrons) && (
                        <div className="flex gap-0.5 justify-center mt-0.5 flex-wrap">
                          {dayEvents.slice(0, 2).map((ev, j) => (
                            <span key={j} className={cn("h-1 w-1 rounded-full", ev.colorId ? getEventColor(ev.colorId).split(" ")[0] : "bg-primary")} />
                          ))}
                          {hasCrons && <span className="h-1 w-1 rounded-full bg-cyan-400" />}
                          {dayEvents.length > 2 && <span className="text-[7px] text-muted-foreground">+{dayEvents.length - 2}</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {selectedDate && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </CardTitle>
                  <button
                    onClick={() => { setFocusDate(new Date(selectedDate + "T12:00:00")); setView("day"); }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    View day &rarr;
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedEvents.length === 0 && (!showCrons || cronJobs.length === 0) && (
                  <p className="text-sm text-muted-foreground italic py-2">No events this day</p>
                )}
                {selectedEvents.map((ev) => <EventCard key={ev.id} event={ev} />)}
                {showCrons && cronJobs.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.06]">
                      <RefreshCw className="h-3 w-3 text-cyan-400/60" />
                      <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wide">Always Running</span>
                    </div>
                    {cronJobs.map((cron) => <CronCard key={cron.name} cron={cron} />)}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

      ) : view === "week" ? (
        /* ─── WEEK VIEW ───────────────────────────────── */
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((wd) => {
                const dk = dateKey(wd);
                const dayEvents = eventsByDate[dk] || [];
                const isToday = dk === todayKey;
                return (
                  <div key={dk} className="min-h-[200px]">
                    <button
                      onClick={() => { setFocusDate(wd); setView("day"); }}
                      className={cn(
                        "w-full text-center py-1.5 rounded-lg mb-2 transition-colors hover:bg-white/[0.04]",
                        isToday && "bg-primary/10 ring-1 ring-primary/20"
                      )}
                    >
                      <p className="text-[10px] text-muted-foreground/60 uppercase">{DAY_NAMES[wd.getDay()]}</p>
                      <p className={cn("text-sm font-semibold", isToday ? "text-primary" : "text-foreground/80")}>{wd.getDate()}</p>
                    </button>
                    <div className="space-y-1">
                      {dayEvents.map((ev) => (
                        <div key={ev.id} className={cn("rounded px-1.5 py-1 text-[10px] border truncate", getEventColor(ev.colorId))}>
                          <span className="font-medium">{formatEventTime(ev)}</span>{" "}
                          <span className="opacity-80">{ev.summary}</span>
                        </div>
                      ))}
                      {showCrons && userTasks.length > 0 && dayEvents.length === 0 && (
                        <div className="text-[9px] text-cyan-400/50 px-1">
                          {userTasks.length} tasks
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {showCrons && cronJobs.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5 mb-2">
                  <RefreshCw className="h-3 w-3 text-cyan-400/60" />
                  <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wide">Always Running (Background Tasks)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {cronJobs.map((cron) => <CronCard key={cron.name} cron={cron} compact />)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      ) : view === "day" ? (
        /* ─── DAY VIEW ────────────────────────────────── */
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-white/[0.04]">
                {HOURS.map((h) => {
                  const hourEvents = events.filter((ev) => getEventHour(ev) === h);
                  return (
                    <div key={h} className="flex min-h-[48px]">
                      <div className="w-16 shrink-0 py-2 pr-3 text-right">
                        <span className="text-[10px] text-muted-foreground/50">{formatHour(h)}</span>
                      </div>
                      <div className="flex-1 py-1 px-2 border-l border-white/[0.04] space-y-1">
                        {hourEvents.map((ev) => (
                          <EventCard key={ev.id} event={ev} compact />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {showCrons && cronJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
                  Always Running (Background Tasks)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {cronJobs.map((cron) => <CronCard key={cron.name} cron={cron} />)}
              </CardContent>
            </Card>
          )}
        </div>

      ) : (
        /* ─── AGENDA VIEW ─────────────────────────────── */
        <div className="space-y-4">
          {showCrons && cronJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
                  Always Running (Background Tasks)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {cronJobs.map((cron) => <CronCard key={cron.name} cron={cron} />)}
              </CardContent>
            </Card>
          )}
          {sortedDates.length === 0 && !showCrons ? (
            <Card className="py-10">
              <CardContent className="text-center text-muted-foreground">No events this month</CardContent>
            </Card>
          ) : (
            sortedDates.map((dk) => (
              <div key={dk}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                    {new Date(dk + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  {dk === todayKey && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/25 text-[10px]">Today</Badge>
                  )}
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
                <div className="space-y-2 ml-2">
                  {eventsByDate[dk].map((ev) => <EventCard key={ev.id} event={ev} />)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Not connected hint (show below content if crons are displayed) */}
      {!connected && cronJobs.length === 0 && (
        <Card className="py-16 mt-4">
          <CardContent className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15 mb-4">
              <CalendarIcon className="h-8 w-8 text-primary/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Connect Google Calendar</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Link your Google Calendar to view events alongside scheduled tasks.
            </p>
            <Button onClick={handleConnect}>
              <Plug className="h-4 w-4 mr-2" />
              Connect with Google
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Event Card ──────────────────────────────────────────
function EventCard({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  const colorClass = getEventColor(event.colorId);

  if (compact) {
    return (
      <div className={cn("rounded px-2 py-1.5 text-xs border", colorClass)}>
        <span className="font-medium">{event.summary || "Untitled"}</span>
        <span className="opacity-60 ml-2">{formatEventTime(event)}</span>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-sm transition-colors", colorClass)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{event.summary || "Untitled"}</p>
          <div className="flex items-center gap-3 mt-1 text-xs opacity-80">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatEventTime(event)}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </div>
        </div>
        {event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 rounded hover:bg-white/[0.1] transition-colors">
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {event.description && (
        <p className="text-xs opacity-60 mt-1.5 line-clamp-2">{event.description}</p>
      )}
    </div>
  );
}

// ─── Cron Group Colors (matches crons page) ─────────────
const CRON_GROUP_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  System:    { bg: "bg-blue-500/10",    text: "text-blue-300",    border: "border-blue-500/20",    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  Core:      { bg: "bg-emerald-500/10", text: "text-emerald-300", border: "border-emerald-500/20", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  Analytics: { bg: "bg-purple-500/10",  text: "text-purple-300",  border: "border-purple-500/20",  badge: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  Social:    { bg: "bg-pink-500/10",    text: "text-pink-300",    border: "border-pink-500/20",    badge: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  Trading:   { bg: "bg-orange-500/10",  text: "text-orange-300",  border: "border-orange-500/20",  badge: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  Health:    { bg: "bg-green-500/10",   text: "text-green-300",   border: "border-green-500/20",   badge: "bg-green-500/15 text-green-400 border-green-500/30" },
};
const DEFAULT_CRON_COLOR = { bg: "bg-cyan-500/10", text: "text-cyan-300", border: "border-cyan-500/20", badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };

function getCronColor(group: string) {
  return CRON_GROUP_COLORS[group] || DEFAULT_CRON_COLOR;
}

// ─── Cron Card ───────────────────────────────────────────
function CronCard({ cron, compact }: { cron: CronJob; compact?: boolean }) {
  const times = parseCronTimes(cron.schedule);
  const c = getCronColor(cron.group);

  if (compact) {
    return (
      <div className={cn("rounded border px-2 py-1.5 text-[10px]", c.bg, c.text, c.border)}>
        <p className="font-medium truncate">{cron.name}</p>
        <p className="opacity-60">{times.join(", ")}</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-sm", c.bg, c.text, c.border)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{cron.name}</p>
          <div className="flex items-center gap-3 mt-1 text-xs opacity-80">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {times.join(", ")}
            </span>
            <span className="truncate">{cron.description}</span>
          </div>
        </div>
        <Badge variant="outline" className={cn("text-[9px] shrink-0", c.badge)}>
          {cron.group}
        </Badge>
      </div>
    </div>
  );
}
