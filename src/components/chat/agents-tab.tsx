"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bot, Lock, MessageSquare, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatPanel } from "./chat-panel";
import { ConversationSidebar } from "./conversation-sidebar";
import {
  getRecentConversations,
  createConversation,
  getOrCreateConversation,
  deleteConversation,
  archiveConversation,
  moveToProject,
  updateConversationTitle,
} from "@/lib/supabase-chat";
import { getProjects, type Project } from "@/lib/supabase-projects";
import { AGENT_ICONS } from "@/lib/agent-icons";
import { NO_CHAT_AGENTS } from "@/lib/constants";
import { isAgentAvailable } from "@/lib/plan-config";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ConversationWithMeta } from "@/lib/conversation-utils";

interface AgentItem {
  name: string;
  type: string;
  status: string;
  description: string;
  model: string;
  cost_per_call: number;
}

// Sub-agent grouping — sub-agents render nested under their parent
const SUB_AGENT_MAP: Record<string, string[]> = {
  "Video Digest": ["YouTube Digest", "TikTok Digest", "Twitter Digest"],
  "Media Manager": ["Image Gen", "Video Gen", "Video Editor"],
  Research: ["Product Research", "Market Research", "Data Viz"],
};

function statusDotColor(status: string) {
  switch (status.toUpperCase()) {
    case "LIVE":
    case "ACTIVE":
    case "RUNNING":
      return "bg-green-400 shadow-sm shadow-green-400/50";
    case "IDLE":
      return "bg-yellow-400 shadow-sm shadow-yellow-400/50";
    case "ERROR":
      return "bg-red-400 shadow-sm shadow-red-400/50";
    default:
      return "bg-muted-foreground/40";
  }
}

