"use client";

import { useMemo, useState, useRef } from "react";
import { Plus, MessageSquare, Clock, MoreHorizontal, Archive, Trash2, FolderInput, FolderOpen, ArchiveRestore, ChevronRight, Pencil, Search, Pin, PinOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  groupConversationsByTime,
  getConversationDisplayTitle,
  formatTimeGroupLabel,
  type ConversationWithMeta,
  type GroupedConversations,
} from "@/lib/conversation-utils";
import type { Project } from "@/lib/supabase-projects";

interface ConversationSidebarProps {
  conversations: ConversationWithMeta[];
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
  onArchive?: (conversationId: string) => void;
  onUnarchive?: (conversationId: string) => void;
  onDelete?: (conversationId: string) => void;
  onMoveToProject?: (conversationId: string, projectId: string | null) => void;
  onRename?: (conversationId: string, newTitle: string) => void;
  projects?: Project[];
  loading?: boolean;
  className?: string;
  showArchived?: boolean;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onArchive,
  onUnarchive,
  onDelete,
  onMoveToProject,
  onRename,
  projects,
  loading,
  className,
  showArchived,
}: ConversationSidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [projectPickerId, setProjectPickerId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Pinned conversation IDs (localStorage)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("harv-pinned-conversations");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  function togglePin(id: string) {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("harv-pinned-conversations", JSON.stringify([...next]));
      return next;
    });
  }

  // Filter out empty conversations, then apply search
  const filtered = useMemo(() => {
    const nonEmpty = conversations.filter((c) => c.message_count > 0);
    if (!searchQuery.trim()) return nonEmpty;
    const q = searchQuery.toLowerCase();
    return nonEmpty.filter((c) => {
      const title = getConversationDisplayTitle(c).toLowerCase();
      const agent = (c.agent_name || "").toLowerCase();
      return title.includes(q) || agent.includes(q);
    });
  }, [conversations, searchQuery]);

  // Split into pinned and unpinned
  const pinned = useMemo(
    () => filtered.filter((c) => pinnedIds.has(c.id)),
    [filtered, pinnedIds]
  );
  const unpinned = useMemo(
    () => filtered.filter((c) => !pinnedIds.has(c.id)),
    [filtered, pinnedIds]
  );

  const grouped = useMemo(
    () => groupConversationsByTime(unpinned),
    [unpinned]
  );

  const groupEntries = (
    Object.entries(grouped) as [keyof GroupedConversations, ConversationWithMeta[]][]
  ).filter(([, items]) => items.length > 0);

  function handleMenuToggle(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpenId(menuOpenId === id ? null : id);
    setConfirmDeleteId(null);
    setProjectPickerId(null);
  }

  function handleArchive(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpenId(null);
    onArchive?.(id);
  }

  function handleUnarchive(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpenId(null);
    onUnarchive?.(id);
  }

  function handleDeleteClick(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDeleteId(id);
  }

  function handleDeleteConfirm(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpenId(null);
    setConfirmDeleteId(null);
    onDelete?.(id);
  }

  const isArchived = showArchived;

  return (
    <div
      className={cn(
        "flex flex-col h-full",
        className
      )}
    >
      {/* New Chat + Search */}
      <div className="p-3 space-y-2 border-b border-white/[0.06]">
        <Button
          onClick={onNewChat}
          variant="ghost"
          className="w-full justify-start gap-2 h-9 text-sm font-medium hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="h-8 pl-8 text-xs bg-white/[0.03] border-white/[0.06] placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading && (
            <div className="px-3 py-6 text-center">
              <Clock className="h-4 w-4 text-muted-foreground/50 mx-auto mb-2 animate-pulse" />
              <p className="text-xs text-muted-foreground/50">Loading...</p>
            </div>
          )}

          {!loading && groupEntries.length === 0 && (
            <div className="px-3 py-6 text-center">
              <MessageSquare className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/50">
                {searchQuery ? "No matching conversations" : "No conversations yet"}
              </p>
            </div>
          )}

          {/* Pinned conversations */}
          {pinned.length > 0 && (
            <div>
              <div className="px-3 pt-3 pb-1 flex items-center gap-1.5">
                <Pin className="h-3 w-3 text-primary/60" />
                <span className="text-[10px] uppercase tracking-wider text-primary/60 font-semibold">
                  Pinned
                </span>
              </div>
              {pinned.map((conv) => (
                <div key={conv.id} className="relative group/item">
                  <button
                    onClick={() => onSelect(conv.id)}
                    className={cn(
                      "w-full text-left rounded-lg px-3 py-2 text-sm transition-colors",
                      activeId === conv.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-5">
                      <Pin className="h-3 w-3 text-primary/40 shrink-0" />
                      <span className="truncate flex-1 text-xs font-medium">
                        {getConversationDisplayTitle(conv)}
                      </span>
                    </div>
                    <time className="text-[10px] text-muted-foreground/50 mt-0.5 block pl-5">
                      {new Date(conv.updated_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(conv.id); }}
                    className="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover/item:opacity-100 hover:bg-white/[0.08] transition-opacity"
                    title="Unpin"
                  >
                    <PinOff className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
              <div className="mx-3 my-2 border-t border-white/[0.06]" />
            </div>
          )}

          {groupEntries.map(([group, items]) => (
            <div key={group}>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                  {formatTimeGroupLabel(group)}
                </span>
              </div>
              {items.map((conv) => (
                <div key={conv.id} className="relative group/item">
                  {editingId === conv.id ? (
                    <div className="px-2 py-1.5">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editTitle.trim()) {
                            onRename?.(conv.id, editTitle.trim());
                            setEditingId(null);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => {
                          if (editTitle.trim() && editTitle !== getConversationDisplayTitle(conv)) {
                            onRename?.(conv.id, editTitle.trim());
                          }
                          setEditingId(null);
                        }}
                        className="h-7 text-xs bg-white/[0.04] border-white/[0.08]"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelect(conv.id)}
                      className={cn(
                        "w-full text-left rounded-lg px-3 py-2 text-sm transition-colors",
                        activeId === conv.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-5">
                        <span className="truncate flex-1 text-xs font-medium">
                          {getConversationDisplayTitle(conv)}
                        </span>
                      </div>
                      <time className="text-[10px] text-muted-foreground/50 mt-0.5 block">
                        {new Date(conv.updated_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </button>
                  )}

                  {/* Action menu trigger — visible on hover */}
                  {(onArchive || onDelete) && (
                    <button
                      onClick={(e) => handleMenuToggle(conv.id, e)}
                      className={cn(
                        "absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-md transition-opacity",
                        menuOpenId === conv.id
                          ? "opacity-100 bg-white/[0.08]"
                          : "opacity-0 group-hover/item:opacity-100 hover:bg-white/[0.08]"
                      )}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}

                  {/* Dropdown menu */}
                  {menuOpenId === conv.id && (
                    <div className="absolute right-2 top-8 z-50 w-40 rounded-lg bg-card/95 backdrop-blur-2xl ring-1 ring-white/[0.1] shadow-xl shadow-black/30 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                      {/* Pin / Unpin */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          togglePin(conv.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                      >
                        {pinnedIds.has(conv.id) ? (
                          <><PinOff className="h-3.5 w-3.5" /> Unpin</>
                        ) : (
                          <><Pin className="h-3.5 w-3.5" /> Pin to top</>
                        )}
                      </button>
                      {onRename && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(null);
                            setEditTitle(getConversationDisplayTitle(conv));
                            setEditingId(conv.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Rename
                        </button>
                      )}
                      {isArchived && onUnarchive ? (
                        <button
                          onClick={(e) => handleUnarchive(conv.id, e)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Unarchive
                        </button>
                      ) : onArchive ? (
                        <button
                          onClick={(e) => handleArchive(conv.id, e)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archive
                        </button>
                      ) : null}

                      {onMoveToProject && projects && projects.length > 0 && (
                        <>
                          {projectPickerId === conv.id ? (
                            <div className="py-1">
                              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                                Move to...
                              </div>
                              {conv.project_id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpenId(null);
                                    setProjectPickerId(null);
                                    onMoveToProject(conv.id, null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                                >
                                  <FolderInput className="h-3.5 w-3.5" />
                                  Remove from project
                                </button>
                              )}
                              {projects.map((project) => (
                                <button
                                  key={project.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpenId(null);
                                    setProjectPickerId(null);
                                    onMoveToProject(conv.id, project.id);
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                                    conv.project_id === project.id
                                      ? "text-primary bg-primary/10"
                                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
                                  )}
                                >
                                  <FolderOpen className="h-3.5 w-3.5" />
                                  <span className="truncate">{project.name}</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectPickerId(conv.id);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                            >
                              <FolderInput className="h-3.5 w-3.5" />
                              <span className="flex-1 text-left">Move to Project</span>
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                        </>
                      )}

                      {onDelete && (
                        <>
                          <div className="my-1 mx-2 border-t border-white/[0.06]" />
                          {confirmDeleteId === conv.id ? (
                            <button
                              onClick={(e) => handleDeleteConfirm(conv.id, e)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Confirm delete
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleDeleteClick(conv.id, e)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
