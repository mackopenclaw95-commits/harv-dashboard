"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LifeBuoy,
  Clock,
  Loader2,
  CheckCircle2,
  MessageSquare,
  User,
  Mail,
  Send,
  AlertCircle,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

type Status = "open" | "in_progress" | "resolved" | "closed";

type Ticket = {
  id: string;
  user_id: string;
  user_name: string | null;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: Status;
  admin_response: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const STATUS_META: Record<Status, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  open: { label: "Open", color: "text-blue-400 border-blue-500/30 bg-blue-500/10", icon: Clock },
  in_progress: { label: "In Progress", color: "text-amber-400 border-amber-500/30 bg-amber-500/10", icon: Loader2 },
  resolved: { label: "Resolved", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", icon: CheckCircle2 },
  closed: { label: "Closed", color: "text-muted-foreground border-white/10 bg-white/[0.03]", icon: CheckCircle2 },
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  bug: "Bug",
  billing: "Billing",
  feature: "Feature",
  account: "Account",
};

const FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function loadTickets() {
    try {
      const url = filter === "all" ? "/api/admin/tickets" : `/api/admin/tickets?status=${filter}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error("Load tickets error:", err);
      toast.error("Failed to load tickets");
      setTickets([]);
    }
  }

  useEffect(() => {
    setTickets(null);
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function updateTicket(id: string, updates: { status?: Status; admin_response?: string }) {
    setSaving(id);
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success("Ticket updated");
      // Dispatch so the sidebar badge refreshes
      window.dispatchEvent(new CustomEvent("support-ticket-updated"));
      loadTickets();
    } catch (err) {
      toast.error((err as Error).message || "Update failed");
    } finally {
      setSaving(null);
    }
  }

  const counts = (tickets || []).reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<Status, number>
  );

  return (
    <div className="flex-1 p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <LifeBuoy className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
            <p className="text-sm text-muted-foreground">Triage and respond to user-submitted support requests.</p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const count = f.value === "all" ? tickets?.length : counts[f.value as Status];
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-2",
                active
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              {f.label}
              {count !== undefined && count > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 text-[9px] font-bold",
                  active ? "bg-primary/20" : "bg-white/[0.06]"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tickets list */}
      {tickets === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : tickets.length === 0 ? (
        <Card className="border-white/[0.06] bg-white/[0.02]">
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tickets in this filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const meta = STATUS_META[t.status] || STATUS_META.open;
            const Icon = meta.icon;
            const isExpanded = expanded === t.id;
            const draft = responseDrafts[t.id] ?? t.admin_response ?? "";
            return (
              <Card key={t.id} className="border-white/[0.06] bg-white/[0.02]">
                <button
                  onClick={() => setExpanded(isExpanded ? null : t.id)}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", t.status === "in_progress" && "animate-spin")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{t.subject}</p>
                      <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 shrink-0", meta.color)}>
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0 text-muted-foreground border-white/10">
                        {CATEGORY_LABELS[t.category] || t.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {t.user_name || t.email.split("@")[0] || "Unknown"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {t.email}
                      </span>
                      <span>· {timeAgo(t.created_at)}</span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 space-y-4">
                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">User message</p>
                      <p className="text-sm whitespace-pre-wrap">{t.message}</p>
                    </div>

                    {/* Status actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status:</span>
                      {(Object.keys(STATUS_META) as Status[]).map((s) => (
                        <button
                          key={s}
                          disabled={saving === t.id || t.status === s}
                          onClick={() => updateTicket(t.id, { status: s })}
                          className={cn(
                            "rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors",
                            t.status === s
                              ? STATUS_META[s].color
                              : "bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                            (saving === t.id || t.status === s) && "opacity-70 cursor-not-allowed"
                          )}
                        >
                          {STATUS_META[s].label}
                        </button>
                      ))}
                    </div>

                    {/* Admin response */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3" />
                        Response to user
                      </p>
                      <Textarea
                        value={draft}
                        onChange={(e) => setResponseDrafts({ ...responseDrafts, [t.id]: e.target.value })}
                        placeholder="Write a response to the user…"
                        rows={4}
                        maxLength={5000}
                      />
                      <div className="flex items-center justify-end mt-2">
                        <Button
                          size="sm"
                          disabled={saving === t.id || draft === (t.admin_response ?? "")}
                          onClick={() => updateTicket(t.id, { admin_response: draft })}
                        >
                          {saving === t.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                          ) : (
                            <Send className="h-3 w-3 mr-1.5" />
                          )}
                          Save Response
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
