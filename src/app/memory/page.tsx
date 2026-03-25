"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, Search, Clock } from "lucide-react";

interface MemoryEntry {
  id: string;
  content: string;
  metadata?: Record<string, string>;
  timestamp?: string;
  distance?: number;
}

interface MemoryStats {
  total_entries: number;
  collection_name: string;
  last_updated?: string;
}

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryEntry[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/proxy?path=/api/memory/dashboard");
        const data = await res.json();
        setStats(data.stats || data);
      } catch {
        setStats({ total_entries: 0, collection_name: "harv_sessions" });
      }
    }
    loadStats();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/proxy?path=/api/memory/search?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Memory</h1>
            <p className="text-sm text-muted-foreground">
              ChromaDB vector store — {stats?.total_entries || 0} entries in{" "}
              {stats?.collection_name || "harv_sessions"}
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memory... (e.g., 'what did we discuss about trading')"
            className="pl-10"
          />
        </div>
      </form>

      <ScrollArea className="flex-1">
        <div className="space-y-3">
          {loading && (
            <p className="text-center text-muted-foreground">Searching...</p>
          )}

          {!loading && results.length === 0 && query && (
            <p className="text-center text-muted-foreground">
              No results found for &quot;{query}&quot;
            </p>
          )}

          {results.map((entry, i) => (
            <Card key={entry.id || i}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {entry.metadata?.session_id || `Entry ${i + 1}`}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {entry.distance !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        {(1 - entry.distance).toFixed(2)} match
                      </Badge>
                    )}
                    {entry.timestamp && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {entry.timestamp}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {entry.content}
                </p>
              </CardContent>
            </Card>
          ))}

          {!loading && results.length === 0 && !query && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <Brain className="mb-4 h-12 w-12 opacity-20" />
              <p>Search Harv&apos;s memory</p>
              <p className="text-sm">
                Type a query above to find relevant conversations and context
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
