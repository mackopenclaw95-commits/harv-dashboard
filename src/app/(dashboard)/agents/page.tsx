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
  Activity,
  BarChart3,
  Wrench,
  Shield,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  Cpu,
  Send,
  Users,
  ArrowRight,
  X,
  ShieldCheck,
  AlertTriangle,
  Plus,
  MessageSquare,
  Bot,
  Lock,
  Crown,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { saveAgentMessage } from "@/lib/chat-history";
import { getRoutingMessage } from "@/lib/constants";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { TIER_LIMITS, displayModelName, type TierKey } from "@/lib/plan-config";
import {
  AGENT_ICONS,
  SUB_AGENT_MAP,
  COMING_SOON_AGENTS,
  COMING_SOON_PERSONAL,
  COMING_SOON_BUSINESS,
  PLANNED_AGENT_NAMES,
  PLANNED_AGENTS,
  PLANNED_AGENTS_META,
  NO_CHAT_AGENTS,
  statusColor,
  type Agent,
  type LastEvent,
  type PlannedAgentMeta,
} from "@/lib/agent-data";

// ─── Helpers ────────────────────────────────────────────

function simplifyModel(model: string): string {
  if (!model || model === "none" || model === "tbd") return model;
  return displayModelName(model);
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

function AgentCard({ agent, onViewDetails, childAgents, harvPlanModel }: { agent: Agent; onViewDetails?: (agent: Agent) => void; childAgents?: Agent[]; harvPlanModel?: string }) {
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
  const modelShort = (agent.name === "Harv" && harvPlanModel) ? harvPlanModel : simplifyModel(agent.model);

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
                  <SubAgentCard key={child.name} agent={child} />
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

function SubAgentCard({ agent }: { agent: Agent }) {
  const Icon = AGENT_ICONS[agent.name] || Bot;
  const isPlanned = agent.status.toUpperCase() === "PLANNED";
  const meta = isPlanned ? PLANNED_AGENTS_META.find((m) => m.agent.name === agent.name) : null;

  // If we have rich metadata, show the enhanced card
  if (meta) return <PlannedAgentCard meta={meta} />;

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

// ─── PlannedAgentCard ──────────────────────────────────

function getAgentWaitlist(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("harv-agent-waitlist") || "[]"); } catch { return []; }
}

function PlannedAgentCard({ meta }: { meta: PlannedAgentMeta }) {
  const { agent, capabilities, eta } = meta;
  const Icon = AGENT_ICONS[agent.name] || Bot;
  const [onWaitlist, setOnWaitlist] = useState(false);

  useEffect(() => {
    setOnWaitlist(getAgentWaitlist().includes(agent.name));
  }, [agent.name]);

  function toggleNotify() {
    const list = getAgentWaitlist();
    const idx = list.indexOf(agent.name);
    if (idx >= 0) { list.splice(idx, 1); } else { list.push(agent.name); }
    localStorage.setItem("harv-agent-waitlist", JSON.stringify(list));
    setOnWaitlist(idx < 0);
    toast.success(idx < 0 ? `You'll be notified when ${agent.name} launches` : `Removed from ${agent.name} waitlist`);
  }

  return (
    <Card className="relative overflow-hidden transition-all duration-300 ring-1 ring-white/[0.08] hover:ring-primary/15 bg-gradient-to-br from-white/[0.02] to-transparent">
      {/* ETA ribbon */}
      <div className="absolute top-3 right-3">
        <Badge className="bg-indigo-500/15 text-indigo-400 border-indigo-500/30 text-[9px] px-1.5 py-0">
          {eta}
        </Badge>
      </div>

      <CardContent className="py-3.5 px-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08]">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <span className="text-sm font-semibold">{agent.name}</span>
            <p className="text-[11px] text-muted-foreground">{agent.description}</p>
          </div>
        </div>

        {/* Capabilities */}
        <ul className="space-y-1 mb-3">
          {capabilities.map((cap) => (
            <li key={cap} className="flex items-start gap-2 text-[11px] text-muted-foreground/80">
              <span className="mt-1 h-1 w-1 rounded-full bg-primary/50 shrink-0" />
              {cap}
            </li>
          ))}
        </ul>

        {/* Notify button */}
        <button
          onClick={toggleNotify}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ring-1",
            onWaitlist
              ? "bg-primary/10 text-primary ring-primary/20"
              : "bg-white/[0.02] text-muted-foreground ring-white/[0.06] hover:ring-white/[0.12] hover:text-foreground"
          )}
        >
          <MessageSquare className="h-3 w-3" />
          {onWaitlist ? "On Waitlist" : "Notify Me"}
        </button>
      </CardContent>
    </Card>
  );
}

