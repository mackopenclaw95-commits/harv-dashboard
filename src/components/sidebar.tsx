"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Bot,
  Brain,
  BarChart3,
  Settings,
  Zap,
  Activity,
  FileText,
  LayoutDashboard,
  FolderOpen,
  FolderKanban,
  Users2,
  Calendar,
  CreditCard,
  Shield,
  ChevronDown,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/components/auth-provider";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/team", label: "Meet the Team", icon: Users2 },
  { href: "/crons", label: "Automations", icon: Zap },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/documents", label: "Files", icon: FolderOpen },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/journal", label: "Journal", icon: FileText },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

const ADMIN_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const [isKachow, setIsKachow] = useState(false);
  const [adminOpen, setAdminOpen] = useState(() => {
    // Auto-open if already on an admin page
    return pathname?.startsWith("/admin") || pathname?.startsWith("/analytics") || false;
  });

  // Hide sidebar on auth pages
  if (pathname?.startsWith("/auth")) return null;

  useEffect(() => {
    // Check on mount
    setIsKachow(document.documentElement.classList.contains("kachow"));
    // Listen for changes
    function handleChange(e: Event) {
      setIsKachow((e as CustomEvent).detail === "cars1");
    }
    window.addEventListener("personality-change", handleChange);
    // Also poll briefly for initial load
    const timer = setTimeout(() => {
      setIsKachow(document.documentElement.classList.contains("kachow"));
    }, 2000);
    return () => { window.removeEventListener("personality-change", handleChange); clearTimeout(timer); };
  }, []);

  return (
    <aside data-tour="sidebar" className="flex h-full w-16 flex-col items-center border-r bg-background py-4 md:w-56">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-4">
        <Zap className="h-6 w-6 text-primary" />
        <span className="hidden text-lg font-bold md:inline">Harv</span>
      </Link>

      <ScrollArea className="flex flex-1 flex-col w-full">
        <nav className="flex flex-col gap-1 px-2 w-full">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : href === "/agents"
                  ? pathname === "/agents"
                  : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-tour={href === "/" ? "dashboard" : href.slice(1)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}

          {/* Admin section — owner/admin only */}
          {isAdmin && (
            <>
              <div className="mx-3 my-2 border-t border-white/[0.06]" />
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname.startsWith("/admin") || pathname.startsWith("/analytics")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Shield className="h-5 w-5 shrink-0" />
                <span className="hidden md:inline flex-1 text-left">Admin Hub</span>
                <ChevronDown className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-200 hidden md:block",
                  adminOpen && "rotate-180"
                )} />
              </button>
              {adminOpen && (
                <div className="flex flex-col gap-0.5 ml-4 md:ml-6">
                  {ADMIN_ITEMS.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="hidden md:inline">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </nav>
      </ScrollArea>

      <div className="hidden px-4 text-xs text-muted-foreground md:block">
        {isKachow ? (
          <span className="flex items-center gap-1.5">
            <span>🏎️</span>
            <span className="text-primary font-semibold">Ka-chow Mode</span>
          </span>
        ) : (
          "Harv AI v1.0"
        )}
      </div>
    </aside>
  );
}
