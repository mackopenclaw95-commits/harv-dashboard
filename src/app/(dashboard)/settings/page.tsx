"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Server, Key, CheckCircle, XCircle,
  ExternalLink, Cpu, RefreshCw, User, Moon, Sun, Palette,
  Link2, CreditCard, Shield, Copy, RotateCcw, LogOut, Trash2,
  MessageSquare, Code, Globe, ChevronDown, Camera,
  Volume2, VolumeX, Clock, Activity, Heart, Wrench,
  Zap, Check,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "next-themes";
import { isGoogleConnected, getGoogleAuthUrl, disconnectGoogle } from "@/lib/google-calendar";
import { useTour } from "@/components/tour/use-tour";
import { cn } from "@/lib/utils";
import {
  getNotificationSounds, setNotificationSounds as saveNotifSounds,
  getTimezone, setTimezone as saveTimezone,
  resolveTimezone, TIMEZONE_OPTIONS,
} from "@/lib/preferences";
import { TIER_LIMITS, FREE_PLAN_AGENTS, type TierKey } from "@/lib/plan-config";

// ─── Types & Constants ──────────────────────────────────

interface HealthStatus { status: string; uptime?: string }
interface ServiceInfo { name: string; status: "active" | "needs auth" | "checking" | "unknown" }

const DEFAULT_SERVICES: ServiceInfo[] = [
  { name: "OpenRouter", status: "active" },
  { name: "OpenAI", status: "active" },
  { name: "DeepSeek", status: "active" },
  { name: "Google OAuth", status: "active" },
  { name: "Telegram Bot", status: "active" },
  { name: "GitHub CLI", status: "needs auth" },
];

const PRIMARY_INTEGRATIONS = [
  { name: "Google", icon: Globe, description: "Calendar, Gmail, Drive", hasAuth: true },
  { name: "GitHub", icon: Code, description: "Repos, issues, PRs", hasAuth: false },
];

const MORE_INTEGRATIONS = [
  { name: "Telegram", icon: MessageSquare, description: "Bot notifications & chat commands" },
  { name: "Discord", icon: MessageSquare, description: "Server bots & webhook notifications" },
  { name: "Slack", icon: MessageSquare, description: "Workspace messaging & alerts" },
  { name: "Twitter/X", icon: Globe, description: "Automated posting & analytics" },
  { name: "WhatsApp", icon: MessageSquare, description: "Message forwarding & commands" },
];

const PLANS = [
  {
    id: "free", name: "Free", price: "$0", period: "forever", highlight: false,
    features: ["7 core agents", "25 messages/day (Gemini Flash Lite)", "Standard model after daily limit", "5 projects"],
    limits: { agents: 7, messages: 25, models: "Basic" },
  },
  {
    id: "pro", name: "Pro", price: "$20", period: "/month", highlight: true,
    features: ["All agents unlocked", "150 messages/day (DeepSeek V3.2)", "Unlimited standard messages", "Image generation (10/day)", "Unlimited projects", "Priority support"],
    limits: { agents: -1, messages: 150, models: "Premium" },
  },
  {
    id: "max", name: "Max", price: "$50", period: "/month", highlight: false,
    features: ["400 messages/day (GPT-4.1)", "Unlimited DeepSeek V3.2 after limit", "All agents + Image gen (30/day)", "Employee Harvs", "Custom integrations", "Admin dashboard"],
    limits: { agents: -1, messages: 400, models: "All" },
  },
];

const KACHOW_CODES = ["kachow", "speed", "ka-chow"];

// ─── Main Component ─────────────────────────────────────

export default function SettingsPageWrapper() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}

