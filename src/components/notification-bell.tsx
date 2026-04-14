"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "./notification-store";
import { AGENT_ICONS } from "@/lib/agent-data";
import { Bot } from "lucide-react";

function timeAgoShort(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function actionIcon(action: string) {
  switch (action) {
    case "health_alert": return "🔴";
    case "auto_repair": return "🔧";
    case "heartbeat": return "💚";
    case "task_completed": return "✅";
    default: return "📡";
  }
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open && unreadCount > 0) markAllRead(); }}
        className={cn(
          "flex items-center justify-center rounded-lg p-2.5 transition-colors",
          open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 md:left-auto md:bottom-auto md:top-full md:mt-2 md:right-0 z-50 w-[320px] rounded-2xl border border-white/[0.08] bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40 animate-in fade-in slide-in-from-bottom-2 md:slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-semibold">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/50">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = AGENT_ICONS[n.agent] || Bot;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group",
                      !n.read && "bg-primary/[0.03]"
                    )}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] mt-0.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px]">{actionIcon(n.action)}</span>
                        <span className="text-xs font-medium">{n.agent}</span>
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-2">
                        {n.summary?.slice(0, 120)}
                      </p>
                      <span className="text-[10px] text-muted-foreground/40 mt-0.5 block">
                        {timeAgoShort(n.timestamp)}
                      </span>
                    </div>
                    <button
                      onClick={() => dismiss(n.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.06] transition-all shrink-0"
                    >
                      <X className="h-3 w-3 text-muted-foreground/40" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
