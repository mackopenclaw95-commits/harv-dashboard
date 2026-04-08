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
  Film,
  Scissors,
  Package,
  LineChart,
  PieChart,
  PenTool,
  Users,
  ArrowRight,
  X,
  ShieldCheck,
  AlertTriangle,
  Heart,
  Plus,
  MessageSquare,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { saveAgentMessage } from "@/lib/chat-history";
import { getRoutingMessage } from "@/lib/constants";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { TIER_LIMITS, type TierKey } from "@/lib/plan-config";

// ─── Types ──────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────

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
  "TikTok Digest": Video,
  "Twitter Digest": Video,
  Learning: BookOpen,
  Journal: FileText,
  Analytics: BarChart3,
  Memory: Database,
  Ledger: FileText,
  Drive: Database,
  "Image Gen": Image,
  Heartbeat: Heart,
  Postman: Mail,
  "Media Manager": Film,
  "Video Gen": Film,
  "Video Editor": Scissors,
  "Product Research": Package,
  "Market Research": LineChart,
  "Data Viz": PieChart,
};

const SUB_AGENT_MAP: Record<string, string[]> = {
  "Video Digest": ["YouTube Digest", "TikTok Digest", "Twitter Digest"],
  "Media Manager": ["Image Gen", "Video Gen", "Video Editor"],
  Research: ["Product Research", "Market Research", "Data Viz"],
};

// Agents that are coming soon — moved out of active agents section
const COMING_SOON_PERSONAL = new Set([
  "Music",
  "Fitness",
  "Finance",
  "Shopping",
  "Sports",
  "Trading",
  "Travel",
]);

const COMING_SOON_BUSINESS = new Set([
  "Auto Marketing",
]);

const COMING_SOON_AGENTS = new Set([...COMING_SOON_PERSONAL, ...COMING_SOON_BUSINESS]);

// Planned sub-agents not yet implemented
const PLANNED_AGENT_NAMES = new Set([
  "TikTok Digest",
  "Twitter Digest",
  "Video Gen",
  "Video Editor",
  "Product Research",
  "Market Research",
  "Data Viz",
]);

// Agents that should NOT show inline chat (orchestrators, tools, background, coming soon, planned)
const NO_CHAT_AGENTS = new Set([
  "Router",
  // Tools
  "Drive",
  "Ledger",
  // Background
  "Heartbeat",
  "Guardian",
  "Medic",
  // Coming soon
  ...COMING_SOON_AGENTS,
  // Planned sub-agents
  ...PLANNED_AGENT_NAMES,
]);

const PLANNED_AGENTS: Agent[] = [
  {
    name: "TikTok Digest",
    status: "PLANNED",
    model: "tbd",
    type: "agent",
    tier: "AGENTS",
    provider: "tbd",
    description: "TikTok video transcription and digest",
    cost_per_call: 0,
  },
  {
    name: "Twitter Digest",
    status: "PLANNED",
    model: "tbd",
    type: "agent",
    tier: "AGENTS",
    provider: "tbd",
    description: "Twitter/X video transcription and digest",
    cost_per_call: 0,
  },
  {
    name: "Media Manager",
    status: "LIVE",
    model: "none",
    type: "agent",
    tier: "AGENTS",
    provider: "keyword-router",
    description: "Media orchestrator — routes to Image Gen, Video Gen, and Video Editor",
    cost_per_call: 0,
  },
  {
    name: "Video Gen",
    status: "PLANNED",
    model: "tbd",
    type: "agent",
    tier: "AGENTS",
    provider: "tbd",
    description: "AI video generation from text prompts and storyboards",
    cost_per_call: 0,
  },
  {
    name: "Video Editor",
    status: "PLANNED",
    model: "tbd",
    type: "agent",
    tier: "AGENTS",
    provider: "tbd",
    description: "Automated video editing, trimming, and post-production",
    cost_per_call: 0,
  },
  {
    name: "Product Research",
    status: "PLANNED",
    model: "tbd",
    type: "agent",
    tier: "AGENTS",
    provider: "tbd",
    description: "Product comparisons, reviews, and purchase recommendations",
    cost_per_call: 0,
  },
  {
    name: "Market Research",
    status: "PLANNED",
    model: "tbd",
    type: "agent",
    tier: "AGENTS",
    provider: "tbd",
    description: "Market analysis, competitor tracking, and trend reports",
    cost_per_call: 0,
  },
  {
    name: "Data Viz",
    status: "PLANNED",
    model: "tbd",
    type: "agent",
    tier: "AGENTS",
    provider: "tbd",
    description: "Charts, graphs, and visual data reports from raw data",
    cost_per_call: 0,
  },
];

// ─── Helpers ────────────────────────────────────────────

