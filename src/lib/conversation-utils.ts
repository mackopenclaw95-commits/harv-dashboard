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

export function getConversationDisplayTitle(conv: ConversationWithMeta): string {
  if (conv.title) return conv.title;
  if (conv.last_message) return conv.last_message.slice(0, 60) + (conv.last_message.length > 60 ? "..." : "");
  return "New conversation";
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
