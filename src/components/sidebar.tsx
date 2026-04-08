"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Shield,
  ChevronDown,
  ChevronUp,
  LogOut,
  User,
  CreditCard,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";

// Core tabs — always visible in sidebar
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/crons", label: "Automations", icon: Zap },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/documents", label: "Files", icon: FolderOpen },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

// Secondary tabs — moved to profile dropdown
const PROFILE_MENU_ITEMS = [
  { href: "/journal", label: "Journal", icon: FileText },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/team", label: "Meet the Team", icon: Users2 },
];

const ADMIN_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export const Sidebar = React.memo(function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, profile, signOut } = useAuth();
  const [isKachow, setIsKachow] = useState(false);
  const [adminOpen, setAdminOpen] = useState(() => {
    return pathname?.startsWith("/admin") || pathname?.startsWith("/analytics") || false;
  });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Hide sidebar on auth pages
  if (pathname?.startsWith("/auth")) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setIsKachow(document.documentElement.classList.contains("kachow"));
    function handleChange(e: Event) {
      setIsKachow((e as CustomEvent).detail === "cars1");
    }
    window.addEventListener("personality-change", handleChange);
    return () => window.removeEventListener("personality-change", handleChange);
  }, []);

  // Close profile menu on outside click
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileMenuOpen]);

  const planName = profile?.plan || "free";
  const userName = profile?.name || profile?.email?.split("@")[0] || "User";
  const userInitial = userName.charAt(0).toUpperCase();

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

      {/* Profile widget — bottom of sidebar */}
      <div className="w-full px-2 relative" ref={profileMenuRef}>
        {/* Profile menu dropdown (opens upward) */}
        {profileMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 rounded-xl bg-popover/95 backdrop-blur-xl border border-white/[0.08] shadow-xl py-1 z-50">
            {/* Secondary nav items */}
            {PROFILE_MENU_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setProfileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-xs font-medium transition-colors mx-1 rounded-lg",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}

            <div className="mx-3 my-1 border-t border-white/[0.06]" />

            {/* Settings & quick actions */}
            <Link
              href="/settings"
              onClick={() => setProfileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors mx-1 rounded-lg"
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Settings</span>
            </Link>
            <button
              onClick={() => { setProfileMenuOpen(false); router.push("/settings?tab=billing"); }}
              className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors w-full mx-1 rounded-lg"
            >
              <CreditCard className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Billing</span>
            </button>
            <button
              onClick={() => { setProfileMenuOpen(false); router.push("/settings?tab=account"); }}
              className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors w-full mx-1 rounded-lg"
            >
              <User className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Account</span>
            </button>

            <div className="mx-3 my-1 border-t border-white/[0.06]" />

            <button
              onClick={() => { setProfileMenuOpen(false); signOut(); }}
              className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors w-full mx-1 rounded-lg"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        )}

        {/* Profile button */}
        <button
          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
            profileMenuOpen
              ? "bg-white/[0.06]"
              : "hover:bg-white/[0.04]"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary ring-1 ring-primary/20">
            {userInitial}
          </div>
          <div className="hidden md:flex flex-1 flex-col items-start min-w-0">
            <span className="text-xs font-medium truncate w-full text-left">{userName}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1.5 py-0 h-4 mt-0.5",
                planName === "pro" && "text-primary border-primary/30 bg-primary/10",
                planName === "max" && "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
                planName === "free" && "text-muted-foreground border-white/[0.1]"
              )}
            >
              {planName}
            </Badge>
          </div>
          <ChevronUp className={cn(
            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 hidden md:block",
            !profileMenuOpen && "rotate-180"
          )} />
        </button>
      </div>
    </aside>
  );
});
