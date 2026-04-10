import type { Conversation } from "./supabase-chat";

export interface ConversationWithMeta extends Conversation {
  message_count: number;
  last_message?: string;
}

export interface GroupedConversations {
  today: ConversationWithMeta[];
  yesterday: ConversationWithMeta[];
  thisWeek: ConversationWithMeta[];
  thisMonth: ConversationWithMeta[];
  older: ConversationWithMeta[];
}

export function groupConversationsByTime(
  conversations: ConversationWithMeta[]
): GroupedConversations {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - 7);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: GroupedConversations = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  for (const conv of conversations) {
    const date = new Date(conv.updated_at);
    if (date >= startOfToday) {
      groups.today.push(conv);
    } else if (date >= startOfYesterday) {
      groups.yesterday.push(conv);
    } else if (date >= startOfThisWeek) {
      groups.thisWeek.push(conv);
    } else if (date >= startOfThisMonth) {
      groups.thisMonth.push(conv);
    } else {
      groups.older.push(conv);
    }
  }

  return groups;
}

const PLATFORM_TAGS: Record<string, string> = {
  "[dc]": "Discord",
  "[tg]": "Telegram",
  "[dash]": "Dashboard",
  "[api]": "API",
};

export function getConversationDisplayTitle(conv: ConversationWithMeta): string {
  let title = conv.title || conv.last_message?.slice(0, 60) || "New conversation";
  // Strip platform tags from display title
  for (const tag of Object.keys(PLATFORM_TAGS)) {
    title = title.replace(tag + " ", "").replace(tag, "");
  }
  return title.trim() || "New conversation";
}

export function getConversationPlatform(conv: ConversationWithMeta): string | null {
  if (!conv.title) return null;
  for (const [tag, label] of Object.entries(PLATFORM_TAGS)) {
    if (conv.title.startsWith(tag)) return label;
  }
  return null;
}

export function formatTimeGroupLabel(group: keyof GroupedConversations): string {
  switch (group) {
    case "today": return "Today";
    case "yesterday": return "Yesterday";
    case "thisWeek": return "This Week";
    case "thisMonth": return "This Month";
    case "older": return "Older";
  }
}
