"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LifeBuoy,
  MessageSquare,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Mail,
  Loader2,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

// ─── FAQ data ──────────────────────────────────────────────

type FaqItem = { q: string; a: string };
type FaqCategory = { title: string; items: FaqItem[] };

const FAQS: FaqCategory[] = [
  {
    title: "Getting Started",
    items: [
      {
        q: "What is Harv?",
        a: "Harv is a personal AI assistant platform built around specialist agents. Each agent (Journal, Finance, Research, Music, etc.) is tuned for a specific task, and the Router invisibly delegates your requests to the right one.",
      },
      {
        q: "How do I use an agent?",
        a: "Either chat with Harv directly from the Chat page and let it route, or open a specific agent page from the Agents list to talk to that specialist directly with dedicated tools and history.",
      },
      {
        q: "What plans are available?",
        a: "Free includes core chat + a handful of agents. Pro ($20/mo) unlocks all personal agents and higher usage limits. Max ($50/mo) lifts the caps further and adds admin/team features. You can manage your plan in Settings → Billing.",
      },
    ],
  },
  {
    title: "Accounts & Billing",
    items: [
      {
        q: "How do I upgrade or cancel my plan?",
        a: "Go to Settings → Billing. Upgrades take effect immediately; cancellations keep your plan active until the end of the current billing period.",
      },
      {
        q: "Where do I see how much I've used?",
        a: "The Analytics page shows token usage, estimated cost, and per-agent breakdown. Admins can export a CSV of all user usage from that page.",
      },
      {
        q: "Can I get a refund?",
        a: "Open a billing ticket below and we'll review it on a case-by-case basis. Include your plan and the billing date you're asking about.",
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        q: "How do I connect Google (Gmail / Drive / Calendar)?",
        a: "Visit the Integrations page and click Connect next to Google. You'll be redirected to Google's OAuth flow. Scopes are limited to what the relevant agents actually need.",
      },
      {
        q: "Why isn't my Spotify working?",
        a: "Spotify tokens expire periodically. Go to Integrations and click Reconnect. If that doesn't fix it, file a bug ticket below with a timestamp of when you noticed the issue.",
      },
      {
        q: "Can I use my own OpenAI / OpenRouter key (BYOK)?",
        a: "Yes — on the Max plan you can add your own keys in Settings → Integrations. Requests will be billed to your provider account instead of counting against Harv's usage limits.",
      },
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      {
        q: "An agent is returning errors or hanging",
        a: "First try reloading the page. If it persists, check the Activity page for recent errors, then file a bug ticket below with the agent name and what you asked it to do.",
      },
      {
        q: "I'm hitting usage limits too quickly",
        a: "Different models consume different token amounts. The Analytics page breaks down your usage by agent — if something's disproportionately high, it might be a retry loop. File a ticket and include the date.",
      },
      {
        q: "The Chat page shows no history",
        a: "Chat history lives in Supabase scoped to your account. If you're logged into the right account and still see nothing, try the History tab on the Chat page — older conversations are grouped there.",
      },
    ],
  },
];

const CATEGORIES = [
  { value: "general", label: "General Question" },
  { value: "bug", label: "Bug Report" },
  { value: "billing", label: "Billing & Account" },
  { value: "feature", label: "Feature Request" },
  { value: "account", label: "Account / Login" },
];

// ─── Ticket types ─────────────────────────────────────────

type Ticket = {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
};

