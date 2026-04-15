"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Shield,
  Flame,
  ListChecks,
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TwitterStats {
  followers: number;
  tweets_today: number;
  tweets_this_week: number;
  total_tweets: number;
}

interface TwitterPost {
  content: string;
  posted_at: string;
  char_count: number;
}

interface SubredditInfo {
  ok: boolean;
  name?: string;
  title?: string;
  subscribers?: number;
  description?: string;
  rules?: string[];
  error?: string;
}

interface RedditDraft {
  title: string;
  body: string;
  subreddit: string;
}

interface QueueItem {
  id: string;
  platform: "twitter" | "reddit";
  status: "draft" | "scheduled" | "posted" | "failed" | "rejected" | "submit_url_ready";
  content: string;
  title: string | null;
  subreddit: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  post_url: string | null;
  error: string | null;
  created_at: string;
}

interface RedditMention {
  title: string;
  url: string;
  subreddit: string;
  author: string;
  score: number;
  num_comments: number;
  selftext: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MarketingPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);

  // Twitter state
  const [twitterStats, setTwitterStats] = useState<TwitterStats | null>(null);
  const [twitterPosts, setTwitterPosts] = useState<TwitterPost[]>([]);
  const [tweetTopic, setTweetTopic] = useState("");
  const [tweetDraft, setTweetDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ideas, setIdeas] = useState("");
  const [loadingIdeas, setLoadingIdeas] = useState(false);

  // Reddit state
  const [redditVerified, setRedditVerified] = useState<{ ok: boolean; mode?: string; note?: string; username?: string; error?: string } | null>(null);
  const [subredditName, setSubredditName] = useState("SaaS");
  const [subredditInfo, setSubredditInfo] = useState<SubredditInfo | null>(null);
  const [loadingSubreddit, setLoadingSubreddit] = useState(false);
  const [redditTopic, setRedditTopic] = useState("");
  const [redditDraft, setRedditDraft] = useState<RedditDraft | null>(null);
  const [redditDrafting, setRedditDrafting] = useState(false);
  const [redditPosting, setRedditPosting] = useState(false);
  const [monitorQuery, setMonitorQuery] = useState("Harv AI");
  const [monitorResults, setMonitorResults] = useState<RedditMention[]>([]);
  const [monitoring, setMonitoring] = useState(false);

  // Queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // Research state (kept from previous page)
  const [researching, setResearching] = useState("");
  const [researchResult, setResearchResult] = useState("");
  const [productQuery, setProductQuery] = useState("");

  // ---------------------------------------------------------------------
  // Fetchers
  // ---------------------------------------------------------------------
  const fetchTwitter = useCallback(async () => {
    const [statsRes, postsRes] = await Promise.all([
      fetch("/api/marketing?action=stats"),
      fetch("/api/marketing?action=recent-posts"),
    ]);
    if (statsRes.ok) setTwitterStats(await statsRes.json());
    if (postsRes.ok) {
      const data = await postsRes.json();
      setTwitterPosts(data.posts || []);
    }
  }, []);

  const fetchRedditVerify = useCallback(async () => {
    // Public mode — no VPS call needed. Always available.
    setRedditVerified({
      ok: true,
      mode: "public",
      note: "Using Reddit public JSON API. Posts open Reddit's submit form in a new tab.",
    });
  }, []);

  const fetchQueue = useCallback(async () => {
    const res = await fetch("/api/marketing?action=queue");
    if (res.ok) {
      const data = await res.json();
      setQueue(data.items || []);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      await Promise.all([fetchTwitter(), fetchRedditVerify(), fetchQueue()]);
    } catch {
      toast.error("Failed to load marketing data");
    } finally {
      setLoading(false);
    }
  }, [fetchTwitter, fetchRedditVerify, fetchQueue]);

  useEffect(() => {
    if (isAdmin) fetchAll();
    else setLoading(false);
  }, [isAdmin, fetchAll]);

  // ---------------------------------------------------------------------
  // Twitter handlers
  // ---------------------------------------------------------------------
  async function handleDraftTweet() {
    if (!tweetTopic.trim()) return toast.error("Enter a topic");
    setDrafting(true);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", topic: tweetTopic.trim() }),
      });
      const data = await res.json();
      if (data.draft) {
        setTweetDraft(data.draft);
        toast.success(`Draft ready (${data.char_count}/280)`);
      } else {
        toast.error(data.error || "Draft failed");
      }
    } finally {
      setDrafting(false);
    }
  }

  async function handlePostTweet() {
    if (!tweetDraft.trim()) return toast.error("No draft");
    if (tweetDraft.length > 280) return toast.error(`Too long (${tweetDraft.length}/280)`);
    setPosting(true);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "post", text: tweetDraft.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Posted to Twitter");
        setTweetDraft("");
        setTweetTopic("");
        fetchTwitter();
      } else {
        toast.error(data.error || "Post failed");
      }
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
    } finally {
      setLoadingIdeas(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(tweetDraft);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  }

  // ---------------------------------------------------------------------
  // Reddit handlers
  // ---------------------------------------------------------------------
  async function handleLookupSubreddit() {
    const name = subredditName.trim().replace(/^r?\//, "");
    if (!name) return toast.error("Enter a subreddit");
    setLoadingSubreddit(true);
    try {
      // Go through our /api/reddit proxy — Reddit.com has no CORS headers
      // and our VPS IP gets rate-limited, but Vercel edge works.
      const [aboutRes, rulesRes] = await Promise.all([
        fetch(`/api/reddit?path=${encodeURIComponent(`/r/${name}/about.json`)}`),
        fetch(`/api/reddit?path=${encodeURIComponent(`/r/${name}/about/rules.json`)}`),
      ]);

      if (!aboutRes.ok) {
        setSubredditInfo({ ok: false, error: `Reddit returned ${aboutRes.status}` });
        return;
      }

      const about = (await aboutRes.json()).data || {};
      const rulesData = rulesRes.ok ? await rulesRes.json() : { rules: [] };
      const rules = (rulesData.rules || [])
        .map((r: { short_name?: string; description?: string }) => {
          const short = r.short_name || "";
          const desc = r.description || "";
          return `${short}: ${desc}`.replace(/^:\s*/, "").trim();
        })
        .filter(Boolean);

      setSubredditInfo({
        ok: true,
        name: about.display_name || name,
        title: about.title || "",
        subscribers: about.subscribers || 0,
        description: (about.public_description || about.description || "").slice(0, 500),
        rules,
      });
    } catch (e) {
      setSubredditInfo({ ok: false, error: String(e) });
    } finally {
      setLoadingSubreddit(false);
    }
  }

  async function handleDraftReddit() {
    const name = subredditName.trim().replace(/^r?\//, "");
    if (!redditTopic.trim() || !name) return toast.error("Need topic and subreddit");
    setRedditDrafting(true);
    setRedditDraft(null);
    try {
      // Pass any rules we've fetched client-side so the LLM can respect them
      const rules =
        subredditInfo && subredditInfo.ok && subredditInfo.name?.toLowerCase() === name.toLowerCase()
          ? subredditInfo.rules || []
          : [];

      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reddit-draft",
          topic: redditTopic.trim(),
          subreddit: name,
          rules,
        }),
      });
      const data = await res.json();
      if (data.draft && data.draft.title) {
        setRedditDraft(data.draft);
        toast.success("Reddit draft ready");
      } else {
        toast.error(data.error || "Draft failed");
      }
    } finally {
      setRedditDrafting(false);
    }
  }

  async function handlePostReddit() {
    if (!redditDraft) return toast.error("No draft");
    setRedditPosting(true);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reddit-post",
          subreddit: redditDraft.subreddit,
          title: redditDraft.title,
          body: redditDraft.body,
        }),
      });
      const data = await res.json();
      if (data.ok && data.submit_url) {
        // Public mode: open Reddit's submit form with title + body prefilled
        window.open(data.submit_url, "_blank", "noopener,noreferrer");
        toast.success(`Opening r/${redditDraft.subreddit} submit form…`);
        setRedditDraft(null);
        setRedditTopic("");
        fetchQueue();
      } else {
        toast.error(data.error || "Could not build submit URL");
      }
    } finally {
      setRedditPosting(false);
    }
  }

  async function handleQueueReddit() {
    if (!redditDraft) return toast.error("No draft");
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "queue-add",
          platform: "reddit",
          content: redditDraft.body,
          title: redditDraft.title,
          subreddit: redditDraft.subreddit,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Queued for review");
        setRedditDraft(null);
        setRedditTopic("");
        fetchQueue();
      } else {
        toast.error(data.error || "Queue failed");
      }
    } catch {
      toast.error("Queue failed");
    }
  }

  async function handleQueueTweet() {
    if (!tweetDraft.trim()) return toast.error("No draft");
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "queue-add",
          platform: "twitter",
          content: tweetDraft.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Queued for review");
        setTweetDraft("");
        setTweetTopic("");
        fetchQueue();
      } else {
        toast.error(data.error || "Queue failed");
      }
    } catch {
      toast.error("Queue failed");
    }
  }

  async function handleMonitorReddit() {
    if (!monitorQuery.trim()) return;
    setMonitoring(true);
    setMonitorResults([]);
    try {
      // Via /api/reddit proxy (CORS + VPS rate limit workaround)
      const params = new URLSearchParams({
        path: "/search.json",
        q: monitorQuery.trim(),
        sort: "new",
        t: "month",
        limit: "15",
      });
      const res = await fetch(`/api/reddit?${params}`);
      if (!res.ok) {
        toast.error(`Reddit returned ${res.status}`);
        return;
      }
      const data = await res.json();
      type RedditChild = {
        data?: {
          title?: string;
          permalink?: string;
          url?: string;
          subreddit?: string;
          author?: string;
          score?: number;
          num_comments?: number;
          selftext?: string;
        };
      };
      const children: RedditChild[] = data?.data?.children || [];
      const results: RedditMention[] = children.map((c) => {
        const p = c.data || {};
        return {
          title: p.title || "",
          url: p.permalink ? `https://www.reddit.com${p.permalink}` : p.url || "",
          subreddit: p.subreddit || "",
          author: p.author || "[deleted]",
          score: p.score || 0,
          num_comments: p.num_comments || 0,
          selftext: (p.selftext || "").slice(0, 500),
        };
      });
      setMonitorResults(results);
    } catch (e) {
      toast.error(`Monitor failed: ${e}`);
    } finally {
      setMonitoring(false);
    }
  }

  // ---------------------------------------------------------------------
  // Queue handlers
  // ---------------------------------------------------------------------
  async function handleQueueApprove(id: string) {
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queue-approve", id }),
      });
      const data = await res.json();
      if (data.ok) {
        // Reddit items return a submit URL — open it in a new tab so the
        // user can complete the post via Reddit's own form.
        const submitUrl = data.result?.submit_url;
        if (submitUrl) {
          window.open(submitUrl, "_blank", "noopener,noreferrer");
          toast.success("Opening Reddit submit form…");
        } else {
          toast.success("Published");
        }
        fetchQueue();
      } else {
        toast.error(data.result?.error || data.error || "Failed");
      }
    } catch {
      toast.error("Approve failed");
    }
  }

  async function handleQueueReject(id: string) {
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queue-reject", id }),
      });
      if (res.ok) {
        toast.success("Rejected");
        fetchQueue();
      }
    } catch {
      toast.error("Reject failed");
    }
  }

  // ---------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------
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

  const queuePending = queue.filter((q) => q.status === "draft" || q.status === "scheduled");

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
              Harv&apos;s brand — Twitter, Reddit, content strategy
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchAll}
            className="ml-auto h-8 w-8"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <Tabs defaultValue="twitter" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="twitter">
            <TwitterIcon className="h-3.5 w-3.5 mr-1.5" />
            Twitter
          </TabsTrigger>
          <TabsTrigger value="reddit">
            <Flame className="h-3.5 w-3.5 mr-1.5" />
            Reddit
          </TabsTrigger>
          <TabsTrigger value="queue">
            <ListChecks className="h-3.5 w-3.5 mr-1.5" />
            Queue {queuePending.length > 0 && (
              <Badge className="ml-1.5 h-4 px-1 text-[9px]">{queuePending.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="research">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            Research
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* TWITTER TAB */}
        {/* ================================================================ */}
        <TabsContent value="twitter" className="space-y-6">
          {/* Stats */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <StatCard icon={Users} label="Followers" value={twitterStats?.followers ?? "—"} color="text-blue-400" />
            <StatCard icon={MessageSquare} label="Today" value={twitterStats?.tweets_today ?? "—"} color="text-primary" />
            <StatCard icon={Calendar} label="This Week" value={twitterStats?.tweets_this_week ?? "—"} color="text-emerald-400" />
            <StatCard icon={TwitterIcon} label="Total" value={twitterStats?.total_tweets ?? "—"} color="text-sky-400" />
          </div>

          {/* Draft */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-400" />
                Draft Tweet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="What should Harv tweet about? (e.g., 'new Learning agent', 'AI automation win')"
                value={tweetTopic}
                onChange={(e) => setTweetTopic(e.target.value)}
                className="min-h-[70px] resize-none"
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleDraftTweet}
                  disabled={drafting || !tweetTopic.trim()}
                  className="bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30"
                >
                  {drafting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generate Draft
                </Button>
                <Button variant="ghost" onClick={handleIdeas} disabled={loadingIdeas}>
                  {loadingIdeas ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lightbulb className="h-4 w-4 mr-2" />}
                  Content Ideas
                </Button>
              </div>

              {ideas && (
                <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.06] p-4">
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-wider font-medium mb-2">
                    Content Ideas
                  </p>
                  <p className="text-sm text-foreground/70 whitespace-pre-wrap">{ideas}</p>
                </div>
              )}

              {tweetDraft && (
                <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.08] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground/60 uppercase tracking-wider font-medium">Preview</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        tweetDraft.length > 280
                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                      )}
                    >
                      {tweetDraft.length}/280
                    </Badge>
                  </div>

                  <Textarea
                    value={tweetDraft}
                    onChange={(e) => setTweetDraft(e.target.value)}
                    className="min-h-[60px] resize-none bg-transparent border-none p-0 focus-visible:ring-0 text-foreground"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handlePostTweet}
                      disabled={posting || tweetDraft.length > 280}
                      className="bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30"
                    >
                      {posting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      Post Now
                    </Button>
                    <Button variant="outline" onClick={handleQueueTweet}>
                      <ListChecks className="h-4 w-4 mr-2" />
                      Queue
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleCopy}>
                      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent posts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TwitterIcon className="h-4 w-4 text-sky-400" />
                Recent Posts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {twitterPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground/50 text-center py-8">No recent posts found</p>
              ) : (
                <div className="space-y-3">
                  {twitterPosts.map((post, i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.04] p-3 hover:ring-white/[0.08] transition-all"
                    >
                      <p className="text-sm text-foreground/80 mb-2 whitespace-pre-wrap">{post.content}</p>
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
        </TabsContent>

        {/* ================================================================ */}
        {/* REDDIT TAB */}
        {/* ================================================================ */}
        <TabsContent value="reddit" className="space-y-6">
          {/* Credentials status */}
          <Card>
            <CardContent className="py-4">
              {redditVerified?.ok ? (
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5" />
                  <div className="flex-1">
                    {redditVerified.mode === "public" ? (
                      <>
                        <p className="font-medium text-emerald-400 mb-1">Public mode active</p>
                        <p className="text-xs text-muted-foreground">
                          Drafts, subreddit info, and mention monitoring work without API keys.
                          Posts open Reddit&apos;s own submit form in a new tab — click once to publish.
                        </p>
                      </>
                    ) : (
                      <p>
                        <span className="text-muted-foreground">Connected as </span>
                        <span className="font-medium">u/{redditVerified.username}</span>
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-400 mb-1">Reddit check failed</p>
                    <p className="text-xs text-muted-foreground">
                      {redditVerified?.error || "Could not reach Reddit's public API."}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subreddit picker */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-orange-400" />
                Target Subreddit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="subreddit (e.g. SaaS, programming, sideproject)"
                  value={subredditName}
                  onChange={(e) => setSubredditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookupSubreddit()}
                />
                <Button onClick={handleLookupSubreddit} disabled={loadingSubreddit} variant="outline">
                  {loadingSubreddit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {subredditInfo && subredditInfo.ok && (
                <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.06] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">r/{subredditInfo.name}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {(subredditInfo.subscribers || 0).toLocaleString()} members
                    </Badge>
                  </div>
                  {subredditInfo.title && (
                    <p className="text-xs text-muted-foreground">{subredditInfo.title}</p>
                  )}
                  {subredditInfo.description && (
                    <p className="text-[11px] text-muted-foreground/70 line-clamp-3">{subredditInfo.description}</p>
                  )}
                  {subredditInfo.rules && subredditInfo.rules.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 mt-2">Rules</p>
                      <ul className="space-y-0.5">
                        {subredditInfo.rules.slice(0, 6).map((r, i) => (
                          <li key={i} className="text-[11px] text-foreground/70 line-clamp-2">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {subredditInfo && !subredditInfo.ok && (
                <p className="text-xs text-red-400">{subredditInfo.error}</p>
              )}
            </CardContent>
          </Card>

          {/* Draft Reddit post */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-400" />
                Draft Reddit Post
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="What's the post about? (e.g., 'I built an AI command center in a month', 'Lessons from shipping 10 agents')"
                value={redditTopic}
                onChange={(e) => setRedditTopic(e.target.value)}
                className="min-h-[70px] resize-none"
              />
              <Button
                onClick={handleDraftReddit}
                disabled={redditDrafting || !redditTopic.trim()}
                className="bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30"
              >
                {redditDrafting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate Draft
              </Button>

              {redditDraft && (
                <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.08] p-4 space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    r/{redditDraft.subreddit} — Preview
                  </div>
                  <Input
                    value={redditDraft.title}
                    onChange={(e) => setRedditDraft({ ...redditDraft, title: e.target.value })}
                    className="font-semibold"
                  />
                  <Textarea
                    value={redditDraft.body}
                    onChange={(e) => setRedditDraft({ ...redditDraft, body: e.target.value })}
                    className="min-h-[200px] font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handlePostReddit}
                      disabled={redditPosting}
                      className="bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30"
                    >
                      {redditPosting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                      Open Submit Form
                    </Button>
                    <Button variant="outline" onClick={handleQueueReddit}>
                      <ListChecks className="h-4 w-4 mr-2" />
                      Queue for Review
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setRedditDraft(null)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monitor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-purple-400" />
                Monitor Mentions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Search term (e.g., 'Harv AI', 'AI command center')"
                  value={monitorQuery}
                  onChange={(e) => setMonitorQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleMonitorReddit()}
                />
                <Button onClick={handleMonitorReddit} disabled={monitoring}>
                  {monitoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {monitorResults.length > 0 && (
                <div className="space-y-2">
                  {monitorResults.map((r, i) => (
                    <a
                      key={i}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg bg-white/[0.02] ring-1 ring-white/[0.04] p-3 hover:ring-white/[0.08] transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium line-clamp-2">{r.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-1">
                            <span>r/{r.subreddit}</span>
                            <span>·</span>
                            <span>u/{r.author}</span>
                            <span>·</span>
                            <span>{r.score} pts</span>
                            <span>·</span>
                            <span>{r.num_comments} comments</span>
                          </div>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/40 mt-1 shrink-0" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* QUEUE TAB */}
        {/* ================================================================ */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-orange-400" />
                Approval Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {queue.length === 0 ? (
                <p className="text-sm text-muted-foreground/50 text-center py-8">
                  No items in queue. Drafts queued from Twitter or Reddit tabs appear here.
                </p>
              ) : (
                <div className="space-y-3">
                  {queue.map((item) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      onApprove={() => handleQueueApprove(item.id)}
                      onReject={() => handleQueueReject(item.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* RESEARCH TAB */}
        {/* ================================================================ */}
        <TabsContent value="research" className="space-y-4">
          <Card>
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
                ].map((q) => (
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
                      } catch {
                        toast.error("Research failed");
                      } finally {
                        setResearching("");
                      }
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-blue-400" />
                Product Research
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Research a product or compare... (e.g., 'best CRM tools', 'Notion vs Clickup')"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                onKeyDown={async (e) => {
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
                    } catch {
                      toast.error("Research failed");
                    } finally {
                      setResearching("");
                    }
                  }
                }}
              />
            </CardContent>
          </Card>

          {researchResult && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{researchResult}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <Icon className={cn("h-3.5 w-3.5", color.replace("text-", "text-") + "/60")} />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            {label}
          </p>
        </div>
        <p className={cn("text-2xl font-bold", color)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function QueueCard({
  item,
  onApprove,
  onReject,
}: {
  item: QueueItem;
  onApprove: () => void;
  onReject: () => void;
}) {
  const statusStyles: Record<string, string> = {
    draft: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    posted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    submit_url_ready: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    failed: "bg-red-500/10 text-red-400 border-red-500/30",
    rejected: "bg-white/[0.04] text-muted-foreground border-white/[0.1]",
  };
  const statusLabels: Record<string, string> = {
    draft: "draft",
    scheduled: "scheduled",
    posted: "posted",
    submit_url_ready: "ready to submit",
    failed: "failed",
    rejected: "rejected",
  };
  const isActionable = item.status === "draft" || item.status === "scheduled";

  return (
    <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.04] p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase">
            {item.platform === "twitter" ? (
              <TwitterIcon className="h-2.5 w-2.5 mr-1" />
            ) : (
              <Flame className="h-2.5 w-2.5 mr-1" />
            )}
            {item.platform}
          </Badge>
          {item.subreddit && (
            <span className="text-[10px] text-muted-foreground">r/{item.subreddit}</span>
          )}
          <Badge variant="outline" className={cn("text-[10px] uppercase", statusStyles[item.status])}>
            {statusLabels[item.status] || item.status}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground/50">
          {new Date(item.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {item.title && <p className="text-sm font-semibold">{item.title}</p>}
      <p className="text-sm text-foreground/70 whitespace-pre-wrap line-clamp-4">{item.content}</p>
      {item.error && <p className="text-[11px] text-red-400">Error: {item.error}</p>}
      {item.post_url && (
        <a
          href={item.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
        >
          View post <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {isActionable && (
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={onApprove}
            className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Approve & Post
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject}>
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
