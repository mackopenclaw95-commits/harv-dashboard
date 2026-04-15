"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AGENT_ICONS } from "@/lib/agent-data";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface AgentChatProps {
  agentName: string;
  placeholder?: string;
  className?: string;
}

export interface AgentChatHandle {
  send: (text: string) => Promise<void>;
}

export const AgentChat = forwardRef<AgentChatHandle, AgentChatProps>(function AgentChat(
  { agentName, placeholder, className },
  ref,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const AgentIcon = AGENT_ICONS[agentName] || Bot;

  // Load chat history from Supabase on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const { getAgentChat } = await import("@/lib/chat-history");
        const history = await getAgentChat(agentName);
        setMessages(history.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })));
      } catch { /* silent */ }
      finally { setLoaded(true); }
    }
    loadHistory();
  }, [agentName]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const { saveAgentMessage } = await import("@/lib/chat-history");
      saveAgentMessage(agentName, "user", trimmed).catch(console.error);

      const { askAgent } = await import("@/lib/agent-ask");
      const response = await askAgent(agentName, trimmed);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      saveAgentMessage(agentName, "assistant", response).catch(console.error);
    } catch {
      toast.error("Failed to get response");
    } finally {
      setSending(false);
    }
  }, [agentName]);

  const sendMessage = useCallback(async () => {
    if (sending) return;
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendText(text);
  }, [input, sending, sendText]);

  useImperativeHandle(ref, () => ({ send: sendText }), [sendText]);

  function formatTime(ts: string) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardContent className="flex flex-col p-0 h-full">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[400px]">
          {!loaded ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AgentIcon className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-xs text-muted-foreground/40">Ask {agentName} anything</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2.5",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5",
                  msg.role === "user" ? "bg-primary/15" : "bg-white/[0.06]"
                )}>
                  {msg.role === "user" ? (
                    <User className="h-3 w-3 text-primary" />
                  ) : (
                    <AgentIcon className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                <div className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2",
                  msg.role === "user"
                    ? "bg-primary/10 text-foreground"
                    : "bg-white/[0.04] text-foreground"
                )}>
                  <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <span className="text-[9px] text-muted-foreground/40 mt-1 block">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] mt-0.5">
                <AgentIcon className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="rounded-xl px-3 py-2 bg-white/[0.04]">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 p-3 border-t border-white/[0.06]">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={placeholder || `Ask ${agentName}...`}
            disabled={sending}
            className="text-xs h-9"
          />
          <Button
            size="sm"
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="h-9 w-9 p-0 shrink-0"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