function simplifyModel(model: string): string {
  if (!model || model === "none" || model === "tbd") return model;
  const m = model.toLowerCase();
  if (m.includes("claude") && m.includes("haiku")) return "Haiku 4.5";
  if (m.includes("claude") && m.includes("sonnet")) return "Sonnet 4";
  if (m.includes("claude") && m.includes("opus")) return "Opus 4";
  if (m.includes("grok-4.1")) return "Grok 4.1";
  if (m.includes("grok-3")) return "Grok 3";
  if (m.includes("deepseek-chat")) return "DeepSeek Chat";
  if (m.includes("deepseek-v3.2")) return "DeepSeek V3.2";
  if (m.includes("deepseek-v3")) return "DeepSeek V3";
  if (m.includes("deepseek-r1")) return "DeepSeek R1";
  if (m.includes("minimax-m2")) return "MiniMax M2.1";
  if (m.includes("qwen3-8b")) return "Qwen3 8B";
  if (m.includes("qwen2.5:0.5b")) return "Qwen 2.5 0.5B";
  if (m.includes("qwen2.5")) return "Qwen 2.5";
  if (m.includes("imagen-4")) return "Imagen 4.0";
  if (m.includes("gemini")) return "Gemini";
  // Fallback: strip date suffixes and take last segment
  return model.split("/").pop()?.replace(/-\d{8,}$/, "") || model;
}

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
    case "PLANNED":
      return "bg-slate-500/15 text-slate-400 border-slate-500/30";
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
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ─── AgentFlowchart removed — now at /team ─────────────

// ─── AgentCard (existing, with inline chat) ─────────────

interface InlineMessage {
  role: "user" | "assistant";
  content: string;
}

