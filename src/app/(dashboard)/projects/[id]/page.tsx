"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderKanban,
  Save,
  Trash2,
  MessageSquare,
  FileText,
  BookOpen,
  Settings2,
  Upload,
  ExternalLink,
  Unlink,
  Link2,
  Brain,
  Search,
  Plus,
  Clock,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import {
  getProjectById,
  getProjectStats,
  getProjectConversations,
  updateProject,
  deleteProject,
  getColorClass,
  PROJECT_COLORS,
  type Project,
  type ProjectStats,
} from "@/lib/supabase-projects";
import {
  getDocuments,
  getDocumentsByProject,
  uploadDocument,
  linkDocumentToProject,
  deleteDocument,
  getDocumentUrl,
  formatFileSize,
  type Document,
} from "@/lib/supabase-documents";
import { moveToProject, createConversation, getRecentConversations, getConversationMessages, type Conversation } from "@/lib/supabase-chat";
import { AGENT_ICONS } from "@/lib/agent-icons";
import { Bot } from "lucide-react";
import {
  getConversationDisplayTitle,
  type ConversationWithMeta,
} from "@/lib/conversation-utils";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Overview state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("primary");
  const [saving, setSaving] = useState(false);

  // Instructions state
  const [instructions, setInstructions] = useState("");
  const [instructionsDirty, setInstructionsDirty] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);

  // Chats state
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);

  // Files state
  // Chat linking state
  const [showChatPicker, setShowChatPicker] = useState(false);
  const [allConvos, setAllConvos] = useState<ConversationWithMeta[]>([]);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [allDocs, setAllDocs] = useState<Document[]>([]);

  // Load project
  useEffect(() => {
    async function load() {
      try {
        const [proj, st] = await Promise.all([
          getProjectById(id),
          getProjectStats(id),
        ]);
        if (!proj) {
          toast.error("Project not found");
          router.push("/projects");
          return;
        }
        setProject(proj);
        setStats(st);
        setEditName(proj.name);
        setEditDesc(proj.description || "");
        setEditColor(proj.color);
        setInstructions(proj.instructions || "");
      } catch {
        toast.error("Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  // Load chats
  const loadChats = useCallback(async () => {
    setChatsLoading(true);
    try {
      const convos = await getProjectConversations(id);
      setConversations(convos as ConversationWithMeta[]);
    } catch {
      // error
    } finally {
      setChatsLoading(false);
    }
  }, [id]);

  // Load files
  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const docs = await getDocumentsByProject(id);
      setDocuments(docs);
    } catch {
      // error
    } finally {
      setFilesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadChats();
    loadFiles();
  }, [loadChats, loadFiles]);

  // Handlers
  async function handleSaveOverview() {
    setSaving(true);
    try {
      await updateProject(id, {
        name: editName.trim(),
        description: editDesc.trim() || null,
        color: editColor,
      });
      setProject((prev) =>
        prev
          ? { ...prev, name: editName.trim(), description: editDesc.trim() || null, color: editColor }
          : prev
      );
      toast.success("Project updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInstructions() {
    setSavingInstructions(true);
    try {
      await updateProject(id, { instructions: instructions.trim() || null });
      setInstructionsDirty(false);
      toast.success("Instructions saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingInstructions(false);
    }
  }

  async function handleDeleteProject() {
    if (!confirm("Delete this project? Conversations and files will be unlinked but not deleted.")) return;
    try {
      await deleteProject(id);
      toast.success("Project deleted");
      router.push("/projects");
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleExportProject() {
    try {
      const lines: string[] = [
        `# ${project?.name || "Project"}`,
        "",
        project?.description ? `> ${project.description}` : "",
        "",
        `Exported: ${new Date().toLocaleString()}`,
        "",
      ];

      // Conversations
      if (conversations.length > 0) {
        lines.push("---", "", "## Conversations", "");
        for (const conv of conversations) {
          lines.push(`### ${conv.title || "Untitled"} (${conv.agent_name || "Harv"})`, "");
          try {
            const msgs = await getConversationMessages(conv.id);
            for (const m of msgs) {
              const role = m.role === "user" ? "**You**" : `**${conv.agent_name || "Harv"}**`;
              lines.push(`${role}: ${m.content}`, "");
            }
          } catch {
            lines.push("_(could not load messages)_", "");
          }
          lines.push("---", "");
        }
      }

      // Files
      if (documents.length > 0) {
        lines.push("## Files", "");
        for (const doc of documents) {
          lines.push(`- ${doc.filename} (${doc.file_type}, ${doc.file_size} bytes)`);
        }
        lines.push("");
      }

      // Instructions
      if (instructions) {
        lines.push("## Instructions", "", instructions, "");
      }

      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(project?.name || "project").replace(/\s+/g, "_").toLowerCase()}_export.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Project exported");
    } catch {
      toast.error("Export failed");
    }
  }

  async function handleOpenChatPicker() {
    try {
      const convos = await getRecentConversations(100);
      const projectConvIds = new Set(conversations.map((c) => c.id));
      setAllConvos((convos as ConversationWithMeta[]).filter((c) => !projectConvIds.has(c.id)));
      setShowChatPicker(true);
    } catch {
      toast.error("Failed to load conversations");
    }
  }

  async function handleLinkExistingChat(convId: string) {
    try {
      await moveToProject(convId, id);
      toast.success("Conversation linked to project");
      setShowChatPicker(false);
      loadChats();
      getProjectStats(id).then(setStats);
    } catch {
      toast.error("Failed to link");
    }
  }

  async function handleNewChat() {
    try {
      const convId = await createConversation("Harv");
      await moveToProject(convId, id);
      router.push(`/chat?project=${id}`);
    } catch {
      toast.error("Failed to start chat");
    }
  }

  async function handleUnlinkChat(convId: string) {
    try {
      await moveToProject(convId, null);
      toast.success("Conversation removed from project");
      loadChats();
      getProjectStats(id).then(setStats);
    } catch {
      toast.error("Failed to unlink");
    }
  }

  async function handleOpenLinkPicker() {
    try {
      const { documents: docs } = await getDocuments({ limit: 100 });
      // Filter out docs already in this project
      const projectDocIds = new Set(documents.map((d) => d.id));
      setAllDocs(docs.filter((d) => !projectDocIds.has(d.id)));
      setShowLinkPicker(true);
    } catch {
      toast.error("Failed to load documents");
    }
  }

  async function handleLinkExisting(docId: string) {
    try {
      await linkDocumentToProject(docId, id);
      toast.success("File linked to project");
      setShowLinkPicker(false);
      loadFiles();
      getProjectStats(id).then(setStats);
    } catch {
      toast.error("Failed to link file");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        await uploadDocument(file, undefined, undefined, undefined, id);
      }
      toast.success(`${files.length} file${files.length > 1 ? "s" : ""} uploaded`);
      loadFiles();
      getProjectStats(id).then(setStats);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleUnlinkFile(docId: string) {
    try {
      await linkDocumentToProject(docId, null);
      toast.success("File removed from project");
      loadFiles();
      getProjectStats(id).then(setStats);
    } catch {
      toast.error("Failed to unlink");
    }
  }

  async function handleDeleteFile(doc: Document) {
    if (!confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc);
      toast.success("File deleted");
      loadFiles();
      getProjectStats(id).then(setStats);
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <Link
          href="/projects"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className={cn("h-3 w-3 rounded-full", getColorClass(project.color))} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-sm text-muted-foreground truncate">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleNewChat} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          <Link href={`/chat?project=${id}`}>
            <Button variant="ghost" size="sm" className="gap-2 text-primary">
              <MessageSquare className="h-4 w-4" />
              Open in Chat
            </Button>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <Tabs defaultValue={0} className="space-y-4">
        <TabsList className="gap-1 h-9">
          <TabsTrigger value={0} className="gap-1.5 px-3 py-1.5 text-xs font-medium">
            <Settings2 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value={1} className="gap-1.5 px-3 py-1.5 text-xs font-medium">
            <MessageSquare className="h-3.5 w-3.5" />
            Chats
            {stats && stats.conversationCount > 0 && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary">
                {stats.conversationCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value={2} className="gap-1.5 px-3 py-1.5 text-xs font-medium">
            <BookOpen className="h-3.5 w-3.5" />
            Instructions
          </TabsTrigger>
          <TabsTrigger value={3} className="gap-1.5 px-3 py-1.5 text-xs font-medium">
            <FileText className="h-3.5 w-3.5" />
            Files
            {stats && stats.documentCount > 0 && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary">
                {stats.documentCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value={4} className="gap-1.5 px-3 py-1.5 text-xs font-medium">
            <Brain className="h-3.5 w-3.5" />
            Knowledge
          </TabsTrigger>
        </TabsList>

        {/* ─── Overview ──────────────────────────────── */}
        <TabsContent value={0} className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Chats</p>
                <p className="text-2xl font-bold text-primary mt-0.5">{stats?.conversationCount ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Files</p>
                <p className="text-2xl font-bold text-primary mt-0.5">{stats?.documentCount ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Last Activity</p>
                <p className="text-sm font-medium mt-1.5">
                  {stats?.lastActivity ? timeAgo(stats.lastActivity) : "None"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Edit form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-card/30 border-white/[0.08]"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Description</label>
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Optional description..."
                  className="bg-card/30 border-white/[0.08]"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Color</label>
                <div className="flex gap-2">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setEditColor(c.value)}
                      className={cn(
                        "h-7 w-7 rounded-full transition-all",
                        c.class,
                        editColor === c.value
                          ? "ring-2 ring-white ring-offset-2 ring-offset-background scale-110"
                          : "opacity-60 hover:opacity-100"
                      )}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleSaveOverview} disabled={saving} size="sm" className="gap-2">
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  onClick={handleExportProject}
                  variant="ghost"
                  size="sm"
                  className="gap-2 ml-auto"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button
                  onClick={handleDeleteProject}
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Project
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const activities = [
                  ...conversations.map((c) => ({
                    type: "chat" as const,
                    title: c.title || "Untitled chat",
                    agent: c.agent_name || "Harv",
                    time: c.updated_at,
                    id: c.id,
                  })),
                  ...documents.map((d) => ({
                    type: "file" as const,
                    title: d.filename,
                    agent: d.file_type || "file",
                    time: d.created_at,
                    id: d.id,
                  })),
                ]
                  .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                  .slice(0, 10);

                if (activities.length === 0) {
                  return (
                    <p className="text-xs text-muted-foreground/50 text-center py-4">
                      No activity yet
                    </p>
                  );
                }

                return (
                  <div className="space-y-1">
                    {activities.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
                      >
                        <div className={cn(
                          "h-7 w-7 shrink-0 flex items-center justify-center rounded-lg",
                          a.type === "chat" ? "bg-primary/10" : "bg-blue-500/10"
                        )}>
                          {a.type === "chat" ? (
                            <MessageSquare className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-blue-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{a.title}</p>
                          <p className="text-[10px] text-muted-foreground/60">
                            {a.type === "chat" ? a.agent : a.agent} · {timeAgo(a.time)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Instructions ──────────────────────────── */}
        <TabsContent value={2} className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Project Instructions</CardTitle>
                {instructionsDirty && (
                  <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-500/30 bg-yellow-500/10">
                    Unsaved
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Add context, guidelines, or notes for this project. These can guide conversations.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={instructions}
                onChange={(e) => {
                  setInstructions(e.target.value);
                  setInstructionsDirty(true);
                }}
                placeholder="Write project instructions, context, or notes here..."
                rows={12}
                className="resize-none bg-card/30 border-white/[0.08] text-sm leading-relaxed"
              />
              <Button
                onClick={handleSaveInstructions}
                disabled={!instructionsDirty || savingInstructions}
                size="sm"
                className="gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                {savingInstructions ? "Saving..." : "Save Instructions"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Chats ─────────────────────────────────── */}
        <TabsContent value={1} className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""} in this project
            </p>
            <div className="flex gap-1">
              <Button onClick={handleOpenChatPicker} variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary text-xs">
                <Link2 className="h-3.5 w-3.5" />
                Link Existing
              </Button>
              <Link href={`/chat?project=${id}`}>
                <Button variant="ghost" size="sm" className="gap-2 text-primary text-xs">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Chat
                </Button>
              </Link>
            </div>
          </div>

          {/* Link existing chat picker */}
          {showChatPicker && (
            <div className="rounded-xl bg-card/50 backdrop-blur-xl ring-1 ring-white/[0.08] p-4 space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Select a conversation to link</span>
                <Button variant="ghost" size="sm" onClick={() => setShowChatPicker(false)} className="h-6 text-xs">Cancel</Button>
              </div>
              {allConvos.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No unlinked conversations available</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {allConvos.map((conv) => {
                    const ConvIcon = AGENT_ICONS[conv.agent_name] || Bot;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => handleLinkExistingChat(conv.id)}
                        className="w-full flex items-center gap-3 rounded-lg p-2 text-left hover:bg-white/[0.04] transition-colors"
                      >
                        <ConvIcon className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium truncate block">{getConversationDisplayTitle(conv)}</span>
                          <span className="text-[10px] text-muted-foreground/60">{conv.agent_name} · {conv.message_count} msgs</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {chatsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-card/20 ring-1 ring-white/[0.04]">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground/50 mt-1 mb-4">
                Start a conversation within this project
              </p>
              <Button onClick={handleNewChat} size="sm" className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                Start a Chat
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => {
                const Icon = AGENT_ICONS[conv.agent_name] || Bot;
                return (
                  <div
                    key={conv.id}
                    onClick={() => router.push(`/chat?project=${id}&conversation=${conv.id}`)}
                    className="flex items-center gap-3 rounded-xl p-4 bg-card/30 ring-1 ring-white/[0.06] hover:bg-card/50 hover:ring-primary/20 transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {getConversationDisplayTitle(conv)}
                        </span>
                        <Badge variant="outline" className="shrink-0 text-[10px] border-white/[0.08] text-muted-foreground/60">
                          {conv.agent_name}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground/40">
                          {conv.message_count} msgs
                        </span>
                      </div>
                      {conv.last_message && (
                        <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                          {conv.last_message.slice(0, 80)}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUnlinkChat(conv.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-red-400 shrink-0"
                      title="Remove from project"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Files ─────────────────────────────────── */}
        <TabsContent value={3} className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">
              {documents.length} file{documents.length !== 1 ? "s" : ""} in this project
            </p>
            <div>
              <input
                type="file"
                multiple
                id="project-file-upload"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                onClick={() => document.getElementById("project-file-upload")?.click()}
                disabled={uploading}
                variant="ghost"
                size="sm"
                className="gap-2 text-primary text-xs"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading..." : "Upload Files"}
              </Button>
              <Button
                onClick={handleOpenLinkPicker}
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-primary text-xs"
              >
                <Link2 className="h-3.5 w-3.5" />
                Link Existing
              </Button>
            </div>
          </div>

          {/* Link existing file picker */}
          {showLinkPicker && (
            <div className="rounded-xl bg-card/50 backdrop-blur-xl ring-1 ring-white/[0.08] p-4 space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Select a file to link</span>
                <Button variant="ghost" size="sm" onClick={() => setShowLinkPicker(false)} className="h-6 text-xs">
                  Cancel
                </Button>
              </div>
              {allDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No unlinked files available</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {allDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => handleLinkExisting(doc.id)}
                      className="w-full flex items-center gap-3 rounded-lg p-2 text-left hover:bg-white/[0.04] transition-colors"
                    >
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium truncate block">{doc.filename}</span>
                        <span className="text-[10px] text-muted-foreground/60">{formatFileSize(doc.file_size)} · {doc.file_type}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {filesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-card/20 ring-1 ring-white/[0.04]">
              <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No files yet</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Upload documents or link existing files to this project
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-xl p-3 bg-card/30 ring-1 ring-white/[0.06] hover:bg-card/50 transition-all duration-200"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">{doc.filename}</span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatFileSize(doc.file_size)} &middot; {doc.file_type}
                    </span>
                  </div>
                  <a
                    href={getDocumentUrl(doc.storage_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleUnlinkFile(doc.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-yellow-400 shrink-0"
                    title="Remove from project"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteFile(doc)}
                    className="h-7 w-7 text-muted-foreground hover:text-red-400 shrink-0"
                    title="Delete file"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Knowledge ─────────────────────────────── */}
        <TabsContent value={4} className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Project Knowledge
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Memory entries related to this project. Knowledge is automatically gathered from conversations.
              </p>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 rounded-xl bg-white/[0.02]">
                <Brain className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Knowledge base integration coming soon
                </p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Project-specific memory entries will appear here
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
