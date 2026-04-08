export const DEFAULT_SIDEBAR_ORDER = [
  "Dashboard", "Chat", "Agents", "Automations", "Calendar", "Files", "Projects",
];

const STORAGE_KEY = "harv-sidebar-order";

export function getSidebarOrder(): string[] {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_ORDER;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_SIDEBAR_ORDER;
    const parsed: string[] = JSON.parse(saved);
    // Ensure all items present (handles additions)
    const set = new Set(parsed);
    for (const item of DEFAULT_SIDEBAR_ORDER) {
      if (!set.has(item)) parsed.push(item);
    }
    // Filter out removed items
    return parsed.filter((item) => DEFAULT_SIDEBAR_ORDER.includes(item));
  } catch {
    return DEFAULT_SIDEBAR_ORDER;
  }
}

export function setSidebarOrder(order: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}
