"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Link2, Check, Unplug, Bell, Loader2, ArrowRight,
  Server, Clock, ChevronRight, Sparkles, Shield, Info,
  Calendar, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  INTEGRATIONS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getIntegrationsByCategory,
  type Integration,
  type IntegrationCategory,
} from "@/lib/integrations";
import {
  isGoogleConnected, getGoogleAuthUrl, disconnectGoogle,
  storeTokens, getGoogleConnectionInfo,
} from "@/lib/google-calendar";

// ─── Helpers ───────────────────────────────────────────

function categoryColor(cat: IntegrationCategory) {
  switch (cat) {
    case "productivity": return "text-primary";
    case "communication": return "text-emerald-400";
    case "social": return "text-purple-400";
    case "developer": return "text-orange-400";
  }
}

function statusBadge(status: Integration["status"]) {
  switch (status) {
    case "connected":
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0"><Check className="h-2.5 w-2.5 mr-0.5" />Connected</Badge>;
    case "vps_active":
      return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0"><Server className="h-2.5 w-2.5 mr-0.5" />VPS Active</Badge>;
    case "disconnected":
      return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">Not Connected</Badge>;
    case "coming_soon":
      return <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-[10px] px-1.5 py-0">Coming Soon</Badge>;
  }
}

function timeAgoShort(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

// ─── Waitlist Logic ────────────────────────────────────

function getWaitlist(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("harv-integration-waitlist") || "[]"); } catch { return []; }
}
function toggleWaitlist(id: string): boolean {
  const list = getWaitlist();
  const idx = list.indexOf(id);
  if (idx >= 0) { list.splice(idx, 1); } else { list.push(id); }
  localStorage.setItem("harv-integration-waitlist", JSON.stringify(list));
  return idx < 0;
}

