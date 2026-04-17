"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Video,
  Loader2,
  Play,
  FileText,
  Wrench,
  Lightbulb,
  Link as LinkIcon,
  ExternalLink,
  Eye,
  Copy,
  Check,
  History as HistoryIcon,
  ChevronDown,
  Trash2,
  Download,
  HelpCircle,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { cn, timeAgo } from "@/lib/utils";
import { MarkdownMessage } from "@/components/chat/markdown-message";

type Mode = "digest" | "implement" | "multi" | "visual";

type HistoryEntry = {
  id: string;
  mode: Mode;
  url: string;
  multiUrls?: string;
  response: string;
  createdAt: string;
  videoTitle?: string;
  videoThumb?: string;
};

type VideoMeta = {
  title?: string;
  thumb?: string;
  author?: string;
};

const HISTORY_KEY = "digest-history-v1";
const MAX_HISTORY = 10;

const MODE_META: Record<Mode, { label: string; icon: React.ComponentType<{ className?: string }>; desc: string; cta: string; Icon: React.ComponentType<{ className?: string }> }> = {
  digest: { label: "Digest", icon: FileText, desc: "Summarize & break into sections", cta: "Digest Video", Icon: Play },
  implement: { label: "Implement", icon: Wrench, desc: "Open a Claude Code session that implements it into Harv", cta: "Implement in Claude Code", Icon: Wrench },
  visual: { label: "Visual", icon: Eye, desc: "Read what's on screen (Gemini VLM)", cta: "Analyze Visually", Icon: Eye },
  multi: { label: "Multi-Video", icon: Lightbulb, desc: "Synthesize ideas from multiple videos", cta: "Synthesize Ideas", Icon: Lightbulb },
};

const PROGRESS_STEPS_BY_MODE: Record<Mode, { at: number; label: string }[]> = {
  digest: [
    { at: 0, label: "Fetching video metadata…" },
    { at: 4, label: "Downloading audio…" },
    { at: 12, label: "Transcribing audio…" },
    { at: 28, label: "Analyzing content…" },
    { at: 40, label: "Writing digest…" },
  ],
  implement: [
    { at: 0, label: "Fetching video metadata…" },
    { at: 4, label: "Downloading audio…" },
    { at: 12, label: "Transcribing audio…" },
    { at: 28, label: "Planning implementation steps…" },
    { at: 42, label: "Writing guide…" },
  ],
  visual: [
    { at: 0, label: "Fetching video metadata…" },
    { at: 4, label: "Downloading video…" },
    { at: 15, label: "Analyzing video frames…" },
    { at: 32, label: "Analyzing visuals…" },
    { at: 48, label: "Writing analysis…" },
  ],
  multi: [
    { at: 0, label: "Fetching videos…" },
    { at: 8, label: "Downloading audio tracks…" },
    { at: 22, label: "Transcribing each…" },
    { at: 42, label: "Finding common themes…" },
    { at: 58, label: "Writing synthesis…" },
  ],
};

// Regex: extract numbered headings from digest output to surface follow-up actions.
// Matches "## 1. Title", "## Section 2: Title", "### 3) Title", etc.
const SECTION_RE = /^#{1,4}\s*(?:Section\s+)?(\d+)[.:)]\s+(.+?)\s*$/gim;

function extractSections(md: string): { n: number; title: string }[] {
  const found = new Map<number, string>();
  let m: RegExpExecArray | null;
  SECTION_RE.lastIndex = 0;
  while ((m = SECTION_RE.exec(md)) !== null) {
    const n = parseInt(m[1], 10);
    if (!found.has(n) && n >= 1 && n <= 12) {
      found.set(n, m[2].replace(/\*+/g, "").trim());
    }
  }
  return Array.from(found.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([n, title]) => ({ n, title }));
}

function detectPlatform(urlStr: string): string {
  if (urlStr.includes("youtube.com") || urlStr.includes("youtu.be")) return "YouTube";
  if (urlStr.includes("tiktok.com")) return "TikTok";
  if (urlStr.includes("twitter.com") || urlStr.includes("x.com")) return "Twitter/X";
  return "Video";
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // localStorage full or unavailable
  }
}

