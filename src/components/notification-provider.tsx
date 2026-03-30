"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const POLL_INTERVAL = 60_000; // 60 seconds
const NOTIFY_ACTIONS = new Set([
  "health_alert",
  "auto_repair",
  "task_completed",
  "heartbeat",
]);

interface EventItem {
  id: number;
  agent: string;
  action: string;
  status: string;
  summary: string;
  timestamp: string;
}

export function NotificationProvider() {
  const lastSeenId = useRef<number>(0);
  const initialized = useRef(false);

  useEffect(() => {
    async function pollEvents() {
      try {
        const res = await fetch(
          "/api/proxy?path=" +
            encodeURIComponent("/api/events/recent?limit=5")
        );
        if (!res.ok) return;
        const events: EventItem[] = await res.json();
        if (!events || events.length === 0) return;

        // On first load, just record the latest ID without notifying
        if (!initialized.current) {
          initialized.current = true;
          lastSeenId.current = Math.max(...events.map((e) => e.id));
          return;
        }

        // Show toasts for new events since last check
        const newEvents = events
          .filter(
            (e) =>
              e.id > lastSeenId.current && NOTIFY_ACTIONS.has(e.action)
          )
          .reverse(); // oldest first

        for (const evt of newEvents) {
          const icon =
            evt.action === "health_alert"
              ? "🔴"
              : evt.action === "auto_repair"
                ? "🔧"
                : evt.action === "heartbeat"
                  ? "💚"
                  : "✅";

          if (evt.status === "error" || evt.action === "health_alert") {
            toast.error(`${icon} ${evt.agent}: ${evt.summary?.slice(0, 100)}`);
          } else {
            toast.success(
              `${icon} ${evt.agent}: ${evt.summary?.slice(0, 100)}`
            );
          }
        }

        if (events.length > 0) {
          lastSeenId.current = Math.max(
            lastSeenId.current,
            ...events.map((e) => e.id)
          );
        }
      } catch {
        // Silent — notification polling should never break the app
      }
    }

    // Initial poll (just records latest ID)
    pollEvents();

    const interval = setInterval(pollEvents, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return null;
}
