"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Music,
  ListMusic,
  Sparkles,
  Search,
  Loader2,
  ExternalLink,
  Lock,
  Play,
  Pause,
  SkipForward,
  Clock,
  TrendingUp,
  User,
  Disc3,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface NowPlayingData {
  playing: boolean;
  track?: string;
  artist?: string;
  album?: string;
  album_art?: string;
  progress_ms?: number;
  duration_ms?: number;
  spotify_url?: string;
  error?: string;
}

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function LockedCard({ title, icon: Icon, description, scope }: { title: string; icon: React.ElementType; description: string; scope: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
      <CardContent className="pt-6 pb-6 flex flex-col items-center text-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08]">
          <Icon className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 justify-center">
            <Lock className="h-3 w-3" /> {title}
          </h3>
          <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">{description}</p>
        </div>
        <p className="text-[10px] text-muted-foreground/40 font-mono">Requires: {scope}</p>
      </CardContent>
    </Card>
  );
}

export default function MusicPage() {
  const [playlistPrompt, setPlaylistPrompt] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [npLoading, setNpLoading] = useState(true);
  const [localProgress, setLocalProgress] = useState(0);
  const [controlling, setControlling] = useState(false);
  const lastFetchTime = useRef(0);

  // Poll now playing
  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/now-playing");
      const data = await res.json();
      setNowPlaying(data);
      if (data.progress_ms != null) {
        setLocalProgress(data.progress_ms);
        lastFetchTime.current = Date.now();
      }
    } catch {
      setNowPlaying({ playing: false, error: "fetch_failed" });
    } finally {
      setNpLoading(false);
    }
  }, []);

  // Poll every 10s
  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 10000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  // Smooth progress: tick every second when playing
  useEffect(() => {
    if (!nowPlaying?.playing) return;
    const tick = setInterval(() => {
      setLocalProgress(prev => {
        const elapsed = Date.now() - lastFetchTime.current;
        const newProgress = (nowPlaying.progress_ms || 0) + elapsed;
        return Math.min(newProgress, nowPlaying.duration_ms || newProgress);
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [nowPlaying]);

  // Player controls
  async function controlPlayer(action: "play" | "pause" | "next" | "previous") {
    setControlling(true);
    try {
      const res = await fetch("/api/spotify/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Playback control failed");
      } else {
        // Re-fetch after a short delay to get updated state
        setTimeout(fetchNowPlaying, 500);
      }
    } catch {
      toast.error("Failed to control playback");
    } finally {
      setControlling(false);
    }
  }

  async function askMusic(message: string) {
    setLoading(true);
    setResponse("");
    setPlaylistUrl("");
    try {
      const { askAgent } = await import("@/lib/agent-ask");
      const text = await askAgent("Music", message);
      setResponse(text);
      const urlMatch = text.match(/https:\/\/open\.spotify\.com\/playlist\/\S+/);
      if (urlMatch) setPlaylistUrl(urlMatch[0]);
    } catch {
      toast.error("Failed to get response");
    } finally {
      setLoading(false);
    }
  }

  const scopeLocked = nowPlaying?.error === "scope_not_granted" || nowPlaying?.error === "not_connected";
  const isPlaying = nowPlaying?.playing && nowPlaying?.track;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
            <Music className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Music</h1>
            <p className="text-sm text-muted-foreground">
              Create playlists, discover music, powered by Spotify
            </p>
          </div>
        </div>
      </header>

      {/* Now Playing Hero */}
      <Card className="overflow-hidden">
        <div className="relative">
          {/* Background gradient from album art color */}
          <div className={cn(
            "absolute inset-0 opacity-20",
            isPlaying ? "bg-gradient-to-r from-emerald-500/30 via-transparent to-emerald-500/10" : "bg-gradient-to-r from-white/[0.02] to-transparent"
          )} />

          <CardContent className="pt-6 pb-6 relative">
            {npLoading ? (
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-lg bg-white/[0.04] animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 w-40 rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-3 w-28 rounded bg-white/[0.04] animate-pulse" />
                </div>
              </div>
            ) : scopeLocked ? (
              /* Locked state — scope not available */
              <div className="flex items-center gap-5">
                <div className="h-20 w-20 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08] flex items-center justify-center shrink-0">
                  <Disc3 className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-muted-foreground flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" /> Now Playing
                  </h3>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Live playback requires Spotify Extended Quota Mode approval.
                    <br />
                    Your playlists and recommendations still work!
                  </p>
                  <p className="text-[10px] text-muted-foreground/40 font-mono mt-2">
                    Requires: user-read-playback-state
                  </p>
                </div>
              </div>
            ) : isPlaying ? (
              /* Playing state */
              <div className="flex items-center gap-5">
                {nowPlaying?.album_art ? (
                  <img
                    src={nowPlaying.album_art}
                    alt={nowPlaying.album || ""}
                    className="h-20 w-20 rounded-lg shadow-lg ring-1 ring-white/[0.1] shrink-0 object-cover"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center shrink-0">
                    <Music className="h-8 w-8 text-emerald-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="flex gap-0.5">
                      <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
                      <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: "0.3s" }} />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-medium">Now Playing</span>
                  </div>
                  <h3 className="text-lg font-semibold truncate">{nowPlaying?.track}</h3>
                  <p className="text-sm text-muted-foreground truncate">{nowPlaying?.artist}</p>
                  <p className="text-xs text-muted-foreground/60 truncate">{nowPlaying?.album}</p>

                  {/* Progress bar (smooth client-side interpolation) */}
                  {nowPlaying?.duration_ms && nowPlaying.duration_ms > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums w-8">
                        {formatMs(localProgress)}
                      </span>
                      <div className="flex-1 h-1 rounded-full bg-white/[0.06]">
                        <div
                          className="h-1 rounded-full bg-emerald-400 transition-all duration-1000 ease-linear"
                          style={{ width: `${Math.min((localProgress / nowPlaying.duration_ms) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums w-8 text-right">
                        {formatMs(nowPlaying.duration_ms)}
                      </span>
                    </div>
                  )}

                  {/* Playback controls */}
                  <div className="mt-3 flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 hover:bg-white/[0.06]"
                      onClick={() => controlPlayer("previous")}
                      disabled={controlling}
                    >
                      <SkipForward className="h-4 w-4 rotate-180" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 hover:bg-white/[0.06]"
                      onClick={() => controlPlayer(nowPlaying?.playing ? "pause" : "play")}
                      disabled={controlling}
                    >
                      {nowPlaying?.playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 hover:bg-white/[0.06]"
                      onClick={() => controlPlayer("next")}
                      disabled={controlling}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {nowPlaying?.spotify_url && (
                  <a href={nowPlaying.spotify_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-emerald-500/10">
                      <ExternalLink className="h-4 w-4 text-emerald-400" />
                    </Button>
                  </a>
                )}
              </div>
            ) : (
              /* Not playing */
              <div className="flex items-center gap-5">
                <div className="h-20 w-20 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08] flex items-center justify-center shrink-0">
                  <Pause className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-muted-foreground">Nothing Playing</h3>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Play something on Spotify and it&apos;ll show up here
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* Create Playlist + Quick Actions row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create Playlist */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              Create a Playlist
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Describe your playlist... (e.g., 'chill lofi for studying', 'high energy gym playlist', '90s R&B vibes')"
              value={playlistPrompt}
              onChange={e => setPlaylistPrompt(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <Button
              onClick={() => askMusic(`make me a playlist of ${playlistPrompt}`)}
              disabled={loading || !playlistPrompt.trim()}
              className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ListMusic className="h-4 w-4 mr-2" />}
              Create Playlist
            </Button>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="h-4 w-4 text-emerald-400" />
              Quick Playlists
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-2">
              {[
                { label: "Discover New", query: "recommend me some new music I might like", color: "text-purple-400" },
                { label: "Workout Mix", query: "make me an intense workout playlist", color: "text-red-400" },
                { label: "Chill Vibes", query: "make me a chill relaxing playlist", color: "text-blue-400" },
                { label: "Road Trip", query: "make me a road trip playlist with a mix of everything", color: "text-amber-400" },
              ].map(({ label, query, color }) => (
                <Button
                  key={label}
                  variant="outline"
                  className="h-auto py-3 flex flex-col gap-1.5 hover:bg-white/[0.04] text-center"
                  onClick={() => { setPlaylistPrompt(query); askMusic(query); }}
                  disabled={loading}
                >
                  <Music className={cn("h-4 w-4", color)} />
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recently Played + Top Tracks (locked) */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <LockedCard
          title="Recently Played"
          icon={Clock}
          description="See your listening history and recently played tracks"
          scope="user-read-recently-played"
        />
        <LockedCard
          title="Top Artists"
          icon={User}
          description="Your most listened-to artists this month"
          scope="user-top-read"
        />
        <LockedCard
          title="Top Tracks"
          icon={TrendingUp}
          description="Your most played songs this month"
          scope="user-top-read"
        />
      </div>

      {/* Search & Ask */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-emerald-400" />
            Search & Ask
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search for songs, ask for recommendations, or anything music..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && askMusic(searchQuery)}
            />
            <Button onClick={() => askMusic(searchQuery)} disabled={loading || !searchQuery.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Response */}
      {response && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap mb-4">{response}</p>
            {playlistUrl && (
              <a href={playlistUrl} target="_blank" rel="noopener noreferrer">
                <Button className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in Spotify
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