function SettingsPage() {
  const { user, profile, signOut, signInWithGoogle, refreshProfile } = useAuth();
  const { resetTour } = useTour();
  const { theme, setTheme } = useTheme();
  const searchParams = useSearchParams();

  const TAB_MAP: Record<string, number> = { general: 0, integrations: 1, "api-keys": 2, billing: 3, usage: 4, account: 5, system: 6 };
  const defaultTab = TAB_MAP[searchParams.get("tab") || ""] ?? 0;

  // Core state
  const [apiUrl] = useState(process.env.NEXT_PUBLIC_API_URL || "");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>(DEFAULT_SERVICES);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [harvApiKey, setHarvApiKey] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState(profile?.plan || "free");
  const [notifSounds, setNotifSounds] = useState(true);
  const [timezone, setTimezoneState] = useState("auto");
  const [currentTime, setCurrentTime] = useState("");

  // Usage data from /api/usage/check
  const [usageData, setUsageData] = useState<{
    used: number; limit: number; remaining: number;
    weekly_used: number; weekly_limit: number;
    image_remaining: number; degraded: boolean;
    model_tier: string;
  } | null>(null);

  // Kachow Easter egg
  const [personality, setPersonality] = useState("default");
  const [personalityLoading, setPersonalityLoading] = useState(true);
  const [kachowInput, setKachowInput] = useState("");
  const [kachowBuffer, setKachowBuffer] = useState("");

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (profile?.plan) setCurrentPlan(profile.plan); }, [profile?.plan]);

  // ─── Data loading ─────────────────────────────────────

  useEffect(() => {
    checkHealth();
    loadAgentCount();
    loadServices();
    loadPersonality();
    loadUsageData();
    setGoogleConnected(isGoogleConnected());
    setHarvApiKey(localStorage.getItem("harv-api-key"));
    setCurrentPlan(profile?.plan || "free");
    setNotifSounds(getNotificationSounds());
    setTimezoneState(getTimezone());
  }, []);

  useEffect(() => {
    function updateTime() {
      const tz = resolveTimezone(timezone);
      setCurrentTime(new Date().toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  // Konami-style kachow detection (type "kachow" anywhere on page)
  const handleKachowKeypress = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const next = kachowBuffer + e.key.toLowerCase();
    setKachowBuffer(next);
    for (const code of KACHOW_CODES) {
      if (next.endsWith(code)) {
        togglePersonality();
        setKachowBuffer("");
        return;
      }
    }
    if (next.length > 20) setKachowBuffer(next.slice(-10));
  }, [kachowBuffer]);

  useEffect(() => {
    window.addEventListener("keypress", handleKachowKeypress);
    return () => window.removeEventListener("keypress", handleKachowKeypress);
  }, [handleKachowKeypress]);

  // ─── API functions ────────────────────────────────────

  async function checkHealth() {
    setChecking(true);
    try {
      const res = await fetch("/api/proxy?path=/api/health/quick");
      setHealth(await res.json());
    } catch {
      setHealth({ status: "unreachable" });
    } finally {
      setChecking(false);
    }
  }

  async function loadAgentCount() {
    try {
      const res = await fetch("/api/proxy?path=/api/agents/list");
      if (res.ok) { const d = await res.json(); setAgentCount((d.agents || []).length); }
    } catch { /* keep null */ }
  }

  async function loadUsageData() {
    try {
      const res = await fetch("/api/usage/check");
      if (res.ok) { const d = await res.json(); setUsageData(d); }
    } catch { /* keep null */ }
  }

  async function loadPersonality() {
    setPersonalityLoading(true);
    try {
      const res = await fetch("/api/personality");
      if (res.ok) { const d = await res.json(); setPersonality(d.personality || "default"); }
    } catch { /* default */ }
    finally { setPersonalityLoading(false); }
  }

  async function togglePersonality() {
    const next = personality === "cars1" ? "default" : "cars1";
    try {
      const res = await fetch("/api/personality", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personality: next }),
      });
      if (res.ok) {
        setPersonality(next);
        // Toggle the kachow CSS class and notify other components
        if (next === "cars1") {
          document.documentElement.classList.add("kachow");
          toast.success("Ka-chow! Speed, I am speed. 🏎️");
        } else {
          document.documentElement.classList.remove("kachow");
          toast.success("Back to standard mode");
        }
        window.dispatchEvent(new CustomEvent("personality-change", { detail: next }));
      }
    } catch { toast.error("Could not reach Harv API"); }
  }

  async function loadServices() {
    setServicesLoading(true);
    try {
      const res = await fetch("/api/proxy?path=/api/health/services");
      if (res.ok) {
        const d = await res.json();
        if (d.services && typeof d.services === "object") {
          setServices(Object.entries(d.services).map(([name, status]) => ({ name, status: status as ServiceInfo["status"] })));
          setServicesLoading(false); return;
        }
      }
    } catch { /* fallback */ }
    setServices(DEFAULT_SERVICES);
    setServicesLoading(false);
  }

  function generateApiKey() {
    const key = `harv_sk_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
    localStorage.setItem("harv-api-key", key);
    setHarvApiKey(key);
    toast.success("API key generated");
  }

  function handleKachowSubmit() {
    const val = kachowInput.trim().toLowerCase();
    if (KACHOW_CODES.includes(val)) {
      togglePersonality();
      setKachowInput("");
    } else if (val) {
      toast.error("Invalid code");
      setKachowInput("");
    }
  }

  const isOk = health?.status === "ok" || health?.status === "healthy";

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="flex-1 p-6 md:p-8 max-w-5xl mx-auto">
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your preferences, integrations, and account</p>
      </header>

      <Tabs defaultValue={defaultTab} orientation="vertical" className="gap-6">
        {/* Tab list */}
        <TabsList data-tour="settings-tabs" variant="line" className="md:w-48 shrink-0 gap-1">
          {[
            { icon: Palette, label: "General" },
            { icon: Link2, label: "Integrations" },
            { icon: Key, label: "API Keys" },
            { icon: CreditCard, label: "Billing" },
            { icon: Activity, label: "Usage" },
            { icon: User, label: "Account" },
            { icon: Server, label: "System" },
          ].map((tab, i) => (
            <TabsTrigger key={i} value={i} className="justify-start gap-2 px-3 py-2 text-sm">
              <tab.icon className="h-4 w-4" />
              <span className="hidden md:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Tab 0: General ── */}
        <TabsContent value={0} className="space-y-6">
          {/* Appearance */}
          <Card data-tour="settings-theme">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Moon className="h-4 w-4 text-indigo-400" />
                Appearance
              </CardTitle>
              <CardDescription>Choose your display theme</CardDescription>
            </CardHeader>
            <CardContent>
              {mounted ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ring-1",
                      theme === "dark" ? "bg-primary/10 text-primary ring-primary/20" : "bg-white/[0.03] text-muted-foreground ring-white/[0.06] hover:bg-white/[0.06]"
                    )}
                  >
                    <Moon className="h-4 w-4" /> Dark
                  </button>
                  <button
                    onClick={() => setTheme("light")}
                    className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ring-1",
                      theme === "light" ? "bg-primary/10 text-primary ring-primary/20" : "bg-white/[0.03] text-muted-foreground ring-white/[0.06] hover:bg-white/[0.06]"
                    )}
                  >
                    <Sun className="h-4 w-4" /> Light
                    <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30">Beta</Badge>
                  </button>
                </div>
              ) : <Skeleton className="h-10 w-48" />}
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                {notifSounds ? <Volume2 className="h-4 w-4 text-sky-400" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
                Notification Sounds
              </CardTitle>
              <CardDescription>Play sounds for new messages and alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-sm">{notifSounds ? "Sounds enabled" : "Sounds muted"}</p>
                <button
                  onClick={() => { const next = !notifSounds; setNotifSounds(next); saveNotifSounds(next); toast.success(next ? "Sounds on" : "Sounds muted"); }}
                  className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                    notifSounds ? "bg-primary" : "bg-white/[0.15]"
                  )}
                >
                  <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200",
                    notifSounds ? "translate-x-5.5 mt-0.5 ml-0.5" : "translate-x-0.5 mt-0.5"
                  )} />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Timezone */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-amber-400" />
                Timezone
              </CardTitle>
              <CardDescription>Set your local timezone for scheduling and timestamps</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                value={timezone}
                onChange={(e) => { setTimezoneState(e.target.value); saveTimezone(e.target.value); toast.success("Timezone updated"); }}
                className="w-full rounded-lg bg-card/50 ring-1 ring-white/[0.08] border-0 px-3 py-2.5 text-sm text-foreground focus:ring-primary/30 focus:outline-none"
              >
                {TIMEZONE_OPTIONS.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Current time: <span className="font-mono text-foreground">{currentTime}</span></p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 1: Integrations ── */}
        <TabsContent value={1} className="space-y-8">
          <div>
            <h3 className="text-sm font-semibold mb-4">Connected Services</h3>
            <div data-tour="settings-integrations" className="grid gap-4 sm:grid-cols-2">
              {PRIMARY_INTEGRATIONS.map((integ) => {
                const isGoogle = integ.name === "Google";
                const connected = isGoogle ? googleConnected : false;
                return (
                  <Card key={integ.name}>
                    <CardContent className="pt-5 pb-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08]">
                            <integ.icon className="h-4.5 w-4.5 text-foreground/70" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{integ.name}</p>
                            <p className="text-xs text-muted-foreground">{integ.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[10px]", connected ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground")}>
                            {connected ? "Connected" : "Not connected"}
                          </Badge>
                          {isGoogle ? (
                            connected ? (
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { disconnectGoogle(); setGoogleConnected(false); toast.success("Google disconnected"); }}>
                                Disconnect
                              </Button>
                            ) : (
                              <Button size="sm" className="text-xs h-7" onClick={() => { window.location.href = getGoogleAuthUrl(); }}>
                                Connect
                              </Button>
                            )
                          ) : (
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => toast.info(`${integ.name} integration coming soon`)}>
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-4">Available Integrations</h3>
            <div className="space-y-2">
              {MORE_INTEGRATIONS.map((integ) => (
                <div key={integ.name} className="flex items-center justify-between rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <integ.icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{integ.name}</p>
                      <p className="text-xs text-muted-foreground">{integ.description}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => toast.info(`${integ.name} — coming soon`)}>
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 2: API Keys ── */}
        <TabsContent value={2} className="space-y-6">
          {/* Your API Key */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Key className="h-4 w-4 text-primary" />
                Your API Key
              </CardTitle>
              <CardDescription>Use this key to connect Harv to external apps and services</CardDescription>
            </CardHeader>
            <CardContent>
              {!harvApiKey ? (
                <Button onClick={generateApiKey} className="gap-2">
                  <Key className="h-4 w-4" /> Generate API Key
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Input readOnly value={`${harvApiKey.slice(0, 12)}${"•".repeat(16)}${harvApiKey.slice(-4)}`} className="font-mono text-sm" />
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(harvApiKey); toast.success("Copied to clipboard"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={generateApiKey}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Backend Service Keys */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Shield className="h-4 w-4 text-amber-400" />
                Backend Service Keys
              </CardTitle>
              <CardDescription>Status of API keys configured on your backend</CardDescription>
            </CardHeader>
            <CardContent>
              {servicesLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              ) : (
                <div className="space-y-2">
                  {services.map((svc) => (
                    <div key={svc.name} className="flex items-center justify-between py-1.5">
                      <span className="text-sm">{svc.name}</span>
                      <Badge variant="outline" className={cn("text-[10px]",
                        svc.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : svc.status === "needs auth" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        : "bg-muted text-muted-foreground"
                      )}>
                        {svc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        {/* ── Tab 3: Billing ── */}
        <TabsContent value={3} className="space-y-6">
          {/* Current Plan */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Current Plan</p>
                  <p className="text-xs text-muted-foreground">
                    You&apos;re on the <span className="text-primary font-medium">{PLANS.find(p => p.id === currentPlan)?.name || "Free"}</span> plan
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {profile?.role === "tester" && (
                    <Badge className="bg-orange-400/15 text-orange-400 border-orange-400/30 text-[9px]">Test Mode</Badge>
                  )}
                  <Badge className="bg-primary/15 text-primary border-primary/30">{PLANS.find(p => p.id === currentPlan)?.name || "Free"}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Plan Cards */}
          <div data-tour="settings-plans" className="grid gap-4 sm:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan;
              return (
                <Card key={plan.id} className={cn(plan.highlight && !isCurrent && "ring-primary/30")}>
                  <CardContent className="pt-5 pb-5 space-y-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold">{plan.name}</h3>
                        {plan.highlight && <Badge className="text-[9px] bg-primary/15 text-primary border-primary/30">Popular</Badge>}
                      </div>
                      <div className="mt-1">
                        <span className="text-2xl font-bold">{plan.price}</span>
                        <span className="text-xs text-muted-foreground">{plan.period}</span>
                      </div>
                    </div>
                    <ul className="space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Check className="h-3 w-3 text-primary shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full text-xs"
                      variant={isCurrent ? "outline" : "default"}
                      disabled={isCurrent}
                      onClick={async () => {
                        if (isCurrent || !user) return;

                        // Testers can switch plans instantly
                        if (profile?.role === "tester") {
                          try {
                            const res = await fetch("/api/billing/test-switch", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ plan: plan.id }),
                            });
                            const data = await res.json();
                            if (data.success) {
                              setCurrentPlan(plan.id);
                              toast.success(`Switched to ${plan.name} (test mode)`);
                              refreshProfile();
                            } else {
                              toast.error(data.error || "Switch failed");
                            }
                          } catch {
                            toast.error("Failed to switch plan");
                          }
                          return;
                        }

                        // Regular users go through Stripe
                        if (plan.id === "free") return;
                        try {
                          const res = await fetch("/api/billing/checkout", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ plan: plan.id, userId: user.id }),
                          });
                          const data = await res.json();
                          if (data.url) {
                            window.location.href = data.url;
                          } else {
                            toast.error(data.error || "Checkout failed");
                          }
                        } catch {
                          toast.error("Failed to start checkout");
                        }
                      }}
                    >
                      {isCurrent ? "Current Plan" : profile?.role === "tester" ? `Switch to ${plan.name}` : "Upgrade"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Manage Subscription */}
          {currentPlan !== "free" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Manage Subscription</CardTitle>
                <CardDescription>Update payment method, view invoices, or cancel your plan</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Button
                  variant="outline"
                  className="gap-2 text-xs"
                  onClick={async () => {
                    if (!user) return;
                    try {
                      const res = await fetch("/api/billing/portal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: user.id }),
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.open(data.url, "_blank");
                      } else {
                        toast.error(data.error || "Could not open billing portal");
                      }
                    } catch {
                      toast.error("Failed to open billing portal");
                    }
                  }}
                >
                  <CreditCard className="h-4 w-4" /> Billing Portal
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 4: Usage ── */}
        <TabsContent value={4} className="space-y-6">
          {(() => {
            const tier = TIER_LIMITS[(currentPlan as TierKey) || "free"] || TIER_LIMITS.free;
            const dailyUsed = usageData?.used ?? 0;
            const dailyLimit = tier.primaryMessagesPerDay;
            const weeklyUsed = usageData?.weekly_used ?? 0;
            const weeklyLimit = tier.weeklyBackstop;
            const imageRemaining = usageData?.image_remaining ?? tier.imagesPerDay;
            const imagesUsed = tier.imagesPerDay - imageRemaining;
            const availableAgents = currentPlan === "free" ? FREE_PLAN_AGENTS.size : (agentCount || 0);
            const agentLimit = currentPlan === "free" ? FREE_PLAN_AGENTS.size : -1;
            const modelTier = usageData?.model_tier || "primary";
            const modelName = modelTier === "fallback" ? tier.fallbackModel : tier.primaryModel;

            return (
              <>
                {/* Current Plan Summary */}
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">Current Plan</p>
                        <p className="text-xs text-muted-foreground">
                          You&apos;re on the <span className="text-primary font-medium">{PLANS.find(p => p.id === currentPlan)?.name || "Free"}</span> plan
                        </p>
                      </div>
                      <Badge className="bg-primary/15 text-primary border-primary/30">{PLANS.find(p => p.id === currentPlan)?.name || "Free"}</Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Usage Meters */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Activity className="h-4 w-4 text-purple-400" />
                      Usage This Period
                    </CardTitle>
                    <CardDescription>Track your consumption against plan limits</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Messages today */}
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Messages today</span>
                        <span className="text-foreground font-medium">{dailyUsed} / {dailyLimit}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/[0.06]">
                        <div className="h-2.5 rounded-full bg-primary/60 transition-all" style={{ width: `${Math.min((dailyUsed / dailyLimit) * 100, 100)}%` }} />
                      </div>
                    </div>
                    {/* Weekly messages */}
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Messages this week</span>
                        <span className="text-foreground font-medium">{weeklyUsed} / {weeklyLimit}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/[0.06]">
                        <div className="h-2.5 rounded-full bg-primary/60 transition-all" style={{ width: `${Math.min((weeklyUsed / weeklyLimit) * 100, 100)}%` }} />
                      </div>
                    </div>
                    {/* Available agents */}
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Available agents</span>
                        <span className="text-foreground font-medium">{availableAgents} / {agentLimit === -1 ? "Unlimited" : agentLimit}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/[0.06]">
                        <div className="h-2.5 rounded-full bg-primary/60 transition-all" style={{ width: agentLimit === -1 ? "100%" : `${Math.min((availableAgents / agentLimit) * 100, 100)}%` }} />
                      </div>
                    </div>
                    {/* Image generation */}
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Images today</span>
                        <span className="text-foreground font-medium">
                          {tier.imagesPerDay === 0 ? "Not available" : `${imagesUsed} / ${tier.imagesPerDay}`}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/[0.06]">
                        <div className="h-2.5 rounded-full bg-primary/60 transition-all" style={{ width: tier.imagesPerDay === 0 ? "0%" : `${Math.min((imagesUsed / tier.imagesPerDay) * 100, 100)}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Model Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Cpu className="h-4 w-4 text-emerald-400" />
                      Current Model
                    </CardTitle>
                    <CardDescription>AI model used for your messages</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Active model</p>
                        <p className="font-semibold text-lg capitalize">{modelName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <p className="font-semibold text-lg">
                          {usageData?.degraded ? (
                            <span className="text-amber-400">Degraded</span>
                          ) : (
                            <span className="text-emerald-400">Primary</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Subscription</p>
                        <p className="font-medium">{PLANS.find(p => p.id === currentPlan)?.price || "$0"}{currentPlan !== "free" ? "/mo" : ""}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fallback model</p>
                        <p className="font-medium capitalize">{tier.fallbackModel}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        {/* ── Tab 5: Account ── */}
        <TabsContent value={5} className="space-y-6">
          {user ? (
            <>
              {/* Profile */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <User className="h-4 w-4 text-primary" />
                    Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary ring-2 ring-primary/20">
                        {(profile?.name || user?.email || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        onClick={() => toast.info("Profile photo upload coming soon")}
                      >
                        <Camera className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <div className="space-y-2 flex-1">
                      <div>
                        <label className="text-xs text-muted-foreground">Display Name</label>
                        <Input
                          defaultValue={profile?.name || ""}
                          className="text-sm mt-1"
                          onBlur={() => {}}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Email</label>
                        <Input value={user?.email || ""} readOnly className="text-sm mt-1 opacity-60" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Session */}
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Sign Out</p>
                      <p className="text-xs text-muted-foreground">End your current session</p>
                    </div>
                    <Button variant="outline" className="gap-2 text-xs" onClick={() => signOut()}>
                      <LogOut className="h-4 w-4" /> Sign Out
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Redo Tutorial */}
              <Card data-tour="settings-restart-tour">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Dashboard Tour</p>
                      <p className="text-xs text-muted-foreground">
                        Take the guided tour of Harv again
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs"
                      onClick={() => {
                        resetTour();
                        toast.success("Tutorial restarted!");
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restart Tour
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card className="border-red-500/20">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-400">Delete Account</p>
                      <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                    </div>
                    <Button variant="outline" className="gap-2 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => {
                      signOut();
                      localStorage.removeItem("harv-onboarding");
                      localStorage.removeItem("harv-api-key");
                      localStorage.removeItem("harv-plan");
                      toast.success("Account deleted");
                    }}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20">
                  <User className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Sign In</h3>
                  <p className="text-sm text-muted-foreground">Sign in to manage your account and preferences</p>
                </div>
                <Button onClick={() => signInWithGoogle()} className="gap-2">
                  <Globe className="h-4 w-4" /> Sign in with Google
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 6: System ── */}
        <TabsContent value={6} className="space-y-6">
          {/* API Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Server className="h-4 w-4 text-sky-400" />
                API Connection
              </CardTitle>
              <CardDescription>Test your connection to the Harv backend</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="gap-2 text-xs" onClick={checkHealth} disabled={checking}>
                <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} />
                {checking ? "Checking..." : "Test Connection"}
              </Button>
              {health && (
                <div className="flex items-center gap-2 text-sm">
                  {isOk ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                  <span className={isOk ? "text-emerald-400" : "text-red-400"}>
                    {isOk ? "Connected" : health.status}
                  </span>
                  {health.uptime && <span className="text-xs text-muted-foreground ml-2">Uptime: {health.uptime}</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Infrastructure */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Cpu className="h-4 w-4 text-violet-400" />
                Infrastructure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground">Provider</p>
                  <p className="font-medium">{process.env.NEXT_PUBLIC_INFRA_PROVIDER || "Hostinger KVM"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">OS</p>
                  <p className="font-medium">{process.env.NEXT_PUBLIC_INFRA_OS || "Ubuntu 24.04"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">HTTPS</p>
                  <p className="font-medium flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-400" /> Let&apos;s Encrypt</p>
                </div>
                <div>
                  <p className="text-muted-foreground">API Endpoint</p>
                  {apiUrl ? (
                    <a href={apiUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-center gap-1 truncate">
                      {apiUrl.replace("https://", "")} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : <p className="font-medium text-muted-foreground">Not configured</p>}
                </div>
                <div>
                  <p className="text-muted-foreground">Agents</p>
                  <p className="font-medium">{agentCount !== null ? `${agentCount} registered` : <Skeleton className="h-4 w-20 inline-block" />}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Active Model</p>
                  <p className="font-medium">Haiku 4.5</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Background Services */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Shield className="h-4 w-4 text-purple-400" />
                System Services
              </CardTitle>
              <CardDescription>Background agents protecting and maintaining the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "Guardian", icon: Shield, desc: "Health scan every 15 min", schedule: "*/15 * * * *" },
                  { name: "Medic", icon: Wrench, desc: "Auto-repair on demand", schedule: "On demand" },
                  { name: "Heartbeat", icon: Heart, desc: "System pulse every 90 min", schedule: "Every 90 min" },
                ].map((svc) => (
                  <div key={svc.name} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <svc.icon className="h-4 w-4 text-purple-400" />
                      <div>
                        <p className="text-sm font-medium">{svc.name}</p>
                        <p className="text-xs text-muted-foreground">{svc.desc}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      Active
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}
