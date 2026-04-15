"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface Notification {
  id: number | string;
  agent: string;
  action: string;
  status: string;
  summary: string;
  timestamp: string;
  read: boolean;
  href?: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  supportUnreadCount: number;
  markAllRead: () => void;
  markRead: (id: number | string) => void;
  dismiss: (id: number | string) => void;
  refreshSupport: () => void;
}

const NotificationContext = createContext<NotificationState>({
  notifications: [],
  unreadCount: 0,
  supportUnreadCount: 0,
  markAllRead: () => {},
  markRead: () => {},
  dismiss: () => {},
  refreshSupport: () => {},
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

type SupportUnreadTicket = { id: string; subject: string; admin_response: string; updated_at: string };

export function NotificationStore({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const lastSeenId = useRef(0);
  const initialized = useRef(false);
  const pollSupportRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/proxy?path=" + encodeURIComponent("/api/events/recent?limit=10"));
        if (!res.ok) return;
        const events = await res.json();
        if (!Array.isArray(events) || events.length === 0) return;

        if (!initialized.current) {
          initialized.current = true;
          lastSeenId.current = Math.max(...events.map((e: { id: number }) => e.id));
          // Seed with recent events (marked as read)
          const seed = events
            .filter((e: Notification) => NOTIFY_ACTIONS.has(e.action))
            .slice(0, 10)
            .map((e: Notification) => ({ ...e, read: true }));
          setNotifications(seed);
          return;
        }

        const newEvents = events
          .filter((e: { id: number; action: string }) => e.id > lastSeenId.current && NOTIFY_ACTIONS.has(e.action))
          .map((e: Notification) => ({ ...e, read: false }));

        if (newEvents.length > 0) {
          setNotifications((prev) => [...newEvents.reverse(), ...prev].slice(0, MAX_NOTIFICATIONS));
          lastSeenId.current = Math.max(lastSeenId.current, ...events.map((e: { id: number }) => e.id));
        }
      } catch { /* silent */ }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Poll support responses separately
  useEffect(() => {
    async function pollSupport() {
      try {
        const res = await fetch("/api/support/unread");
        if (!res.ok) {
          if (res.status === 401) {
            setSupportUnreadCount(0);
          }
          return;
        }
        const data = await res.json();
        const tickets: SupportUnreadTicket[] = data.tickets || [];
        setSupportUnreadCount(tickets.length);

        // Merge support tickets into the notification list as synthetic entries.
        // Keyed by `support-${ticket.id}` so we don't duplicate.
        setNotifications((prev) => {
          const withoutSupport = prev.filter((n) => !String(n.id).startsWith("support-"));
          const synthetic: Notification[] = tickets.map((t) => ({
            id: `support-${t.id}`,
            agent: "Support",
            action: "support_response",
            status: "info",
            summary: `Response to: ${t.subject}`,
            timestamp: t.updated_at,
            read: false,
            href: "/support",
          }));
          return [...synthetic, ...withoutSupport].slice(0, MAX_NOTIFICATIONS);
        });
      } catch { /* silent */ }
    }
    pollSupportRef.current = pollSupport;

    pollSupport();
    const interval = setInterval(pollSupport, POLL_INTERVAL);
    function handleExternal() { pollSupport(); }
    window.addEventListener("support-ticket-updated", handleExternal);
    window.addEventListener("support-unread-refresh", handleExternal);
    return () => {
      clearInterval(interval);
      window.removeEventListener("support-ticket-updated", handleExternal);
      window.removeEventListener("support-unread-refresh", handleExternal);
    };
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: number | string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const dismiss = useCallback((id: number | string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const refreshSupport = useCallback(() => {
    pollSupportRef.current?.();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext value={{ notifications, unreadCount, supportUnreadCount, markAllRead, markRead, dismiss, refreshSupport }}>
      {children}
    </NotificationContext>
  );
}
