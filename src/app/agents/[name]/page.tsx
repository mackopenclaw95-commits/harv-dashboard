"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
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
  Send,
  User,
  Cpu,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAgentChat,
  saveAgentChat,
  type StoredMessage,
} from "@/lib/chat-history";

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

interface Agent {
  name: string;
  status: string;
  model: string;
  type: string;
  tier: string;
  provider: string;
  description: string;
  cost_per_call: number;
}

interface LastEvent {
  action: string;
  status: string;
  summary: string;
  timestamp: string;
  cost: number;
  tokens: number;
  duration: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
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
    default:
      return "bg-muted text-muted-foreground";
  }
}

function timeAgo(ts: string): string {
  if (!ts) return "";
  const now = Date.now();
  const then = new Date(
    ts.replace(" ", "T") + (ts.includes("+") || ts.includes("Z") ? "" : "Z")
  ).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (isNaN(diff) || diff < 0) return ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function callAgentAPI(
  message: string,
  agent: string
): Promise<string> {
  const res = await fetch("/api/chat/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, agent }),
  });
  if (!res.ok) return `Error: ${res.status}`;
  return await res.text();
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: rawName } = use(params);
  const agentName = decodeURIComponent(rawName);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [lastEvent, setLastEvent] = useState<LastEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const autoSentRef = useRef(false);
  const historyLoadedRef = useRef(false);

  const Icon = AGENT_ICONS[agentName] || Bot;

  // Fetch agent info and load chat history
  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, eventsRes] = await Promise.all([
          fetch("/api/proxy?path=/api/agents/list"),
          fetch("/api/proxy?path=/api/events/recent?limit=50"),
        ]);
        const agentsData = await agentsRes.json();
        const eventsData = await eventsRes.json();

        const found = (agentsData.agents || []).find(
          (a: Agent) => a.name.toLowerCase() === agentName.toLowerCase()
        );
        if (found) setAgent(found);

        const events = eventsData.events || [];
        const match = events.find(
          (ev: { agent: string }) =>
            (ev.agent || "").toLowerCase() === agentName.toLowerCase()
        );
        if (match) {
          setLastEvent({
            action: match.action || "",
            status: match.status || "",
            summary: match.summary || "",
            timestamp: match.timestamp || "",
            cost: match.cost || 0,
            tokens: match.tokens || 0,
            duration: match.duration_seconds || 0,
          });
        }

        // Load saved chat history (do this after agent fetch so we have agent info for welcome)
        if (!historyLoadedRef.current) {
          historyLoadedRef.current = true;
          const saved = getAgentChat(agentName);
          if (saved.length > 0) {
            setMessages(
              saved.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
            );
          } else if (found) {
            setMessages([
              {
                id: "welcome",
                role: "assistant",
                content: `Hey! I'm ${found.name}. ${found.description}. How can I help?`,
                timestamp: new Date(),
              },
            ]);
          }
        }
      } catch {
        // still works for chat — load history even if API fails
        if (!historyLoadedRef.current) {
          historyLoadedRef.current = true;
          const saved = getAgentChat(agentName);
          if (saved.length > 0) {
            setMessages(
              saved.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
            );
          }
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentName]);

  // Auto-send from query param (?msg=...)
  useEffect(() => {
    if (autoSentRef.current || !agent || messages.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const msg = params.get("msg");
    if (msg) {
      autoSentRef.current = true;
      doSend(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, messages.length]);

  // Save to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      const toStore: StoredMessage[] = messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      }));
      saveAgentChat(agentName, toStore);
    }
  }, [messages, agentName]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function doSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSendingRef.current) return;

    isSendingRef.current = true;
    setIsSending(true);
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const reply = await callAgentAPI(trimmed, agentName);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: reply || "Sorry, I couldn't generate a response.",
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Connection error. Is the Harv API running?",
          timestamp: new Date(),
        },
      ]);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSend(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend(input);
    }
  }

  const modelShort = agent
    ? (agent.model || "none").split("/").pop()
    : "...";
  const costStr = agent
    ? agent.cost_per_call > 0
      ? `$${agent.cost_per_call.toFixed(4)}`
      : "Free"
    : "...";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b px-6 py-4">
        <Link
          href="/agents"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Icon className="h-6 w-6 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold truncate">{agentName}</h1>
            {agent && (
              <Badge variant="outline" className={statusColor(agent.status)}>
                {agent.status}
              </Badge>
            )}
          </div>
          {agent && (
            <p className="text-sm text-muted-foreground truncate">
              {agent.description}
            </p>
          )}
        </div>
        {agent && (
          <div className="hidden sm:flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-violet-500/10 text-violet-400 border-violet-500/30"
            >
              <Cpu className="h-3 w-3 mr-1" />
              {modelShort}
            </Badge>
            <Badge
              variant="outline"
              className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
            >
              <DollarSign className="h-3 w-3 mr-1" />
              {costStr}
            </Badge>
          </div>
        )}
      </header>

      {/* Main content: sidebar info + chat */}
      <div className="flex flex-1 min-h-0">
        {/* Info sidebar */}
        <aside className="hidden lg:flex w-72 flex-col border-r p-4 gap-4 overflow-y-auto">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : agent ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Provider</span>
                    <p className="font-medium">{agent.provider}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Model</span>
                    <p className="font-medium font-mono text-[11px]">
                      {agent.model}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tier</span>
                    <p className="font-medium">{agent.tier}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type</span>
                    <p className="font-medium">{agent.type}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cost/Call</span>
                    <p className="font-medium">{costStr}</p>
                  </div>
                </CardContent>
              </Card>

              {lastEvent && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      Last Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <span className="text-muted-foreground">Action</span>
                        <p className="font-medium">{lastEvent.action}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status</span>
                        <p className="font-medium">{lastEvent.status}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Time</span>
                        <p className="font-medium">
                          {timeAgo(lastEvent.timestamp)}
                        </p>
                      </div>
                      {lastEvent.duration > 0 && (
                        <div>
                          <span className="text-muted-foreground">
                            Duration
                          </span>
                          <p className="font-medium">
                            {lastEvent.duration.toFixed(1)}s
                          </p>
                        </div>
                      )}
                      {lastEvent.tokens > 0 && (
                        <div>
                          <span className="text-muted-foreground">Tokens</span>
                          <p className="font-medium">
                            {lastEvent.tokens.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {lastEvent.cost > 0 && (
                        <div>
                          <span className="text-muted-foreground">Cost</span>
                          <p className="font-medium">
                            ${lastEvent.cost.toFixed(5)}
                          </p>
                        </div>
                      )}
                    </div>
                    {lastEvent.summary && (
                      <p className="text-muted-foreground italic">
                        {lastEvent.summary}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Agent &quot;{agentName}&quot; not found in registry
            </div>
          )}
        </aside>

        {/* Chat area */}
        <div className="flex flex-1 flex-col min-h-0">
          <ScrollArea className="flex-1 px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <Avatar className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </Avatar>
                  )}

                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <time className="mt-1 block text-[10px] opacity-50">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>

                  {msg.role === "user" && (
                    <Avatar className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                      <User className="h-4 w-4" />
                    </Avatar>
                  )}
                </div>
              ))}

              {isSending && (
                <div className="flex gap-3">
                  <Avatar className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </Avatar>
                  <div className="rounded-2xl bg-muted px-4 py-3">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="border-t px-4 py-4">
            <form
              onSubmit={handleSubmit}
              className="mx-auto flex max-w-2xl items-end gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${agentName}...`}
                rows={1}
                className="min-h-[44px] max-h-[200px] resize-none"
                disabled={isSending}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isSending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