// ─── Page ──────────────────────────────────────────────

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[]>(INTEGRATIONS);
  const [waitlist, setWaitlist] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [setupDialog, setSetupDialog] = useState<Integration | null>(null);
  const [successDialog, setSuccessDialog] = useState<Integration | null>(null);
  const [googleInfo, setGoogleInfo] = useState<{ connectedAt: string | null; scopes: string[] }>({ connectedAt: null, scopes: [] });
  // Link code flow state
  const [linkDialog, setLinkDialog] = useState<{ integration: Integration; code: string; expiresAt: number } | null>(null);
  const [linkPolling, setLinkPolling] = useState(false);
  const [, setTick] = useState(0); // force re-render for countdown

  // Hydrate statuses + handle OAuth callback
  useEffect(() => {
    setWaitlist(getWaitlist());

    // Handle Google OAuth callback tokens
    const tokensParam = searchParams.get("tokens");
    if (tokensParam) {
      try {
        const tokens = JSON.parse(decodeURIComponent(tokensParam));
        storeTokens(tokens);
        setIntegrations((prev) =>
          prev.map((i) => i.id === "google" ? { ...i, status: "connected" } : i)
        );
        setGoogleInfo(getGoogleConnectionInfo());
        // Show success dialog
        const google = INTEGRATIONS.find((i) => i.id === "google");
        if (google) setSuccessDialog(google);
        // Clean URL
        window.history.replaceState({}, "", "/integrations");
      } catch {
        toast.error("Failed to complete Google connection");
      }
      return;
    }

    // Normal load — check Google connection
    const googleConnected = isGoogleConnected();
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === "google"
          ? { ...i, status: googleConnected ? "connected" : "disconnected" }
          : i
      )
    );
    if (googleConnected) {
      setGoogleInfo(getGoogleConnectionInfo());
    }

    // Fetch real integration statuses from Supabase
    fetch("/api/integrations/status")
      .then((r) => r.json())
      .then((data) => {
        const linked = data.integrations || [];
        setIntegrations((prev) =>
          prev.map((i) => {
            const match = linked.find((l: { provider: string; status: string }) => l.provider === i.id);
            if (match && match.status === "active") {
              return { ...i, status: "connected" as const, connectedAt: match.connected_at };
            }
            return i;
          })
        );
      })
      .catch(() => {});
  }, [searchParams]);

  const handleConnect = useCallback((integration: Integration) => {
    // If the integration has a setup guide, show it first
    if (integration.setupGuide) {
      setSetupDialog(integration);
      return;
    }
    // Otherwise, toggle waitlist (coming soon)
    const joined = toggleWaitlist(integration.id);
    setWaitlist(getWaitlist());
    toast.success(joined
      ? `You'll be notified when ${integration.name} is available`
      : `Removed from ${integration.name} waitlist`
    );
  }, []);

  const handleConfirmConnect = useCallback(async (integration: Integration) => {
    setSetupDialog(null);

    if (integration.id === "google") {
      setConnecting("google");
      try {
        window.location.href = getGoogleAuthUrl("from_integrations");
      } catch {
        toast.error("Failed to start Google auth");
        setConnecting(null);
      }
      return;
    }

    // Telegram / WhatsApp / Discord — generate link code
    if (integration.id === "telegram" || integration.id === "whatsapp" || integration.id === "discord") {
      setConnecting(integration.id);
      try {
        const res = await fetch("/api/integrations/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: integration.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate code");
        setLinkDialog({
          integration,
          code: data.code,
          expiresAt: Date.now() + data.expires_in * 1000,
        });
        setLinkPolling(true);
      } catch (err) {
        toast.error(String(err));
      } finally {
        setConnecting(null);
      }
    }
  }, []);

  // Countdown timer for link dialog
  useEffect(() => {
    if (!linkDialog) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [linkDialog]);

  // Poll for link code verification
  useEffect(() => {
    if (!linkPolling || !linkDialog) return;
    const interval = setInterval(async () => {
      // Check if expired
      if (Date.now() > linkDialog.expiresAt) {
        setLinkPolling(false);
        toast.error("Link code expired. Generate a new one.");
        setLinkDialog(null);
        return;
      }
      try {
        const res = await fetch(`/api/integrations/status?provider=${linkDialog.integration.id}`);
        const data = await res.json();
        const match = (data.integrations || []).find((i: { status: string }) => i.status === "active");
        if (match) {
          setLinkPolling(false);
          setLinkDialog(null);
          setIntegrations((prev) =>
            prev.map((i) =>
              i.id === linkDialog.integration.id
                ? { ...i, status: "connected", connectedAt: match.connected_at }
                : i
            )
          );
          setSuccessDialog(linkDialog.integration);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [linkPolling, linkDialog]);

  const handleDisconnect = useCallback(async (integration: Integration) => {
    if (integration.id === "google") {
      disconnectGoogle();
      setIntegrations((prev) =>
        prev.map((i) => i.id === "google" ? { ...i, status: "disconnected" } : i)
      );
      setGoogleInfo({ connectedAt: null, scopes: [] });
      toast.success("Google disconnected");
      return;
    }
    // Telegram / WhatsApp — unlink via API
    try {
      const res = await fetch("/api/integrations/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: integration.id }),
      });
      if (res.ok) {
        setIntegrations((prev) =>
          prev.map((i) => i.id === integration.id ? { ...i, status: "disconnected" } : i)
        );
        toast.success(`${integration.name} disconnected`);
      }
    } catch {
      toast.error("Failed to disconnect");
    }
  }, []);

  const connected = integrations.filter((i) => i.status === "connected" || i.status === "vps_active");
  const available = integrations.filter((i) => i.status !== "connected" && i.status !== "vps_active");
  const grouped = getIntegrationsByCategory(available);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your favorite services to Harv
        </p>
      </div>

      {/* ── Connected Services ── */}
      {connected.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15">
              <Check className="h-3 w-3 text-emerald-400" />
            </div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active ({connected.length})
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {connected.map((integration) => {
              const Icon = integration.icon;
              const isVps = integration.status === "vps_active";
              const isGoogle = integration.id === "google";
              const ringClass = isVps ? "ring-blue-500/20 hover:ring-blue-500/30" : "ring-emerald-500/20 hover:ring-emerald-500/30";
              const iconBg = isVps ? "bg-blue-500/10 ring-1 ring-blue-500/20" : "bg-emerald-500/10 ring-1 ring-emerald-500/20";
              const iconColor = isVps ? "text-blue-400" : "text-emerald-400";

              return (
                <Card key={integration.id} className={cn("group bg-card/50 backdrop-blur-xl ring-1 transition-all duration-200", ringClass)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
                        <Icon className={cn("h-5 w-5", iconColor)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{integration.name}</p>
                          {statusBadge(integration.status)}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{integration.description}</p>
                      </div>
                    </div>

                    {/* Connection details */}
                    {isGoogle && googleInfo.connectedAt && (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {googleInfo.scopes.map((s) => (
                            <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-emerald-400/70 border-emerald-500/20">
                              {s}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                          <Clock className="h-2.5 w-2.5" />
                          Connected {timeAgoShort(googleInfo.connectedAt)}
                        </div>
                      </div>
                    )}

                    {/* VPS setup info */}
                    {isVps && integration.setupGuide && (
                      <button
                        onClick={() => setSetupDialog(integration)}
                        className="mt-3 flex items-center gap-1.5 text-[10px] text-blue-400/70 hover:text-blue-400 transition-colors"
                      >
                        <Info className="h-2.5 w-2.5" />
                        View setup instructions
                      </button>
                    )}

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                      {integration.hasAuth && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => handleDisconnect(integration)}
                        >
                          <Unplug className="h-3 w-3 mr-1" />
                          Disconnect
                        </Button>
                      )}
                      {isVps && (
                        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0 ml-auto">
                          <Server className="h-2.5 w-2.5 mr-0.5" />Configured on VPS
                        </Badge>
                      )}
                      {!isVps && (
                        <Badge className="ml-auto bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                          <Check className="h-2.5 w-2.5 mr-0.5" />Active
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Available Integrations by Category ── */}
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;

        return (
          <section key={cat}>
            <div className="flex items-center gap-2 mb-4">
              <h2 className={cn("text-xs font-semibold uppercase tracking-wider", categoryColor(cat))}>
                {CATEGORY_LABELS[cat]}
              </h2>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground border-white/[0.08]">
                {items.length}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((integration) => {
                const Icon = integration.icon;
                const onWaitlist = waitlist.includes(integration.id);
                const isConnecting = connecting === integration.id;

                return (
                  <Card key={integration.id} className="group bg-card/50 backdrop-blur-xl ring-1 ring-white/[0.08] hover:ring-primary/15 transition-all duration-200">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] group-hover:bg-primary/5 group-hover:ring-primary/15 transition-all duration-200">
                          <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{integration.name}</p>
                            {statusBadge(integration.status)}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{integration.description}</p>
                          {integration.eta && (
                            <p className="text-[10px] text-muted-foreground/50 mt-1">Expected: {integration.eta}</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-white/[0.06]">
                        {integration.status === "disconnected" && integration.hasAuth ? (
                          <Button
                            size="sm"
                            className="h-7 text-[11px] w-full"
                            onClick={() => handleConnect(integration)}
                            disabled={isConnecting}
                          >
                            {isConnecting ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Connecting...</>
                            ) : (
                              <><Link2 className="h-3 w-3 mr-1" />Connect {integration.name}</>
                            )}
                          </Button>
                        ) : integration.status === "coming_soon" ? (
                          <div className="flex gap-2">
                            <Button
                              variant={onWaitlist ? "outline" : "ghost"}
                              size="sm"
                              className={cn(
                                "h-7 text-[11px] flex-1",
                                onWaitlist
                                  ? "border-primary/30 text-primary bg-primary/5"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                              onClick={() => {
                                const joined = toggleWaitlist(integration.id);
                                setWaitlist(getWaitlist());
                                toast.success(joined
                                  ? `You'll be notified when ${integration.name} is available`
                                  : `Removed from ${integration.name} waitlist`
                                );
                              }}
                            >
                              <Bell className={cn("h-3 w-3 mr-1", onWaitlist && "fill-current")} />
                              {onWaitlist ? "On Waitlist" : "Notify Me"}
                            </Button>
                            {integration.setupGuide && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[11px] text-muted-foreground"
                                onClick={() => setSetupDialog(integration)}
                              >
                                <Info className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground/50 pt-4">
        {connected.length} active &middot; {available.length} available &middot; More integrations coming soon
      </div>

      {/* ── Setup Guide Dialog ── */}
      <Dialog open={!!setupDialog} onOpenChange={() => setSetupDialog(null)}>
        <DialogContent className="max-w-md">
          {setupDialog && (() => {
            const Icon = setupDialog.icon;
            const guide = setupDialog.setupGuide;
            const isVps = setupDialog.status === "vps_active";
            const canConnect = setupDialog.hasAuth && setupDialog.status === "disconnected";
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl ring-1",
                      isVps ? "bg-blue-500/10 ring-blue-500/20" : "bg-primary/10 ring-primary/20"
                    )}>
                      <Icon className={cn("h-5.5 w-5.5", isVps ? "text-blue-400" : "text-primary")} />
                    </div>
                    <div>
                      <DialogTitle className="text-base">{setupDialog.name}</DialogTitle>
                      <p className="text-xs text-muted-foreground">{setupDialog.description}</p>
                    </div>
                  </div>
                </DialogHeader>

                {guide && (
                  <div className="space-y-5 mt-2">
                    {/* What you get */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary" />
                        What you get
                      </h4>
                      <ul className="space-y-1.5">
                        {guide.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Permissions */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-amber-400" />
                        Permissions required
                      </h4>
                      <ul className="space-y-1">
                        {guide.permissions.map((p) => (
                          <li key={p} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-amber-400/50 shrink-0" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Steps */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <ArrowRight className="h-3 w-3 text-primary" />
                        {isVps ? "Setup steps" : "What happens next"}
                      </h4>
                      <ol className="space-y-1.5">
                        {guide.steps.map((s, i) => (
                          <li key={s} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                            <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/[0.1] text-[10px] font-bold text-foreground mt-0.5">
                              {i + 1}
                            </span>
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Action */}
                    {canConnect && (
                      <Button
                        className="w-full"
                        onClick={() => handleConfirmConnect(setupDialog)}
                      >
                        <Link2 className="h-4 w-4 mr-2" />
                        Continue to {setupDialog.name}
                      </Button>
                    )}
                    {!canConnect && !isVps && (
                      <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] p-3 text-center text-xs text-muted-foreground">
                        This integration isn&apos;t available yet. Join the waitlist to get notified.
                      </div>
                    )}
                    {isVps && (
                      <div className="rounded-lg bg-blue-500/5 ring-1 ring-blue-500/15 p-3 text-center text-xs text-blue-400/80">
                        <Server className="h-3.5 w-3.5 mx-auto mb-1" />
                        This integration is configured on your Harv VPS server
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Link Code Dialog ── */}
      <Dialog open={!!linkDialog} onOpenChange={() => { setLinkDialog(null); setLinkPolling(false); }}>
        <DialogContent className="max-w-sm">
          {linkDialog && (() => {
            const Icon = linkDialog.integration.icon;
            const provider = linkDialog.integration.id;
            const remaining = Math.max(0, Math.ceil((linkDialog.expiresAt - Date.now()) / 1000));
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            const instructions = {
              telegram: { where: "Send this to @HarvAI_bot on Telegram:", how: "Open Telegram, find @HarvAI_bot, and send the command above." },
              discord: { where: "Use this slash command in the Harv AI Discord server:", how: "Open Discord, go to any channel in the Harv AI server, and type the command above." },
              whatsapp: { where: "Send this to Harv on WhatsApp:", how: "Open WhatsApp and send the command above to the Harv number." },
            };
            const inst = instructions[provider as keyof typeof instructions] || instructions.telegram;
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <DialogTitle className="text-base">Link {linkDialog.integration.name}</DialogTitle>
                      <p className="text-xs text-muted-foreground">Send this code to verify your account</p>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4 mt-3">
                  {/* The code */}
                  <div className="flex items-center justify-center">
                    <div className="font-mono text-4xl font-bold tracking-[0.3em] text-primary bg-primary/5 rounded-xl px-6 py-4 ring-1 ring-primary/20">
                      {linkDialog.code}
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4 space-y-2">
                    <p className="text-sm font-medium">{inst.where}</p>
                    <div className="font-mono text-sm bg-white/[0.04] rounded-lg px-3 py-2 text-primary">
                      /link {linkDialog.code}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{inst.how}</p>
                  </div>

                  {/* Polling status */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      Waiting for verification...
                    </div>
                    <span className="font-mono">
                      {minutes}:{String(seconds).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Success Dialog ── */}
      <Dialog open={!!successDialog} onOpenChange={() => setSuccessDialog(null)}>
        <DialogContent className="max-w-sm text-center">
          {successDialog && (() => {
            const Icon = successDialog.icon;
            return (
              <>
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
                    <CheckCircle className="h-8 w-8 text-emerald-400" />
                  </div>
                  <DialogTitle className="text-lg">{successDialog.name} Connected!</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Your {successDialog.name} account is now linked to Harv.
                  </p>

                  {successDialog.setupGuide && (
                    <div className="w-full rounded-xl bg-emerald-500/5 ring-1 ring-emerald-500/15 p-3 mt-2">
                      <p className="text-[11px] font-semibold text-emerald-400 mb-1.5">What&apos;s unlocked:</p>
                      <ul className="space-y-1 text-left">
                        {successDialog.setupGuide.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 w-full">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => setSuccessDialog(null)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
