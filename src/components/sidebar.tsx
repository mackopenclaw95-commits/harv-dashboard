"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getAgentsWithHistory } from "@/lib/chat-history";
import {
  MessageSquare,
  Bot,
  Brain,
  BarChart3,
  Settings,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
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
  Database,
  FileText,
  Image,
  Trophy,
  Megaphone,
  History,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/crons", label: "Cron Jobs", icon: Clock },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

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

interface AgentItem {
  name: string;
  type: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const [agentsOpen, setAgentsOpen] = useState(() =>
    typeof window !== "undefined" ? pathname.startsWith("/agents/") : false
  );
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [historyAgents, setHistoryAgents] = useState<string[]>([]);

  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await fetch("/api/proxy?path=/api/agents/list");
        const data = await res.json();
        const list = (data.agents || [])
          .filter((a: AgentItem) => a.type === "agent")
          .map((a: AgentItem) => ({ name: a.name, type: a.type }));
        setAgents(list);
      } catch {
        // fallback
      }
    }
    loadAgents();
  }, []);

  // Refresh history agents on pathname change (when navigating between chats)
  useEffect(() => {
    setHistoryAgents(getAgentsWithHistory());
  }, [pathname]);

  // Auto-open dropdown when on an agent chat page
  useEffect(() => {
    if (pathname.startsWith("/agents/") && !agentsOpen) {
      setAgentsOpen(true);
    }
  }, [pathname, agentsOpen]);

  const agentsWithoutHistory = agents.filter(
    (a) => !historyAgents.includes(a.name)
  );

  return (
    <aside className="flex h-full w-16 flex-col items-center border-r bg-background py-4 md:w-56">
      <Link href="/" className="mb-8 flex items-center gap-2 px-4">
        <Zap className="h-6 w-6 text-primary" />
        <span className="hidden text-lg font-bold md:inline">Harv</span>
      </Link>

      <ScrollArea className="flex flex-1 flex-col w-full">
        <nav className="flex flex-col gap-1 px-2 w-full">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/agents"
                ? pathname === "/agents"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}

          {/* Spacer line */}
          <div className="my-2 mx-3 border-t border-border" />

          {/* Agent Chat dropdown */}
          <button
            onClick={() => setAgentsOpen(!agentsOpen)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors w-full",
              pathname.startsWith("/agents/")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <MessageSquare className="h-5 w-5 shrink-0" />
            <span className="hidden md:inline flex-1 text-left">
              Agent Chat
            </span>
            <span className="hidden md:inline">
              {agentsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </button>

          {agentsOpen && (
            <div className="hidden md:flex flex-col gap-0.5 pl-4 pr-2">
              {/* Recent chats (agents with history) */}
              {historyAgents.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1">
                    <History className="h-3 w-3 text-muted-foreground/60" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                      Recent
                    </span>
                  </div>
                  {historyAgents.map((name) => {
                    const Icon = AGENT_ICONS[name] || Bot;
                    const href = `/agents/${encodeURIComponent(name)}`;
                    const active = decodeURIComponent(pathname) === `/agents/${name}`;
                    return (
                      <Link
                        key={name}
                        href={href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{name}</span>
                      </Link>
                    );
                  })}
                </>
              )}

              {/* All agents (without history) */}
              {agentsWithoutHistory.length > 0 && (
                <>
                  {historyAgents.length > 0 && (
                    <div className="my-1 mx-2.5 border-t border-border/50" />
                  )}
                  <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1">
                    <Bot className="h-3 w-3 text-muted-foreground/60" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                      All Agents
                    </span>
                  </div>
                  {agentsWithoutHistory.map((agent) => {
                    const Icon = AGENT_ICONS[agent.name] || Bot;
                    const href = `/agents/${encodeURIComponent(agent.name)}`;
                    const active = decodeURIComponent(pathname) === `/agents/${agent.name}`;
                    return (
                      <Link
                        key={agent.name}
                        href={href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{agent.name}</span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </nav>
      </ScrollArea>

      <div className="hidden px-4 text-xs text-muted-foreground md:block">
        Harv AI v1.0
      </div>
    </aside>
  );
}
