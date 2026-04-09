import {
  Globe, Code, MessageSquare, Music, Video,
  FileText, LayoutGrid,
} from "lucide-react";
import type React from "react";

// ─── Types ─────────────────────────────────────────────

export type IntegrationStatus = "connected" | "disconnected" | "coming_soon" | "vps_active";
export type IntegrationCategory = "productivity" | "social" | "communication" | "developer";

export interface SetupGuide {
  features: string[];       // what the integration unlocks
  permissions: string[];    // what permissions are required (plain English)
  steps: string[];          // what happens when they click Connect
}

export interface Integration {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  hasAuth: boolean;
  scopes?: string[];
  connectedAt?: string;
  setupGuide?: SetupGuide;
  eta?: string;             // e.g. "Q3 2026" for coming soon
}

// ─── Integration Registry ──────────────────────────────

export const INTEGRATIONS: Integration[] = [
  // Productivity
  {
    id: "google",
    name: "Google",
    icon: Globe,
    description: "Calendar, Gmail, Drive — sync events, send emails, manage files",
    category: "productivity",
    status: "disconnected",
    hasAuth: true,
    scopes: ["Calendar", "Gmail", "Drive"],
    setupGuide: {
      features: [
        "View and manage your Google Calendar events",
        "Harv can schedule meetings and check your availability",
        "Access Gmail for email drafting and sending",
      ],
      permissions: [
        "Read and write access to your Google Calendar",
        "Read and write access to calendar events",
      ],
      steps: [
        "You'll be redirected to Google's sign-in page",
        "Choose which Google account to connect",
        "Review and approve the requested permissions",
        "You'll be redirected back to Harv automatically",
      ],
    },
  },
  {
    id: "notion",
    name: "Notion",
    icon: FileText,
    description: "Sync pages, databases, and notes with Harv",
    category: "productivity",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q3 2026",
    setupGuide: {
      features: [
        "Sync Notion pages and databases with Harv",
        "Create and update notes from chat",
        "Search across your Notion workspace",
      ],
      permissions: ["Read and write access to your Notion workspace"],
      steps: ["Connect via Notion OAuth when available"],
    },
  },
  {
    id: "spotify",
    name: "Spotify",
    icon: Music,
    description: "Control playback, manage playlists, discover music",
    category: "productivity",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q4 2026",
    setupGuide: {
      features: [
        "Control playback — play, pause, skip, queue",
        "Create and manage playlists",
        "Get music recommendations from Harv",
      ],
      permissions: ["Access to your Spotify playback and library"],
      steps: ["Connect via Spotify OAuth when available"],
    },
  },

  // Social
  {
    id: "twitter",
    name: "Twitter / X",
    icon: Globe,
    description: "Automated posting, analytics, and feed monitoring",
    category: "social",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q3 2026",
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: Video,
    description: "Content scheduling, analytics, and trend tracking",
    category: "social",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q4 2026",
  },

  // Communication
  {
    id: "telegram",
    name: "Telegram",
    icon: MessageSquare,
    description: "Chat with Harv directly in Telegram — send commands, get notifications",
    category: "communication",
    status: "disconnected",
    hasAuth: true,
    setupGuide: {
      features: [
        "Chat with Harv directly in Telegram",
        "Receive notifications and alerts",
        "Run commands and get quick answers",
      ],
      permissions: ["Telegram Bot API token (set up on your VPS)"],
      steps: [
        "Create a bot via @BotFather on Telegram",
        "Copy the bot token",
        "Add TELEGRAM_BOT_TOKEN to your VPS .env file",
        "Add your Telegram user ID to TELEGRAM_ALLOWED_IDS",
        "Restart the harv-api service on your VPS",
      ],
    },
  },
  {
    id: "discord",
    name: "Discord",
    icon: MessageSquare,
    description: "Server bots, webhook notifications, and channel alerts",
    category: "communication",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q3 2026",
  },
  {
    id: "slack",
    name: "Slack",
    icon: MessageSquare,
    description: "Workspace messaging, alerts, and slash commands",
    category: "communication",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q4 2026",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: MessageSquare,
    description: "Message Harv via WhatsApp — dedicated number coming soon",
    category: "communication",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q3 2026",
    setupGuide: {
      features: [
        "Chat with Harv via WhatsApp",
        "Forward messages for Harv to process",
        "Get responses and summaries on the go",
      ],
      permissions: ["Twilio account with WhatsApp sandbox or number"],
      steps: [
        "Create a Twilio account and set up a WhatsApp sandbox",
        "Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to your VPS .env",
        "Configure the Twilio webhook URL to point to your VPS",
        "Restart the harv-api service on your VPS",
      ],
    },
  },

  // Developer
  {
    id: "github",
    name: "GitHub",
    icon: Code,
    description: "Repos, issues, PRs — track code and manage projects",
    category: "developer",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q3 2026",
  },
  {
    id: "linear",
    name: "Linear",
    icon: LayoutGrid,
    description: "Issue tracking, project management, and sprint planning",
    category: "developer",
    status: "coming_soon",
    hasAuth: false,
    eta: "Q4 2026",
  },
];

// ─── Helpers ───────────────────────────────────────────

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  productivity: "Productivity",
  social: "Social Media",
  communication: "Communication",
  developer: "Developer Tools",
};

export const CATEGORY_ORDER: IntegrationCategory[] = [
  "productivity", "communication", "social", "developer",
];

export function getIntegrationsByCategory(integrations: Integration[]) {
  const grouped = new Map<IntegrationCategory, Integration[]>();
  for (const cat of CATEGORY_ORDER) {
    const items = integrations.filter((i) => i.category === cat);
    if (items.length > 0) grouped.set(cat, items);
  }
  return grouped;
}

export function getConnectedIntegrations(integrations: Integration[]) {
  return integrations.filter((i) => i.status === "connected" || i.status === "vps_active");
}

export function getAvailableIntegrations(integrations: Integration[]) {
  return integrations.filter((i) => i.status !== "connected" && i.status !== "vps_active");
}
