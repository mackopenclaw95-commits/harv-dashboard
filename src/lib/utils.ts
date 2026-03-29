import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(ts: string): string {
  if (!ts) return "";
  const now = Date.now();
  // Strip timezone abbreviation first — backend says "EST" but means local time
  const stripped = ts.replace(/\s+[A-Z]{2,5}$/, "");
  let then = new Date(stripped).getTime();
  if (isNaN(then)) {
    then = new Date(ts).getTime();
  }
  if (isNaN(then)) {
    // ISO-ish fallback
    const bare = ts.replace(" ", "T");
    then = new Date(bare).getTime();
    if (isNaN(then)) then = new Date(bare + "Z").getTime();
  }
  if (isNaN(then)) return ts;
  const diff = Math.floor((now - then) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
