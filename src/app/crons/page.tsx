"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Terminal,
  Shield,
  Cpu,
  BarChart3,
  Timer,
  TrendingUp,
  HeartPulse,
  CircleHelp,
} from "lucide-react";

interface CronJob {
  name: string;
  description: string;
  group: string;
  schedule: string;
  log_file: string | null;
  last_log: string | null;
  last_log_time: string | null;
}

const GROUP_ICONS: Record<string, React.ElementType> = {
  System: Shield,
  Core: Cpu,
  Analytics: BarChart3,
  Social: Timer,
  Trading: TrendingUp,
  Health: HeartPulse,
  Other: CircleHelp,
};

function groupColor(group: string) {
  switch (group) {
    case "System":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "Core":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "Analytics":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "Social":
      return "bg-pink-500/15 text-pink-400 border-pink-500/30";
    case "Trading":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "Health":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function timeAgo(ts: string): string {
  if (!ts) return "";
  const now = Date.now();
  const then = new Date(ts.replace(" ", "T") + (ts.includes("+") || ts.includes("Z") ? "" : "Z")).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (isNaN(diff) || diff < 0) return ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function CronCard({ job }: { job: CronJob }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = GROUP_ICONS[job.group] || CircleHelp;

  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary/40"
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{job.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={groupColor(job.group)}>
              {job.group}
            </Badge>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {job.description}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <code className="text-xs bg-primary/8 text-primary border border-primary/20 px-2.5 py-1 rounded font-mono">
            {job.schedule}
          </code>
          {job.last_log_time && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(job.last_log_time)}
            </span>
          )}
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border space-y-3">
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Schedule</span>
                <span className="font-mono font-medium">{job.schedule}</span>
              </div>
              {job.log_file && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Log File</span>
                  <span className="font-mono font-medium text-[11px]">{job.log_file}</span>
                </div>
              )}
              {job.last_log_time && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Run</span>
                  <span className="font-medium">{job.last_log_time}</span>
                </div>
              )}
            </div>

            {job.last_log ? (
              <div className="rounded-lg bg-card border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Last Log Output
                  </span>
                </div>
                <p className="text-xs font-mono text-foreground break-all leading-relaxed">
                  {job.last_log}
                </p>
                {job.last_log_time && (
                  <p className="text-[11px] text-muted-foreground">{job.last_log_time}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No log output available
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CronsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/proxy?path=/api/crons");
        const data = await res.json();
        setJobs(data.jobs || []);
      } catch {
        setError("Could not connect to Harv API");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const groups: Record<string, number> = {};
  jobs.forEach((j) => {
    groups[j.group] = (groups[j.group] || 0) + 1;
  });
  const allGroups = ["all", ...Object.keys(groups).sort()];

  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.group === filter);

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Cron Jobs</h1>
        <p className="text-muted-foreground">
          {jobs.length} scheduled jobs
          {error && <span className="ml-2 text-yellow-500">({error})</span>}
        </p>
      </header>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold">{jobs.length}</p>
          </CardContent>
        </Card>
        {Object.entries(groups)
          .sort((a, b) => b[1] - a[1])
          .map(([g, c]) => (
            <Card key={g}>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{g}</p>
                <p className="text-2xl font-bold">{c}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {allGroups.map((g) => (
          <button
            key={g}
            onClick={() => setFilter(g)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              filter === g
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {g === "all" ? "All" : g}
          </button>
        ))}
      </div>

      {/* Cron grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-4 w-24 mt-3" />
                </CardContent>
              </Card>
            ))
          : filtered.map((job) => <CronCard key={job.name} job={job} />)}
      </div>
    </div>
  );
}
