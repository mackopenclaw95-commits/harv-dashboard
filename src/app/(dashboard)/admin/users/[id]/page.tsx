"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  User,
  MessageSquare,
  FileText,
  FolderKanban,
  CreditCard,
  Clock,
  Shield,
  Ban,
  Play,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import type { Profile } from "@/components/auth-provider";

interface UserConversation {
  id: string;
  title: string | null;
  agent_name: string;
  status: string;
  updated_at: string;
  messages: { count: number }[];
}

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<UserConversation[]>([]);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [usage, setUsage] = useState<{ today: number; total: number; totalTokens: number; totalCost: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/users/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.profile) setProfile(data.profile);
          if (data.conversations) setConversations(data.conversations);
          if (data.documents) setDocuments(data.documents);
          if (data.projects) setProjects(data.projects);
          if (data.usage) setUsage(data.usage);
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [id]);

  async function toggleUserStatus(action: "ban" | "activate") {
    try {
      const res = await fetch(`/api/admin/users/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile((p) => (p ? { ...p, plan_status: data.status } : p));
        toast.success(action === "ban" ? "User suspended" : "User activated");
      }
    } catch {
      toast.error("Action failed");
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  const trialDaysLeft = profile.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {(profile.name || profile.email || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{profile.name || "Unnamed"}</h1>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  profile.plan === "pro" && "text-primary border-primary/30",
                  profile.plan === "max" && "text-yellow-400 border-yellow-500/30"
                )}
              >
                {profile.plan}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  profile.plan_status === "active" && "text-green-400 border-green-500/30",
                  profile.plan_status === "trial" && "text-yellow-400 border-yellow-500/30",
                  profile.plan_status === "cancelled" && "text-red-400 border-red-500/30"
                )}
              >
                {profile.plan_status === "trial"
                  ? `Trial · ${trialDaysLeft}d left`
                  : profile.plan_status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {profile.plan_status !== "cancelled" ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => toggleUserStatus("ban")}
            >
              <Ban className="h-3.5 w-3.5" />
              Suspend
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
              onClick={() => toggleUserStatus("activate")}
            >
              <Play className="h-3.5 w-3.5" />
              Activate
            </Button>
          )}
        </div>
      </div>

      {/* User details card */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Joined</p>
              <p className="font-medium mt-0.5">{timeAgo(profile.created_at)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Role</p>
              <p className="font-medium mt-0.5">{profile.role}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stripe ID</p>
              <p className="font-mono text-xs mt-0.5 truncate">
                {profile.stripe_customer_id || "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Onboarded</p>
              <p className="font-medium mt-0.5">{profile.onboarded ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Promo</p>
              <p className="font-medium mt-0.5">{profile.promo_code || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage stats */}
      {usage && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Today</p>
                <p className="text-xl font-bold mt-0.5">{usage.today} <span className="text-xs font-normal text-muted-foreground">msgs</span></p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">All Time</p>
                <p className="text-xl font-bold mt-0.5">{usage.total} <span className="text-xs font-normal text-muted-foreground">msgs</span></p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens Used</p>
                <p className="text-xl font-bold mt-0.5">{usage.totalTokens.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">API Cost</p>
                <p className="text-xl font-bold mt-0.5">${usage.totalCost.toFixed(4)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Conversations ({conversations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <div className="space-y-1">
                {conversations.map((c) => (
                  <div key={c.id} className="px-2 py-1.5 rounded-lg hover:bg-white/[0.03] text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate flex-1">
                        {c.title || "Untitled"}
                      </span>
                      <Badge variant="outline" className="text-[9px] shrink-0">
                        {c.agent_name}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {c.messages?.[0]?.count || 0} msgs · {timeAgo(c.updated_at)}
                    </p>
                  </div>
                ))}
                {conversations.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center py-4">None</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              Files ({documents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <div className="space-y-1">
                {documents.map((d) => (
                  <div key={String(d.id)} className="px-2 py-1.5 rounded-lg hover:bg-white/[0.03] text-xs">
                    <span className="font-medium truncate block">{String(d.filename)}</span>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {String(d.file_type)} · {timeAgo(String(d.created_at))}
                    </p>
                  </div>
                ))}
                {documents.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center py-4">None</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Projects */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-yellow-400" />
              Projects ({projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <div className="space-y-1">
                {projects.map((p) => (
                  <div key={String(p.id)} className="px-2 py-1.5 rounded-lg hover:bg-white/[0.03] text-xs">
                    <span className="font-medium truncate block">{String(p.name)}</span>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {timeAgo(String(p.updated_at))}
                    </p>
                  </div>
                ))}
                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center py-4">None</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
