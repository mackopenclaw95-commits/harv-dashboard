"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface Notification {
  id: number;
  agent: string;
  action: string;
  status: string;
  summary: string;
  timestamp: string;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: number) => void;
  dismiss: (id: number) => void;
}

const NotificationContext = createContext<NotificationState>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  markRead: () => {},
  dismiss: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const POLL_INTERVAL = 60_000;
const MAX_NOTIFICATIONS = 30;
const NOTIFY_ACTIONS = new Set([
  "health_alert",
  "auto_repair",
  "task_completed",
  "heartbeat",
  "api_cost",
]);

export function NotificationStore({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const lastSeenId = useRef(0);
  const initialized = useRef(false);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/proxy?path=" + encodeURIComponent("/api/events/recent?limit=10"));
        if (!res.ok) return;
        const events = await res.json();
        if (!Array.isArray(events) || events.length === 0) return;

        if (!initialized.current) {
          initialized.current = true;
          lastSeenId.current = Math.max(...events.map((e: Notification) => e.id));
          // Seed with recent events (marked as read)
          const seed = events
            .filter((e: Notification) => NOTIFY_ACTIONS.has(e.action))
            .slice(0, 10)
            .map((e: Notification) => ({ ...e, read: true }));
          setNotifications(seed);
          return;
        }

        const newEvents = events
          .filter((e: Notification) => e.id > lastSeenId.current && NOTIFY_ACTIONS.has(e.action))
          .map((e: Notification) => ({ ...e, read: false }));

        if (newEvents.length > 0) {
          setNotifications((prev) => [...newEvents.reverse(), ...prev].slice(0, MAX_NOTIFICATIONS));
          lastSeenId.current = Math.max(lastSeenId.current, ...events.map((e: Notification) => e.id));
        }
      } catch { /* silent */ }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: number) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext value={{ notifications, unreadCount, markAllRead, markRead, dismiss }}>
      {children}
    </NotificationContext>
  );
}
