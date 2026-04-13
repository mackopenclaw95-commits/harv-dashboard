"use client";

import { useEffect, useState, useCallback } from "react";
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
  Megaphone,
  Send,
  Sparkles,
  MessageCircle as TwitterIcon,
  Users,
  MessageSquare,
  Calendar,
  Loader2,
  Copy,
  Check,
  Lightbulb,
  RefreshCw,
  TrendingUp,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

interface Stats {
  followers: number;
  tweets_today: number;
  tweets_this_week: number;
  total_tweets: number;
}

interface Post {
  content: string;
  posted_at: string;
  char_count: number;
}

export default function MarketingPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // Draft state
  const [topic, setTopic] = useState("");
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Ideas state
  const [ideas, setIdeas] = useState("");
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  // Research state
  const [researching, setResearching] = useState("");
  const [researchResult, setResearchResult] = useState("");
  const [productQuery, setProductQuery] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, postsRes] = await Promise.all([
        fetch("/api/marketing?action=stats"),
        fetch("/api/marketing?action=recent-posts"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.posts || []);
      }
    } catch {
      toast.error("Failed to load marketing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
    else setLoading(false);
  }, [isAdmin, fetchData]);

  async function handleDraft() {
    if (!topic.trim()) {
      toast.error("Enter a topic first");
      return;
    }
    setDrafting(true);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", topic: topic.trim() }),
      });
      const data = await res.json();
      if (data.draft) {
        setDraft(data.draft);
        toast.success(`Draft generated (${data.char_count} chars)`);
      } else {
        toast.error(data.error || "Failed to generate draft");
      }
    } catch {
      toast.error("Draft generation failed");
    } finally {
      setDrafting(false);
    }
  }

  async function handlePost() {
    if (!draft.trim()) {
      toast.error("No draft to post");
      return;
    }
    if (draft.length > 280) {
      toast.error(`Tweet too long (${draft.length}/280)`);
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "post", text: draft.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Posted to Twitter!");
        setDraft("");
        setTopic("");
        fetchData(); // refresh stats
      } else {
        toast.error(data.error || "Failed to post");
      }
    } catch {
      toast.error("Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function handleIdeas() {
    setLoadingIdeas(true);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ideas" }),
      });
      const data = await res.json();
      setIdeas(data.ideas || "No ideas generated");
    } catch {
      toast.error("Failed to generate ideas");
    } finally {
      setLoadingIdeas(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  }

  // Admin gate
  if (authLoading || loading) {
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
            <Megaphone className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Admin Only</h3>
            <p className="text-sm text-muted-foreground">
              Marketing dashboard is only available to administrators.
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 ring-1 ring-orange-500/20">
            <Megaphone className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
            <p className="text-sm text-muted-foreground">
              Harv&apos;s brand presence &middot; Twitter &middot; Content Strategy
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchData}
            className="ml-auto h-8 w-8"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Stats Row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Users className="h-3.5 w-3.5 text-blue-400/60" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Followers
              </p>
            </div>
            <p className="text-2xl font-bold text-blue-400">
              {stats?.followers ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <MessageSquare className="h-3.5 w-3.5 text-primary/60" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Today
              </p>
            </div>
            <p className="text-2xl font-bold">
              {stats?.tweets_today ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Calendar className="h-3.5 w-3.5 text-emerald-400/60" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                This Week
              </p>
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              {stats?.tweets_this_week ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <TwitterIcon className="h-3.5 w-3.5 text-sky-400/60" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Total
              </p>
            </div>
            <p className="text-2xl font-bold text-sky-400">
              {stats?.total_tweets ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Draft Section */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-400" />
            Draft New Tweet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Topic input */}
          <div>
            <Textarea
              placeholder="What should Harv tweet about? (e.g., 'new video gen feature', 'AI assistant capabilities')"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleDraft}
              disabled={drafting || !topic.trim()}
              className="bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30"
            >
              {drafting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate Draft
            </Button>
            <Button
              variant="ghost"
              onClick={handleIdeas}
              disabled={loadingIdeas}
            >
              {loadingIdeas ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lightbulb className="h-4 w-4 mr-2" />
              )}
              Content Ideas
            </Button>
          </div>

          {/* Ideas panel */}
          {ideas && (
            <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.06] p-4">
              <p className="text-xs text-muted-foreground/60 uppercase tracking-wider font-medium mb-2">
                Content Ideas
              </p>
              <p className="text-sm text-foreground/70 whitespace-pre-wrap">
                {ideas}
              </p>
            </div>
          )}

          {/* Draft preview */}
          {draft && (
            <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.08] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground/60 uppercase tracking-wider font-medium">
                  Preview
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    draft.length > 280
                      ? "bg-red-500/10 text-red-400 border-red-500/30"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  )}
                >
                  {draft.length}/280
                </Badge>
              </div>

              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[60px] resize-none bg-transparent border-none p-0 focus-visible:ring-0 text-foreground"
              />

              <div className="flex gap-2">
                <Button
                  onClick={handlePost}
                  disabled={posting || draft.length > 280}
                  className="bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30"
                >
                  {posting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Post to Twitter
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Posts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TwitterIcon className="h-4 w-4 text-sky-400" />
            Recent Posts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground/50 text-center py-8">
              No recent posts found
            </p>
          ) : (
            <div className="space-y-3">
              {posts.map((post, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.04] p-3 hover:ring-white/[0.08] transition-all"
                >
                  <p className="text-sm text-foreground/80 mb-2">
                    {post.content}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
                    <span>
                      {new Date(post.posted_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>{post.char_count} chars</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Market Research Section */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-400" />
            Market Research
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
            {[
              "AI chatbot market size 2026",
              "Harv competitors analysis",
              "SaaS pricing trends",
              "Personal AI assistant market",
              "AI agent framework landscape",
              "Consumer AI spending habits",
            ].map(q => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                className="text-xs text-left justify-start h-auto py-2"
                onClick={async () => {
                  setResearching(q);
                  try {
                    const res = await fetch("/api/chat/agent", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ message: q, agent: "Market Research" }),
                    });
                    const data = await res.json();
                    setResearchResult(data.response || data.text || "");
                  } catch { toast.error("Research failed"); }
                  finally { setResearching(""); }
                }}
                disabled={!!researching}
              >
                {researching === q ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                {q}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Product Research Section */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-blue-400" />
            Product Research
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Research a product or compare... (e.g., 'best CRM tools', 'Notion vs Clickup')"
              value={productQuery}
              onChange={e => setProductQuery(e.target.value)}
              onKeyDown={async e => {
                if (e.key === "Enter" && productQuery.trim()) {
                  setResearching(productQuery);
                  try {
                    const res = await fetch("/api/chat/agent", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ message: productQuery, agent: "Product Research" }),
                    });
                    const data = await res.json();
                    setResearchResult(data.response || data.text || "");
                  } catch { toast.error("Research failed"); }
                  finally { setResearching(""); }
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Research Result */}
      {researchResult && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{researchResult}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
