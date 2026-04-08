"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageSquare, Bot, Clock, Archive, Trash2, MoreHorizontal, ArchiveRestore, FolderInput, FolderOpen, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AGENT_ICONS } from "@/lib/agent-icons";
import {
  getRecentConversations,
  searchMessages,
  deleteConversation,
  archiveConversation,
  unarchiveConversation,
  moveToProject,
} from "@/lib/supabase-chat";
import { getProjects, type Project } from "@/lib/supabase-projects";
import {
  groupConversationsByTime,
  getConversationDisplayTitle,
  formatTimeGroupLabel,
  type ConversationWithMeta,
  type GroupedConversations,
} from "@/lib/conversation-utils";
import { toast } from "sonner";

type StatusFilter = "active" | "archived" | "all";

interface HistoryTabProps {
  onOpenConversation?: (conversationId: string) => void;
}

export function HistoryTab({ onOpenConversation }: HistoryTabProps = {}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [searchResults, setSearchResults] = useState<
    { conversation_id: string; content: string; agent_name: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [projectPickerId, setProjectPickerId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  const loadConversations = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    try {
      const convos = await getRecentConversations(100, undefined, status);
      setConversations(convos as ConversationWithMeta[]);
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations(statusFilter);
  }, [statusFilter, loadConversations]);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchMessages(searchQuery, 20);
        setSearchResults(
          results.map((r) => ({
            conversation_id: r.conversation_id,
            content: r.content,
            agent_name: r.conversation?.agent_name || "Harv",
          }))
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const grouped = useMemo(
    () => groupConversationsByTime(conversations),
    [conversations]
  );

  const groupEntries = (
    Object.entries(grouped) as [keyof GroupedConversations, ConversationWithMeta[]][]
  ).filter(([, items]) => items.length > 0);

  function openConversation(agentName: string, conversationId: string) {
    if (onOpenConversation && agentName === "Harv") {
      onOpenConversation(conversationId);
      return;
    }
    if (agentName === "Harv") {
      router.push(`/chat?tab=harv&conversation=${conversationId}`);
    } else {
      router.push(
        `/chat?tab=agents&agent=${encodeURIComponent(agentName)}&conversation=${conversationId}`
      );
    }
  }

  async function handleArchive(id: string) {
    try {
      await archiveConversation(id);
      toast.success("Conversation archived");
      setMenuOpenId(null);
      await loadConversations(statusFilter);
    } catch {
      toast.error("Failed to archive");
    }
  }

  async function handleUnarchive(id: string) {
    try {
      await unarchiveConversation(id);
      toast.success("Conversation restored");
      setMenuOpenId(null);
      await loadConversations(statusFilter);
    } catch {
      toast.error("Failed to restore");
    }
  }

  async function handleMoveToProject(convId: string, projId: string | null) {
    try {
      await moveToProject(convId, projId);
      const projName = projects.find((p) => p.id === projId)?.name;
      toast.success(projId ? `Moved to "${projName}"` : "Removed from project");
      setMenuOpenId(null);
      setProjectPickerId(null);
      await loadConversations(statusFilter);
    } catch {
      toast.error("Failed to move");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteConversation(id);
      toast.success("Conversation deleted");
      setMenuOpenId(null);
      setConfirmDeleteId(null);
      await loadConversations(statusFilter);
    } catch {
      toast.error("Failed to delete");
    }
  }

  const isSearching = searchQuery.trim().length > 0;

  const FILTERS: { label: string; value: StatusFilter }[] = [
    { label: "Active", value: "active" },
    { label: "Archived", value: "archived" },
    { label: "All", value: "all" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Search bar + filters */}
      <div className="shrink-0 px-6 py-4 border-b border-white/[0.06] bg-card/20 backdrop-blur-xl space-y-3">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all conversations..."
            className="pl-9 h-10 bg-card/40 backdrop-blur-sm border-white/[0.08] focus-visible:border-primary/30 focus-visible:ring-primary/20 transition-all"
          />
        </div>
        <div className="flex gap-1.5 max-w-2xl mx-auto">
          {FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200",
                statusFilter === value
                  ? "bg-primary/15 text-primary ring-1 ring-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-6 space-y-2">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          )}

          {/* Search results mode */}
          {isSearching && !searching && searchResults.length === 0 && (
            <div className="text-center py-12">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No results found</p>
            </div>
          )}

          {isSearching && searching && (
            <div className="text-center py-12">
              <Clock className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2 animate-pulse" />
              <p className="text-xs text-muted-foreground">Searching...</p>
            </div>
          )}

          {isSearching &&
            searchResults.map((result, i) => {
              const Icon = AGENT_ICONS[result.agent_name] || Bot;
              return (
                <button
                  key={`${result.conversation_id}-${i}`}
                  onClick={() => openConversation(result.agent_name, result.conversation_id)}
                  className="w-full text-left rounded-xl p-4 transition-all bg-card/30 ring-1 ring-white/[0.06] hover:bg-card/50 hover:ring-primary/20"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className="text-[10px] border-white/[0.08]"
                        >
                          {result.agent_name}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {result.content}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}

          {/* Browse mode - grouped conversations */}
          {!isSearching &&
            !loading &&
            groupEntries.length === 0 && (
              <div className="text-center py-12">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {statusFilter === "archived"
                    ? "No archived conversations"
                    : "No conversations yet"}
                </p>
                <p className="text-xs text-muted-foreground/40 mt-1">
                  {statusFilter === "archived"
                    ? "Archive conversations from the chat drawer"
                    : "Start a chat with Harv or an agent"}
                </p>
              </div>
            )}

          {!isSearching &&
            groupEntries.map(([group, items]) => (
              <div key={group}>
                <div className="px-1 pt-5 pb-2">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">
                    {formatTimeGroupLabel(group)}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map((conv) => {
                    const Icon = AGENT_ICONS[conv.agent_name] || Bot;
                    const isConvArchived = conv.status === "archived";
                    return (
                      <div key={conv.id} className="relative group/card">
                        <button
                          onClick={() => openConversation(conv.agent_name, conv.id)}
                          className="w-full text-left rounded-xl p-4 transition-all duration-200 bg-card/30 ring-1 ring-white/[0.06] hover:bg-card/50 hover:ring-primary/20 hover:shadow-lg hover:shadow-primary/5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">
                                  {getConversationDisplayTitle(conv)}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="shrink-0 text-[10px] border-white/[0.08] text-muted-foreground/60"
                                >
                                  {conv.agent_name}
                                </Badge>
                                {isConvArchived && (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 text-[10px] border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
                                  >
                                    Archived
                                  </Badge>
                                )}
                                {conv.message_count > 0 && (
                                  <span className="text-[10px] text-muted-foreground/40 shrink-0">
                                    {conv.message_count} msgs
                                  </span>
                                )}
                              </div>
                              {conv.last_message && (
                                <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                                  {conv.last_message.slice(0, 80)}
                                </p>
                              )}
                            </div>
                            <time className="text-[10px] text-muted-foreground/40 shrink-0">
                              {new Date(conv.updated_at).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </time>
                          </div>
                        </button>

                        {/* Action menu trigger */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                            setConfirmDeleteId(null);
                            setProjectPickerId(null);
                          }}
                          className={cn(
                            "absolute right-3 top-3 h-7 w-7 flex items-center justify-center rounded-lg transition-opacity",
                            menuOpenId === conv.id
                              ? "opacity-100 bg-white/[0.08]"
                              : "opacity-0 group-hover/card:opacity-100 hover:bg-white/[0.08]"
                          )}
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>

                        {/* Action dropdown */}
                        {menuOpenId === conv.id && (
                          <div className="absolute right-3 top-11 z-50 w-40 rounded-lg bg-card/95 backdrop-blur-2xl ring-1 ring-white/[0.1] shadow-xl shadow-black/30 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                            {isConvArchived ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnarchive(conv.id);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                              >
                                <ArchiveRestore className="h-3.5 w-3.5" />
                                Unarchive
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleArchive(conv.id);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                              >
                                <Archive className="h-3.5 w-3.5" />
                                Archive
                              </button>
                            )}

                            {/* Move to Project */}
                            {projects.length > 0 && (
                              <>
                                {projectPickerId === conv.id ? (
                                  <div className="py-1">
                                    <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                                      Move to...
                                    </div>
                                    {conv.project_id && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleMoveToProject(conv.id, null); }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                                      >
                                        <FolderInput className="h-3.5 w-3.5" />
                                        Remove from project
                                      </button>
                                    )}
                                    {projects.map((p) => (
                                      <button
                                        key={p.id}
                                        onClick={(e) => { e.stopPropagation(); handleMoveToProject(conv.id, p.id); }}
                                        className={cn(
                                          "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                                          conv.project_id === p.id
                                            ? "text-primary bg-primary/10"
                                            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
                                        )}
                                      >
                                        <FolderOpen className="h-3.5 w-3.5" />
                                        <span className="truncate">{p.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setProjectPickerId(conv.id); }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                                  >
                                    <FolderInput className="h-3.5 w-3.5" />
                                    <span className="flex-1 text-left">Move to Project</span>
                                    <ChevronRight className="h-3 w-3" />
                                  </button>
                                )}
                              </>
                            )}

                            <div className="my-1 mx-2 border-t border-white/[0.06]" />
                            {confirmDeleteId === conv.id ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(conv.id);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Confirm delete
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(conv.id);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}
