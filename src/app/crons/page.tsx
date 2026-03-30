"use client";

import { useEffect, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap, Clock, Heart, Shield, BarChart3, Mail, Calendar,
  FileText, Trash2, HardDrive, ChevronDown, Plus,
  Newspaper, CalendarCheck, Inbox, Share2, Database, Wrench,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { getCustomAutomations, toggleCustomAutomation, deleteCustomAutomation } from "@/lib/preferences";
import type { CustomAutomation } from "@/lib/preferences";

// ─── Types ──────────────────────────────────────────────

interface CronJob {
  name: string;
  description: string;
  group: string;
  schedule: string;
  last_log_time: string | null;
}

// ─── Human-readable names for backend crons ─────────────

const CRON_DISPLAY: Record<string, { name: string; description: string; icon: React.ElementType; color: string; scheduleOverride?: string }> = {
  Heartbeat: { name: "System Heartbeat", description: "System pulse — runs health checks, processes tasks, and syncs data", icon: Heart, color: "text-red-400", scheduleOverride: "Every 90 minutes" },
  "System Health": { name: "Health Monitor", description: "Monitors system resources and alerts you if something needs attention", icon: Shield, color: "text-blue-400" },
  Medic: { name: "Error Scanner", description: "Called by Guardian when issues are found", icon: Wrench, color: "text-green-400", scheduleOverride: "On demand" },
  "Daily Digest": { name: "Daily Briefing", description: "Morning summary of yesterday's activity, conversations, and key events", icon: Newspaper, color: "text-purple-400" },
};

// Legacy/admin crons (hidden from main view)
const ADMIN_CRONS = new Set(["Daily Backup", "Daily Backups", "VPS Snapshot", "VPS Snapshots", "Weekly Archive", "Weekly Archives", "Dependency Updates", "Daily Digest"]);

// System crons — shown in collapsible "System" section
const SYSTEM_CRONS = new Set(["Heartbeat", "System Health", "Medic"]);

// ─── Automation templates ───────────────────────────────

const TEMPLATES = [
  { id: "daily-briefing", name: "Daily Briefing", description: "Get a morning summary of your team's activity", schedule: "Daily at 8 AM", icon: Newspaper, color: "text-purple-400" },
  { id: "weekly-report", name: "Weekly Report", description: "Automated weekly performance report via email", schedule: "Fridays at 5 PM", icon: BarChart3, color: "text-emerald-400" },
  { id: "calendar-reminder", name: "Calendar Reminder", description: "Daily agenda sent to you each morning", schedule: "Daily at 7 AM", icon: CalendarCheck, color: "text-sky-400" },
  { id: "inbox-cleanup", name: "Inbox Cleanup", description: "Auto-archive old emails and organize labels", schedule: "Daily at midnight", icon: Inbox, color: "text-amber-400" },
  { id: "social-post", name: "Social Post", description: "Schedule automated social media updates", schedule: "Custom", icon: Share2, color: "text-pink-400" },
  { id: "data-backup", name: "Data Backup", description: "Archive old conversations to keep things tidy", schedule: "Weekly on Sunday", icon: Database, color: "text-violet-400" },
];

// ─── Schedule formatter ─────────────────────────────────

function formatSchedule(cron: string): string {
  if (!cron) return "Not scheduled";
  // Detect common patterns
  if (cron.includes("*/15")) return "Every 15 minutes";
  if (cron.includes("*/30")) return "Every 30 minutes";
  if (cron.includes("*/5")) return "Every 5 minutes";

  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;

  const [min, hour, dom, , dow] = parts;

  // Every N hours
  if (hour.includes(",") && min !== "*") {
    const hours = hour.split(",");
    if (hours.length >= 4) {
      const diff = parseInt(hours[1]) - parseInt(hours[0]);
      if (diff > 0) return `Every ${diff} hours`;
    }
  }
  if (hour.includes("/")) {
    const interval = parseInt(hour.split("/")[1]);
    return `Every ${interval} hours`;
  }

  // Specific daily time
  if (dom === "*" && hour !== "*" && min !== "*") {
    const h = parseInt(hour);
    const m = parseInt(min);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const time = `${displayH}:${m.toString().padStart(2, "0")} ${period}`;

    if (dow === "*") return `Daily at ${time}`;
    if (dow === "1-5") return `Weekdays at ${time}`;
    if (dow === "0" || dow === "7") return `Sundays at ${time}`;
    if (dow === "5") return `Fridays at ${time}`;
    return `${time}`;
  }

  // 90-minute heartbeat pattern
  if (cron.length > 30) return "Every 90 minutes";

  return cron;
}

function isOverdue(lastRun: string | null, schedule: string): boolean {
  if (!lastRun) return false;
  const elapsed = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60);
  // If schedule says every N minutes/hours, check if last run is 3x overdue
  const formatted = formatSchedule(schedule);
  if (formatted.includes("15 min")) return elapsed > 60;
  if (formatted.includes("30 min")) return elapsed > 90;
  if (formatted.includes("90 min")) return elapsed > 270;
  if (formatted.includes("hour")) return elapsed > 540;
  if (formatted.includes("Daily")) return elapsed > 60 * 36;
  return false;
}

