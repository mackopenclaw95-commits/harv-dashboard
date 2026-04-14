import {
  Bot, Brain, Shield, Wrench, Dumbbell, DollarSign, TrendingUp, Search,
  Music, Plane, ShoppingCart, Trophy, Megaphone, Mail, Calendar, Video,
  BookOpen, FileText, BarChart3, Database, Image, Activity, PenTool, Heart,
  Film, Scissors, Package, LineChart, PieChart, Zap, ImagePlus,
} from "lucide-react";
import type React from "react";

// ─── Interfaces ─────────────────────────────────────────

export interface LastEvent {
  action: string;
  status: string;
  summary: string;
  timestamp: string;
  cost: number;
  tokens: number;
  duration: number;
}

export interface Agent {
  name: string;
  status: string;
  model: string;
  type: string;
  tier: string;
  provider: string;
  description: string;
  cost_per_call: number;
  last_event?: LastEvent | null;
}

// ─── Constants ──────────────────────────────────────────

export const AGENT_ICONS: Record<string, React.ElementType> = {
  Harv: Bot,
  Router: Brain,
  Guardian: Shield,
  Medic: Wrench,
  Fitness: Dumbbell,
  Finance: DollarSign,
  Trading: TrendingUp,
  Research: Search,
  Music: Music,
  Travel: Plane,
  Shopping: ShoppingCart,
  Sports: Trophy,
  "Marketing": Megaphone,
  Email: Mail,
  Scheduler: Calendar,
  "Video Digest": Video,
  "YouTube Digest": Video,
  "TikTok Digest": Video,
  "Twitter Digest": Video,
  Learning: BookOpen,
  Journal: FileText,
  Analytics: BarChart3,
  Memory: Database,
  Ledger: FileText,
  Drive: Database,
  "Image Gen": Image,
  Heartbeat: Heart,
  Postman: Mail,
  "Media Manager": Film,
  "Video Gen": Film,
  "Video Editor": Scissors,
  "Image Editor": ImagePlus,
  "Product Research": Package,
  "Market Research": LineChart,
  "Data Viz": PieChart,
  "Automation Builder": Zap,
};

export const SUB_AGENT_MAP: Record<string, string[]> = {
  "Video Digest": ["YouTube Digest", "TikTok Digest", "Twitter Digest"],
  "Media Manager": ["Image Gen", "Image Editor", "Video Gen", "Video Editor"],
  Research: ["Product Research", "Market Research", "Data Viz"],
};

// The 9 core agents shown in Cost by Agent on Analytics
export const CORE_AGENTS = new Set([
  "Harv", "Router", "Journal", "Scheduler", "Email",
  "Learning", "Research", "Video Digest", "Media Manager",
]);

export const COMING_SOON_PERSONAL = new Set([
  "Fitness", "Shopping",
]);

export const COMING_SOON_BUSINESS = new Set<string>([
]);

export const COMING_SOON_AGENTS = new Set([
  ...COMING_SOON_PERSONAL, ...COMING_SOON_BUSINESS,
]);

export const PLANNED_AGENT_NAMES = new Set([
  "Data Viz",
]);

export const NO_CHAT_AGENTS = new Set([
  "Router",
  // Tools
  "Drive", "Ledger",
  // Background
  "Heartbeat", "Guardian", "Medic",
  // Coming soon + planned
  ...COMING_SOON_AGENTS,
  ...PLANNED_AGENT_NAMES,
]);

export interface PlannedAgentMeta {
  agent: Agent;
  capabilities: string[];
  eta: string;
  parent?: string;
}

