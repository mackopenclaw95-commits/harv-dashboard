"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Flag, Loader2, Paperclip, Send, User, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "./markdown-message";
import { ImageMessage, parseImageResponse } from "./image-message";
import { VideoMessage, parseVideoResponse } from "./video-message";
import { getRoutingMessage, getKachowGreeting, KACHOW_PLACEHOLDERS } from "@/lib/constants";
import {
  saveMessage,
  getConversationMessages,
  updateConversationTitle,
} from "@/lib/supabase-chat";
import { getProjectById } from "@/lib/supabase-projects";
import { getDocumentsByProject, getDocumentUrl } from "@/lib/supabase-documents";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

interface Attachment {
  name: string;
  size: number;
  type: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
}

interface ChatPanelProps {
  conversationId: string | null;
  agentName: string;
  apiEndpoint: "/api/chat" | "/api/chat/agent";
  icon?: React.ElementType;
  placeholder?: string;
  onNewMessage?: () => void;
  isFirstConversation?: boolean;
  agentDescription?: string;
  projectId?: string | null;
}

function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  const who = name || "there";
  if (hour < 12) return `Good morning, ${who}`;
  if (hour < 17) return `Good afternoon, ${who}`;
  return `Good evening, ${who}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Strip leaked context blocks from message content for display */
function stripContextBlocks(text: string): string {
  return text
    .replace(/\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*/g, "")
    .replace(/\[CONTEXT\][\s\S]*?\[\/CONTEXT\]\s*/g, "")
    .replace(/^User message:\s*/i, "")
    .trim();
}

/** Sanitize agent responses — replace raw errors with friendly messages, strip action blocks */
function sanitizeAgentResponse(text: string): string {
  let cleaned = text;

  // Replace raw Google OAuth errors with friendly message
  if (/RefreshError.*Token has been expired or revoked/i.test(cleaned) ||
      /invalid_grant/i.test(cleaned)) {
    cleaned = "Your Google connection needs to be re-authorized. Go to **Settings > Integrations** to reconnect Google, then try again.";
  }

  // Replace raw RuntimeError for unconfigured agents
  if (/RuntimeError.*not configured/i.test(cleaned)) {
    const match = cleaned.match(/RuntimeError:\s*(.+?)(?:\.|$)/);
    cleaned = `This feature needs setup first${match ? `: ${match[1]}` : ""}. Check **Settings** or ask Harv for help.`;
  }

  // Replace raw Python/backend exceptions
  if (/Traceback \(most recent call last\)/i.test(cleaned) ||
      /^\w+Error:\s/m.test(cleaned) && cleaned.length < 300) {
    if (!cleaned.startsWith("Your Google") && !cleaned.startsWith("This feature")) {
      cleaned = "Something went wrong processing your request. Please try again, or ask Harv for help.";
    }
  }

  // Strip [SPOTIFY_ACTION] blocks — show friendly message instead
  cleaned = cleaned.replace(
    /\[SPOTIFY_ACTION\][\s\S]*?\[\/SPOTIFY_ACTION\]/g,
    "\n\n*Creating your Spotify playlist...*"
  );

  return cleaned.trim();
}

export function ChatPanel({
  conversationId,
  agentName,
  apiEndpoint,
  icon: IconProp,
  placeholder,
  onNewMessage,
  isFirstConversation,
  agentDescription,
  projectId,
}: ChatPanelProps) {
  const { profile } = useAuth();
  const Icon = IconProp || Bot;
  const [messages, setMessages] = useState<Message[]>([]);
  const [projectContext, setProjectContext] = useState<string | null>(null);
  const [isKachow, setIsKachow] = useState(false);

  // Detect kachow mode
  useEffect(() => {
    setIsKachow(document.documentElement.classList.contains("kachow"));
    function handleChange(e: Event) { setIsKachow((e as CustomEvent).detail === "cars1"); }
    window.addEventListener("personality-change", handleChange);
    const timer = setTimeout(() => setIsKachow(document.documentElement.classList.contains("kachow")), 1500);
    return () => { window.removeEventListener("personality-change", handleChange); clearTimeout(timer); };
  }, []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);
  const titleSetRef = useRef(false);
  const nearCapWarnedRef = useRef(false);

  const hasMessages = messages.length > 0;

  // Load messages when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setHistoryLoading(false);
      titleSetRef.current = false;
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    titleSetRef.current = false;

    async function load() {
      try {
        const msgs = await getConversationMessages(conversationId!);
        if (cancelled) return;
        if (msgs.length > 0) {
          setMessages(
            msgs.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.created_at),
            }))
          );
          titleSetRef.current = true; // existing conversation, title already set
        } else if (agentName !== "Harv" && agentDescription) {
          setMessages([
            {
              id: "welcome",
              role: "assistant",
              content: `Hey! I'm ${agentName}. ${agentDescription}. How can I help?`,
              timestamp: new Date(),
            },
          ]);
        } else {
          setMessages([]);
        }
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    load();

    return () => { cancelled = true; };
  }, [conversationId, agentName, agentDescription]);

  // Auto-scroll — always scroll when a new message arrives or loading state changes
  const prevMessageCount = useRef(0);
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const messageCountChanged = messages.length !== prevMessageCount.current;
    prevMessageCount.current = messages.length;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    // Scroll if: near bottom, or a new message just appeared, or loading just started/stopped
    if (distanceFromBottom < 300 || messageCountChanged) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // Load project context (instructions + file contents) when projectId is set
  useEffect(() => {
    if (!projectId) {
      setProjectContext(null);
      return;
    }

    let cancelled = false;

    async function loadProjectContext() {
      try {
        const [project, docs] = await Promise.all([
          getProjectById(projectId!),
          getDocumentsByProject(projectId!),
        ]);

        if (cancelled || !project) return;

        const parts: string[] = [];
        parts.push(`You are working within the project "${project.name}".`);

        if (project.description) {
          parts.push(`Project description: ${project.description}`);
        }

        if (project.instructions) {
          parts.push(`Project instructions:\n${project.instructions}`);
        }

        if (docs.length > 0) {
          parts.push(`\nProject files (${docs.length}):`);

          // Fetch text content for small text-based files
          for (const doc of docs) {
            const isText =
              doc.file_type === "document" ||
              doc.file_type === "spreadsheet" ||
              doc.mime_type?.startsWith("text/") ||
              doc.filename.match(/\.(txt|md|csv|json|tsv|xml|yaml|yml)$/i);

            if (isText && doc.file_size < 50000) {
              try {
                const url = getDocumentUrl(doc.storage_path);
                const res = await fetch(url);
                if (res.ok) {
                  const text = await res.text();
                  parts.push(`\n--- File: ${doc.filename} ---\n${text}\n--- End of ${doc.filename} ---`);
                } else {
                  parts.push(`- ${doc.filename} (${doc.file_type}, could not read)`);
                }
              } catch {
                parts.push(`- ${doc.filename} (${doc.file_type}, could not read)`);
              }
            } else {
              parts.push(`- ${doc.filename} (${doc.file_type}, ${doc.file_size} bytes)`);
            }
          }
        }

        if (!cancelled) {
          setProjectContext(parts.join("\n"));
        }
      } catch {
        // Failed to load context, continue without it
      }
    }

    loadProjectContext();
    return () => { cancelled = true; };
  }, [projectId]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setAttachedFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) setAttachedFiles((prev) => [...prev, ...files]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (isSendingRef.current) return;

    isSendingRef.current = true;
    setIsLoading(true);
    setInput("");

    // Check usage limits before sending
    let currentModelTier: "primary" | "fallback" | "blocked" = "primary";
    try {
      const agentParam = agentName ? `?agent=${encodeURIComponent(agentName)}` : "";
      const usageRes = await fetch(`/api/usage/check${agentParam}`);
      if (usageRes.ok) {
        const usage = await usageRes.json();
        if (usage.reason === "trial_expired") {
          toast.error(
            "Your free trial has ended. Upgrade to Pro to keep using Harv.",
            {
              duration: 8000,
              action: { label: "Upgrade", onClick: () => window.location.href = "/settings?tab=billing" },
            }
          );
          isSendingRef.current = false;
          setIsLoading(false);
          return;
        }
        if (usage.reason === "agent_locked") {
          toast.error(
            `${agentName} requires a Pro or Max plan. Upgrade to unlock all agents.`,
            { duration: 5000 }
          );
          isSendingRef.current = false;
          setIsLoading(false);
          return;
        }
        if (!usage.allowed) {
          if (usage.reason === "daily_cost_cap") {
            const spent = Number(usage.daily_cost_usd || 0).toFixed(4);
            const cap = Number(usage.daily_cost_cap_usd || 0).toFixed(2);
            toast.error(
              `Daily spend cap reached ($${spent} / $${cap}). Resets at midnight.`,
              {
                duration: 8000,
                action: {
                  label: "Upgrade",
                  onClick: () => window.location.href = "/settings?tab=billing",
                },
              }
            );
          } else {
            toast.error(
              `Weekly limit reached (${usage.weekly_used}/${usage.weekly_limit}). Resets next week.`,
              {
                duration: 8000,
                action: {
                  label: "Upgrade",
                  onClick: () => window.location.href = "/settings?tab=billing",
                },
              }
            );
          }
          isSendingRef.current = false;
          setIsLoading(false);
          return;
        }
        currentModelTier = usage.model_tier || "primary";
        if (usage.degraded) {
          toast("Using standard model — daily premium limit reached. Upgrade for more.", {
            duration: 4000,
            action: {
              label: "Upgrade",
              onClick: () => window.location.href = "/settings?tab=billing",
            },
          });
        }
        // Soft warning at 80% of daily $ cap — once per session
        const capUsd = Number(usage.daily_cost_cap_usd || 0);
        const spentUsd = Number(usage.daily_cost_usd || 0);
        if (
          capUsd > 0 &&
          spentUsd / capUsd >= 0.8 &&
          !usage.cost_exceeded &&
          !nearCapWarnedRef.current
        ) {
          nearCapWarnedRef.current = true;
          const pct = Math.round((spentUsd / capUsd) * 100);
          toast(
            `Heads up — you've used ${pct}% of today's spend cap ($${spentUsd.toFixed(4)} / $${capUsd.toFixed(2)}).`,
            {
              duration: 6000,
              action: {
                label: "Upgrade",
                onClick: () => window.location.href = "/settings?tab=billing",
              },
            }
          );
        }
      }
    } catch {} // If usage check fails, allow the message through

    const fileAttachments: Attachment[] = attachedFiles.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    const fileContext =
      attachedFiles.length > 0
        ? `\n\n[Attached: ${attachedFiles.map((f) => f.name).join(", ")}]`
        : "";

    setAttachedFiles([]);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: (trimmed || "Sent files") + fileContext,
      timestamp: new Date(),
      attachments: fileAttachments.length > 0 ? fileAttachments : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);

    // Save user message and auto-set title
    if (conversationId) {
      saveMessage(conversationId, "user", userMessage.content).catch(() =>
        toast.error("Failed to save message")
      );
      if (!titleSetRef.current && trimmed) {
        titleSetRef.current = true;
        updateConversationTitle(
          conversationId,
          trimmed.slice(0, 60)
        ).catch(() => {});
      }
    }

    try {
      const fetchBody =
        apiEndpoint === "/api/chat/agent"
          ? {
              message: trimmed,
              agent: agentName,
              plan: profile?.plan || "free",
              model_tier: currentModelTier,
              ...(projectContext ? { context: projectContext } : {}),
            }
          : {
              messages: [...messages, userMessage].map((m) => ({
                role: m.role,
                content: m.content,
              })),
              plan: profile?.plan || "free",
              model_tier: currentModelTier,
              ...(projectContext ? { context: projectContext } : {}),
            };

      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fetchBody),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      const assistantId = (Date.now() + 1).toString();
      let tokensIn = 0;
      let tokensOut = 0;
      let streamModel = "";
      let cachedTokens = 0;

      if (contentType.includes("text/event-stream") && res.body) {
        // SSE streaming: render text incrementally
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let fullText = "";
        let streamDone = false;

        // Add empty assistant message that we'll update
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
        ]);
        setIsLoading(false); // hide loading dots — text is streaming

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });

          // Parse SSE events (data: {...}\n\n)
          const events = accumulated.split("\n\n");
          accumulated = events.pop() || ""; // keep incomplete chunk

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === "delta") {
                fullText += payload.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullText } : m
                  )
                );
              } else if (payload.type === "done") {
                fullText = payload.full_text || fullText;
                tokensIn = payload.tokens_in || 0;
                tokensOut = payload.tokens_out || 0;
                streamModel = payload.model || streamModel;
                cachedTokens = payload.cached_tokens || 0;
                streamDone = true;
              }
              // tool events are informational — text keeps streaming after
            } catch {
              // skip malformed events
            }
          }
        }

        const assistantContent = sanitizeAgentResponse(fullText || "Sorry, I couldn't generate a response.");
        // Final update with clean text
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: assistantContent } : m
          )
        );

        if (conversationId) {
          saveMessage(conversationId, "assistant", assistantContent).catch(
            console.error
          );
        }
      } else {
        // Non-streaming fallback: plain text response
        const responseText = await res.text();
        const assistantContent = sanitizeAgentResponse(responseText || "Sorry, I couldn't generate a response.");
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: assistantContent, timestamp: new Date() },
        ]);

        if (conversationId) {
          saveMessage(conversationId, "assistant", assistantContent).catch(
            console.error
          );
        }
      }

      onNewMessage?.();

      // Log usage — server computes authoritative cost from model_pricing table
      fetch("/api/usage/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_name: agentName || "Harv",
          model: streamModel,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cached_tokens: cachedTokens,
        }),
      }).then(res => {
        if (!res.ok) console.error("[usage-log] Failed:", res.status);
      }).catch(err => console.error("[usage-log] Error:", err));
    } catch {
      toast.error("Connection error — is the Harv API running?");
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
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const routingMessage = getRoutingMessage(agentName, isKachow);

  // Loading skeleton
  if (historyLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-5">
            <div className="flex gap-3 justify-end">
              <Skeleton className="h-16 w-[60%] rounded-2xl" />
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <Skeleton className="h-24 w-[70%] rounded-2xl" />
            </div>
            <div className="flex gap-3 justify-end">
              <Skeleton className="h-12 w-[50%] rounded-2xl" />
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state (centered input like Claude)
  if (!hasMessages && !isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl flex flex-col items-center">
          <div className="flex items-center gap-3 mb-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25 shadow-lg shadow-primary/10">
              {agentName === "Harv" ? (
                isKachow ? <Flag className="h-5 w-5 text-primary" /> : <Zap className="h-5 w-5 text-primary" />
              ) : (
                <Icon className="h-5 w-5 text-primary" />
              )}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {agentName === "Harv"
                ? (isKachow ? getKachowGreeting(profile?.name ?? undefined) : getGreeting(profile?.name ?? undefined))
                : `Chat with ${agentName}`}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="w-full">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <div data-tour="chat-input-area" className="relative rounded-2xl ring-1 ring-white/[0.08] bg-card/50 backdrop-blur-2xl shadow-xl shadow-black/15 focus-within:ring-primary/30 focus-within:shadow-primary/5 transition-all duration-300">
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-5 pt-4">
                  {attachedFiles.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08] px-2.5 py-1.5 text-xs"
                    >
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="max-w-[120px] truncate">{file.name}</span>
                      <span className="text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="ml-0.5 rounded p-0.5 hover:bg-white/[0.08] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isKachow ? KACHOW_PLACEHOLDERS[Math.floor(Math.random() * KACHOW_PLACEHOLDERS.length)] : (placeholder || `Message ${agentName}...`)}
                rows={2}
                className={cn(
                  "min-h-[80px] max-h-[200px] resize-none border-0 bg-transparent px-5 pb-12 text-base placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0",
                  attachedFiles.length > 0 ? "pt-2" : "pt-4"
                )}
                disabled={isLoading}
              />
              <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  data-tour="chat-attach"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 w-8 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
                  disabled={isLoading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  data-tour="chat-send"
                  disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
                  className="h-8 w-8 rounded-lg hover:bg-primary/10"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Conversation view
  return (
    <div
      className="flex h-full flex-col relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-2xl m-2 pointer-events-none">
          <div className="text-center">
            <Paperclip className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-primary">Drop files here</p>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-6" ref={chatContainerRef}>
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <Avatar className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </Avatar>
              )}

              <div
                className={cn(
                  "max-w-[85%] sm:max-w-[70%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-card/40 backdrop-blur-xl rounded-bl-md ring-1 ring-white/[0.08]"
                )}
              >
                {msg.role === "assistant" ? (() => {
                  const cleaned = stripContextBlocks(msg.content);
                  const imgData = parseImageResponse(cleaned);
                  if (imgData) {
                    return <ImageMessage {...imgData} projectId={projectId} />;
                  }
                  const vidData = parseVideoResponse(cleaned);
                  if (vidData) {
                    return <VideoMessage {...vidData} projectId={projectId} />;
                  }
                  return (
                    <div className="text-sm leading-relaxed">
                      <MarkdownMessage content={cleaned} />
                    </div>
                  );
                })() : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                <time className="mt-1.5 block text-[10px] opacity-60">
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>

              {msg.role === "user" && (
                <Avatar className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/8">
                  <User className="h-4 w-4 text-foreground/70" />
                </Avatar>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <Avatar className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </Avatar>
              <div className="rounded-2xl rounded-bl-md bg-card/40 backdrop-blur-xl ring-1 ring-white/[0.08] px-5 py-3.5">
                <p className="text-xs text-muted-foreground mb-1.5 italic">
                  {routingMessage}
                </p>
                <div className="flex gap-1.5">
                  {isKachow ? (
                    <>
                      <span className="h-2 w-2 animate-bounce rounded-full bg-red-500/60 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-yellow-500/60 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-red-500/60 [animation-delay:300ms]" />
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30 [animation-delay:300ms]" />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-white/[0.06] px-4 py-3 bg-card/30 backdrop-blur-2xl">
        <input
          type="file"
          multiple
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileSelect}
        />
        <div className="mx-auto max-w-3xl">
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachedFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08] px-2.5 py-1.5 text-xs"
                >
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <span className="text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-0.5 rounded p-0.5 hover:bg-white/[0.08] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div data-tour="chat-input-area" className="rounded-xl ring-1 ring-white/[0.08] bg-card/40 backdrop-blur-xl p-1.5 focus-within:ring-primary/25 transition-all duration-200">
            <form onSubmit={handleSubmit} className="flex items-end gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                data-tour="chat-attach"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground rounded-lg"
                disabled={isLoading}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isKachow ? KACHOW_PLACEHOLDERS[Math.floor(Math.random() * KACHOW_PLACEHOLDERS.length)] : (placeholder || `Message ${agentName}...`)}
                rows={1}
                className="min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                data-tour="chat-send"
                disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
                className="shrink-0 h-9 w-9 rounded-lg"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