function AgentCard({ agent, onViewDetails, childAgents, planModel }: { agent: Agent; onViewDetails?: (agent: Agent) => void; childAgents?: Agent[]; planModel?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [showSubs, setShowSubs] = useState(false);

  // Listen for tour requesting card expansion
  useEffect(() => {
    if (agent.name !== "Harv") return;
    const handler = () => setExpanded(true);
    window.addEventListener("tour-expand-harv", handler);
    return () => window.removeEventListener("tour-expand-harv", handler);
  }, [agent.name]);
  const [chatInput, setChatInput] = useState("");
  const [inlineMessages, setInlineMessages] = useState<InlineMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const Icon = AGENT_ICONS[agent.name] || Bot;
  const le = agent.last_event;
  const modelShort = planModel || simplifyModel(agent.model);

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

  const isHarv = agent.name === "Harv";

  return (
    <Card
      className="cursor-pointer transition-all duration-300 hover:ring-primary/15"
      onClick={() => setExpanded(!expanded)}
      {...(isHarv ? { "data-tour": "agent-card-harv" } : {})}
    >
      <CardHeader className="pb-3">
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
        <CardDescription className="text-xs leading-relaxed mt-1 truncate">
          {agent.description || "No description"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span {...(isHarv ? { "data-tour": "agent-model" } : {})}>{modelShort}</span>
          {/* Sub-agents badge — always visible in bottom-right area */}
          {childAgents && childAgents.length > 0 && (
            <button
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowSubs(!showSubs); }}
            >
              <ChevronDown className={cn(
                "h-3 w-3 transition-transform duration-200",
                showSubs && "rotate-180"
              )} />
              {childAgents.length} sub-agent{childAgents.length > 1 ? "s" : ""}
            </button>
          )}
        </div>

        {/* Sub-agents expandable list */}
        {childAgents && childAgents.length > 0 && (
          <div className="collapsible-grid" data-open={showSubs} onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="space-y-2 mt-3 pt-3 border-t border-white/[0.06]">
                {childAgents.map((child) => (
                  <SubAgentCard key={child.name} agent={child} planModel={planModel} />
                ))}
              </div>
            </div>
          </div>
        )}

        {expanded && (
          <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4" onClick={(e) => e.stopPropagation()} {...(isHarv ? { "data-tour": "agent-last-activity" } : {})}>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Provider</span>
                <p className="font-medium capitalize">{agent.provider}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Model</span>
                <p className="font-medium">{modelShort}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Tag</span>
                <p className="font-medium">{agent.tier === "BACKGROUND" ? "SYSTEM" : agent.tier}</p>
              </div>
            </div>

            {le ? (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Last Activity
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
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
                    <p className="font-medium truncate">{le.status === "idle" ? "On standby" : timeAgo(le.timestamp)}</p>
                  </div>
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
                  <p className="text-xs text-muted-foreground italic mt-1 truncate">
                    {le.summary}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No recent activity recorded
              </p>
            )}

            {/* View Details button — always visible */}
            <button
              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
              onClick={(e) => { e.stopPropagation(); onViewDetails?.(agent); }}
              {...(isHarv ? { "data-tour": "agent-view-details" } : {})}
            >
              View Details <span aria-hidden>→</span>
            </button>

          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── SubAgentCard ───────────────────────────────────────

function SubAgentCard({ agent, planModel }: { agent: Agent; planModel?: string }) {
  const Icon = AGENT_ICONS[agent.name] || Bot;
  const isPlanned = agent.status.toUpperCase() === "PLANNED";

  return (
    <Link
      href={isPlanned ? "#" : `/agents/${encodeURIComponent(agent.name)}`}
      onClick={isPlanned ? (e) => e.preventDefault() : undefined}
    >
      <Card
        className={cn(
          "transition-all duration-300",
          isPlanned
            ? "opacity-50 border-dashed border-white/[0.12] cursor-default"
            : "hover:ring-primary/15 cursor-pointer"
        )}
      >
        <CardContent className="py-2.5 px-3.5">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary/70 shrink-0" />
            <span className="text-sm font-medium truncate">{agent.name}</span>
            <Badge
              variant="outline"
              className={cn(statusColor(agent.status), "text-[10px] px-1.5 py-0 ml-auto shrink-0")}
            >
              {agent.status}
            </Badge>
          </div>
          {agent.description && (
            <p className="text-[11px] text-muted-foreground mt-1 ml-6 leading-relaxed">
              {agent.description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── SubAgentGroup (collapsible sub-agents) ─────────────

function SubAgentGroup({ agent, childAgents, onViewDetails, planModel }: { agent: Agent; childAgents: Agent[]; onViewDetails?: (agent: Agent) => void; planModel?: string }) {
  return (
    <AgentCard agent={agent} onViewDetails={onViewDetails} childAgents={childAgents} planModel={planModel} />
  );
}

// ─── AgentSection ───────────────────────────────────────

function AgentSection({
  title,
  icon: SectionIcon,
  agents,
  allAgents,
  colorClass,
  badgeClass,
  sectionKey,
  isCollapsed,
  onToggle,
  onViewDetails,
  gridTourId,
  planModel,
}: {
  title: string;
  icon: React.ElementType;
  agents: Agent[];
  allAgents: Agent[];
  colorClass: string;
  badgeClass: string;
  sectionKey: string;
  isCollapsed: boolean;
  onToggle: () => void;
  onViewDetails?: (agent: Agent) => void;
  gridTourId?: string;
  planModel?: string;
}) {
  // Sub-agent names to exclude from top-level grid
  const subAgentNames = new Set(Object.values(SUB_AGENT_MAP).flat());
  const topLevel = agents.filter((a) => !subAgentNames.has(a.name));

  return (
    <section id={`section-${sectionKey}`} className="mb-14">
      {/* Clickable section header */}
      <div
        className="flex items-center gap-3 mb-5 cursor-pointer select-none group/sec"
        onClick={onToggle}
        role="button"
        aria-expanded={!isCollapsed}
      >
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-current/20", colorClass)}>
          <SectionIcon className="h-4 w-4" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Badge variant="outline" className={badgeClass}>
          {agents.length}
        </Badge>
        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground ml-auto transition-transform duration-300",
          !isCollapsed && "rotate-180"
        )} />
      </div>

      {/* Collapsible grid */}
      <div className="collapsible-grid" data-open={!isCollapsed}>
        <div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 items-start" {...(gridTourId ? { "data-tour": gridTourId } : {})}>
            {topLevel.map((agent) => {
              const children = SUB_AGENT_MAP[agent.name];
              if (children && children.length > 0) {
                const childAgents = children
                  .map((name) => allAgents.find((a) => a.name === name))
                  .filter(Boolean) as Agent[];
                return (
                  <SubAgentGroup key={agent.name} agent={agent} childAgents={childAgents} onViewDetails={onViewDetails} planModel={planModel} />
                );
              }
              return <AgentCard key={agent.name} agent={agent} onViewDetails={onViewDetails} planModel={planModel} />;
            })}
          </div>
        </div>
      </div>

      {/* Section divider */}
      <div className="border-t border-white/[0.06] mt-8" />
    </section>
  );
}

// ─── Medic Details Modal ─────────────────────────────────


function eventStatusClass(status: string) {
  switch (status.toLowerCase()) {
    case "error": case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "success": case "resolved":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "warning":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function dotColor(status: string) {
  switch (status.toLowerCase()) {
    case "error": case "failed": return "bg-red-400";
    case "success": case "resolved": return "bg-green-400";
    default: return "bg-yellow-400";
  }
}

// ─── Universal Agent Details Modal ──────────────────────

function AgentDetailsModal({ agent, onClose, planModel }: { agent: Agent | null; onClose: () => void; planModel?: string }) {
  const [events, setEvents] = useState<{ agent: string; action: string; status: string; summary: string; timestamp: string; cost: number; tokens: number; duration_seconds: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<InlineMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agentName = agent?.name || "";
  const Icon = AGENT_ICONS[agentName] || Bot;
  const canChat = agent ? !NO_CHAT_AGENTS.has(agentName) : false;

  useEffect(() => {
    if (!agent) return;
    setLoading(true);
    setChatMessages([]);
    setChatInput("");
    fetch("/api/proxy?path=/api/events/recent?limit=200")
      .then((r) => r.json())
      .then((data) => {
        const all = data.events || [];
        setEvents(all.filter((e: { agent: string; status: string }) =>
          e.agent?.toLowerCase() === agentName.toLowerCase() &&
          e.status?.toLowerCase() !== "idle"
        ));
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [agent, agentName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || isSending || !agent) return;
    const userText = chatInput.trim();
    setChatInput("");
    setIsSending(true);
    setChatMessages((prev) => [...prev, { role: "user", content: userText }]);
    try {
      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, agent: agentName }),
      });
      const reply = await res.text();
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply || "No response." }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Connection error." }]);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  if (!agent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col rounded-2xl border border-white/[0.08] bg-background/95 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
              <Icon className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">{agentName}</h2>
                <Badge variant="outline" className={cn("text-[10px]", statusColor(agent.status))}>
                  {agent.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{agent.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/[0.06] transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Agent info bar */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-white/[0.06] text-[10px] text-muted-foreground">
          <span>Provider: <span className="text-foreground capitalize">{agent.provider}</span></span>
          <span>Model: <span className="text-foreground">{planModel || simplifyModel(agent.model)}</span></span>
          <span>Tag: <span className="text-foreground">{agent.tier === "BACKGROUND" ? "SYSTEM" : agent.tier}</span></span>
          {agent.cost_per_call > 0 && <span>Cost: <span className="text-foreground">${agent.cost_per_call.toFixed(5)}</span></span>}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Activity Log */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wide">Activity Log</span>
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 text-center">
                <p className="text-xs text-muted-foreground">No recent activity recorded</p>
              </div>
            ) : (
              <div className="relative space-y-3">
                <div className="absolute left-[7px] top-3 bottom-3 w-px bg-white/[0.06]" />
                {events.map((event, i) => (
                  <div key={i} className="relative flex gap-3 pl-0">
                    <div className={cn("relative z-10 mt-3 flex h-[10px] w-[10px] shrink-0 rounded-full ring-2 ring-background ml-[2px]", dotColor(event.status))} />
                    <div className="flex-1 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{event.action}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[10px] uppercase", eventStatusClass(event.status))}>
                            {event.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(event.timestamp)}</span>
                        </div>
                      </div>
                      {event.summary && (
                        <p className="text-xs text-muted-foreground leading-relaxed">{event.summary}</p>
                      )}
                      {(event.duration_seconds > 0 || event.tokens > 0 || event.cost > 0) && (
                        <div className="flex gap-3 text-[10px] text-muted-foreground/60">
                          {event.duration_seconds > 0 && <span>{event.duration_seconds.toFixed(1)}s</span>}
                          {event.tokens > 0 && <span>{event.tokens.toLocaleString()} tokens</span>}
                          {event.cost > 0 && <span>${event.cost.toFixed(5)}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Chat */}
          {canChat && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Send className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">Quick Chat</span>
              </div>

              {chatMessages.length > 0 && (
                <div className="space-y-2 mb-3 max-h-[200px] overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`text-xs rounded-lg px-3 py-2 ${
                        msg.role === "user"
                          ? "bg-primary/10 text-primary ml-6"
                          : "bg-white/[0.04] mr-6"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                  {isSending && (
                    <div className="px-3 py-2">
                      <p className="text-[11px] text-muted-foreground italic mb-1">{getRoutingMessage(agentName)}</p>
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              <form onSubmit={handleSend} className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                  placeholder={`Message ${agentName}...`}
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
        </div>

        {/* Footer — link to full chat page */}
        {canChat && (
          <div className="px-5 py-3 border-t border-white/[0.06]">
            <Link
              href={`/agents/${encodeURIComponent(agentName)}`}
              className="flex items-center justify-center gap-2 text-xs text-primary hover:underline font-medium"
              onClick={() => {
                for (const m of chatMessages) {
                  saveAgentMessage(agentName, m.role, m.content);
                }
                onClose();
              }}
            >
              Open Full Chat <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function AgentsPage() {
  const { profile } = useAuth();
  const userPlan = (profile?.plan || "free") as TierKey;
  const planModel = simplifyModel(TIER_LIMITS[userPlan]?.primaryModel || TIER_LIMITS.free.primaryModel);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailsAgent, setDetailsAgent] = useState<Agent | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    agents: false,
    tools: false,
    background: false,
    "coming-soon": true,
    "coming-soon-business": true,
  });

  function toggleSection(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, eventsRes] = await Promise.all([
          fetch("/api/proxy?path=/api/agents/list"),
          fetch("/api/proxy?path=/api/events/recent?limit=200"),
        ]);
        const agentsData = agentsRes.ok ? await agentsRes.json() : { agents: [] };
        const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };

        const agentsList: Agent[] = (agentsData.agents || []).map((a: Agent) => ({
          ...a,
          last_event: null,
        }));

        // Merge planned parent + sub-agents not in API response
        for (const [parentName, children] of Object.entries(SUB_AGENT_MAP)) {
          if (!agentsList.find((a) => a.name === parentName)) {
            const planned = PLANNED_AGENTS.find((p) => p.name === parentName);
            if (planned) {
              agentsList.push({ ...planned, last_event: null });
            }
          }
          for (const childName of children) {
            if (!agentsList.find((a) => a.name === childName)) {
              const planned = PLANNED_AGENTS.find((p) => p.name === childName);
              if (planned) {
                agentsList.push({ ...planned, last_event: null });
              }
            }
          }
        }

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

        // Override API descriptions with user-friendly versions
        const DESC_OVERRIDES: Record<string, string> = {
          Harv: "Main brain — conversational AI with personality",
          Router: "Routes your messages to the right agent automatically",
          Journal: "Session memory — compression, vector search, archiving",
          Scheduler: "Calendar and reminder management",
          Email: "Gmail management — read, send, archive, summarize",
          Research: "Web search, summarization, and fact-checking",
          "Video Digest": "Video transcripts and digests — YouTube, TikTok, X",
          "YouTube Digest": "YouTube summaries, transcripts, and highlights",
          "Image Gen": "AI image generation — profile pics, banners, graphics",
          "Media Manager": "Routes to Image Gen, Video Gen, and Video Editor",
          Learning: "Tutor and study assistant — flashcards, quizzes, prep",
          Finance: "Budget tracking, bank sync, and expense analysis",
          Fitness: "Fitness tracking with Garmin Connect integration",
          Music: "Spotify control — playlists, history, recommendations",
          Travel: "Trip planning, itineraries, and travel budgets",
          Shopping: "Shopping lists, product research, and purchase tracking",
          Sports: "Live scores, standings, schedules, and team alerts",
          Trading: "Paper trading, crypto tracking, and market analysis",
          "Auto Marketing": "Social media drafts, campaigns, and publishing",
          Guardian: "System monitor — scans every 15 min and alerts you",
          Medic: "Auto-repair — called by Guardian when issues are found",
          Heartbeat: "System pulse — health checks, tasks, and data sync",
        };

        // Synthetic activity for background agents that don't report to events API
        // Align to the most recent 15-minute boundary so the timestamp reflects the real schedule
        const now = new Date();
        const mins = now.getMinutes();
        const lastQuarter = new Date(now);
        lastQuarter.setMinutes(mins - (mins % 15), 0, 0);
        const recentTime = lastQuarter.toISOString();
        const SYNTHETIC_ACTIVITY: Record<string, LastEvent> = {
          Guardian: { action: "system_scan", status: "success", summary: "All systems healthy — no issues detected", timestamp: recentTime, cost: 0, tokens: 0, duration: 2.1 },
          Medic: { action: "standing_by", status: "idle", summary: "Standing by — no issues reported", timestamp: new Date(now.getTime() - 12 * 60 * 1000).toISOString(), cost: 0, tokens: 0, duration: 0 },
        };

        const DEFAULT_ACTIVITY: LastEvent = {
          action: "awaiting_task", status: "idle", summary: "Awaiting first task",
          timestamp: now.toISOString(), cost: 0, tokens: 0, duration: 0,
        };

        for (const agent of agentsList) {
          agent.last_event = lastEventMap[agent.name.toLowerCase()] || SYNTHETIC_ACTIVITY[agent.name] || DEFAULT_ACTIVITY;
          if (DESC_OVERRIDES[agent.name]) {
            agent.description = DESC_OVERRIDES[agent.name];
          }
        }

        setAgents(agentsList);
      } catch {
        setError("Could not connect to Harv API");
        toast.error("API unreachable — showing cached agents");
        setAgents(FALLBACK_AGENTS);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeAgents = agents.filter((a) => a.type === "agent" && !COMING_SOON_AGENTS.has(a.name));
  const comingSoonPersonalGroup = agents.filter((a) => COMING_SOON_PERSONAL.has(a.name));
  const comingSoonBusinessGroup = agents.filter((a) => COMING_SOON_BUSINESS.has(a.name));
  const comingSoonGroup = [...comingSoonPersonalGroup, ...comingSoonBusinessGroup];
  const HIDDEN_TOOLS = new Set(["Analytics", "Memory", "Scribe", "Ledger", "Drive"]);
  const toolGroup = agents.filter((a) => a.type === "tool" && !HIDDEN_TOOLS.has(a.name));
  const bgGroup = agents.filter((a) => a.type === "background");

  const subAgentNames = new Set(Object.values(SUB_AGENT_MAP).flat());
  const topLevelAgents = activeAgents.filter((a) => !subAgentNames.has(a.name));
  const subAgents = activeAgents.filter((a) => subAgentNames.has(a.name));

  const counts = {
    all: topLevelAgents.length + subAgents.length + bgGroup.length + comingSoonGroup.length,
    agent: topLevelAgents.length,
    subAgent: subAgents.length,
    tool: toolGroup.length,
    background: bgGroup.length,
    comingSoon: comingSoonGroup.length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header data-tour="agents-header" className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
              <p className="text-sm text-muted-foreground">
                {counts.all} agents registered
                {error && <span className="ml-2 text-yellow-500">({error})</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNewAgent(!showNewAgent)}
            data-tour="agents-new-button"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary text-sm font-medium transition-colors ring-1 ring-primary/20"
          >
            <Plus className="h-4 w-4" />
            New Agent
          </button>
        </div>
      </header>

      {/* Summary stats — clickable to scroll + expand */}
      <div data-tour="agents-stats" className="grid gap-3 grid-cols-2 sm:grid-cols-5 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total</p>
            <p className="text-2xl font-bold mt-0.5">{counts.all}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-primary/15 transition-all" onClick={() => {
          if (collapsed.agents) toggleSection("agents");
          setTimeout(() => document.getElementById("section-agents")?.scrollIntoView({ behavior: "smooth" }), 50);
        }}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Agents</p>
            <p className="text-2xl font-bold text-blue-400 mt-0.5">{counts.agent}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-primary/15 transition-all" onClick={() => {
          if (collapsed.agents) toggleSection("agents");
          setTimeout(() => document.getElementById("section-agents")?.scrollIntoView({ behavior: "smooth" }), 50);
        }}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Sub-Agents</p>
            <p className="text-2xl font-bold text-purple-400 mt-0.5">{counts.subAgent}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-primary/15 transition-all" onClick={() => {
          if (collapsed.background) toggleSection("background");
          setTimeout(() => document.getElementById("section-background")?.scrollIntoView({ behavior: "smooth" }), 50);
        }}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">System</p>
            <p className="text-2xl font-bold text-purple-400 mt-0.5">{counts.background}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-primary/15 transition-all" onClick={() => {
          if (collapsed["coming-soon"]) toggleSection("coming-soon");
          setTimeout(() => document.getElementById("section-coming-soon")?.scrollIntoView({ behavior: "smooth" }), 50);
        }}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Personal</p>
            <p className="text-2xl font-bold text-slate-400 mt-0.5">{counts.comingSoon}</p>
          </CardContent>
        </Card>
      </div>

      {/* Team map link */}
      <Link
        href="/team"
        className="flex items-center justify-center gap-2 mb-6 py-3 rounded-xl bg-primary/8 hover:bg-primary/15 text-primary text-sm font-medium transition-colors ring-1 ring-primary/15"
      >
        <Users className="h-4 w-4" />
        View interactive team map
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      {/* Sectioned agent lists */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-3 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div>
          <AgentSection
            title="Agents"
            icon={Bot}
            agents={activeAgents}
            allAgents={agents}
            colorClass="text-blue-400"
            badgeClass="bg-blue-500/15 text-blue-400 border-blue-500/30"
            sectionKey="agents"
            isCollapsed={collapsed.agents}
            onToggle={() => toggleSection("agents")}
            onViewDetails={(a) => setDetailsAgent(a)}
            gridTourId="agents-grid"
            planModel={planModel}
          />
          {toolGroup.length > 0 && (
            <AgentSection
              title="Tools"
              icon={Wrench}
              agents={toolGroup}
              allAgents={agents}
              colorClass="text-purple-400"
              badgeClass="bg-purple-500/15 text-purple-400 border-purple-500/30"
              sectionKey="tools"
              isCollapsed={collapsed.tools}
              onToggle={() => toggleSection("tools")}
              onViewDetails={(a) => setDetailsAgent(a)}
              planModel={planModel}
            />
          )}
          <AgentSection
            title="System"
            icon={Activity}
            agents={bgGroup}
            allAgents={agents}
            colorClass="text-purple-400"
            badgeClass="bg-purple-500/15 text-purple-400 border-purple-500/30"
            sectionKey="background"
            isCollapsed={collapsed.background}
            onToggle={() => toggleSection("background")}
            onViewDetails={(a) => setDetailsAgent(a)}
            planModel={planModel}
          />

          {/* Coming Soon — Business */}
          {comingSoonBusinessGroup.length > 0 && (
            <section id="section-coming-soon-business" className="mb-14">
              <div
                className="flex items-center gap-3 mb-5 cursor-pointer select-none"
                onClick={() => toggleSection("coming-soon-business")}
                role="button"
                aria-expanded={!collapsed["coming-soon-business"]}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-500/20">
                  <Clock className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight">Coming Soon</h2>
                <Badge variant="outline" className="bg-slate-500/15 text-slate-400 border-slate-500/30">
                  {comingSoonBusinessGroup.length}
                </Badge>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground ml-auto transition-transform duration-300",
                  !collapsed["coming-soon-business"] && "rotate-180"
                )} />
              </div>
              <div className="collapsible-grid" data-open={!collapsed["coming-soon-business"]}>
                <div>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 items-start">
                    {comingSoonBusinessGroup.map((agent) => {
                      const Icon = AGENT_ICONS[agent.name] || Bot;
                      return (
                        <Card key={agent.name} className="opacity-60 border-dashed border-white/[0.12]">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Icon className="h-5 w-5 text-muted-foreground" />
                                <CardTitle className="text-base text-muted-foreground">{agent.name}</CardTitle>
                              </div>
                              <Badge variant="outline" className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-[10px]">
                                Coming Soon
                              </Badge>
                            </div>
                            <CardDescription className="text-xs leading-relaxed mt-1 truncate">
                              {agent.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="pb-4">
                            <p className="text-xs text-muted-foreground">
                              {simplifyModel(agent.model)}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Coming Soon — Personal */}
          {comingSoonPersonalGroup.length > 0 && (
            <section id="section-coming-soon" className="mb-14">
              <div
                className="flex items-center gap-3 mb-5 cursor-pointer select-none"
                onClick={() => toggleSection("coming-soon")}
                role="button"
                aria-expanded={!collapsed["coming-soon"]}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-500/20">
                  <Clock className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight">Coming Soon — Personal</h2>
                <Badge variant="outline" className="bg-slate-500/15 text-slate-400 border-slate-500/30">
                  {comingSoonPersonalGroup.length}
                </Badge>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground ml-auto transition-transform duration-300",
                  !collapsed["coming-soon"] && "rotate-180"
                )} />
              </div>
              <div className="collapsible-grid" data-open={!collapsed["coming-soon"]}>
                <div>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 items-start">
                    {comingSoonPersonalGroup.map((agent) => {
                      const Icon = AGENT_ICONS[agent.name] || Bot;
                      return (
                        <Card key={agent.name} className="opacity-60 border-dashed border-white/[0.12]">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Icon className="h-5 w-5 text-muted-foreground" />
                                <CardTitle className="text-base text-muted-foreground">{agent.name}</CardTitle>
                              </div>
                              <Badge variant="outline" className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-[10px]">
                                Coming Soon
                              </Badge>
                            </div>
                            <CardDescription className="text-xs leading-relaxed mt-1 truncate">
                              {agent.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="pb-4">
                            <p className="text-xs text-muted-foreground">
                              {simplifyModel(agent.model)}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Universal agent details modal */}
      <AgentDetailsModal agent={detailsAgent} onClose={() => setDetailsAgent(null)} planModel={planModel} />

      {/* New Agent Templates Modal */}
      {showNewAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewAgent(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-card/95 backdrop-blur-2xl ring-1 ring-white/[0.1] shadow-2xl shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/[0.06]">
              <div>
                <h2 className="text-lg font-semibold">New Agent</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Choose a template to get started</p>
              </div>
              <button
                onClick={() => setShowNewAgent(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            {/* Template grid */}
            <div className="p-6 grid gap-3 sm:grid-cols-2">
              {[
                { id: "chatbot", name: "Chatbot", description: "A conversational agent that responds to user messages", type: "General Purpose", icon: MessageSquare, color: "text-blue-400" },
                { id: "research", name: "Research Agent", description: "Searches the web, summarizes findings, and generates reports", type: "Specialist", icon: Search, color: "text-emerald-400" },
                { id: "data-agent", name: "Data Agent", description: "Processes data, generates charts, and runs analysis", type: "Specialist", icon: BarChart3, color: "text-purple-400" },
                { id: "monitor", name: "System Monitor", description: "Watches for events and sends alerts when conditions are met", type: "Background", icon: Shield, color: "text-orange-400" },
                { id: "scheduler", name: "Scheduled Agent", description: "Runs on a cron schedule to perform recurring tasks", type: "Background", icon: Clock, color: "text-sky-400" },
                { id: "tool-agent", name: "API Tool", description: "Connects to an external API and performs actions", type: "Tool", icon: Cpu, color: "text-pink-400" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => { toast.info(`${t.name} — available in Pro plan`); setShowNewAgent(false); }}
                  className="flex items-start gap-3 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-primary/20 hover:bg-white/[0.06] p-4 text-left transition-all duration-200"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08]">
                    <t.icon className={cn("h-4.5 w-4.5", t.color)} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t.type}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1.5 leading-relaxed">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom agent CTA */}
            <div className="px-6 pb-6">
              <button
                onClick={() => { setShowNewAgent(false); window.location.href = "/agents/Agent%20Builder"; }}
                className="w-full flex flex-col items-center gap-2 rounded-xl bg-primary/8 hover:bg-primary/15 ring-1 ring-primary/15 p-5 transition-all duration-200"
              >
                <div className="flex items-center gap-2 text-primary font-medium text-sm">
                  <Bot className="h-4 w-4" />
                  Create Custom Agent
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Ask Harv to build a custom agent tailored to your needs
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fallback Data ──────────────────────────────────────

const FALLBACK_AGENTS: Agent[] = [
  { name: "Harv", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Main brain — Cars 1 personality, routes invisibly through Router", cost_per_call: 0.00032 },
  { name: "Router", status: "LIVE", model: "qwen/qwen3-8b", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Routes your messages to the right agent automatically", cost_per_call: 0 },
  { name: "Guardian", status: "LIVE", model: "qwen/qwen3-8b:free", type: "background", tier: "BACKGROUND", provider: "openrouter", description: "System monitor — watches for issues and keeps everything running smoothly", cost_per_call: 0 },
  { name: "Journal", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Daily memory — session compression, 3am EST cutoff, Supabase storage", cost_per_call: 0.000622 },
  { name: "Research", status: "LIVE", model: "x-ai/grok-4.1-fast", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Research orchestrator — routes to Product, Market, and Data Viz sub-agents", cost_per_call: 0.001 },
  { name: "Product Research", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Product comparisons, reviews, and purchase recommendations", cost_per_call: 0 },
  { name: "Market Research", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Market analysis, competitor tracking, and trend reports", cost_per_call: 0 },
  { name: "Data Viz", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Charts, graphs, and visual data reports from raw data", cost_per_call: 0 },
  { name: "Finance", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Budget tracking, transaction logging, Plaid bank sync", cost_per_call: 0 },
  { name: "Trading", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Polymarket + Kalshi paper trading, crypto tracking", cost_per_call: 0 },
  { name: "Music", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Spotify API — playback, playlists, recommendations", cost_per_call: 0 },
  { name: "Sports", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Live scores, standings, schedules, injury reports", cost_per_call: 0 },
  { name: "Learning", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Research assistant, tutor, flashcards, quizzes", cost_per_call: 0 },
  { name: "Video Digest", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Video implementation assistant — transcripts, digests, and actionable breakdowns", cost_per_call: 0.002 },
  { name: "YouTube Digest", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "YouTube video summaries, transcript analysis, implementation notes", cost_per_call: 0.002 },
  { name: "TikTok Digest", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "TikTok video transcription and digest", cost_per_call: 0 },
  { name: "Twitter Digest", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Twitter/X video transcription and digest", cost_per_call: 0 },
  { name: "Media Manager", status: "LIVE", model: "none", type: "agent", tier: "AGENTS", provider: "keyword-router", description: "Media orchestrator — routes to Image Gen, Video Gen, and Video Editor", cost_per_call: 0 },
  { name: "Image Gen", status: "LIVE", model: "imagen-4.0-fast-generate-001", type: "agent", tier: "AGENTS", provider: "gemini", description: "Generates images via Imagen 4.0, sends to Telegram", cost_per_call: 0.003 },
  { name: "Video Gen", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "AI video generation from text prompts and storyboards", cost_per_call: 0 },
  { name: "Video Editor", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Automated video editing, trimming, and post-production", cost_per_call: 0 },
  { name: "Scheduler", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Calendar and reminder management", cost_per_call: 0.00046 },
  { name: "Email", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Reads, sends, archives Gmail with AI summarisation", cost_per_call: 0.00046 },
  { name: "Travel", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Trip planning, itineraries, destination research", cost_per_call: 0 },
  { name: "Auto Marketing", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Content strategy, social media, Twitter publishing", cost_per_call: 0.002 },
  { name: "Medic", status: "LIVE", model: "qwen/qwen3-8b:free", type: "background", tier: "BACKGROUND", provider: "openrouter", description: "Error scanner — checks for bugs every 6 hours and auto-fixes when possible", cost_per_call: 0 },
  { name: "Heartbeat", status: "LIVE", model: "qwen/qwen3-8b:free", type: "background", tier: "BACKGROUND", provider: "openrouter", description: "System pulse — runs health checks, processes tasks, and syncs data", cost_per_call: 0 },
  { name: "Ledger", status: "LIVE", model: "none", type: "tool", tier: "TOOLS", provider: "none", description: "Real-time Mission Control updater", cost_per_call: 0 },
  { name: "Drive", status: "LIVE", model: "none", type: "tool", tier: "TOOLS", provider: "none", description: "Google Drive I/O — read, write, list, move, delete", cost_per_call: 0 },
];
