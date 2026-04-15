"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GraduationCap,
  BookOpen,
  Flame,
  Trophy,
  Clock,
  Plus,
  Sparkles,
  ListTodo,
  FileText,
  Brain,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AgentChat, type AgentChatHandle } from "@/components/agent-chat";
import {
  getLearningStats,
  listRecentSessions,
  listTracks,
  type LearningTrack,
  type LearningSession,
} from "@/lib/supabase-learning";

const LEVEL_COLORS: Record<string, string> = {
  beginner: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
  intermediate: "text-amber-400 bg-amber-500/10 ring-amber-500/20",
  advanced: "text-rose-400 bg-rose-500/10 ring-rose-500/20",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Complete",
};

export default function LearningPage() {
  const chatRef = useRef<AgentChatHandle>(null);
  const [tracks, setTracks] = useState<LearningTrack[]>([]);
  const [sessions, setSessions] = useState<(LearningSession & { track_topic?: string })[]>([]);
  const [stats, setStats] = useState({ totalHours: 0, activeTracks: 0, completedTracks: 0, streakDays: 0 });
  const [loaded, setLoaded] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [t, s, stat] = await Promise.all([
        listTracks(),
        listRecentSessions(8),
        getLearningStats(),
      ]);
      setTracks(t);
      setSessions(s);
      setStats(stat);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const ask = useCallback(
    async (message: string) => {
      if (!chatRef.current) return;
      setSending(true);
      try {
        await chatRef.current.send(message);
      } finally {
        setSending(false);
        // Refresh after any chat action in case it changed tracks/sessions
        setTimeout(refresh, 800);
      }
    },
    [refresh],
  );

  function startNewTopic() {
    const t = newTopic.trim();
    if (!t) {
      toast.error("Enter a topic to learn");
      return;
    }
    setNewTopic("");
    ask(`I want to learn ${t}`);
  }

  const quickActions: { label: string; icon: typeof Sparkles; query: (t: string) => string; color: string }[] = [
    { label: "Study Guide", icon: FileText, query: (t) => `study guide on ${t}`, color: "text-sky-400" },
    { label: "Flashcards", icon: Brain, query: (t) => `flashcards for ${t}`, color: "text-violet-400" },
    { label: "Quiz Me", icon: Sparkles, query: (t) => `quiz me on ${t}`, color: "text-amber-400" },
    { label: "Resources", icon: BookOpen, query: (t) => `best resources for ${t}`, color: "text-emerald-400" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/20">
            <GraduationCap className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Learning</h1>
            <p className="text-sm text-muted-foreground">
              Pick any topic — get guides, flashcards, quizzes, and track your progress
            </p>
          </div>
        </div>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Clock} label="Hours logged" value={stats.totalHours.toFixed(1)} color="text-sky-400" />
        <StatCard icon={ListTodo} label="Active tracks" value={String(stats.activeTracks)} color="text-indigo-400" />
        <StatCard icon={Trophy} label="Completed" value={String(stats.completedTracks)} color="text-emerald-400" />
        <StatCard icon={Flame} label="Day streak" value={String(stats.streakDays)} color="text-amber-400" />
      </div>

      {/* Start new topic */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-400" />
            Start a new topic
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="e.g., Options pricing, Rust ownership, FINRA SIE exam..."
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  startNewTopic();
                }
              }}
              className="flex-1 min-w-[220px]"
              disabled={sending}
            />
            <Button onClick={startNewTopic} disabled={sending || !newTopic.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              Generate outline
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-2">
            Creates a track with a study outline you can expand with guides, flashcards, and quizzes.
          </p>
        </CardContent>
      </Card>

      {/* Active tracks */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 px-1">Your tracks</h2>
        {!loaded ? (
          <Card>
            <CardContent className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
            </CardContent>
          </Card>
        ) : tracks.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <GraduationCap className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground/60">No tracks yet. Start one above.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tracks.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                disabled={sending}
                onAction={(q) => ask(q)}
                actions={quickActions}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent sessions */}
      {loaded && sessions.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlayCircle className="h-3.5 w-3.5 text-indigo-400/60 shrink-0" />
                    <span className="truncate text-foreground/80">{s.track_topic || "Track"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{Number(s.hours).toFixed(1)}h</span>
                    <span className="text-[10px]">{new Date(s.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat with Learning agent */}
      <AgentChat
        ref={chatRef}
        agentName="Learning"
        placeholder="Ask anything, generate material, log a session..."
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("h-3.5 w-3.5", color)} />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
        </div>
        <div className="text-xl font-semibold tabular-nums truncate">{value}</div>
      </CardContent>
    </Card>
  );
}

function TrackCard({
  track,
  disabled,
  onAction,
  actions,
}: {
  track: LearningTrack;
  disabled: boolean;
  onAction: (q: string) => void;
  actions: { label: string; icon: typeof Sparkles; query: (t: string) => string; color: string }[];
}) {
  const levelClass = LEVEL_COLORS[track.level] || LEVEL_COLORS.beginner;
  return (
    <Card className="flex flex-col">
      <CardContent className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{track.topic}</h3>
            {track.description && (
              <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-0.5">{track.description}</p>
            )}
          </div>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full ring-1", levelClass)}>
            {track.level}
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{STATUS_LABEL[track.status] || track.status}</span>
            <span>
              {track.progress_pct}% • {Number(track.hours_logged || 0).toFixed(1)}h
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                track.status === "completed" ? "bg-emerald-500/70" : "bg-indigo-500/70",
              )}
              style={{ width: `${Math.max(2, track.progress_pct)}%` }}
            />
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-1.5 mt-auto">
          {actions.map(({ label, icon: Icon, query, color }) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              className="h-8 text-[11px] justify-start px-2"
              disabled={disabled}
              onClick={() => onAction(query(track.topic))}
            >
              <Icon className={cn("h-3 w-3 mr-1.5", color)} />
              {label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
