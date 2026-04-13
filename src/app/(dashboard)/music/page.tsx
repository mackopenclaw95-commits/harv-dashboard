"use client";

import { useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function MusicPage() {
  const [playlistPrompt, setPlaylistPrompt] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");

  async function askMusic(message: string) {
    setLoading(true);
    setResponse("");
    setPlaylistUrl("");
    try {
      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, agent: "Music" }),
      });
      const data = await res.json();
      const text = data.response || data.text || data.message || "";
      setResponse(text);

      // Extract Spotify URL if present
      const urlMatch = text.match(/https:\/\/open\.spotify\.com\/playlist\/\S+/);
      if (urlMatch) setPlaylistUrl(urlMatch[0]);
    } catch {
      toast.error("Failed to get response");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
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

      {/* Quick Playlist Creator */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Create a Playlist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Describe your playlist... (e.g., 'chill lofi for studying', 'high energy gym playlist with hip hop and EDM', '90s R&B vibes')"
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
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        {[
          { label: "Discover New Music", query: "recommend me some new music I might like", color: "text-purple-400" },
          { label: "Workout Playlist", query: "make me an intense workout playlist", color: "text-red-400" },
          { label: "Chill Vibes", query: "make me a chill relaxing playlist", color: "text-blue-400" },
          { label: "Road Trip Mix", query: "make me a road trip playlist with a mix of everything", color: "text-amber-400" },
        ].map(({ label, query, color }) => (
          <Button
            key={label}
            variant="outline"
            className="h-auto py-3 flex flex-col gap-1.5 hover:bg-white/[0.04] text-center"
            onClick={() => { setPlaylistPrompt(query); askMusic(query); }}
            disabled={loading}
          >
            <Music className={cn("h-5 w-5", color)} />
            <span className="text-xs">{label}</span>
          </Button>
        ))}
      </div>

      {/* Search Spotify */}
      <Card className="mb-6">
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
