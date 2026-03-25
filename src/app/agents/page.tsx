"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Brain,
  Dumbbell,
  DollarSign,
  Newspaper,
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
} from "lucide-react";

interface Agent {
  name: string;
  status: string;
  model: string;
  type: string;
  last_task?: string;
  last_used?: string;
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

function statusColor(status: string) {
  switch (status.toLowerCase()) {
    case "active":
    case "running":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "idle":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "error":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/proxy?path=/api/agents/list");
        const data = await res.json();
        setAgents(data.agents || []);
      } catch {
        setError("Could not connect to Harv API");
        // Fallback: show known agents
        setAgents(FALLBACK_AGENTS);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="text-muted-foreground">
          {agents.length} agents registered
          {error && <span className="ml-2 text-yellow-500">({error})</span>}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 12 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))
          : agents.map((agent) => {
              const Icon = AGENT_ICONS[agent.name] || Bot;
              return (
                <Card key={agent.name} className="transition-colors hover:border-primary/40">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">
                          {agent.name}
                        </CardTitle>
                      </div>
                      <Badge
                        variant="outline"
                        className={statusColor(agent.status)}
                      >
                        {agent.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {agent.model || "no model"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    <p className="truncate">
                      {agent.last_task || "No recent tasks"}
                    </p>
                    {agent.last_used && (
                      <p className="mt-1 opacity-60">{agent.last_used}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </div>
  );
}

const FALLBACK_AGENTS: Agent[] = [
  { name: "Harv", status: "Active", model: "claude-haiku-4-5", type: "agent" },
  { name: "Router", status: "Active", model: "qwen3-8b", type: "agent" },
  { name: "Guardian", status: "Active", model: "qwen2.5:0.5b", type: "background" },
  { name: "Journal", status: "Active", model: "minimax-m2.1", type: "agent" },
  { name: "Research", status: "Active", model: "deepseek-v3", type: "agent" },
  { name: "Fitness", status: "Active", model: "qwen2.5:0.5b", type: "agent" },
  { name: "Finance", status: "Active", model: "deepseek-v3", type: "agent" },
  { name: "Trading", status: "Active", model: "deepseek-v3", type: "agent" },
  { name: "Music", status: "Active", model: "deepseek-v3", type: "agent" },
  { name: "Sports", status: "Active", model: "deepseek-v3", type: "agent" },
  { name: "Learning", status: "Active", model: "deepseek-v3", type: "agent" },
  { name: "Video Digest", status: "Active", model: "deepseek-chat", type: "agent" },
  { name: "Scheduler", status: "Active", model: "minimax-m2.1", type: "agent" },
  { name: "Email", status: "Active", model: "minimax-m2.1", type: "agent" },
  { name: "Travel", status: "Active", model: "minimax-m2.1", type: "agent" },
  { name: "Shopping", status: "Active", model: "qwen2.5:0.5b", type: "agent" },
  { name: "Auto Marketing", status: "Active", model: "deepseek-chat", type: "agent" },
  { name: "Image Gen", status: "Active", model: "imagen-4.0", type: "agent" },
  { name: "Medic", status: "Active", model: "qwen2.5:0.5b", type: "background" },
  { name: "Analytics", status: "Active", model: "none", type: "tool" },
  { name: "Memory", status: "Active", model: "none", type: "tool" },
  { name: "Ledger", status: "Active", model: "none", type: "tool" },
  { name: "Drive", status: "Active", model: "none", type: "tool" },
];
