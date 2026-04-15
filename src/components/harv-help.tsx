"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HelpCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "harv-help-history";
const MAX_HISTORY = 30;

const SUGGESTED_QUESTIONS = [
  "How do I upgrade my plan?",
  "What's the difference between Free and Pro?",
  "How does the Learning agent work?",
  "How do I connect Google Calendar?",
];

export function HarvHelp() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hide on auth pages
  const hidden = pathname?.startsWith("/auth") || pathname?.startsWith("/onboarding");

  // Load history from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch { /* ignore */ }
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data?.reply || "Sorry — I couldn't answer that. Try rephrasing or ask Mack directly.";
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Connection failed — check your network and try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [messages, sending]);

  if (hidden) return null;

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/30 backdrop-blur-md hover:bg-primary/30 hover:scale-105 transition-all shadow-lg shadow-primary/20"
          aria-label="Open Harv Help"
          title="Need help? Ask Harv"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[560px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl bg-popover/95 backdrop-blur-xl ring-1 ring-white/[0.08] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/25">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Harv Help</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Ask about Harv</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center text-center py-6">
                <Sparkles className="h-8 w-8 text-primary/30 mb-2" />
                <p className="text-xs text-foreground/70 mb-1">Hey, I&apos;m Harv Help.</p>
                <p className="text-[11px] text-muted-foreground mb-4">
                  Ask me anything about Harv — features, pricing, how-tos.
                </p>
                <div className="space-y-1.5 w-full">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendText(q)}
                      className="w-full text-left text-[11px] text-foreground/70 hover:text-foreground hover:bg-white/[0.04] rounded-lg px-3 py-2 transition-colors ring-1 ring-white/[0.04]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                      msg.role === "user"
                        ? "bg-primary/15 text-foreground ring-1 ring-primary/20"
                        : "bg-white/[0.04] text-foreground/90 ring-1 ring-white/[0.04]",
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex gap-2">
                <div className="bg-white/[0.04] ring-1 ring-white/[0.04] rounded-xl px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/[0.06] p-3 flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendText(input);
                }
              }}
              placeholder="Ask a question..."
              disabled={sending}
              className="text-xs h-9"
            />
            <Button
              size="sm"
              onClick={() => sendText(input)}
              disabled={sending || !input.trim()}
              className="h-9 w-9 p-0 shrink-0"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
