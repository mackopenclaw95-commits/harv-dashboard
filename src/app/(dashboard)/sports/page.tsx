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
import {
  Trophy,
  Star,
  Plus,
  X,
  RefreshCw,
  Loader2,
  TrendingUp,
  Calendar,
  Newspaper,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

export default function SportsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [newTeam, setNewTeam] = useState("");
  const [newSport, setNewSport] = useState("");
  const [newPlayer, setNewPlayer] = useState("");

  // Chat with Sports agent
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [asking, setAsking] = useState(false);

  // Favorites from agent
  const [favorites, setFavorites] = useState<{ teams: string[]; sports: string[]; players: string[] }>({
    teams: [], sports: [], players: [],
  });

  async function askSports(message: string) {
    setAsking(true);
    setResponse("");
    try {
      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, agent: "Sports" }),
      });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        setResponse(data.response || data.text || data.message || text);
      } catch {
        setResponse(text || "No response");
      }
    } catch {
      toast.error("Failed to get response");
    } finally {
      setAsking(false);
    }
  }

  async function addFavorite(type: string, value: string) {
    if (!value.trim()) return;
    const msg = type === "team" ? `follow the ${value}` :
                type === "sport" ? `add ${value} to my sports` :
                `track player ${value}`;
    await askSports(msg);
    setFavorites(prev => ({
      ...prev,
      [type + "s"]: [...prev[type + "s" as keyof typeof prev], value.trim()],
    }));
    if (type === "team") setNewTeam("");
    if (type === "sport") setNewSport("");
    if (type === "player") setNewPlayer("");
    toast.success(`Added ${value}`);
  }

  async function removeFavorite(type: string, value: string) {
    await askSports(`unfollow ${value}`);
    const key = type + "s" as keyof typeof favorites;
    setFavorites(prev => ({
      ...prev,
      [key]: (prev[key] as string[]).filter(v => v !== value),
    }));
    toast.success(`Removed ${value}`);
  }

  // Load favorites on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/chat/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "show my favorites", agent: "Sports" }),
        });
        const raw = await res.text();
        let text = raw;
        try { const data = JSON.parse(raw); text = data.response || data.text || raw; } catch {}
        text = text || "";
        // Parse favorites from response
        const teams = text.match(/Teams:\s*(.+)/)?.[1]?.split(",").map((s: string) => s.trim()).filter((s: string) => s && s !== "None set") || [];
        const sports = text.match(/Sports:\s*(.+)/)?.[1]?.split(",").map((s: string) => s.trim()).filter((s: string) => s && s !== "None set") || [];
        const players = text.match(/Players:\s*(.+)/)?.[1]?.split(",").map((s: string) => s.trim()).filter((s: string) => s && s !== "None set") || [];
        setFavorites({ teams, sports, players });
      } catch {
        // Silent fail
      }
    }
    load();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/20">
            <Trophy className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sports</h1>
            <p className="text-sm text-muted-foreground">
              Live scores, standings, and your favorite teams
            </p>
          </div>
        </div>
      </header>

      {/* Favorites Management */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {/* Teams */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              Favorite Teams
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
              {favorites.teams.map(team => (
                <Badge key={team} variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 gap-1 pr-1">
                  {team}
                  <button onClick={() => removeFavorite("team", team)} className="hover:text-red-400 ml-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {favorites.teams.length === 0 && <span className="text-xs text-muted-foreground/50">No teams added yet</span>}
            </div>
            <div className="flex gap-1.5">
              <Input placeholder="Add team..." value={newTeam} onChange={e => setNewTeam(e.target.value)} className="text-xs h-8" onKeyDown={e => e.key === "Enter" && addFavorite("team", newTeam)} />
              <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => addFavorite("team", newTeam)}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </CardContent>
        </Card>

        {/* Sports */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Favorite Sports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
              {favorites.sports.map(sport => (
                <Badge key={sport} variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 pr-1">
                  {sport}
                  <button onClick={() => removeFavorite("sport", sport)} className="hover:text-red-400 ml-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {favorites.sports.length === 0 && <span className="text-xs text-muted-foreground/50">No sports added yet</span>}
            </div>
            <div className="flex gap-1.5">
              <Input placeholder="Add sport..." value={newSport} onChange={e => setNewSport(e.target.value)} className="text-xs h-8" onKeyDown={e => e.key === "Enter" && addFavorite("sport", newSport)} />
              <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => addFavorite("sport", newSport)}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </CardContent>
        </Card>

        {/* Players */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              Favorite Players
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
              {favorites.players.map(player => (
                <Badge key={player} variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 gap-1 pr-1">
                  {player}
                  <button onClick={() => removeFavorite("player", player)} className="hover:text-red-400 ml-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {favorites.players.length === 0 && <span className="text-xs text-muted-foreground/50">No players added yet</span>}
            </div>
            <div className="flex gap-1.5">
              <Input placeholder="Add player..." value={newPlayer} onChange={e => setNewPlayer(e.target.value)} className="text-xs h-8" onKeyDown={e => e.key === "Enter" && addFavorite("player", newPlayer)} />
              <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => addFavorite("player", newPlayer)}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        {[
          { label: "Live Scores", icon: Trophy, query: "live scores today", color: "text-amber-400" },
          { label: "Standings", icon: TrendingUp, query: favorites.sports.length ? `${favorites.sports[0]} standings` : "NFL standings", color: "text-emerald-400" },
          { label: "Schedule", icon: Calendar, query: favorites.teams.length ? `${favorites.teams[0]} schedule this week` : "NFL schedule this week", color: "text-blue-400" },
          { label: "News", icon: Newspaper, query: favorites.teams.length ? `${favorites.teams[0]} latest news` : "sports news today", color: "text-purple-400" },
        ].map(({ label, icon: Icon, query: q, color }) => (
          <Button
            key={label}
            variant="outline"
            className="h-auto py-3 flex flex-col gap-1.5 hover:bg-white/[0.04]"
            onClick={() => { setQuery(q); askSports(q); }}
            disabled={asking}
          >
            <Icon className={cn("h-5 w-5", color)} />
            <span className="text-xs">{label}</span>
          </Button>
        ))}
      </div>

      {/* Ask Sports Agent */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            Ask Sports Agent
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Ask about scores, standings, stats, predictions..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !asking && askSports(query)}
            />
            <Button onClick={() => askSports(query)} disabled={asking || !query.trim()}>
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
            </Button>
          </div>

          {response && (
            <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.06] p-4">
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{response}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