const STATUS_META: Record<Ticket["status"], { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  open: { label: "Open", color: "text-blue-400 border-blue-500/30 bg-blue-500/10", icon: Clock },
  in_progress: { label: "In Progress", color: "text-amber-400 border-amber-500/30 bg-amber-500/10", icon: Loader2 },
  resolved: { label: "Resolved", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", icon: CheckCircle2 },
  closed: { label: "Closed", color: "text-muted-foreground border-white/10 bg-white/[0.03]", icon: CheckCircle2 },
};

// ─── Page ─────────────────────────────────────────────────

export default function SupportPage() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  async function loadTickets() {
    try {
      const res = await fetch("/api/support");
      if (res.status === 401) {
        setTickets([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error("Failed to load tickets:", err);
      setTickets([]);
    }
  }

  useEffect(() => {
    loadTickets();
    // Mark all admin responses as seen + refresh the sidebar badge
    fetch("/api/support/unread", { method: "POST" }).then(() => {
      window.dispatchEvent(new CustomEvent("support-unread-refresh"));
    }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success("Ticket submitted — we'll get back to you soon");
      setSubject("");
      setMessage("");
      setCategory("general");
      loadTickets();
    } catch (err) {
      toast.error((err as Error).message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 p-6 md:p-8 max-w-5xl mx-auto space-y-10">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <LifeBuoy className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Support</h1>
            <p className="text-sm text-muted-foreground">Browse the FAQ or send us a message — we usually reply within a day.</p>
          </div>
        </div>
      </header>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a
          href="#faq"
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
        >
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold">FAQ</p>
            <p className="text-xs text-muted-foreground">Common questions</p>
          </div>
        </a>
        <a
          href="#contact"
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
        >
          <Mail className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold">Contact Us</p>
            <p className="text-xs text-muted-foreground">Open a ticket</p>
          </div>
        </a>
        <a
          href="#tickets"
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
        >
          <MessageSquare className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold">My Tickets</p>
            <p className="text-xs text-muted-foreground">Track your requests</p>
          </div>
        </a>
      </div>

      {/* FAQ */}
      <section id="faq" className="space-y-4 scroll-mt-24">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          {FAQS.map((cat) => (
            <div key={cat.title}>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{cat.title}</p>
              <div className="space-y-2">
                {cat.items.map((item) => {
                  const key = `${cat.title}:${item.q}`;
                  const isOpen = openFaq === key;
                  return (
                    <Card key={key} className="border-white/[0.06] bg-white/[0.02]">
                      <button
                        onClick={() => setOpenFaq(isOpen ? null : key)}
                        className="flex w-full items-center justify-between gap-3 p-4 text-left"
                      >
                        <span className="text-sm font-medium">{item.q}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                      {isOpen && (
                        <CardContent className="pt-0 pb-4">
                          <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact form */}
      <section id="contact" className="space-y-4 scroll-mt-24">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Send us a message
        </h2>
        <Card className="border-white/[0.06] bg-white/[0.02]">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        category === c.value
                          ? "bg-primary/15 border-primary/30 text-primary"
                          : "bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Short summary"
                  maxLength={200}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message</label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe the issue or question. For bugs, include what you were doing and what you expected to happen."
                  rows={6}
                  maxLength={5000}
                  required
                />
                <p className="text-[10px] text-muted-foreground mt-1">{message.length} / 5000</p>
              </div>
              <div className="flex items-center justify-end">
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Sending…
                    </>
                  ) : (
                    "Send Ticket"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* My tickets */}
      <section id="tickets" className="space-y-4 scroll-mt-24">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          My Tickets
        </h2>
        {tickets === null ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : tickets.length === 0 ? (
          <Card className="border-white/[0.06] bg-white/[0.02]">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No tickets yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Send a message above if you need help.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => {
              const meta = STATUS_META[t.status] || STATUS_META.open;
              const Icon = meta.icon;
              const isExpanded = expandedTicket === t.id;
              return (
                <Card key={t.id} className="border-white/[0.06] bg-white/[0.02]">
                  <button
                    onClick={() => setExpandedTicket(isExpanded ? null : t.id)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", t.status === "in_progress" && "animate-spin")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{t.subject}</p>
                        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 shrink-0", meta.color)}>
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {CATEGORIES.find((c) => c.value === t.category)?.label || t.category} · {timeAgo(t.created_at)}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>
                  {isExpanded && (
                    <CardContent className="pt-0 pb-4 space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Your message</p>
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{t.message}</p>
                      </div>
                      {t.admin_response && (
                        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-primary mb-1">Response from Harv team</p>
                          <p className="text-sm whitespace-pre-wrap">{t.admin_response}</p>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
