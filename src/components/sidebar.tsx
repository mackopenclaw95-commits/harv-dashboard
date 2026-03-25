"use client";

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
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-16 flex-col items-center border-r bg-background py-4 md:w-56">
      <Link href="/" className="mb-8 flex items-center gap-2 px-4">
        <Zap className="h-6 w-6 text-primary" />
        <span className="hidden text-lg font-bold md:inline">Harv</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-2 w-full">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
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
      </nav>

      <div className="hidden px-4 text-xs text-muted-foreground md:block">
        Harv AI v1.0
      </div>
    </aside>
  );
}
