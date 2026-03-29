import {
  Bot, Brain, Shield, Wrench, Dumbbell, DollarSign, TrendingUp, Search,
  Music, Plane, ShoppingCart, Trophy, Megaphone, Mail, Calendar, Video,
  BookOpen, FileText, BarChart3, Database, Image, Activity, PenTool, Heart,
  Film, Scissors, Package, LineChart, PieChart, Zap,
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
  "Auto Marketing": Megaphone,
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
  "Product Research": Package,
  "Market Research": LineChart,
  "Data Viz": PieChart,
  "Automation Builder": Zap,
};

export const SUB_AGENT_MAP: Record<string, string[]> = {
  "Video Digest": ["YouTube Digest", "TikTok Digest", "Twitter Digest"],
  "Media Manager": ["Image Gen", "Video Gen", "Video Editor"],
  Research: ["Product Research", "Market Research", "Data Viz"],
};

// The 9 core agents shown in Cost by Agent on Analytics
export const CORE_AGENTS = new Set([
  "Harv", "Router", "Journal", "Scheduler", "Email",
  "Learning", "Research", "Video Digest", "Media Manager",
]);

export const COMING_SOON_AGENTS = new Set([
  "Music", "Fitness", "Finance", "Shopping", "Sports", "Trading",
]);

export const PLANNED_AGENT_NAMES = new Set([
  "TikTok Digest", "Twitter Digest", "Video Gen", "Video Editor",
  "Product Research", "Market Research", "Data Viz",
]);

export const NO_CHAT_AGENTS = new Set([
  "Router",
  "Drive", "Ledger",
  "Heartbeat", "Guardian", "Medic",
  ...COMING_SOON_AGENTS,
  ...PLANNED_AGENT_NAMES,
]);

export const PLANNED_AGENTS: Agent[] = [
  { name: "TikTok Digest", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "TikTok video transcription and digest", cost_per_call: 0 },
  { name: "Twitter Digest", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Twitter/X video transcription and digest", cost_per_call: 0 },
  { name: "Media Manager", status: "LIVE", model: "none", type: "agent", tier: "AGENTS", provider: "keyword-router", description: "Media orchestrator — routes to Image Gen, Video Gen, and Video Editor", cost_per_call: 0 },
  { name: "Video Gen", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "AI video generation from text prompts and storyboards", cost_per_call: 0 },
  { name: "Video Editor", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Automated video editing, trimming, and post-production", cost_per_call: 0 },
  { name: "Product Research", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Product comparisons, reviews, and purchase recommendations", cost_per_call: 0 },
  { name: "Market Research", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Market analysis, competitor tracking, and trend reports", cost_per_call: 0 },
  { name: "Data Viz", status: "PLANNED", model: "tbd", type: "agent", tier: "AGENTS", provider: "tbd", description: "Charts, graphs, and visual data reports from raw data", cost_per_call: 0 },
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
