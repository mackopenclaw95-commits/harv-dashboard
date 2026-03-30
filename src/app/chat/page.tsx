"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Zap, Users, History, FolderOpen, Plus, ChevronDown, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HarvTab } from "@/components/chat/harv-tab";
import { AgentsTab } from "@/components/chat/agents-tab";
import { HistoryTab } from "@/components/chat/history-tab";
import { getRecentConversations } from "@/lib/supabase-chat";
import { getProjects, createProject, type Project } from "@/lib/supabase-projects";

const PROJECT_COLOR_STYLES: Record<string, string> = {
  primary: "bg-primary/15 text-primary ring-1 ring-primary/20",
  blue: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20",
  purple: "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20",
  pink: "bg-pink-500/15 text-pink-400 ring-1 ring-pink-500/20",
  orange: "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/20",
  green: "bg-green-500/15 text-green-400 ring-1 ring-green-500/20",
  red: "bg-red-500/15 text-red-400 ring-1 ring-red-500/20",
  yellow: "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/20",
};
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TAB_MAP: Record<string, number> = {
  harv: 0,
  agents: 1,
  history: 2,
};

const TABS = [
  { label: "Harv", icon: Zap },
  { label: "Agents", icon: Users },
  { label: "History", icon: History },
];

function ChatPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "";
  const projectParam = searchParams.get("project");
  const conversationParam = searchParams.get("conversation");

  const [activeTab, setActiveTab] = useState(TAB_MAP[tabParam] ?? 0);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [newProjectChatTrigger, setNewProjectChatTrigger] = useState(0);

  // Sync tab state when URL search params change (e.g. navigating from History)
  useEffect(() => {
    const newTab = TAB_MAP[tabParam] ?? 0;
    setActiveTab(newTab);
  }, [tabParam]);

  // Projects state — read ?project= param from URL
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(projectParam);

  // Sync activeProject when URL project param changes
  useEffect(() => {
    if (projectParam && projectParam !== activeProject) {
      setActiveProject(projectParam);
    }
  }, [projectParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Refresh history count on tab switch (picks up archive/delete changes)
  useEffect(() => {
    getRecentConversations(100)
      .then((convos) => setHistoryCount(convos.length))
      .catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    try {
      const project = await createProject(newProjectName.trim());
      setProjects((prev) => [project, ...prev]);
      setActiveProject(project.id);
      setNewProjectName("");
      setShowNewProject(false);
      setProjectDropdownOpen(false);
      // Switch to Harv tab and trigger a new chat
      setActiveTab(0);
      setNewProjectChatTrigger((n) => n + 1);
      toast.success(`Project "${project.name}" created`);
    } catch {
      toast.error("Failed to create project");
    }
  }

  const activeProjectData = projects.find((p) => p.id === activeProject);
  const activeProjectName = activeProjectData?.name;
  const activeProjectColor = activeProjectData?.color || "primary";
  const activeProjectStyle = PROJECT_COLOR_STYLES[activeProjectColor] || PROJECT_COLOR_STYLES.primary;

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as number)} className="flex flex-col h-full gap-0">
        {/* Tab bar */}
        <div className="shrink-0 border-b border-white/[0.06] bg-card/30 backdrop-blur-2xl px-6 pt-2 relative z-20">
          <div className="flex items-center gap-3">
            <TabsList className="gap-1 h-9">
              {TABS.map(({ label, icon: Icon }, i) => (
                <TabsTrigger
                  key={i}
                  value={i}
                  className="gap-1.5 px-3 py-1.5 text-xs font-medium"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                  {label === "History" && historyCount != null && historyCount > 0 && (
                    <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                      {historyCount}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Project selector */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                  activeProject
                    ? activeProjectStyle
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                )}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="max-w-[120px] truncate">
                  {activeProjectName || "Projects"}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {/* Clear project filter */}
              {activeProject && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveProject(null);
                  }}
                  className="absolute -right-1 -top-1 h-4 w-4 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}

              {/* Dropdown */}
              {projectDropdownOpen && (
                <div className="absolute right-0 top-10 z-50 w-56 rounded-xl bg-card/95 backdrop-blur-2xl ring-1 ring-white/[0.1] shadow-xl shadow-black/30 py-2 animate-in fade-in-0 zoom-in-95 duration-100">
                  {/* All conversations (no project filter) */}
                  <button
                    onClick={() => {
                      setActiveProject(null);
                      setProjectDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      !activeProject
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    All Conversations
                  </button>

                  {projects.length > 0 && (
                    <div className="my-1.5 mx-2 border-t border-white/[0.06]" />
                  )}

                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => {
                        setActiveProject(project.id);
                        setProjectDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                        activeProject === project.id
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                      )}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span className="truncate">{project.name}</span>
                    </button>
                  ))}

                  <div className="my-1.5 mx-2 border-t border-white/[0.06]" />

                  {showNewProject ? (
                    <div className="px-2 py-1">
                      <div className="flex gap-1.5">
                        <Input
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          placeholder="Project name..."
                          className="h-7 text-xs bg-white/[0.04] border-white/[0.08]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateProject();
                            if (e.key === "Escape") {
                              setShowNewProject(false);
                              setNewProjectName("");
                            }
                          }}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleCreateProject}
                          className="h-7 w-7 shrink-0"
                          disabled={!newProjectName.trim()}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewProject(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Project
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <TabsContent value={0} className="flex-1 min-h-0">
          <HarvTab
            newChatTrigger={newProjectChatTrigger}
            projectId={activeProject}
            initialConversationId={conversationParam}
          />
        </TabsContent>

        <TabsContent value={1} className="flex-1 min-h-0">
          <AgentsTab projectId={activeProject} />
        </TabsContent>

        <TabsContent value={2} className="flex-1 min-h-0">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