function statusBadgeColor(status: string) {
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

interface AgentsTabProps {
  projectId?: string | null;
}

export function AgentsTab({ projectId }: AgentsTabProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const userPlan = profile?.plan || "free";
  const selectedAgent = searchParams.get("agent");

  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const projectIdRef = useRef(projectId);

  // Agent chat state
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [convLoading, setConvLoading] = useState(false);

  // Load agents list
  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await fetch("/api/proxy?path=/api/agents/list");
        const data = await res.json();
        const list = (data.agents || [])
          .filter((a: AgentItem) => a.type === "agent" && a.status?.toUpperCase() === "LIVE" && !NO_CHAT_AGENTS.has(a.name))
          .map((a: AgentItem) => ({
            name: a.name,
            type: a.type,
            status: a.status || "IDLE",
            description: a.description || "",
            model: a.model || "",
            cost_per_call: a.cost_per_call || 0,
          }));
        setAgents(list);
      } catch {
        // fallback
      } finally {
        setAgentsLoading(false);
      }
    }
    loadAgents();
    getProjects().then(setProjects).catch(() => {});
  }, []);

  const loadConversations = useCallback(
    async (agentName: string) => {
      try {
        const convos = await getRecentConversations(50, agentName);
        setConversations(convos as ConversationWithMeta[]);
        return convos;
      } catch {
        return [];
      }
    },
    []
  );

  // Keep projectId ref in sync
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  // When an agent is selected, load its conversations
  useEffect(() => {
    if (!selectedAgent) {
      setConversations([]);
      setActiveConversationId(null);
      return;
    }

    let cancelled = false;
    setConvLoading(true);

    async function init() {
      try {
        // Parallelize independent calls
        const [convos, currentId] = await Promise.all([
          loadConversations(selectedAgent!),
          getOrCreateConversation(selectedAgent!),
        ]);
        if (cancelled) return;
        // Auto-link to project if one is active (fire and forget)
        if (projectIdRef.current) {
          moveToProject(currentId, projectIdRef.current).catch(() => {});
        }
        setActiveConversationId(currentId);
        if (!convos.some((c: { id: string }) => c.id === currentId)) {
          await loadConversations(selectedAgent!);
        }
      } catch {
        // error
      } finally {
        if (!cancelled) setConvLoading(false);
      }
    }
    init();

    return () => {
      cancelled = true;
    };
  }, [selectedAgent, loadConversations]);

  function selectAgent(name: string) {
    const projectParam = projectId ? `&project=${projectId}` : "";
    router.push(`/chat?tab=agents&agent=${encodeURIComponent(name)}${projectParam}`, {
      scroll: false,
    });
  }

  function goBack() {
    const projectParam = projectId ? `&project=${projectId}` : "";
    router.push(`/chat?tab=agents${projectParam}`, { scroll: false });
  }

  async function handleNewChat() {
    if (!selectedAgent) return;
    try {
      const id = await createConversation(selectedAgent);
      if (projectIdRef.current) {
        await moveToProject(id, projectIdRef.current);
      }
      setActiveConversationId(id);
      await loadConversations(selectedAgent);
      setSidebarOpen(false);
    } catch {
      // error
    }
  }

  function handleSelect(id: string) {
    setActiveConversationId(id);
    setSidebarOpen(false);
  }

  async function handleNewMessage() {
    if (selectedAgent) {
      await loadConversations(selectedAgent);
    }
  }

  async function handleArchive(id: string) {
    if (!selectedAgent) return;
    try {
      await archiveConversation(id);
      toast.success("Conversation archived");
      if (activeConversationId === id) {
        const convos = await loadConversations(selectedAgent);
        setActiveConversationId(convos[0]?.id || null);
      } else {
        await loadConversations(selectedAgent);
      }
    } catch {
      toast.error("Failed to archive");
    }
  }

  async function handleDelete(id: string) {
    if (!selectedAgent) return;
    try {
      await deleteConversation(id);
      toast.success("Conversation deleted");
      if (activeConversationId === id) {
        const convos = await loadConversations(selectedAgent);
        setActiveConversationId(convos[0]?.id || null);
      } else {
        await loadConversations(selectedAgent);
      }
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleMoveToProject(convId: string, projectId: string | null) {
    if (!selectedAgent) return;
    try {
      await moveToProject(convId, projectId);
      const projectName = projects.find((p) => p.id === projectId)?.name;
      toast.success(projectId ? `Moved to "${projectName}"` : "Removed from project");
      await loadConversations(selectedAgent);
    } catch {
      toast.error("Failed to move");
    }
  }

  async function handleRename(convId: string, newTitle: string) {
    if (!selectedAgent) return;
    try {
      await updateConversationTitle(convId, newTitle);
      await loadConversations(selectedAgent);
    } catch {
      toast.error("Failed to rename");
    }
  }

  const agentData = agents.find(
    (a) => a.name.toLowerCase() === selectedAgent?.toLowerCase()
  );
  const AgentIcon = selectedAgent
    ? AGENT_ICONS[selectedAgent] || Bot
    : Bot;

  // ─── Agent Chat View ─────────────────────────────────
  if (selectedAgent) {
    return (
      <div className="flex h-full flex-col">
        {/* Agent header with drawer toggle */}
        <div className="shrink-0 flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 bg-card/20 backdrop-blur-xl">
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <AgentIcon className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold truncate">{selectedAgent}</h2>
              {agentData && (
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", statusBadgeColor(agentData.status))}
                >
                  {agentData.status}
                </Badge>
              )}
            </div>
            {agentData && (
              <p className="text-xs text-muted-foreground truncate">
                {agentData.description}
              </p>
            )}
          </div>
        </div>

        {/* Conversation drawer */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-72 sm:max-w-72 p-0 gap-0 bg-card/95 backdrop-blur-2xl border-r border-white/[0.08]"
          >
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle className="text-sm">{selectedAgent} Conversations</SheetTitle>
            </SheetHeader>
            <ConversationSidebar
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={handleSelect}
              onNewChat={handleNewChat}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onMoveToProject={handleMoveToProject}
              onRename={handleRename}
              projects={projects}
              loading={convLoading}
            />
          </SheetContent>
        </Sheet>

        {/* Chat area */}
        <div className="flex-1 min-h-0 min-w-0">
          <ChatPanel
            key={activeConversationId}
            conversationId={activeConversationId}
            agentName={selectedAgent}
            apiEndpoint="/api/chat/agent"
            icon={AgentIcon}
            placeholder={`Message ${selectedAgent}...`}
            onNewMessage={handleNewMessage}
            agentDescription={agentData?.description}
            projectId={projectId}
          />
        </div>
      </div>
    );
  }

  // ─── Agent Grid View ──────────────────────────────────

  // Derive parent and sub-agent lists dynamically
  const subAgentNames = new Set(Object.values(SUB_AGENT_MAP).flat());
  const parentAgents = agents.filter((a) => !subAgentNames.has(a.name));

  // Synthesize virtual parent agents for SUB_AGENT_MAP parents not in the API
  // (e.g. Media Manager isn't a registered agent but Image Gen is its child)
  for (const [parentName, childNames] of Object.entries(SUB_AGENT_MAP)) {
    const parentExists = parentAgents.some((a) => a.name === parentName);
    if (parentExists) continue;
    const liveChildren = childNames.filter((name) =>
      agents.some((a) => a.name === name)
    );
    if (liveChildren.length > 0) {
      parentAgents.push({
        name: parentName,
        type: "agent",
        status: "LIVE",
        description: `Manages ${liveChildren.join(", ")}`,
        model: "",
        cost_per_call: 0,
      });
    }
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <MessageSquare className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Chat with an Agent</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Select an agent to start a conversation</p>
          </div>
        </div>

        {agentsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {parentAgents.map((agent) => {
              const Icon = AGENT_ICONS[agent.name] || Bot;
              const childNames = SUB_AGENT_MAP[agent.name];
              const childAgents = childNames
                ? childNames
                    .map((name) => agents.find((a) => a.name === name))
                    .filter(Boolean) as AgentItem[]
                : [];
              const locked = !isAgentAvailable(agent.name, userPlan);

              return (
                <div key={agent.name} className="flex flex-col gap-0">
                  {/* Parent agent card */}
                  <button
                    onClick={() => {
                      if (locked) {
                        toast("Upgrade to Pro or Max to unlock this agent", {
                          action: { label: "Upgrade", onClick: () => router.push("/settings?tab=billing") },
                          duration: 5000,
                        });
                        return;
                      }
                      selectAgent(agent.name);
                    }}
                    className={cn(
                      "group flex items-start gap-4 p-5 text-left transition-all duration-300 bg-card/40 backdrop-blur-xl ring-1 ring-white/[0.08] flex-1",
                      locked
                        ? "opacity-60 cursor-not-allowed"
                        : "hover:bg-card/60 hover:ring-primary/20 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5",
                      childAgents.length > 0
                        ? "rounded-t-2xl rounded-b-none"
                        : "rounded-2xl"
                    )}
                  >
                    <div className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-all duration-300",
                      locked
                        ? "bg-muted/20 ring-white/[0.08]"
                        : "bg-primary/10 ring-primary/20 group-hover:ring-primary/30 group-hover:shadow-lg group-hover:shadow-primary/10"
                    )}>
                      {locked ? (
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Icon className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">
                          {agent.name}
                        </span>
                        {locked ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-400 bg-amber-500/10">
                            PRO
                          </Badge>
                        ) : (
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              statusDotColor(agent.status)
                            )}
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {locked ? "Upgrade to Pro to unlock" : (agent.description || "No description")}
                      </p>
                    </div>
                  </button>

                  {/* Sub-agent list */}
                  {childAgents.length > 0 && (
                    <div className="rounded-b-2xl bg-white/[0.02] ring-1 ring-white/[0.06] border-t border-white/[0.04] divide-y divide-white/[0.04]">
                      {childAgents.map((child) => {
                        const ChildIcon = AGENT_ICONS[child.name] || Bot;
                        const childLocked = !isAgentAvailable(child.name, userPlan);
                        return (
                          <button
                            key={child.name}
                            onClick={() => {
                              if (childLocked) {
                                toast("Upgrade to Pro or Max to unlock this agent", {
                                  action: { label: "Upgrade", onClick: () => router.push("/settings?tab=billing") },
                                  duration: 5000,
                                });
                                return;
                              }
                              selectAgent(child.name);
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors group/sub",
                              childLocked ? "opacity-50 cursor-not-allowed" : "hover:bg-white/[0.04]"
                            )}
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/5 ring-1 ring-primary/10 group-hover/sub:ring-primary/20 transition-colors">
                              {childLocked ? (
                                <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                              ) : (
                                <ChildIcon className="h-3.5 w-3.5 text-primary/70" />
                              )}
                            </div>
                            <span className="text-xs font-medium text-muted-foreground group-hover/sub:text-foreground transition-colors truncate">
                              {child.name}
                            </span>
                            {childLocked ? (
                              <Lock className="h-3 w-3 text-muted-foreground/40 ml-auto shrink-0" />
                            ) : (
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0 ml-auto",
                                  statusDotColor(child.status)
                                )}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