export const PLANNED_AGENTS: Agent[] = [
  { name: "TikTok Digest", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "TikTok video digest, transcription, and implementation guide", cost_per_call: 0.001 },
  { name: "Twitter Digest", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Twitter/X thread summarization and implementation guide", cost_per_call: 0.001 },
  { name: "Media Manager", status: "LIVE", model: "orchestrator", type: "agent", tier: "AGENTS", provider: "keyword-router", description: "Media orchestrator — routes to Image Gen, Video Gen, and Video Editor", cost_per_call: 0 },
  { name: "Video Gen", status: "LIVE", model: "bytedance/seedance-1-5-pro", type: "agent", tier: "AGENTS", provider: "openrouter", description: "AI video generation from text prompts (Seedance 1.5 Pro)", cost_per_call: 0.005 },
  { name: "Video Editor", status: "LIVE", model: "ffmpeg+deepseek", type: "agent", tier: "AGENTS", provider: "local+openrouter", description: "Video editing — trim, resize, crop, speed, rotate, subtitles, convert", cost_per_call: 0 },
  { name: "Image Editor", status: "LIVE", model: "pillow+deepseek", type: "agent", tier: "AGENTS", provider: "local+openrouter", description: "Image editing — resize, crop, rotate, filters, text overlay, convert", cost_per_call: 0 },
  { name: "Finance", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Personal finance — spending tracking, budgets, analysis, financial advice", cost_per_call: 0.001 },
  { name: "Travel", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Trip planning, flights, hotels, itineraries, destination guides", cost_per_call: 0.001 },
  { name: "Sports", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Scores, standings, game recaps, predictions, fantasy advice", cost_per_call: 0.001 },
  { name: "Music", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Music discovery, playlist curation, artist info, recommendations", cost_per_call: 0.001 },
  { name: "Product Research", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Product comparisons, reviews, and purchase recommendations", cost_per_call: 0.001 },
  { name: "Market Research", status: "LIVE", model: "deepseek/deepseek-chat-v3-0324", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Competitor analysis, industry trends, market sizing", cost_per_call: 0.001 },
  { name: "Data Viz", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Charts, graphs, and visual data reports from raw data", cost_per_call: 0 },
  { name: "Fitness", status: "COMING_SOON", model: "tbd", type: "personal", tier: "AGENTS", provider: "tbd", description: "Fitness tracking with Garmin Connect integration", cost_per_call: 0 },
  { name: "Shopping", status: "COMING_SOON", model: "tbd", type: "personal", tier: "AGENTS", provider: "tbd", description: "Shopping lists, product research, and purchase tracking", cost_per_call: 0 },
];

export const PLANNED_AGENTS_META: PlannedAgentMeta[] = [
  {
    agent: PLANNED_AGENTS.find((a) => a.name === "Data Viz")!,
    capabilities: ["Auto-generate charts from data", "Interactive dashboard creation", "Export to image/PDF"],
    eta: "Q4 2026",
    parent: "Research",
  },
];

// ─── Helpers ────────────────────────────────────────────

export function statusColor(status: string) {
  switch (status.toUpperCase()) {
    case "LIVE": case "ACTIVE": case "RUNNING":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "IDLE":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "ERROR":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "PLANNED":
      return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function typeColor(type: string) {
  switch (type) {
    case "agent": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "tool": return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "background": return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export function statusDotColor(status: string) {
  switch (status.toUpperCase()) {
    case "LIVE": case "ACTIVE": case "RUNNING": return "bg-emerald-500";
    case "IDLE": return "bg-amber-500";
    case "ERROR": return "bg-red-500";
    case "PLANNED": return "bg-slate-500";
    default: return "bg-muted-foreground";
  }
}

export function typeRingColor(type: string) {
  switch (type) {
    case "agent": return "ring-blue-500/30";
    case "tool": return "ring-purple-500/30";
    case "background": return "ring-orange-500/30";
    default: return "ring-slate-500/30";
  }
}

export function typeEdgeColor(type: string) {
  switch (type) {
    case "agent": return "rgba(59, 130, 246, 0.4)";
    case "tool": return "rgba(168, 85, 247, 0.4)";
    case "background": return "rgba(249, 115, 22, 0.4)";
    default: return "rgba(100, 116, 139, 0.3)";
  }
}