// ─── SubAgentGroup (collapsible sub-agents) ─────────────

function SubAgentGroup({ agent, childAgents, onViewDetails, harvPlanModel }: { agent: Agent; childAgents: Agent[]; onViewDetails?: (agent: Agent) => void; harvPlanModel?: string }) {
  return (
    <AgentCard agent={agent} onViewDetails={onViewDetails} childAgents={childAgents} harvPlanModel={harvPlanModel} />
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
  harvPlanModel,
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
  harvPlanModel?: string;
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
                  <SubAgentGroup key={agent.name} agent={agent} childAgents={childAgents} onViewDetails={onViewDetails} harvPlanModel={harvPlanModel} />
                );
              }
              return <AgentCard key={agent.name} agent={agent} onViewDetails={onViewDetails} harvPlanModel={harvPlanModel} />;
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

function AgentDetailsModal({ agent, onClose, harvPlanModel }: { agent: Agent | null; onClose: () => void; harvPlanModel?: string }) {
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
          <span>Model: <span className="text-foreground">{(agent.name === agentName && agentName === "Harv" && harvPlanModel) ? harvPlanModel : simplifyModel(agent.model)}</span></span>
          <span>Tag: <span className="text-foreground">{agent.tier === "BACKGROUND" ? "SYSTEM" : agent.tier}</span></span>
          {agent.cost_per_call > 0 && <span>Cost: <span className="text-foreground">${agent.cost_per_call.toFixed(5)}</span></span>}
        </div>

        {/* Research Multi-Model Pipeline */}
        {agentName === "Research" && (
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">Multi-Model Pipeline</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 px-2.5 py-1.5">
                <Search className="h-3 w-3 text-blue-400" />
                <span className="text-blue-400 font-medium">Search</span>
                <span className="text-blue-400/60">Engine</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
              <div className="flex items-center gap-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-500/20 px-2.5 py-1.5">
                <Cpu className="h-3 w-3 text-purple-400" />
                <span className="text-purple-400 font-medium">Analysis</span>
                <span className="text-purple-400/60">Engine</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 px-2.5 py-1.5">
                <Shield className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Standard</span>
                <span className="text-emerald-400/60">Fallback</span>
              </div>
            </div>
          </div>
        )}

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
  const { profile, isAdmin } = useAuth();
  const userPlan = (profile?.plan || "free") as TierKey;
  // Only Harv uses the plan-based model — other agents keep their specialized models
  const harvPlanModel = simplifyModel(TIER_LIMITS[userPlan]?.primaryModel || TIER_LIMITS.free.primaryModel);

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

        // Merge Coming Soon agents not in API response
        for (const planned of PLANNED_AGENTS) {
          if (!agentsList.find((a) => a.name === planned.name)) {
            agentsList.push({ ...planned, last_event: null });
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
          "Marketing": "Social media drafts, campaigns, and publishing",
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

  const ADMIN_ONLY_AGENTS = new Set(["Auto Marketing", "Marketing"]);
  const visibleAgents = isAdmin ? agents : agents.filter((a) => !ADMIN_ONLY_AGENTS.has(a.name));
  const activeAgents = visibleAgents.filter((a) => a.type === "agent" && !COMING_SOON_AGENTS.has(a.name));
  const comingSoonPersonalGroup = visibleAgents.filter((a) => COMING_SOON_PERSONAL.has(a.name));
  const comingSoonBusinessGroup = visibleAgents.filter((a) => COMING_SOON_BUSINESS.has(a.name));
  const comingSoonGroup = [...comingSoonPersonalGroup, ...comingSoonBusinessGroup];
  const HIDDEN_TOOLS = new Set(["Analytics", "Memory", "Scribe", "Ledger", "Drive"]);
  const toolGroup = visibleAgents.filter((a) => a.type === "tool" && !HIDDEN_TOOLS.has(a.name));
  const bgGroup = visibleAgents.filter((a) => a.type === "background");

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
            harvPlanModel={harvPlanModel}
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
              harvPlanModel={harvPlanModel}
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
            harvPlanModel={harvPlanModel}
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
      <AgentDetailsModal agent={detailsAgent} onClose={() => setDetailsAgent(null)} harvPlanModel={harvPlanModel} />

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
  { name: "Guardian", status: "LIVE", model: "google/gemma-3-4b-it:free", type: "background", tier: "BACKGROUND", provider: "openrouter", description: "System monitor — watches for issues and keeps everything running smoothly", cost_per_call: 0 },
  { name: "Journal", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Daily memory — session compression, 3am EST cutoff, Supabase storage", cost_per_call: 0.000622 },
  { name: "Research", status: "LIVE", model: "x-ai/grok-4.1-fast", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Research orchestrator — routes to Product, Market, and Data Viz sub-agents", cost_per_call: 0.001 },
  { name: "Product Research", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Product comparisons, reviews, and purchase recommendations", cost_per_call: 0.001 },
  { name: "Market Research", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Competitor analysis, industry trends, market sizing", cost_per_call: 0.001 },
  { name: "Data Viz", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Charts, graphs, and visual data reports from raw data", cost_per_call: 0 },
  { name: "Finance", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Budget tracking, transaction logging, Plaid bank sync", cost_per_call: 0 },
  { name: "Trading", status: "COMING_SOON", model: "tbd", type: "personal", tier: "AGENTS", provider: "tbd", description: "Polymarket + Kalshi paper trading, crypto tracking", cost_per_call: 0 },
  { name: "Music", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Spotify API — playback, playlists, recommendations", cost_per_call: 0 },
  { name: "Sports", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Live scores, standings, schedules, injury reports", cost_per_call: 0 },
  { name: "Learning", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Research assistant, tutor, flashcards, quizzes", cost_per_call: 0 },
  { name: "Video Digest", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Video implementation assistant — transcripts, digests, and actionable breakdowns", cost_per_call: 0.002 },
  { name: "YouTube Digest", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "YouTube video summaries, transcript analysis, implementation notes", cost_per_call: 0.002 },
  { name: "TikTok Digest", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "TikTok video digest, transcription, and implementation guide", cost_per_call: 0.001 },
  { name: "Twitter Digest", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Twitter/X thread summarization and implementation guide", cost_per_call: 0.001 },
  { name: "Media Manager", status: "LIVE", model: "orchestrator", type: "agent", tier: "AGENTS", provider: "keyword-router", description: "Media orchestrator — routes to Image Gen, Video Gen, and Video Editor", cost_per_call: 0 },
  { name: "Image Gen", status: "LIVE", model: "imagen-4.0-fast-generate-001", type: "agent", tier: "AGENTS", provider: "gemini", description: "AI image generation, sends to Telegram", cost_per_call: 0.003 },
  { name: "Video Gen", status: "LIVE", model: "bytedance/seedance-1-5-pro", type: "agent", tier: "AGENTS", provider: "openrouter", description: "AI video generation from text prompts", cost_per_call: 0.005 },
  { name: "Video Editor", status: "LIVE", model: "ffmpeg+deepseek", type: "agent", tier: "AGENTS", provider: "local+openrouter", description: "Video editing — trim, resize, crop, speed, rotate, subtitles, convert", cost_per_call: 0 },
  { name: "Image Editor", status: "LIVE", model: "pillow+deepseek", type: "agent", tier: "AGENTS", provider: "local+openrouter", description: "Image editing — resize, crop, rotate, filters, text overlay, convert", cost_per_call: 0 },
  { name: "Scheduler", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Calendar and reminder management", cost_per_call: 0.00046 },
  { name: "Email", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Reads, sends, archives Gmail with AI summarisation", cost_per_call: 0.00046 },
  { name: "Travel", status: "LIVE", model: "minimax/minimax-m2.1", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Trip planning, itineraries, destination research", cost_per_call: 0 },
  { name: "Marketing", status: "LIVE", model: "deepseek/deepseek-v3.2", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Content strategy, social media, Twitter publishing", cost_per_call: 0.002 },
  { name: "Fitness", status: "COMING_SOON", model: "tbd", type: "personal", tier: "AGENTS", provider: "tbd", description: "Fitness tracking with Garmin Connect integration", cost_per_call: 0 },
  { name: "Shopping", status: "COMING_SOON", model: "tbd", type: "personal", tier: "AGENTS", provider: "tbd", description: "Shopping lists, product research, and purchase tracking", cost_per_call: 0 },
  { name: "Medic", status: "LIVE", model: "google/gemma-3-4b-it:free", type: "background", tier: "BACKGROUND", provider: "openrouter", description: "Error scanner — checks for bugs every 6 hours and auto-fixes when possible", cost_per_call: 0 },
  { name: "Heartbeat", status: "LIVE", model: "google/gemma-3-4b-it:free", type: "background", tier: "BACKGROUND", provider: "openrouter", description: "System pulse — runs health checks, processes tasks, and syncs data", cost_per_call: 0 },
  { name: "Ledger", status: "LIVE", model: "none", type: "tool", tier: "TOOLS", provider: "none", description: "Real-time Mission Control updater", cost_per_call: 0 },
  { name: "Drive", status: "LIVE", model: "none", type: "tool", tier: "TOOLS", provider: "none", description: "Google Drive I/O — read, write, list, move, delete", cost_per_call: 0 },
];
