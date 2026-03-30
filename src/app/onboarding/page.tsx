"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Bot,
  Calendar,
  Mail,
  Music,
  Shield,
  ChevronRight,
  Check,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  saveOnboardingState,
  completeOnboarding,
  type OnboardingState,
} from "@/lib/onboarding";
import { getGoogleAuthUrl, isGoogleConnected } from "@/lib/google-calendar";

const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [personality, setPersonality] = useState<"cars1" | "default">("cars1");
  const [googleDone, setGoogleDone] = useState(() => isGoogleConnected());
  const [spotifyDone] = useState(false);
  const [permissions, setPermissions] = useState({
    emailAutoSend: false,
    emailAutoDelete: false,
    schedulerAutoAdd: true,
  });

  function next() {
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function back() {
    if (step > 1) setStep(step - 1);
  }

  async function handleFinish() {
    // Save personality to backend
    try {
      await fetch("/api/proxy?path=/api/settings/personality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personality }),
      });
    } catch {
      // non-critical
    }

    saveOnboardingState({
      personality,
      googleConnected: googleDone,
      spotifyConnected: spotifyDone,
      permissions,
    });
    completeOnboarding();
    toast.success("Welcome to Harv! Let's get to work.");
    router.push("/");
  }

  function handleConnectGoogle() {
    window.location.href = getGoogleAuthUrl();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="flex items-center gap-1.5 mb-8">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-300",
                i + 1 <= step ? "bg-primary" : "bg-white/[0.08]"
              )}
            />
          ))}
        </div>

        {/* Step 1: Meet Harv */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25 mx-auto mb-4">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">
                Meet Harv
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Your personal AI assistant. Harv manages a team of specialized
                agents that handle everything from scheduling to research.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                Choose Harv&apos;s personality
              </p>

              <button
                onClick={() => setPersonality("cars1")}
                className={cn(
                  "w-full rounded-xl p-4 text-left transition-all duration-200 ring-1",
                  personality === "cars1"
                    ? "bg-red-500/10 ring-red-500/30"
                    : "bg-white/[0.03] ring-white/[0.08] hover:bg-white/[0.05]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    personality === "cars1" ? "bg-red-500/20" : "bg-white/[0.06]"
                  )}>
                    <Zap className={cn("h-5 w-5", personality === "cars1" ? "text-red-400" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Cars 1 Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Lightning McQueen meets J.A.R.V.I.S. — confident, fast,
                      Ka-chow energy. Racing refs when natural.
                    </p>
                  </div>
                  {personality === "cars1" && (
                    <Check className="h-5 w-5 text-red-400 shrink-0" />
                  )}
                </div>
              </button>

              <button
                onClick={() => setPersonality("default")}
                className={cn(
                  "w-full rounded-xl p-4 text-left transition-all duration-200 ring-1",
                  personality === "default"
                    ? "bg-blue-500/10 ring-blue-500/30"
                    : "bg-white/[0.03] ring-white/[0.08] hover:bg-white/[0.05]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    personality === "default" ? "bg-blue-500/20" : "bg-white/[0.06]"
                  )}>
                    <Bot className={cn("h-5 w-5", personality === "default" ? "text-blue-400" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Default Mode</p>
                    <p className="text-xs text-muted-foreground">
                      Sharp, direct, dry humor. No racing refs. Straight to
                      the point.
                    </p>
                  </div>
                  {personality === "default" && (
                    <Check className="h-5 w-5 text-blue-400 shrink-0" />
                  )}
                </div>
              </button>
            </div>

            <Button onClick={next} className="w-full">
              Continue
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 2: Connect Google */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/15 ring-1 ring-blue-500/25 mx-auto mb-4">
                <Calendar className="h-8 w-8 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">
                Connect Google
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Let Harv manage your calendar and email. You can adjust
                permissions anytime in Settings.
              </p>
            </div>

            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-blue-400" />
                    <div>
                      <p className="text-sm font-medium">Google Calendar</p>
                      <p className="text-xs text-muted-foreground">
                        View & manage events
                      </p>
                    </div>
                  </div>
                  {googleDone ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleConnectGoogle}
                    >
                      <Plug className="h-3 w-3 mr-1.5" />
                      Connect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-amber-400" />
                    <div>
                      <p className="text-sm font-medium">Gmail</p>
                      <p className="text-xs text-muted-foreground">
                        Read, send, & organize email
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-muted text-muted-foreground">
                    Coming with Google connect
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={back} className="flex-1">
                Back
              </Button>
              <Button onClick={next} className="flex-1">
                {googleDone ? "Continue" : "Skip for now"}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Connect Spotify */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/15 ring-1 ring-green-500/25 mx-auto mb-4">
                <Music className="h-8 w-8 text-green-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">
                Connect Spotify
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Let Harv&apos;s Music agent control your playback, create
                playlists, and recommend tracks.
              </p>
            </div>

            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Music className="h-5 w-5 text-green-400" />
                    <div>
                      <p className="text-sm font-medium">Spotify</p>
                      <p className="text-xs text-muted-foreground">
                        Playback, playlists, recommendations
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-muted text-muted-foreground">
                    Coming Soon
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={back} className="flex-1">
                Back
              </Button>
              <Button onClick={next} className="flex-1">
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Permissions */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/15 ring-1 ring-purple-500/25 mx-auto mb-4">
                <Shield className="h-8 w-8 text-purple-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">
                Permissions
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Control how much autonomy Harv&apos;s agents have. You can
                change these anytime.
              </p>
            </div>

            <div className="space-y-3">
              <PermissionToggle
                label="Auto-send emails"
                description="Email agent can send without asking. If off, drafts require your approval."
                checked={permissions.emailAutoSend}
                onChange={(v) =>
                  setPermissions({ ...permissions, emailAutoSend: v })
                }
              />
              <PermissionToggle
                label="Auto-delete emails"
                description="Email agent can archive/delete junk without asking."
                checked={permissions.emailAutoDelete}
                onChange={(v) =>
                  setPermissions({ ...permissions, emailAutoDelete: v })
                }
              />
              <PermissionToggle
                label="Auto-add calendar events"
                description="Scheduler agent can add events without confirmation."
                checked={permissions.schedulerAutoAdd}
                onChange={(v) =>
                  setPermissions({ ...permissions, schedulerAutoAdd: v })
                }
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={back} className="flex-1">
                Back
              </Button>
              <Button onClick={next} className="flex-1">
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/25 mx-auto mb-4">
                <Check className="h-8 w-8 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">
                You&apos;re all set
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Harv is ready to roll. Ask him anything — he&apos;ll route it
                to the right agent automatically.
              </p>
            </div>

            {/* Summary */}
            <Card>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Personality</span>
                  <span className="font-medium">
                    {personality === "cars1" ? "Cars 1 Mode" : "Default"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Google</span>
                  <span className="font-medium">
                    {googleDone ? "Connected" : "Skipped"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Spotify</span>
                  <span className="font-medium">Coming Soon</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Email auto-send</span>
                  <span className="font-medium">
                    {permissions.emailAutoSend ? "On" : "Off"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Calendar auto-add
                  </span>
                  <span className="font-medium">
                    {permissions.schedulerAutoAdd ? "On" : "Off"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={back} className="flex-1">
                Back
              </Button>
              <Button onClick={handleFinish} className="flex-1">
                <Zap className="h-4 w-4 mr-1.5" />
                Launch Harv
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Simple toggle component for permissions. */
function PermissionToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full rounded-xl p-4 text-left transition-all duration-200 ring-1",
        checked
          ? "bg-primary/8 ring-primary/25"
          : "bg-white/[0.03] ring-white/[0.08] hover:bg-white/[0.05]"
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div
          className={cn(
            "h-5 w-9 rounded-full transition-colors relative shrink-0 ml-3",
            checked ? "bg-primary" : "bg-white/[0.15]"
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              checked ? "translate-x-4" : "translate-x-0.5"
            )}
          />
        </div>
      </div>
    </button>
  );
}
