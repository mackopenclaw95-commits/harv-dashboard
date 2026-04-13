"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Video,
  Loader2,
  Play,
  FileText,
  Wrench,
  Lightbulb,
  Link,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

export default function DigestPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [url, setUrl] = useState("");
  const [multiUrls, setMultiUrls] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"digest" | "implement" | "multi">("digest");

  async function askDigest(message: string) {
    setLoading(true);
    setResponse("");
    try {
      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, agent: "Video Digest" }),
      });
      const data = await res.json();
      setResponse(data.response || data.text || data.message || JSON.stringify(data));
    } catch {
      toast.error("Failed to get response");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit() {
    if (mode === "multi") {
      if (!multiUrls.trim()) {
        toast.error("Paste at least 2 URLs");
        return;
      }
      askDigest(`synthesize ideas from these videos: ${multiUrls}`);
    } else if (mode === "implement") {
      if (!url.trim()) {
        toast.error("Paste a URL");
        return;
      }
      askDigest(`implement this video: ${url}`);
    } else {
      if (!url.trim()) {
        toast.error("Paste a URL");
        return;
      }
      askDigest(url);
    }
  }

  function detectPlatform(urlStr: string): string {
    if (urlStr.includes("youtube.com") || urlStr.includes("youtu.be")) return "YouTube";
    if (urlStr.includes("tiktok.com")) return "TikTok";
    if (urlStr.includes("twitter.com") || urlStr.includes("x.com")) return "Twitter/X";
    return "Video";
  }

  // Admin gate
  if (authLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="py-8">
              <div className="h-5 w-48 bg-white/[0.06] rounded mb-3" />
              <div className="h-3 w-full bg-white/[0.04] rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card className="py-16">
          <CardContent className="flex flex-col items-center text-center">
            <Video className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Admin Only</h3>
            <p className="text-sm text-muted-foreground">
              Digest dashboard is only available to administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
            <Video className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Digest</h1>
            <p className="text-sm text-muted-foreground">
              YouTube, TikTok, Twitter &middot; Transcribe, digest, and implement
            </p>
          </div>
        </div>
      </header>

      {/* Mode Selector */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "digest" as const, label: "Digest", icon: FileText, desc: "Summarize & break into sections" },
          { id: "implement" as const, label: "Implement", icon: Wrench, desc: "Step-by-step implementation guide" },
          { id: "multi" as const, label: "Multi-Video", icon: Lightbulb, desc: "Synthesize ideas from multiple videos" },
        ].map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              "flex-1 rounded-xl p-3 text-left ring-1 transition-all",
              mode === id
                ? "bg-violet-500/10 ring-violet-500/30 text-violet-400"
                : "ring-white/[0.06] text-muted-foreground hover:bg-white/[0.03] hover:ring-white/[0.1]"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
            <p className="text-[11px] opacity-60">{desc}</p>
          </button>
        ))}
      </div>

      {/* URL Input */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link className="h-4 w-4 text-violet-400" />
            {mode === "multi" ? "Paste Multiple URLs" : "Paste Video URL"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "multi" ? (
            <Textarea
              placeholder={"Paste 2+ video URLs (one per line or space-separated):\nhttps://youtube.com/watch?v=...\nhttps://tiktok.com/@user/video/...\nhttps://x.com/user/status/..."}
              value={multiUrls}
              onChange={e => setMultiUrls(e.target.value)}
              className="min-h-[100px] resize-none font-mono text-xs"
            />
          ) : (
            <Input
              placeholder="https://youtube.com/watch?v=... or tiktok.com/... or x.com/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && handleSubmit()}
            />
          )}

          {url && mode !== "multi" && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[10px]">
                {detectPlatform(url)}
              </Badge>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Open original
              </a>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={loading || (mode === "multi" ? !multiUrls.trim() : !url.trim())}
            className="bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : mode === "digest" ? (
              <Play className="h-4 w-4 mr-2" />
            ) : mode === "implement" ? (
              <Wrench className="h-4 w-4 mr-2" />
            ) : (
              <Lightbulb className="h-4 w-4 mr-2" />
            )}
            {mode === "digest" ? "Digest Video" : mode === "implement" ? "Generate Implementation Guide" : "Synthesize Ideas"}
          </Button>
        </CardContent>
      </Card>

      {/* Quick Examples */}
      {!response && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground/60">How to use</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground/70">
              <div>
                <span className="font-medium text-violet-400">Digest:</span> Paste a YouTube/TikTok/Twitter URL — gets the transcript, breaks it into actionable sections with takeaways.
              </div>
              <div>
                <span className="font-medium text-violet-400">Implement:</span> Same as digest but generates a complete step-by-step guide with code, commands, and configs. You can follow it without watching the video.
              </div>
              <div>
                <span className="font-medium text-violet-400">Multi-Video:</span> Paste 2-5 URLs from different videos. The agent summarizes each, finds common themes, and creates a combined action plan.
              </div>
              <div className="pt-2 text-[11px] text-muted-foreground/40">
                After digesting, you can say &quot;implement section 2&quot; to get a detailed guide for a specific section.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Response */}
      {response && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{response}</p>

            {/* Follow-up actions */}
            {mode === "digest" && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setMode("implement"); handleSubmit(); }}
                  disabled={loading}
                >
                  <Wrench className="h-3 w-3 mr-1" />
                  Generate Implementation Guide
                </Button>
                {[1, 2, 3].map(n => (
                  <Button
                    key={n}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => askDigest(`implement section ${n}`)}
                    disabled={loading}
                  >
                    Implement Section {n}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
