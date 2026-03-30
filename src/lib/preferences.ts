// ─── Client Preferences (localStorage) ──────────────────

const KEYS = {
  notificationSounds: "harv-notification-sounds",
  timezone: "harv-timezone",
  favoriteAgents: "harv-favorite-agents",
  hiddenAgents: "harv-hidden-agents",
  defaultAgent: "harv-default-agent",
  trialStart: "harv-trial-start",
  customAutomations: "harv-custom-automations",
  customAgents: "harv-custom-agents",
  projectContext: "harv-project-context",
} as const;

// ─── Custom Automations ─────────────────────────────────

export interface CustomAutomation {
  id: string;
  name: string;
  description: string;
  schedule: string;
  agent: string;
  action: string;
  enabled: boolean;
  createdAt: string;
}

export function getCustomAutomations(): CustomAutomation[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEYS.customAutomations) || "[]"); } catch { return []; }
}

export function saveCustomAutomation(auto: CustomAutomation): void {
  const current = getCustomAutomations();
  current.push(auto);
  localStorage.setItem(KEYS.customAutomations, JSON.stringify(current));
}

export function deleteCustomAutomation(id: string): void {
  const current = getCustomAutomations().filter((a) => a.id !== id);
  localStorage.setItem(KEYS.customAutomations, JSON.stringify(current));
}

export function toggleCustomAutomation(id: string): CustomAutomation[] {
  const current = getCustomAutomations().map((a) =>
    a.id === id ? { ...a, enabled: !a.enabled } : a
  );
  localStorage.setItem(KEYS.customAutomations, JSON.stringify(current));
  return current;
}

// ─── Custom Agents ──────────────────────────────────────

export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  type: string;
  model: string;
  personality: string;
  capabilities: string[];
  createdAt: string;
}

export function getCustomAgents(): CustomAgent[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEYS.customAgents) || "[]"); } catch { return []; }
}

export function saveCustomAgent(agent: CustomAgent): void {
  const current = getCustomAgents();
  current.push(agent);
  localStorage.setItem(KEYS.customAgents, JSON.stringify(current));
}

export function deleteCustomAgent(id: string): void {
  const current = getCustomAgents().filter((a) => a.id !== id);
  localStorage.setItem(KEYS.customAgents, JSON.stringify(current));
}

// ─── Notification Sounds ────────────────────────────────

export function getNotificationSounds(): boolean {
  if (typeof window === "undefined") return true;
  const val = localStorage.getItem(KEYS.notificationSounds);
  return val === null ? true : val === "true";
}

export function setNotificationSounds(enabled: boolean): void {
  localStorage.setItem(KEYS.notificationSounds, String(enabled));
}

export function getProjectContextEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const val = localStorage.getItem(KEYS.projectContext);
  return val === null ? true : val === "true";
}

export function setProjectContextEnabled(enabled: boolean): void {
  localStorage.setItem(KEYS.projectContext, String(enabled));
}

export function getTimezone(): string {
  if (typeof window === "undefined") return "auto";
  return localStorage.getItem(KEYS.timezone) || "auto";
}

export function setTimezone(tz: string): void {
  localStorage.setItem(KEYS.timezone, tz);
}

export function resolveTimezone(tz: string): string {
  if (tz === "auto") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return tz;
}

// ─── Agent Preferences ──────────────────────────────────

export function getFavoriteAgents(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEYS.favoriteAgents) || "[]"); } catch { return []; }
}

export function setFavoriteAgents(names: string[]): void {
  localStorage.setItem(KEYS.favoriteAgents, JSON.stringify(names));
}

export function toggleFavoriteAgent(name: string): string[] {
  const current = getFavoriteAgents();
  const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
  setFavoriteAgents(next);
  return next;
}

export function getHiddenAgents(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEYS.hiddenAgents) || "[]"); } catch { return []; }
}

export function setHiddenAgents(names: string[]): void {
  localStorage.setItem(KEYS.hiddenAgents, JSON.stringify(names));
}

export function toggleHiddenAgent(name: string): string[] {
  const current = getHiddenAgents();
  const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
  setHiddenAgents(next);
  return next;
}

export function getDefaultAgent(): string {
  if (typeof window === "undefined") return "Harv";
  return localStorage.getItem(KEYS.defaultAgent) || "Harv";
}

export function setDefaultAgent(name: string): void {
  localStorage.setItem(KEYS.defaultAgent, name);
}

// ─── Trial Timer ────────────────────────────────────────

export function getTrialStartDate(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEYS.trialStart);
}

export function setTrialStartDate(date: string): void {
  localStorage.setItem(KEYS.trialStart, date);
}

export function ensureTrialStarted(): void {
  if (!getTrialStartDate()) {
    setTrialStartDate(new Date().toISOString());
  }
}

export function getTrialDaysRemaining(): number {
  const start = getTrialStartDate();
  if (!start) return 14;
  const elapsed = (Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(14 - elapsed));
}

export function isTrialExpired(): boolean {
  return getTrialDaysRemaining() <= 0;
}

// ─── Timezone ───────────────────────────────────────────

export const TIMEZONE_OPTIONS = [
  { value: "auto", label: "Auto-detect", group: "Default" },
  { value: "America/New_York", label: "Eastern (ET)", group: "United States" },
  { value: "America/Chicago", label: "Central (CT)", group: "United States" },
  { value: "America/Denver", label: "Mountain (MT)", group: "United States" },
  { value: "America/Los_Angeles", label: "Pacific (PT)", group: "United States" },
  { value: "Europe/London", label: "London (GMT/BST)", group: "Europe" },
  { value: "Europe/Paris", label: "Paris (CET)", group: "Europe" },
  { value: "Europe/Berlin", label: "Berlin (CET)", group: "Europe" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", group: "Asia" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", group: "Asia" },
  { value: "Asia/Dubai", label: "Dubai (GST)", group: "Asia" },
  { value: "Australia/Sydney", label: "Sydney (AEST)", group: "Australia" },
];