export default function DigestPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [url, setUrl] = useState("");
  const [multiUrls, setMultiUrls] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("digest");
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(true);
  const [sendingToClaude, setSendingToClaude] = useState(false);
  const [claudeSessionUrl, setClaudeSessionUrl] = useState<string | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const metaDebounce = useRef<NodeJS.Timeout | null>(null);

  // Load history on mount, collapse how-to if there is any
  useEffect(() => {
    const h = loadHistory();
    setHistory(h);
    if (h.length > 0) setHowToOpen(false);
  }, []);

  // Fetch video metadata (debounced) when a valid URL is typed
  useEffect(() => {
    if (metaDebounce.current) clearTimeout(metaDebounce.current);
    if (mode === "multi" || !url.trim()) {
      setVideoMeta(null);
      return;
    }
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setVideoMeta(null);
      return;
    }
    metaDebounce.current = setTimeout(async () => {
      setMetaLoading(true);
      try {
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        if (data.error) {
          setVideoMeta(null);
        } else {
          setVideoMeta({
            title: data.title,
            thumb: data.thumbnail_url,
            author: data.author_name,
          });
        }
      } catch {
        setVideoMeta(null);
      } finally {
        setMetaLoading(false);
      }
    }, 500);
    return () => {
      if (metaDebounce.current) clearTimeout(metaDebounce.current);
    };
  }, [url, mode]);

  // Progress animation while loading
  useEffect(() => {
    if (!loading) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      setProgressStep(0);
      setElapsed(0);
      return;
    }
    const steps = PROGRESS_STEPS_BY_MODE[mode];
    const start = Date.now();
    progressInterval.current = setInterval(() => {
      const secs = Math.floor((Date.now() - start) / 1000);
      setElapsed(secs);
      const step = steps.filter((s) => s.at <= secs).length - 1;
      setProgressStep(Math.max(0, step));
    }, 500);
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [loading, mode]);

  async function fireClaudeCodeSession(text: string) {
    const res = await fetch("/api/digest/implement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok || !data.session_url) {
      throw new Error(data.error || "Failed to start Claude Code session");
    }
    setClaudeSessionUrl(data.session_url);
    toast.success("Claude Code session started", {
      description: "Click to open and watch it work",
      action: {
        label: "Open",
        onClick: () => window.open(data.session_url, "_blank", "noopener,noreferrer"),
      },
    });
  }

  async function sendToClaudeCode() {
    if (!response.trim()) return;
    setSendingToClaude(true);
    setClaudeSessionUrl(null);
    try {
      const header = videoMeta?.title
        ? `# Implementation guide for: ${videoMeta.title}\n\n`
        : `# Implementation guide\n\n`;
      const sourceLine = url ? `Source video: ${url}\n\n` : "";
      await fireClaudeCodeSession(header + sourceLine + response);
    } catch (e) {
      toast.error(`Failed: ${String(e).slice(0, 140)}`);
    } finally {
      setSendingToClaude(false);
    }
  }

  async function implementDirectly() {
    if (!url.trim()) { toast.error("Paste a URL"); return; }
    setSendingToClaude(true);
    setClaudeSessionUrl(null);

    // Step 1: fetch transcript via VPS (Claude Code's sandbox can't reach YouTube).
    // On a cached video this is ~2s; fresh videos up to ~55s before we give up and
    // fire the routine without a transcript — Claude Code will then ask the user.
    let transcriptBlock = "";
    let videoTitle = "";
    try {
      toast.loading("Fetching transcript…", { id: "fetch-transcript" });
      const tRes = await fetch("/api/digest/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const tData = await tRes.json().catch(() => ({}));
      toast.dismiss("fetch-transcript");
      if (tRes.ok && tData.transcript && typeof tData.transcript === "string") {
        const clipped = tData.transcript.length > 50000
          ? tData.transcript.slice(0, 50000) + "\n\n[...transcript truncated at 50k chars...]"
          : tData.transcript;
        videoTitle = tData.title && tData.title !== "Unknown" ? ` (${tData.title})` : "";
        transcriptBlock = [
          ``,
          `## Transcript (pre-fetched by Harv — don't re-fetch)`,
          ``,
          `Channel: ${tData.channel || "Unknown"}  |  Title: ${tData.title || "Unknown"}  |  ${tData.length} chars`,
          ``,
          `<transcript>`,
          clipped,
          `</transcript>`,
          ``,
        ].join("\n");
      } else {
        toast.warning("Transcript unavailable — Claude Code will ask you for it", {
          description: tData.error?.slice(0, 120),
        });
      }
    } catch (e) {
      toast.dismiss("fetch-transcript");
      toast.warning("Transcript fetch errored — continuing without it");
    }

    try {
      const prompt = [
        `# Implement this video${videoTitle} into Harv — scope first, then ask`,
        ``,
        `Source: ${url.trim()}`,
        transcriptBlock,
        `**Don't write code yet.** Scope the work and ask me before touching anything.`,
        ``,
        `## Phase 1 — research (do this silently, then report)`,
        `1. **Read \`docs/HARV_SYSTEM.md\` first** — that's Harv's ground truth (what's built, what's out-of-scope, hard constraints). Use the decision tree in Section 9 when evaluating each feature from the video.`,
        transcriptBlock
          ? `2. Use the transcript above — don't try to fetch YouTube from your sandbox (it's blocked).`
          : `2. Fetch the transcript yourself (WebFetch or youtube-transcript — don't call the VPS digest agent). If your sandbox blocks YouTube, say so and ask me to paste it.`,
        `3. Enumerate the concrete techniques / features the video demonstrates.`,
        `4. For each one, apply the decision tree from HARV_SYSTEM.md §9 — flag "already have it" (ref Section 4), "out of scope" (ref Section 6), "constraint violation" (ref Section 7), or "fits launch prep" (ref Section 5). Grep \`src/lib/agent-data.ts\` for the authoritative agent list before claiming something is new.`,
        ``,
        `## Phase 2 — stop and ask me`,
        `Reply with a short plan that includes:`,
        `- Bullet list of techniques from the video, each tagged "new to Harv", "already have it", or "partial — could extend".`,
        `- **2-4 concrete options** for what to build, with trade-offs (effort, blast radius, whether anything gets replaced).`,
        `- For each option that *replaces* existing code, explicitly ask: "Keep the old X as a fallback branch / git tag / parallel module, or delete it?"`,
        `- Any ambiguities about scope, model choice, data model, or user experience you want my call on.`,
        ``,
        `Then **wait for my reply** before writing code.`,
        ``,
        `## Phase 3 — after I answer`,
        `- Before replacing or deleting any existing module, tag the current state (e.g. \`git tag pre-<feature>-<date>\`) so we can roll back without spelunking through history.`,
        `- Implement only what I approved.`,
        `- Open a PR against master with: what the video showed, what you picked, what you skipped, what was snapshotted, and how to revert.`,
        ``,
        `If the video isn't actually implementable (pure concept / marketing / vibe piece with no concrete buildable features), say so in Phase 2 and stop — don't invent busywork.`,
      ].join("\n");
      await fireClaudeCodeSession(prompt);
    } catch (e) {
      toast.error(`Failed: ${String(e).slice(0, 140)}`);
    } finally {
      setSendingToClaude(false);
    }
  }

  async function askDigest(message: string, ctx?: { url?: string; multiUrls?: string; mode: Mode }) {
    setLoading(true);
    setResponse("");
    setClaudeSessionUrl(null);
    try {
      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, agent: "Video Digest" }),
      });

      if (!res.ok) {
        throw new Error(`API ${res.status}: ${await res.text().catch(() => "")}`);
      }

      // /api/chat/agent returns either SSE (text/event-stream) or plain text.
      // Match the parser in chat-panel.tsx — res.json() does NOT work here.
      const contentType = res.headers.get("content-type") || "";
      let text = "";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamDone = false;
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";
          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === "delta") {
                text += payload.text;
              } else if (payload.type === "done") {
                text = payload.full_text || text;
                streamDone = true;
              }
            } catch {
              // skip malformed events
            }
          }
        }
      } else {
        text = await res.text();
      }

      if (!text.trim()) {
        toast.error("Empty response from Video Digest agent");
        return;
      }
      setResponse(text);

      // Save to history
      if (ctx) {
        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          mode: ctx.mode,
          url: ctx.url || "",
          multiUrls: ctx.multiUrls,
          response: text,
          createdAt: new Date().toISOString(),
          videoTitle: videoMeta?.title,
          videoThumb: videoMeta?.thumb,
        };
        const next = [entry, ...history].slice(0, MAX_HISTORY);
        setHistory(next);
        saveHistory(next);
      }
      setHowToOpen(false);
    } catch (err) {
      toast.error(`Failed: ${String(err).slice(0, 120)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit() {
    if (mode === "multi") {
      if (!multiUrls.trim()) { toast.error("Paste at least 2 URLs"); return; }
      askDigest(`synthesize ideas from these videos: ${multiUrls}`, { multiUrls, mode });
    } else if (mode === "implement") {
      implementDirectly();
    } else if (mode === "visual") {
      if (!url.trim()) { toast.error("Paste a URL"); return; }
      askDigest(`[vlm] ${url}`, { url, mode });
    } else {
      if (!url.trim()) { toast.error("Paste a URL"); return; }
      askDigest(url, { url, mode });
    }
  }

  async function copyResponse() {
    try {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  function downloadResponse() {
    const title = videoMeta?.title?.slice(0, 60).replace(/[^\w\s-]/g, "") || "digest";
    const slug = title.replace(/\s+/g, "-").toLowerCase();
    const blob = new Blob([response], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function restoreEntry(entry: HistoryEntry) {
    setMode(entry.mode);
    setUrl(entry.url);
    if (entry.multiUrls) setMultiUrls(entry.multiUrls);
    setResponse(entry.response);
    if (entry.videoTitle || entry.videoThumb) {
      setVideoMeta({ title: entry.videoTitle, thumb: entry.videoThumb });
    }
    setHistoryOpen(false);
  }

  function deleteHistoryEntry(id: string) {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    saveHistory(next);
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
    toast.success("History cleared");
  }

  const progressSteps = PROGRESS_STEPS_BY_MODE[mode];
  const lastStepAt = progressSteps[progressSteps.length - 1].at;
  const stalled = loading && elapsed > lastStepAt + 20;
  const currentProgress = useMemo(
    () => progressSteps[progressStep] ?? progressSteps[0],
    [progressStep, progressSteps]
  );
  const sections = useMemo(() => extractSections(response), [response]);

  // Admin gate
  if (authLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="py-8">
              <div className="h-5 w-48 bg-white/[0.06] rounded mb-3" />
              <div className="h-3 w-full bg-white/[0.04] rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card className="py-16">
          <CardContent className="flex flex-col items-center text-center">
            <Video className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Admin Only</h3>
            <p className="text-sm text-muted-foreground">
              Digest dashboard is only available to administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
            <Video className="h-5 w-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Digest</h1>
            <p className="text-sm text-muted-foreground">
              YouTube, TikTok, Twitter &middot; Transcribe, digest, and implement
            </p>
          </div>
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
              historyOpen
                ? "bg-violet-500/15 text-violet-400 border border-violet-500/30"
                : "bg-white/[0.02] border border-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            )}
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            History
            {history.length > 0 && (
              <span className="rounded-full bg-white/[0.08] px-1.5 text-[9px] font-bold">{history.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* History panel */}
      {historyOpen && (
        <Card className="mb-6 border-violet-500/20">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 text-violet-400" />
              Recent Digests
            </CardTitle>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 text-center py-4">
                No digests yet. Run one to see it here.
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="group flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors"
                  >
                    {h.videoThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={h.videoThumb}
                        alt=""
                        className="h-12 w-20 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-20 rounded bg-violet-500/10 flex items-center justify-center shrink-0">
                        <Video className="h-5 w-5 text-violet-400/60" />
                      </div>
                    )}
                    <button
                      onClick={() => restoreEntry(h)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-xs font-medium truncate">
                        {h.videoTitle || (h.mode === "multi" ? "Multi-video digest" : h.url)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-violet-500/30 text-violet-400 bg-violet-500/10">
                          {MODE_META[h.mode].label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(h.createdAt)}</span>
                      </div>
                    </button>
                    <button
                      onClick={() => deleteHistoryEntry(h.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.06] transition-all shrink-0"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground/60 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mode Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
        {(Object.keys(MODE_META) as Mode[]).map((id) => {
          const { label, icon: Icon, desc } = MODE_META[id];
          return (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={cn(
                "flex-1 rounded-xl p-3 text-left ring-1 transition-all",
                mode === id
                  ? "bg-violet-500/10 ring-violet-500/30 text-violet-400"
                  : "ring-white/[0.06] text-muted-foreground hover:bg-white/[0.03] hover:ring-white/[0.1]"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <p className="text-[11px] opacity-60">{desc}</p>
            </button>
          );
        })}
      </div>

      {/* URL Input */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-violet-400" />
            {mode === "multi" ? "Paste Multiple URLs" : "Paste Video URL"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "multi" ? (
            <Textarea
              placeholder={"Paste 2+ video URLs (one per line or space-separated):\nhttps://youtube.com/watch?v=...\nhttps://tiktok.com/@user/video/...\nhttps://x.com/user/status/...\n\nPress Ctrl+Enter to submit"}
              value={multiUrls}
              onChange={e => setMultiUrls(e.target.value)}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !loading) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="min-h-[100px] resize-none font-mono text-xs"
            />
          ) : (
            <Input
              placeholder="https://youtube.com/watch?v=... or tiktok.com/... or x.com/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && handleSubmit()}
            />
          )}

          {/* Video preview card */}
          {mode !== "multi" && url.trim() && (videoMeta || metaLoading) && (
            <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              {metaLoading ? (
                <div className="h-14 w-24 rounded bg-white/[0.04] animate-pulse shrink-0" />
              ) : videoMeta?.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={videoMeta.thumb} alt="" className="h-14 w-24 rounded object-cover shrink-0" />
              ) : (
                <div className="h-14 w-24 rounded bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Video className="h-5 w-5 text-violet-400/60" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {metaLoading ? (
                  <>
                    <div className="h-3 w-3/4 bg-white/[0.06] rounded animate-pulse mb-1.5" />
                    <div className="h-2 w-1/2 bg-white/[0.04] rounded animate-pulse" />
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium truncate">{videoMeta?.title || "Video"}</p>
                    {videoMeta?.author && (
                      <p className="text-[10px] text-muted-foreground truncate">{videoMeta.author}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[9px] px-1.5 py-0 h-4">
                        {detectPlatform(url)}
                      </Badge>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> Open
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={loading || sendingToClaude || (mode === "multi" ? !multiUrls.trim() : !url.trim())}
            className="bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30"
          >
            {loading || sendingToClaude ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              (() => {
                const I = MODE_META[mode].Icon;
                return <I className="h-4 w-4 mr-2" />;
              })()
            )}
            {MODE_META[mode].cta}
          </Button>
        </CardContent>
      </Card>

      {/* Progress while loading */}
      {loading && (
        <Card className="mb-6 border-violet-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400 shrink-0" />
              <p className="text-sm font-medium text-violet-400">
                {stalled ? "Still working — long videos can take 60–90s" : currentProgress.label}
              </p>
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{elapsed}s</span>
            </div>
            <div className="space-y-1.5">
              {progressSteps.map((step, i) => {
                const done = stalled || i < progressStep;
                const active = !stalled && i === progressStep;
                return (
                  <div
                    key={step.label}
                    className={cn(
                      "flex items-center gap-2 text-[11px] transition-colors",
                      done && "text-emerald-400/70",
                      active && "text-violet-400",
                      !done && !active && "text-muted-foreground/30"
                    )}
                  >
                    {done ? (
                      <Check className="h-3 w-3" />
                    ) : active ? (
                      <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
                    )}
                    {step.label}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Claude Code session banner — visible in implement mode once a session is live */}
      {claudeSessionUrl && mode === "implement" && !response && (
        <Card className="mb-6 border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-3">
              <Rocket className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-400">Claude Code session running</p>
                <p className="text-xs text-muted-foreground">It will read the video, implement what fits Harv, and open a PR when done.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => window.open(claudeSessionUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Watch session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* How-to (collapsible) */}
      {!response && !loading && (
        <Card className="mb-6">
          <button
            onClick={() => setHowToOpen(!howToOpen)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left"
          >
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground/80">
              <HelpCircle className="h-4 w-4" />
              How to use
            </CardTitle>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", howToOpen && "rotate-180")} />
          </button>
          {howToOpen && (
            <CardContent className="pt-0">
              <div className="space-y-3 text-sm text-muted-foreground/70">
                <div>
                  <span className="font-medium text-violet-400">Digest:</span> Paste a YouTube/TikTok/Twitter URL — gets the transcript, breaks it into actionable sections with takeaways.
                </div>
                <div>
                  <span className="font-medium text-violet-400">Implement:</span> Spawns a Claude Code session on Anthropic&apos;s cloud that reads the video, scopes what fits Harv&apos;s architecture, and opens a PR. No in-app preview — work happens in the Claude Code session you&apos;ll see linked below.
                </div>
                <div>
                  <span className="font-medium text-violet-400">Visual:</span> Sends the actual video frames to Gemini instead of just the transcript. Reads code on screen, UI demos, charts, and diagrams — catches anything a silent demo would show. Best for tutorials and product walkthroughs. Works best on TikTok/Twitter; YouTube bot-gates datacenter IPs.
                </div>
                <div>
                  <span className="font-medium text-violet-400">Multi-Video:</span> Paste 2-5 URLs from different videos. The agent summarizes each, finds common themes, and creates a combined action plan.
                </div>
                <div className="pt-2 text-[11px] text-muted-foreground/40">
                  After digesting, you can say &quot;implement section 2&quot; to get a detailed guide for a specific section.
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Response */}
      {response && !loading && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-violet-400" />
              {videoMeta?.title ? videoMeta.title : MODE_META[mode].label}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={copyResponse}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadResponse}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3 w-3 mr-1" />
                .md
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-foreground/85">
              <MarkdownMessage content={response} />
            </div>

            {/* Send to Claude Code — implement mode only */}
            {mode === "implement" && (
              <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-2">
                {claudeSessionUrl ? (
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <Rocket className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-emerald-400">Claude Code session running</p>
                      <p className="text-[10px] text-muted-foreground truncate">It will open a PR on harv-dashboard when done.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      onClick={() => window.open(claudeSessionUrl, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Watch session
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <Button
                      onClick={sendToClaudeCode}
                      disabled={sendingToClaude}
                      className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                    >
                      {sendingToClaude ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Rocket className="h-4 w-4 mr-2" />
                      )}
                      Send to Claude Code
                    </Button>
                    <p className="text-[11px] text-muted-foreground/70 pt-2">
                      Fires a Claude Code session on Anthropic&apos;s cloud. It will implement this guide against harv-dashboard and open a PR.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Follow-up actions */}
            {mode === "digest" && url.trim() && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setMode("implement");
                    implementDirectly();
                  }}
                  disabled={loading || sendingToClaude}
                >
                  <Wrench className="h-3 w-3 mr-1" />
                  Implement in Claude Code
                </Button>
                {sections.slice(0, 5).map(({ n, title }) => (
                  <Button
                    key={n}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => askDigest(`implement section ${n}: ${title}`)}
                    disabled={loading}
                    title={title}
                  >
                    Implement: {title.length > 28 ? title.slice(0, 28) + "…" : title}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
