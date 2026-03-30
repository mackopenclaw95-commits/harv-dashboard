"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bot, PanelLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  cleanupEmptyConversations,
} from "@/lib/supabase-chat";
import { getProjects, type Project } from "@/lib/supabase-projects";
import { toast } from "sonner";
import type { ConversationWithMeta } from "@/lib/conversation-utils";

interface HarvTabProps {
  newChatTrigger?: number;
  projectId?: string | null;
  initialConversationId?: string | null;
}

export function HarvTab({ newChatTrigger, projectId, initialConversationId }: HarvTabProps = {}) {
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const cleanupRan = useRef(false);
  const lastTrigger = useRef(0);

  const loadConversations = useCallback(async () => {
    try {
      const convos = await getRecentConversations(50, "Harv", "active", projectId || undefined);
      setConversations(convos as ConversationWithMeta[]);
      return convos;
    } catch {
      return [];
    }
  }, [projectId]);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    async function init() {
      // Run cleanup once on mount
      if (!cleanupRan.current) {
        cleanupRan.current = true;
        cleanupEmptyConversations().catch(() => {});
      }

      try {
        const convos = await loadConversations();
        // If an initial conversation ID was provided (e.g. from project detail), use it
        if (initialConversationId) {
          setActiveConversationId(initialConversationId);
        } else {
          const currentId = await getOrCreateConversation("Harv");
          setActiveConversationId(currentId);
          if (!convos.some((c: { id: string }) => c.id === currentId)) {
            await loadConversations();
          }
        }
      } catch {
        // No conversations yet
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [loadConversations]);

  // React to initialConversationId changes (e.g. clicking a chat from History)
  useEffect(() => {
    if (initialConversationId) {
      setActiveConversationId(initialConversationId);
    }
  }, [initialConversationId]);

  // Respond to new-project-chat trigger from parent
  useEffect(() => {
    if (!newChatTrigger || newChatTrigger === lastTrigger.current) return;
    lastTrigger.current = newChatTrigger;

    async function createProjectChat() {
      try {
        const id = await createConversation("Harv");
        // If there's a project, link the conversation to it
        if (projectId) {
          await moveToProject(id, projectId);
        }
        setActiveConversationId(id);
        await loadConversations();
      } catch {
        // error
      }
    }
    createProjectChat();
  }, [newChatTrigger, projectId, loadConversations]);

  async function handleNewChat() {
    try {
      const id = await createConversation("Harv");
      // Auto-link to active project if one is selected
      if (projectId) {
        await moveToProject(id, projectId);
      }
      setActiveConversationId(id);
      await loadConversations();
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
    await loadConversations();
  }

  async function handleArchive(id: string) {
    try {
      await archiveConversation(id);
      toast.success("Conversation archived");
      if (activeConversationId === id) {
        const convos = await loadConversations();
        setActiveConversationId(convos[0]?.id || null);
      } else {
        await loadConversations();
      }
    } catch {
      toast.error("Failed to archive");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteConversation(id);
      toast.success("Conversation deleted");
      if (activeConversationId === id) {
        const convos = await loadConversations();
        setActiveConversationId(convos[0]?.id || null);
      } else {
        await loadConversations();
      }
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleMoveToProject(convId: string, projectId: string | null) {
    try {
      await moveToProject(convId, projectId);
      const projectName = projects.find((p) => p.id === projectId)?.name;
      toast.success(projectId ? `Moved to "${projectName}"` : "Removed from project");
      await loadConversations();
    } catch {
      toast.error("Failed to move");
    }
  }

  async function handleRename(convId: string, newTitle: string) {
    try {
      await updateConversationTitle(convId, newTitle);
      await loadConversations();
    } catch {
      toast.error("Failed to rename");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Compact header with drawer toggle */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-card/20 backdrop-blur-xl">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold">Harv</span>
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
            <SheetTitle className="text-sm">
              {projectId ? "Project Conversations" : "Conversations"}
            </SheetTitle>
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
            loading={loading}
          />
        </SheetContent>
      </Sheet>

      {/* Chat area */}
      <div className="flex-1 min-w-0 min-h-0">
        <ChatPanel
          key={activeConversationId}
          conversationId={activeConversationId}
          agentName="Harv"
          apiEndpoint="/api/chat"
          icon={Bot}
          placeholder="Message Harv..."
          onNewMessage={handleNewMessage}
          projectId={projectId}
        />
      </div>
    </div>
  );
}
