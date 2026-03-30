"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { saveCustomAutomation, saveCustomAgent } from "@/lib/preferences";
import type { CustomAutomation, CustomAgent } from "@/lib/preferences";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Bot,
  Cpu,
  DollarSign,
  Zap,
  MessageSquare,
  PenTool,
  CheckCircle,
  Clock,
  ChevronRight,
  Settings2,
  Send,
  X,
  User,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { AGENT_ICONS } from "@/lib/agent-icons";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { toast } from "sonner";

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

  const Icon = AGENT_ICONS[agentName] || Bot;

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, eventsRes] = await Promise.all([
          fetch("/api/proxy?path=/api/agents/list"),
          fetch("/api/proxy?path=/api/events/recent?limit=50"),
        ]);
        const agentsData = agentsRes.ok ? await agentsRes.json() : { agents: [] };
        const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };

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
      } catch {
        // error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentName]);

  const modelShort = agent
    ? (agent.model || "none").split("/").pop()
    : "...";
  const costStr = agent
    ? agent.cost_per_call > 0
      ? `$${agent.cost_per_call.toFixed(4)}`
      : "Free"
    : "...";

  // ─── Automation Builder special UI ─────────────────────
  if (agentName === "Automation Builder") {
    return <AutomationBuilderPage />;
  }

  // ─── Agent Builder special UI ─────────────────────────
  if (agentName === "Agent Builder") {
    return <AgentBuilderPage />;
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 border-b border-white/[0.06] px-6 py-4 bg-card/50 backdrop-blur-xl">
        <Link
          href="/agents"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-colors"
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

      {/* Main content: agent info */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Chat CTA */}
          <Link href={`/chat?tab=agents&agent=${encodeURIComponent(agentName)}`}>
            <div className="rounded-xl p-5 bg-primary/10 ring-1 ring-primary/20 hover:bg-primary/15 transition-all cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-primary">
                    Chat with {agentName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Open a conversation in the Chat tab
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-primary/60 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>

          {/* Agent details cards */}
          {loading ? (
            <div className="space-y-4">
              <Card><CardHeader className="pb-2"><Skeleton className="h-4 w-16" /></CardHeader><CardContent className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/2" /></CardContent></Card>
              <Card><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></CardContent></Card>
            </div>
          ) : agent ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
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
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-medium">{agent.status}</p>
                  </div>
                </CardContent>
              </Card>

              {agent.description && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {agent.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {lastEvent && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      Last Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                          <span className="text-muted-foreground">Duration</span>
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
            <div className="text-sm text-muted-foreground text-center py-12">
              Agent &quot;{agentName}&quot; not found in registry
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Automation Builder (Conversational) ────────────────

const SCHEDULE_OPTIONS = [
  "Daily at 7 AM", "Daily at 8 AM", "Daily at 9 AM", "Daily at 12 PM",
  "Daily at 5 PM", "Daily at midnight",
  "Weekdays at 8 AM", "Weekdays at 9 AM",
  "Fridays at 5 PM",
  "Weekly on Monday", "Weekly on Sunday",
  "Every hour", "Every 3 hours", "Every 6 hours",
];

const AGENT_OPTIONS = [
  "Harv", "Email", "Research", "Scheduler", "Journal",
  "Auto Marketing", "Learning", "Travel",
];

interface FollowUp {
  question: string;
  options: string[];
  key: string;
}

function generateFollowUps(desc: string): FollowUp[] {
  const d = desc.toLowerCase();
  const questions: FollowUp[] = [];

  // Audience
  if (d.includes("email") || d.includes("send") || d.includes("notify") || d.includes("summary") || d.includes("report")) {
    questions.push({
      question: "Who should receive this?",
      options: ["Just me", "My whole team", "Specific people", "A Slack/Discord channel"],
      key: "audience",
    });
  }

  // Content scope
  if (d.includes("summary") || d.includes("report") || d.includes("briefing") || d.includes("digest")) {
    questions.push({
      question: "What should be included?",
      options: ["All agent activity", "Only conversations", "Costs & analytics", "Tasks & calendar events", "Everything"],
      key: "scope",
    });
  }

  // Format
  if (d.includes("report") || d.includes("summary") || d.includes("briefing")) {
    questions.push({
      question: "How should it be formatted?",
      options: ["Short bullet points", "Detailed breakdown", "Quick one-liner", "Visual chart summary"],
      key: "format",
    });
  }

  // Social media specifics
  if (d.includes("post") || d.includes("social") || d.includes("twitter") || d.includes("marketing")) {
    questions.push({
      question: "Which platforms?",
      options: ["Twitter/X", "LinkedIn", "All connected platforms", "Let Harv decide"],
      key: "platforms",
    });
    questions.push({
      question: "What kind of content?",
      options: ["Industry insights", "Company updates", "Engagement posts", "Mix of everything"],
      key: "content_type",
    });
  }

  // Research / data
  if (d.includes("research") || d.includes("monitor") || d.includes("track") || d.includes("watch")) {
    questions.push({
      question: "How should results be delivered?",
      options: ["Email digest", "Dashboard notification", "Slack message", "Save to documents"],
      key: "delivery",
    });
  }

  // Calendar / scheduling
  if (d.includes("calendar") || d.includes("meeting") || d.includes("agenda") || d.includes("schedule")) {
    questions.push({
      question: "How far ahead should it look?",
      options: ["Today only", "Next 3 days", "The full week", "Next 2 weeks"],
      key: "lookahead",
    });
  }

  // Cleanup / archive
  if (d.includes("clean") || d.includes("archive") || d.includes("organize") || d.includes("delete") || d.includes("backup")) {
    questions.push({
      question: "What should be cleaned up?",
      options: ["Old conversations (30+ days)", "Unread emails", "Completed tasks", "All of the above"],
      key: "cleanup_target",
    });
  }

  // If nothing matched, add generic questions
  if (questions.length === 0) {
    questions.push({
      question: "Can you tell me more about what you need?",
      options: ["Send me notifications", "Generate a report", "Automate a task", "Monitor something"],
      key: "intent",
    });
  }

  return questions.slice(0, 3); // Max 3 follow-ups
}

function suggestAgent(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("email") || d.includes("inbox") || d.includes("send")) return "Email";
  if (d.includes("research") || d.includes("monitor") || d.includes("track")) return "Research";
  if (d.includes("calendar") || d.includes("meeting") || d.includes("agenda") || d.includes("schedule")) return "Scheduler";
  if (d.includes("post") || d.includes("social") || d.includes("twitter") || d.includes("marketing")) return "Auto Marketing";
  if (d.includes("learn") || d.includes("study") || d.includes("quiz")) return "Learning";
  if (d.includes("journal") || d.includes("diary") || d.includes("log")) return "Journal";
  if (d.includes("trip") || d.includes("travel") || d.includes("flight")) return "Travel";
  return "Harv";
}

function suggestSchedule(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("morning")) return "Daily at 8 AM";
  if (d.includes("evening") || d.includes("end of day")) return "Daily at 5 PM";
  if (d.includes("weekly") || d.includes("every week")) return "Weekly on Monday";
  if (d.includes("friday")) return "Fridays at 5 PM";
  if (d.includes("midnight") || d.includes("overnight")) return "Daily at midnight";
  if (d.includes("hourly") || d.includes("every hour")) return "Every hour";
  if (d.includes("weekday")) return "Weekdays at 9 AM";
  return "Daily at 8 AM";
}

type BuilderStep = "describe" | "followup" | "configure" | "created";

function AutomationBuilderPage() {
  const [step, setStep] = useState<BuilderStep>("describe");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState(SCHEDULE_OPTIONS[1]);
  const [agent, setAgent] = useState(AGENT_OPTIONS[0]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<Array<{ role: "harv" | "user"; text: string }>>([
    { role: "harv", text: "Hey! I'm the Automation Builder. Tell me what you'd like to automate and I'll set it up for you." },
  ]);

  function handleDescribe() {
    if (!name.trim() || !description.trim()) {
      toast.error("Fill in both the name and description");
      return;
    }

    // Add user message to chat
    setChatMessages((prev) => [
      ...prev,
      { role: "user", text: `I want to create "${name}" — ${description}` },
    ]);

    // Generate follow-ups based on description
    const fups = generateFollowUps(description);
    setFollowUps(fups);

    // Auto-suggest agent and schedule
    setAgent(suggestAgent(description));
    setSchedule(suggestSchedule(description));

    // Harv responds
    setTimeout(() => {
      const suggestedAgent = suggestAgent(description);
      setChatMessages((prev) => [
        ...prev,
        { role: "harv", text: `Got it! I'll use **${suggestedAgent}** for this. I have a few quick questions to make sure I set this up perfectly.` },
      ]);
      setStep("followup");
    }, 600);
  }

  function handleAnswer(key: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [key]: answer }));

    // Add to chat
    setChatMessages((prev) => [
      ...prev,
      { role: "user", text: answer },
    ]);

    // Check if all follow-ups answered
    const newAnswers = { ...answers, [key]: answer };
    const allAnswered = followUps.every((f) => newAnswers[f.key]);

    if (allAnswered) {
      // Build the refined description
      const extras = Object.entries(newAnswers).map(([, v]) => v).join(". ");
      const refined = `${description}. ${extras}`;

      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          { role: "harv", text: `Perfect! Here's what I've set up. Take a look at the preview and hit confirm when you're ready.` },
        ]);
        setDescription(refined);
        setStep("configure");
      }, 500);
    }
  }

  function handleCreate() {
    const auto: CustomAutomation = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      schedule,
      agent,
      action: "custom",
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    saveCustomAutomation(auto);
    setChatMessages((prev) => [
      ...prev,
      { role: "harv", text: `Done! "${name}" is now live and will run ${schedule}. You can manage it from the Automations page.` },
    ]);
    setStep("created");
    toast.success("Automation created!");
  }

  // Find the current unanswered follow-up
  const currentFollowUp = followUps.find((f) => !answers[f.key]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <header className="shrink-0 flex items-center gap-3 border-b border-white/[0.06] px-6 py-4 bg-card/50 backdrop-blur-xl">
        <Link href="/crons" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold">Automation Builder</h1>
          <p className="text-xs text-muted-foreground">
            {step === "describe" ? "Describe your automation" : step === "followup" ? "Refining details..." : step === "configure" ? "Review & confirm" : "All set!"}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Chat messages */}
          {chatMessages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "harv" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card/50 backdrop-blur-sm rounded-bl-md ring-1 ring-white/[0.06]"
              )}>
                <p className="whitespace-pre-wrap">{msg.text.replace(/\*\*(.*?)\*\*/g, "$1")}</p>
              </div>
              {msg.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/8 mt-0.5">
                  <User className="h-4 w-4 text-foreground/70" />
                </div>
              )}
            </div>
          ))}

          {/* Step 1: Describe */}
          {step === "describe" && (
            <Card className="mt-4">
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Name your automation</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Morning Team Briefing" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">What should it do?</label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe in plain English what you want automated..." rows={3} className="text-sm resize-none" />
                </div>
                <Button onClick={handleDescribe} className="w-full gap-2" disabled={!name.trim() || !description.trim()}>
                  <Send className="h-4 w-4" />
                  Continue
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Follow-up questions */}
          {step === "followup" && currentFollowUp && (
            <Card className="mt-2">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm font-medium mb-3">{currentFollowUp.question}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {currentFollowUp.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleAnswer(currentFollowUp.key, opt)}
                      className="text-left rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-primary/20 hover:bg-white/[0.06] px-4 py-3 text-sm transition-all duration-200"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Configure & Preview */}
          {step === "configure" && (
            <>
              <Card className="mt-2">
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Schedule</label>
                    <select value={schedule} onChange={(e) => setSchedule(e.target.value)} className="w-full rounded-lg bg-card/50 ring-1 ring-white/[0.08] border-0 px-3 py-2.5 text-sm text-foreground focus:ring-primary/30 focus:outline-none">
                      {SCHEDULE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Advanced options toggle */}
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-90")} />
                    <Settings2 className="h-3 w-3" />
                    Advanced options
                  </button>

                  {showAdvanced && (
                    <div className="pl-5 space-y-1.5">
                      <label className="text-xs text-muted-foreground font-medium">Run by</label>
                      <select value={agent} onChange={(e) => setAgent(e.target.value)} className="w-full rounded-lg bg-card/50 ring-1 ring-white/[0.08] border-0 px-3 py-2.5 text-sm text-foreground focus:ring-primary/30 focus:outline-none">
                        {AGENT_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preview */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Preview</p>
                <Card className="ring-primary/20">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                          <Zap className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] shrink-0">Custom</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />{schedule}</span>
                      <span>by {agent}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Button onClick={handleCreate} className="w-full gap-2" size="lg">
                <CheckCircle className="h-4 w-4" />
                Confirm & Create
              </Button>
            </>
          )}

          {/* Step 4: Created */}
          {step === "created" && (
            <div className="flex gap-3 mt-4">
              <Link href="/crons" className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary text-sm font-medium transition-colors">
                View Automations
              </Link>
              <button
                onClick={() => { setStep("describe"); setName(""); setDescription(""); setAnswers({}); setFollowUps([]); setChatMessages([{ role: "harv", text: "Ready to build another automation! What do you need?" }]); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors ring-1 ring-white/[0.06]"
              >
                Create Another
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Agent Builder Constants ────────────────────────────

const AGENT_TYPE_OPTIONS = ["General Purpose", "Specialist", "Background", "Tool"];
const MODEL_OPTIONS = [
  "Let Harv decide",
  "Claude (Anthropic)", "GPT-4o (OpenAI)", "Grok (xAI)",
  "DeepSeek V3", "Qwen 3 (OpenRouter)", "Ollama (Local/Free)",
];

interface AgentFollowUp {
  question: string;
  options: string[];
  key: string;
}

function generateAgentFollowUps(desc: string): AgentFollowUp[] {
  const d = desc.toLowerCase();
  const questions: AgentFollowUp[] = [];

  // Communication style
  questions.push({
    question: "What personality should this agent have?",
    options: ["Professional & concise", "Friendly & casual", "Technical & detailed", "No personality — just results"],
    key: "personality",
  });

  // Trigger
  if (d.includes("monitor") || d.includes("watch") || d.includes("alert") || d.includes("scan")) {
    questions.push({
      question: "How should this agent be triggered?",
      options: ["On a schedule (cron)", "When an event happens", "Manually by me", "Called by another agent"],
      key: "trigger",
    });
  } else if (d.includes("chat") || d.includes("talk") || d.includes("ask") || d.includes("help")) {
    questions.push({
      question: "Should this agent be available for direct chat?",
      options: ["Yes — I want to chat with it", "No — it works in the background", "Only when another agent calls it"],
      key: "chat_mode",
    });
  } else {
    questions.push({
      question: "How will you interact with this agent?",
      options: ["Chat directly", "It runs automatically", "Other agents call it", "All of the above"],
      key: "interaction",
    });
  }

  // Data access
  if (d.includes("data") || d.includes("api") || d.includes("connect") || d.includes("integrate")) {
    questions.push({
      question: "What data sources does it need?",
      options: ["External APIs", "Google Sheets/Drive", "Database queries", "Web scraping", "No external data"],
      key: "data_source",
    });
  }

  if (questions.length < 3) {
    questions.push({
      question: "How important is cost for this agent?",
      options: ["Free only (Ollama)", "Budget-friendly", "Best quality regardless of cost", "Let Harv optimize"],
      key: "cost_pref",
    });
  }

  return questions.slice(0, 3);
}

function suggestAgentModel(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("free") || d.includes("local") || d.includes("simple")) return "Ollama (Local/Free)";
  if (d.includes("smart") || d.includes("complex") || d.includes("reason")) return "Claude (Anthropic)";
  if (d.includes("research") || d.includes("search") || d.includes("web")) return "Grok (xAI)";
  if (d.includes("code") || d.includes("data") || d.includes("analyze")) return "DeepSeek V3";
  return "Let Harv decide";
}

function suggestAgentType(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("monitor") || d.includes("scan") || d.includes("watch") || d.includes("background") || d.includes("schedule")) return "Background";
  if (d.includes("api") || d.includes("tool") || d.includes("connect") || d.includes("utility")) return "Tool";
  if (d.includes("chat") || d.includes("talk") || d.includes("general")) return "General Purpose";
  return "Specialist";
}

type AgentBuilderStep = "describe" | "followup" | "configure" | "created";

function AgentBuilderPage() {
  const [step, setStep] = useState<AgentBuilderStep>("describe");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState(AGENT_TYPE_OPTIONS[0]);
  const [model, setModel] = useState(MODEL_OPTIONS[0]);
  const [followUps, setFollowUps] = useState<AgentFollowUp[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<Array<{ role: "harv" | "user"; text: string }>>([
    { role: "harv", text: "Hey! I'm the Agent Builder. Tell me what kind of agent you need and I'll set it up for you." },
  ]);

  function handleDescribe() {
    if (!name.trim() || !description.trim()) {
      toast.error("Fill in both the name and description");
      return;
    }

    setChatMessages((prev) => [
      ...prev,
      { role: "user", text: `I want to create "${name}" — ${description}` },
    ]);

    const fups = generateAgentFollowUps(description);
    setFollowUps(fups);
    setModel(suggestAgentModel(description));
    setAgentType(suggestAgentType(description));

    setTimeout(() => {
      const suggestedType = suggestAgentType(description);
      setChatMessages((prev) => [
        ...prev,
        { role: "harv", text: `Got it! I'll set this up as a **${suggestedType}** agent. Let me ask a few questions to get it right.` },
      ]);
      setStep("followup");
    }, 600);
  }

  function handleAnswer(key: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [key]: answer }));

    setChatMessages((prev) => [
      ...prev,
      { role: "user", text: answer },
    ]);

    const newAnswers = { ...answers, [key]: answer };
    const allAnswered = followUps.every((f) => newAnswers[f.key]);

    if (allAnswered) {
      const extras = Object.entries(newAnswers).map(([, v]) => v).join(". ");
      const refined = `${description}. ${extras}`;

      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          { role: "harv", text: `Perfect! Here's your new agent. Review the details and hit confirm when ready.` },
        ]);
        setDescription(refined);
        setStep("configure");
      }, 500);
    }
  }

  function handleCreate() {
    const caps = Object.values(answers).filter(Boolean);
    const agent: CustomAgent = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      type: agentType,
      model,
      personality: answers.personality || "Professional & concise",
      capabilities: caps,
      createdAt: new Date().toISOString(),
    };
    saveCustomAgent(agent);
    setChatMessages((prev) => [
      ...prev,
      { role: "harv", text: `Done! "${name}" has been created as a ${agentType} agent. You can find it on the Agents page.` },
    ]);
    setStep("created");
    toast.success("Agent created!");
  }

  const currentFollowUp = followUps.find((f) => !answers[f.key]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <header className="shrink-0 flex items-center gap-3 border-b border-white/[0.06] px-6 py-4 bg-card/50 backdrop-blur-xl">
        <Link href="/agents" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/20">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold">Agent Builder</h1>
          <p className="text-xs text-muted-foreground">
            {step === "describe" ? "Describe your agent" : step === "followup" ? "Refining details..." : step === "configure" ? "Review & confirm" : "All set!"}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Chat messages */}
          {chatMessages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "harv" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card/50 backdrop-blur-sm rounded-bl-md ring-1 ring-white/[0.06]"
              )}>
                <p className="whitespace-pre-wrap">{msg.text.replace(/\*\*(.*?)\*\*/g, "$1")}</p>
              </div>
              {msg.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/8 mt-0.5">
                  <User className="h-4 w-4 text-foreground/70" />
                </div>
              )}
            </div>
          ))}

          {/* Step 1: Describe */}
          {step === "describe" && (
            <Card className="mt-4">
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Name your agent</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Code Reviewer, Meeting Prep, News Digest" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">What should it do?</label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe in plain English what this agent should handle..." rows={3} className="text-sm resize-none" />
                </div>
                <Button onClick={handleDescribe} className="w-full gap-2" disabled={!name.trim() || !description.trim()}>
                  <Send className="h-4 w-4" />
                  Continue
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Follow-up questions */}
          {step === "followup" && currentFollowUp && (
            <Card className="mt-2">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm font-medium mb-3">{currentFollowUp.question}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {currentFollowUp.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleAnswer(currentFollowUp.key, opt)}
                      className="text-left rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-primary/20 hover:bg-white/[0.06] px-4 py-3 text-sm transition-all duration-200"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Configure & Preview */}
          {step === "configure" && (
            <>
              <Card className="mt-2">
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Agent Type</label>
                    <select value={agentType} onChange={(e) => setAgentType(e.target.value)} className="w-full rounded-lg bg-card/50 ring-1 ring-white/[0.08] border-0 px-3 py-2.5 text-sm text-foreground focus:ring-primary/30 focus:outline-none">
                      {AGENT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-90")} />
                    <Settings2 className="h-3 w-3" />
                    Advanced options
                  </button>

                  {showAdvanced && (
                    <div className="pl-5 space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-medium">Model</label>
                        <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-lg bg-card/50 ring-1 ring-white/[0.08] border-0 px-3 py-2.5 text-sm text-foreground focus:ring-primary/30 focus:outline-none">
                          {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preview */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Preview</p>
                <Card className="ring-primary/20">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                          <Bot className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description.split(". ")[0]}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] shrink-0">Custom</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Cpu className="h-3 w-3" />{agentType}</span>
                      <span>{model}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Button onClick={handleCreate} className="w-full gap-2" size="lg">
                <CheckCircle className="h-4 w-4" />
                Confirm & Create
              </Button>
            </>
          )}

          {/* Step 4: Created */}
          {step === "created" && (
            <div className="flex gap-3 mt-4">
              <Link href="/agents" className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary text-sm font-medium transition-colors">
                View Agents
              </Link>
              <button
                onClick={() => { setStep("describe"); setName(""); setDescription(""); setAnswers({}); setFollowUps([]); setShowAdvanced(false); setChatMessages([{ role: "harv", text: "Ready to build another agent! What do you need?" }]); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-colors ring-1 ring-white/[0.06]"
              >
                Create Another
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
