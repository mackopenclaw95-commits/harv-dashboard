"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  Brain,
  Dumbbell,
  DollarSign,
  Music,
  Plane,
  ShoppingCart,
  TrendingUp,
  Mail,
  Calendar,
  Search,
  Video,
  BookOpen,
  Shield,
  Wrench,
  Activity,
  BarChart3,
  Database,
  FileText,
  Image,
  Trophy,
  Megaphone,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  Cpu,
  Send,
} from "lucide-react";
import { saveAgentChat, type StoredMessage } from "@/lib/chat-history";

interface LastEvent {
  action: string;
  status: string;
  summary: string;
  timestamp: string;
  cost: number;
  tokens: number;
  duration: number;
}

interface Agent {
  name: string;
  status: string;
  model: string;
  type: string;
  tier: string;
  provider: string;
  description: string;
  cost_per_call: number;
  last_event?: LastEvent | null;
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  Harv: Bot,
  Router: Brain,
  Guardian: Shield,
  Medic: Wrench,
  Fitness: Dumbbell,
  Finance: DollarSign,
  Trading: TrendingUp,
  Research: Search,
  Music: Music,
  Travel: Plane,
  Shopping: ShoppingCart,
  Sports: Trophy,
  "Auto Marketing": Megaphone,
  Email: Mail,
  Scheduler: Calendar,
  "Video Digest": Video,
  "YouTube Digest": Video,
  Learning: BookOpen,
  Journal: FileText,
  Analytics: BarChart3,
  Memory: Database,
  Ledger: FileText,
  Drive: Database,
  "Image Gen": Image,
  Heartbeat: Activity,
  Postman: Mail,
};

const TYPE_FILTERS = ["all", "agent", "tool", "background"] as const;

