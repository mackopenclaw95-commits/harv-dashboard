"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Brain,
  Search,
  Clock,
  Database,
  MessageSquare,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  Layers,
  Hash,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import {
  getRecentConversations,
  getConversationMessages,
  searchMessages,
  getChatStats,
  type Conversation,
  type ChatMessage,
} from "@/lib/supabase-chat";
import {
  searchMemoryEntries,
  getMemoryStats,
  type MemoryEntry,
} from "@/lib/supabase-memory";

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<number>(0);

  // Chat history state
  const [conversations, setConversations] = useState<
    (Conversation & { message_count: number; last_message?: string })[]
  >([]);
  const [expandedConv, setExpandedConv] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<ChatMessage[]>([]);
  const [chatSearchResults, setChatSearchResults] = useState<
    (ChatMessage & { conversation: Conversation })[] | null
  >(null);
  const [chatStats, setChatStats] = useState({
    total_conversations: 0,
    total_messages: 0,
  });

  // Memory state
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [memoryStats, setMemoryStats] = useState({
    total_entries: 0,
    agents: [] as string[],
  });

  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const [convs, cStats, mStats, mEntries] = await Promise.all([
          getRecentConversations(50),
          getChatStats(),
          getMemoryStats(),
          searchMemoryEntries(undefined, 20),
        ]);
        setConversations(convs);
        setChatStats(cStats);
        setMemoryStats(mStats);
        setMemoryEntries(mEntries);
      } catch (err) {
        console.error("Failed to load memory data:", err);
        toast.error("Failed to load memory data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Expand a conversation to see messages
  async function toggleConversation(convId: string) {
    if (expandedConv === convId) {
      setExpandedConv(null);
      setExpandedMessages([]);
      return;
    }
    setExpandedConv(convId);
    try {
      const msgs = await getConversationMessages(convId);
      setExpandedMessages(msgs);
    } catch {
      setExpandedMessages([]);
      toast.error("Failed to load conversation messages");
    }
  }

  // Search handler
  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;
      setSearching(true);
      try {
        if (activeTab === 0) {
          const results = await searchMessages(query);
          setChatSearchResults(results);
        } else {
          const results = await searchMemoryEntries(query, 30);
          setMemoryEntries(results);
        }
      } catch {
        toast.error("Search failed — please try again");
      } finally {
        setSearching(false);
      }
    },
    [query, activeTab]
  );

  // Filter by agent
  async function filterByAgent(agent: string | null) {
    setAgentFilter(agent);
    setSearching(true);
    try {
      if (agent) {
        const { getMemoryByAgent } = await import("@/lib/supabase-memory");
        const results = await getMemoryByAgent(agent, 30);
        setMemoryEntries(results);
      } else {
        const results = await searchMemoryEntries(undefined, 20);
        setMemoryEntries(results);
      }
    } catch {
      toast.error("Failed to filter entries");
    } finally {
      setSearching(false);
    }
  }

  // Clear search
  function clearSearch() {
    setQuery("");
    setChatSearchResults(null);
    setAgentFilter(null);
    // Reload default memory entries
    searchMemoryEntries(undefined, 20).then(setMemoryEntries).catch(() => {});
  }

  const isSearching = query.trim().length > 0 && chatSearchResults !== null;

  return (
    <div className="flex flex-col p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
              <p className="text-sm text-muted-foreground">
                Supabase-powered memory &mdash;{" "}
                {chatStats.total_messages} messages, {memoryStats.total_entries}{" "}
                knowledge entries
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              activeTab === 0
                ? "Search chat history..."
                : "Search knowledge base..."
            }
            className="pl-10"
          />
        </div>
        {query && (
          <Button type="button" variant="outline" onClick={clearSearch}>
            Clear
          </Button>
        )}
        <Button type="submit" disabled={searching} variant="outline">
          {searching ? "Searching..." : "Search"}
        </Button>
      </form>

      {/* Tabs */}
      <Tabs
        defaultValue={0}
        onValueChange={(val) => {
          setActiveTab(val as number);
          clearSearch();
        }}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="bg-card/50 backdrop-blur-xl ring-1 ring-white/[0.06] mb-4">
          <TabsTrigger value={0} className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Chat History
            <Badge
              variant="outline"
              className="ml-1 text-[10px] px-1.5 py-0 bg-sky-500/10 text-sky-400 border-sky-500/20"
            >
              {chatStats.total_conversations}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value={1} className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Knowledge Base
            <Badge
              variant="outline"
              className="ml-1 text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-400 border-violet-500/20"
            >
              {memoryStats.total_entries}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Chat History Tab ── */}
        <TabsContent value={0} className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <LoadingState />
          ) : isSearching ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                {chatSearchResults!.length} results for &ldquo;{query}&rdquo;
              </p>
              {chatSearchResults!.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No messages matching &ldquo;{query}&rdquo;</p>
                </div>
              )}
              {chatSearchResults!.map((msg) => (
                <Card key={msg.id} size="sm">
                  <CardContent className="pt-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          msg.role === "user"
                            ? "bg-foreground/8"
                            : "bg-primary/10"
                        )}
                      >
                        {msg.role === "user" ? (
                          <User className="h-3.5 w-3.5 text-foreground/70" />
                        ) : (
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-sky-500/10 text-sky-400 border-sky-500/20"
                          >
                            {msg.conversation.agent_name}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDate(msg.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet"
              description="Start chatting with Harv or any agent — conversations will appear here"
            />
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => {
                const isExpanded = expandedConv === conv.id;
                return (
                  <div key={conv.id}>
                    <button
                      onClick={() => toggleConversation(conv.id)}
                      className="w-full text-left"
                    >
                      <Card
                        size="sm"
                        className={cn(
                          "cursor-pointer transition-all duration-200",
                          isExpanded && "ring-primary/20"
                        )}
                      >
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
                              <Bot className="h-4 w-4 text-sky-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {conv.agent_name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {conv.message_count} msgs
                                </Badge>
                              </div>
                              {conv.last_message && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-lg">
                                  {conv.last_message}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {timeAgo(conv.updated_at)}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground/50" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </button>

                    {/* Expanded conversation messages */}
                    {isExpanded && (
                      <div className="ml-6 mt-1 mb-3 space-y-1.5 border-l-2 border-white/[0.06] pl-4">
                        {expandedMessages.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            Loading messages...
                          </p>
                        ) : (
                          expandedMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className="flex items-start gap-2.5 py-1.5"
                            >
                              <div
                                className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md mt-0.5",
                                  msg.role === "user"
                                    ? "bg-foreground/8"
                                    : "bg-primary/10"
                                )}
                              >
                                {msg.role === "user" ? (
                                  <User className="h-3 w-3 text-foreground/70" />
                                ) : (
                                  <Bot className="h-3 w-3 text-primary" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                  {msg.content}
                                </p>
                                <time className="text-[10px] text-muted-foreground/50 mt-0.5 block">
                                  {formatDate(msg.created_at)}
                                </time>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Knowledge Base Tab ── */}
        <TabsContent value={1} className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <LoadingState />
          ) : memoryEntries.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Knowledge base empty"
              description="When Harv processes conversations, knowledge entries will be stored here for semantic search"
            />
          ) : (
            <div className="space-y-2">
              {/* Agent filter badges */}
              {memoryStats.agents.length > 0 && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] cursor-pointer transition-colors",
                      agentFilter === null
                        ? "bg-primary/15 text-primary border-primary/30 ring-1 ring-primary/20"
                        : "bg-white/[0.04] text-muted-foreground border-white/[0.08] hover:bg-white/[0.08]"
                    )}
                    onClick={() => filterByAgent(null)}
                  >
                    All
                  </Badge>
                  {memoryStats.agents.map((agent) => (
                    <Badge
                      key={agent}
                      variant="outline"
                      className={cn(
                        "text-[10px] cursor-pointer transition-colors",
                        agentFilter === agent
                          ? "bg-violet-500/20 text-violet-300 border-violet-500/40 ring-1 ring-violet-500/20"
                          : "bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20"
                      )}
                      onClick={() => filterByAgent(agent)}
                    >
                      {agent}
                    </Badge>
                  ))}
                </div>
              )}

              {memoryEntries.map((entry) => (
                <Card key={entry.id} size="sm">
                  <CardHeader className="pb-1">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground/50" />
                        {entry.agent_name || "System"}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {entry.similarity !== undefined && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          >
                            {(entry.similarity * 100).toFixed(0)}% match
                          </Badge>
                        )}
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {timeAgo(entry.created_at)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {entry.content}
                    </p>
                    {entry.metadata &&
                      Object.keys(entry.metadata).length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {Object.entries(entry.metadata).map(([key, val]) => (
                            <Badge
                              key={key}
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 bg-white/[0.03] border-white/[0.06]"
                            >
                              {key}: {String(val)}
                            </Badge>
                          ))}
                        </div>
                      )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Search className="h-4 w-4 animate-pulse" />
        <p className="text-sm">Loading memory...</p>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 ring-1 ring-primary/10 mb-4">
        <Icon className="h-8 w-8 text-primary/30" />
      </div>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
        {description}
      </p>
    </div>
  );
}