// ─── Main Component ─────────────────────────────────────

export default function AutomationsPage() {
  const { isAdmin } = useAuth();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [customAutomations, setCustomAutomations] = useState<CustomAutomation[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/proxy?path=/api/crons/");
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs || []);
        } else {
          setError("Could not load automations");
        }
      } catch {
        setError("Could not connect to Harv API");
      } finally {
        setLoading(false);
      }
    }
    load();
    setCustomAutomations(getCustomAutomations());
  }, []);

  // Ensure Medic always appears in system jobs even if not in API
  const allJobs = jobs.some((j) => j.name === "Medic")
    ? jobs
    : [...jobs, { name: "Medic", description: "Called by Guardian", group: "System", schedule: "on-demand", last_log_time: null }];

  const activeJobs = allJobs.filter((j) => !ADMIN_CRONS.has(j.name) && !SYSTEM_CRONS.has(j.name));
  const systemJobs = allJobs.filter((j) => SYSTEM_CRONS.has(j.name));
  const adminJobs = jobs.filter((j) => ADMIN_CRONS.has(j.name));
  const isAdminUser = isAdmin;

  const counts = {
    total: activeJobs.length + customAutomations.length,
    active: activeJobs.length + customAutomations.length,
    templates: TEMPLATES.length,
  };

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
              <p className="text-sm text-muted-foreground">Scheduled tasks and workflows</p>
            </div>
          </div>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary text-sm font-medium transition-colors ring-1 ring-primary/20"
          >
            <Plus className="h-4 w-4" />
            New Automation
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Active</p>
            <p className="text-2xl font-bold text-primary mt-0.5">{counts.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Available</p>
            <p className="text-2xl font-bold text-muted-foreground mt-0.5">+{counts.templates}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Status</p>
            <p className="text-2xl font-bold text-emerald-400 mt-0.5">{error ? "Error" : "Running"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Active Automations */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Active Automations</h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(3)].map((_, i) => (
              <Card key={i}><CardContent className="pt-5 pb-4 space-y-3">
                <Skeleton className="h-5 w-40" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-24" />
              </CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 items-start">
            {activeJobs.map((job) => {
              const display = CRON_DISPLAY[job.name] || {
                name: job.name,
                description: job.description,
                icon: Zap,
                color: "text-foreground",
              };
              const Icon = display.icon;
              return (
                <Card key={job.name} className="transition-all duration-300 hover:ring-primary/15">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08]")}>
                          <Icon className={cn("h-4.5 w-4.5", display.color)} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{display.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{display.description}</p>
                        </div>
                      </div>
                      {/* Toggle */}
                      <button
                        onClick={() => toast.info("Automation toggle coming soon")}
                        className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full bg-emerald-500 transition-colors duration-200 mt-1"
                      >
                        <span className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transform translate-x-4.5 mt-0.5 ml-0.5 transition-transform duration-200" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {formatSchedule(job.schedule)}
                      </span>
                      {job.last_log_time && (
                        <span className="flex items-center gap-1.5">
                          Last: {timeAgo(job.last_log_time)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Custom automations */}
            {customAutomations.map((auto) => (
              <Card key={auto.id} className="transition-all duration-300 hover:ring-primary/15">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <Zap className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{auto.name}</p>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[9px]">Custom</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{auto.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { deleteCustomAutomation(auto.id); setCustomAutomations(getCustomAutomations()); toast.success("Automation deleted"); }}
                        className="p-1 rounded text-muted-foreground/30 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setCustomAutomations(toggleCustomAutomation(auto.id))}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                          auto.enabled ? "bg-emerald-500" : "bg-white/[0.15]"
                        )}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transform transition-transform duration-200",
                          auto.enabled ? "translate-x-4.5 mt-0.5 ml-0.5" : "translate-x-0.5 mt-0.5"
                        )} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {auto.schedule}
                    </span>
                    <span>by {auto.agent}</span>
                  </div>
                </CardContent>
              </Card>
            ))}

            {activeJobs.length === 0 && customAutomations.length === 0 && !loading && (
              <div className="col-span-2 text-center py-12 text-muted-foreground">
                <Zap className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No active automations</p>
                <p className="text-xs mt-1">Click &quot;New Automation&quot; to get started</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Always Running — background tasks */}
      {systemJobs.length > 0 && (
        <details className="group" open>
          <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors py-2">
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            Always Running ({systemJobs.length})
          </summary>
          <div className="grid gap-4 sm:grid-cols-2 items-start mt-3">
            {systemJobs.map((job) => {
              const display = CRON_DISPLAY[job.name] || {
                name: job.name, description: job.description, icon: Zap, color: "text-foreground",
              };
              const Icon = display.icon;
              return (
                <Card key={job.name} className="transition-all duration-300 hover:ring-primary/15">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08]">
                          <Icon className={cn("h-4.5 w-4.5", display.color)} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{display.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{display.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toast.info("Automation toggle coming soon")}
                        className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full bg-emerald-500 transition-colors duration-200 mt-1"
                      >
                        <span className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transform translate-x-4.5 mt-0.5 ml-0.5 transition-transform duration-200" />
                      </button>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {display.scheduleOverride || formatSchedule(job.schedule)}
                      </span>
                      {job.last_log_time && (
                        <span>Last: {timeAgo(job.last_log_time)}</span>
                      )}
                      {isOverdue(job.last_log_time, job.schedule) && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] ml-auto">Overdue</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </details>
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTemplates(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-card/95 backdrop-blur-2xl ring-1 ring-white/[0.1] shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/[0.06]">
              <div>
                <h2 className="text-lg font-semibold">New Automation</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Choose a template to get started</p>
              </div>
              <button
                onClick={() => setShowTemplates(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            {/* Template grid */}
            <div className="p-6 grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { toast.info(`${t.name} — available in Pro plan`); setShowTemplates(false); }}
                  className="flex items-start gap-3 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-primary/20 hover:bg-white/[0.06] p-4 text-left transition-all duration-200"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08]">
                    <t.icon className={cn("h-4.5 w-4.5", t.color)} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t.schedule}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1.5 leading-relaxed">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom automation CTA */}
            <div className="px-6 pb-6">
              <button
                onClick={() => { setShowTemplates(false); window.location.href = "/agents/Automation%20Builder"; }}
                className="w-full flex flex-col items-center gap-2 rounded-xl bg-primary/8 hover:bg-primary/15 ring-1 ring-primary/15 p-5 transition-all duration-200"
              >
                <div className="flex items-center gap-2 text-primary font-medium text-sm">
                  <Zap className="h-4 w-4" />
                  Create Custom Automation
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Ask Harv to build a custom automation tailored to your workflow
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin section */}
      {isAdmin && adminJobs.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-2">
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            System Administration ({adminJobs.length})
          </summary>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            {adminJobs.map((job) => (
              <Card key={job.name} className="opacity-60">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{job.name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatSchedule(job.schedule)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Admin</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