function statusColor(status: string) {
  switch (status.toUpperCase()) {
    case "LIVE":
    case "ACTIVE":
    case "RUNNING":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "IDLE":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "ERROR":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function typeColor(type: string) {
  switch (type) {
    case "agent":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "tool":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "background":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
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

interface InlineMessage {
  role: "user" | "assistant";
  content: string;
}

function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [inlineMessages, setInlineMessages] = useState<InlineMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const Icon = AGENT_ICONS[agent.name] || Bot;
  const le = agent.last_event;
  const modelShort = (agent.model || "none").split("/").pop();
  const costStr = agent.cost_per_call > 0 ? `$${agent.cost_per_call.toFixed(4)}` : "Free";

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!chatInput.trim() || isSending) return;

    const userText = chatInput.trim();
    setChatInput("");
    setIsSending(true);
    setInlineMessages((prev) => [...prev, { role: "user", content: userText }]);

    try {
      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, agent: agent.name }),
      });
      const reply = await res.text();
      setInlineMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply || "No response." },
      ]);
    } catch {
      setInlineMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error." },
      ]);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary/40"
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{agent.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusColor(agent.status)}>
              {agent.status}
            </Badge>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        <CardDescription className="text-xs leading-relaxed mt-1">
          {agent.description || "No description"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={typeColor(agent.type)}>
            {agent.type}
          </Badge>
          <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30">
            <Cpu className="h-3 w-3 mr-1" />
            {modelShort}
          </Badge>
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
            <DollarSign className="h-3 w-3 mr-1" />
            {costStr}
          </Badge>
          {le && (
            <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(le.timestamp)}
            </span>
          )}
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Provider</span>
                <p className="font-medium">{agent.provider}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Model</span>
                <p className="font-medium font-mono text-[11px]">{agent.model}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Tier</span>
                <p className="font-medium">{agent.tier}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Cost/Call</span>
                <p className="font-medium">{costStr}</p>
              </div>
            </div>

            {le ? (
              <div className="rounded-lg bg-card border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Last Activity
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div>
                    <span className="text-muted-foreground">Action</span>
                    <p className="font-medium">{le.action}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-medium">{le.status}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time</span>
                    <p className="font-medium">{le.timestamp}</p>
                  </div>
                  {le.duration > 0 && (
                    <div>
                      <span className="text-muted-foreground">Duration</span>
                      <p className="font-medium">{le.duration.toFixed(1)}s</p>
                    </div>
                  )}
                  {le.tokens > 0 && (
                    <div>
                      <span className="text-muted-foreground">Tokens</span>
                      <p className="font-medium">{le.tokens.toLocaleString()}</p>
                    </div>
                  )}
                  {le.cost > 0 && (
                    <div>
                      <span className="text-muted-foreground">Cost</span>
                      <p className="font-medium">${le.cost.toFixed(5)}</p>
                    </div>
                  )}
                </div>
                {le.summary && (
                  <p className="text-xs text-muted-foreground italic mt-1">
                    {le.summary}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No recent activity recorded
              </p>
            )}

            {/* Inline chat */}
            {inlineMessages.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                {inlineMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-xs rounded-lg px-3 py-2 ${
                      msg.role === "user"
                        ? "bg-primary/10 text-primary ml-6"
                        : "bg-muted mr-6"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
                {isSending && (
                  <div className="flex gap-1 px-3 py-2">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
                  </div>
                )}
                <Link
                  href={`/agents/${encodeURIComponent(agent.name)}`}
                  className="block text-center text-xs text-primary hover:underline pt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Save inline messages to localStorage so the full chat page picks them up
                    const now = new Date().toISOString();
                    const toStore: StoredMessage[] = inlineMessages.map((m, idx) => ({
                      id: `inline-${idx}`,
                      role: m.role,
                      content: m.content,
                      timestamp: now,
                    }));
                    saveAgentChat(agent.name, toStore);
                  }}
                >
                  Open full chat →
                </Link>
              </div>
            )}
            <form onSubmit={handleSend} className={`flex items-end gap-2 ${inlineMessages.length === 0 ? "pt-2 border-t border-border" : ""}`}>
              <Textarea
                ref={textareaRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${agent.name}...`}
                rows={1}
                className="min-h-[38px] max-h-[80px] resize-none text-sm"
                disabled={isSending}
              />
              <Button type="submit" size="icon" className="shrink-0 h-[38px] w-[38px]" disabled={!chatInput.trim() || isSending}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        // Fetch agents list and recent events in parallel
        const [agentsRes, eventsRes] = await Promise.all([
          fetch("/api/proxy?path=/api/agents/list"),
          fetch("/api/proxy?path=/api/events/recent?limit=200"),
        ]);
        const agentsData = await agentsRes.json();
        const eventsData = await eventsRes.json();

        const agentsList: Agent[] = (agentsData.agents || []).map((a: Agent) => ({
          ...a,
          last_event: null,
        }));

        // Build last-event lookup
        const events = eventsData.events || [];
        const lastEventMap: Record<string, LastEvent> = {};
        for (const ev of events) {
          const name = (ev.agent || "").toLowerCase();
          if (name && !lastEventMap[name]) {
            lastEventMap[name] = {
              action: ev.action || "",
              status: ev.status || "",
              summary: ev.summary || "",
              timestamp: ev.timestamp || "",
              cost: ev.cost || 0,
              tokens: ev.tokens || 0,
              duration: ev.duration_seconds || 0,
            };
          }
        }

        // Merge
        for (const agent of agentsList) {
          agent.last_event = lastEventMap[agent.name.toLowerCase()] || null;
        }

        setAgents(agentsList);
      } catch {
        setError("Could not connect to Harv API");
        setAgents(FALLBACK_AGENTS);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = filter === "all" ? agents : agents.filter((a) => a.type === filter);
  const counts = {
    all: agents.length,
    agent: agents.filter((a) => a.type === "agent").length,
    tool: agents.filter((a) => a.type === "tool").length,
    background: agents.filter((a) => a.type === "background").length,
  };

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="text-muted-foreground">
          {agents.length} agents registered
          {error && <span className="ml-2 text-yellow-500">({error})</span>}
        </p>
      </header>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold">{counts.all}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Agents</p>
            <p className="text-2xl font-bold text-blue-400">{counts.agent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tools</p>
            <p className="text-2xl font-bold text-purple-400">{counts.tool}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Background</p>
            <p className="text-2xl font-bold text-orange-400">{counts.background}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              filter === t
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {t === "all" ? "All" : `${t.charAt(0).toUpperCase() + t.slice(1)}s`}
            <span className="ml-1.5 text-xs opacity-60">
              {counts[t as keyof typeof counts]}
            </span>
          </button>
        ))}
      </div>

      {/* Agent grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 12 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-32" />
                </CardContent>
              </Card>
            ))
          : filtered.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
      </div>
    </div>
  );
}

const FALLBACK_AGENTS: Agent[] = [
  { name: "Harv", status: "LIVE", model: "claude-haiku-4-5", type: "agent", tier: "AGENTS", provider: "anthropic", description: "Conversational brain — user-facing, tool routing, personality", cost_per_call: 0.004672 },
  { name: "Router", status: "LIVE", model: "qwen/qwen3-8b", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Core orchestrator — reads Tasks sheet, routes to agents", cost_per_call: 0 },
  { name: "Guardian", status: "LIVE", model: "qwen2.5:0.5b", type: "background", tier: "BACKGROUND", provider: "ollama", description: "VPS health monitor, Telegram alerts, daily snapshots", cost_per_call: 0 },
  { name: "Journal", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Session compression, ChromaDB vector memory, Drive archiving", cost_per_call: 0.000622 },
  { name: "Research", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Web search, summarization, comparison, fact-checking", cost_per_call: 0.001 },
  { name: "Fitness", status: "LIVE", model: "qwen2.5:0.5b", type: "agent", tier: "AGENTS", provider: "ollama", description: "Fitness tracking with Garmin Connect integration", cost_per_call: 0 },
  { name: "Finance", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Budget tracking, transaction logging, Plaid bank sync", cost_per_call: 0 },
  { name: "Trading", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Polymarket + Kalshi paper trading, crypto tracking", cost_per_call: 0 },
  { name: "Music", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Spotify API — playback, playlists, recommendations", cost_per_call: 0 },
  { name: "Sports", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Live scores, standings, schedules, injury reports", cost_per_call: 0 },
  { name: "Learning", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Research assistant, tutor, flashcards, quizzes", cost_per_call: 0 },
  { name: "Video Digest", status: "LIVE", model: "deepseek/deepseek-chat", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Multi-platform video transcripts and digests", cost_per_call: 0.002 },
  { name: "Scheduler", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Calendar and reminder management", cost_per_call: 0.00046 },
  { name: "Email", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Reads, sends, archives Gmail with AI summarisation", cost_per_call: 0.00046 },
  { name: "Travel", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Trip planning, itineraries, destination research", cost_per_call: 0 },
  { name: "Shopping", status: "LIVE", model: "qwen2.5:0.5b", type: "agent", tier: "AGENTS", provider: "ollama", description: "Shopping lists, product research, purchase tracking", cost_per_call: 0 },
  { name: "Auto Marketing", status: "LIVE", model: "deepseek/deepseek-chat", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Content strategy, social media, Twitter publishing", cost_per_call: 0.002 },
  { name: "Image Gen", status: "LIVE", model: "imagen-4.0-fast-generate-001", type: "agent", tier: "AGENTS", provider: "gemini", description: "Generates images via Imagen 4.0, sends to Telegram", cost_per_call: 0.003 },
  { name: "Medic", status: "LIVE", model: "qwen2.5:0.5b", type: "background", tier: "BACKGROUND", provider: "ollama", description: "Auto-repair agent — scripted fixes + LLM diagnosis", cost_per_call: 0 },
  { name: "Analytics", status: "LIVE", model: "none", type: "tool", tier: "TOOLS", provider: "none", description: "Cost analytics, spend projections, burn rate tracking", cost_per_call: 0 },
  { name: "Memory", status: "LIVE", model: "none", type: "tool", tier: "TOOLS", provider: "none", description: "Session memory — ChromaDB vector search, Drive archive", cost_per_call: 0 },
  { name: "Ledger", status: "LIVE", model: "none", type: "tool", tier: "TOOLS", provider: "none", description: "Real-time Mission Control updater", cost_per_call: 0 },
  { name: "Drive", status: "LIVE", model: "none", type: "tool", tier: "TOOLS", provider: "none", description: "Google Drive I/O — read, write, list, move, delete", cost_per_call: 0 },
];
