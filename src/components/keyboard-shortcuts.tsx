"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Esc — close any open Sheet/dialog
      if (e.key === "Escape") {
        const closeBtn = document.querySelector(
          '[data-radix-collection-item][aria-label="Close"],' +
          'button[class*="SheetClose"],' +
          '[role="dialog"] button[class*="close"]'
        ) as HTMLButtonElement | null;
        if (closeBtn) {
          closeBtn.click();
          e.preventDefault();
          return;
        }
      }

      // Skip other shortcuts when typing in inputs
      if (isInput) return;

      // Ctrl+N / Cmd+N — New chat
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        router.push("/chat");
      }

      // Ctrl+K / Cmd+K — Focus search (open drawer + focus search input)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        // Try to find and focus search in conversation sidebar
        const searchInput = document.querySelector(
          'input[placeholder*="Search conversations"]'
        ) as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
        } else {
          // If drawer isn't open, try to open it first
          const drawerTrigger = document.querySelector(
            '[data-sidebar-trigger], button[aria-label*="sidebar"]'
          ) as HTMLButtonElement | null;
          drawerTrigger?.click();
          setTimeout(() => {
            const input = document.querySelector(
              'input[placeholder*="Search conversations"]'
            ) as HTMLInputElement | null;
            input?.focus();
          }, 300);
        }
      }

      // Ctrl+Shift+P / Cmd+Shift+P — Go to projects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        router.push("/projects");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return null;
}
