/**
 * Google Calendar API client for the Harv dashboard.
 * Uses OAuth 2.0 for user authentication.
 * Tokens stored in localStorage (single-user system).
 */

const SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status: string;
  colorId?: string;
  creator?: { email: string };
  htmlLink?: string;
}

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

const TOKEN_KEY_BASE = "harv-google-tokens";
let _currentUserId: string | null = null;

// Immediately remove old shared token key so no user inherits another's tokens
if (typeof window !== "undefined") {
  localStorage.removeItem(TOKEN_KEY_BASE);
}

/** Set the user-scoped token key (call after auth is known). */
export function setTokenUserId(userId: string): void {
  if (typeof window === "undefined") return;
  _currentUserId = userId;
}

/** Get the current user's token key. Returns null if no user set yet. */
function getUserTokenKey(): string | null {
  if (typeof window === "undefined") return null;
  if (_currentUserId) return `${TOKEN_KEY_BASE}-${_currentUserId}`;
  // No user ID set yet — don't fall back to shared key
  return null;
}

/** Check if user has connected Google Calendar. */
export function isGoogleConnected(): boolean {
  if (typeof window === "undefined") return false;
  const key = getUserTokenKey();
  if (!key) return false;
  const stored = localStorage.getItem(key);
  if (!stored) return false;
  try {
    const tokens: TokenData = JSON.parse(stored);
    return !!tokens.access_token;
  } catch {
    return false;
  }
}

/** Get stored tokens. */
function getTokens(): TokenData | null {
  if (typeof window === "undefined") return null;
  const key = getUserTokenKey();
  if (!key) return null;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/** Store tokens. */
export function storeTokens(tokens: TokenData): void {
  const key = getUserTokenKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(tokens));
}

/** Clear tokens (disconnect). */
export function disconnectGoogle(): void {
  const key = getUserTokenKey();
  if (!key) return;
  localStorage.removeItem(key);
}

/** Build the Google OAuth consent URL. */
export function getGoogleAuthUrl(): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const redirectUri = `${window.location.origin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Get a valid access token, refreshing if needed. */
async function getAccessToken(): Promise<string> {
  const tokens = getTokens();
  if (!tokens) throw new Error("Not connected to Google");

  // If token is still valid (with 5 min buffer)
  if (tokens.expires_at > Date.now() + 5 * 60 * 1000) {
    return tokens.access_token;
  }

  // Refresh the token
  if (!tokens.refresh_token) {
    disconnectGoogle();
    throw new Error("Token expired and no refresh token. Please reconnect.");
  }

  const res = await fetch("/api/auth/google/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  });

  if (!res.ok) {
    disconnectGoogle();
    throw new Error("Failed to refresh Google token. Please reconnect.");
  }

  const data = await res.json();
  const newTokens: TokenData = {
    access_token: data.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
  };
  storeTokens(newTokens);
  return newTokens.access_token;
}

/** Fetch calendar events for a date range. */
export async function getCalendarEvents(
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    if (res.status === 401) {
      disconnectGoogle();
      throw new Error("Google token expired. Please reconnect.");
    }
    throw new Error(`Calendar API error: ${res.status}`);
  }

  const data = await res.json();
  return (data.items || []) as CalendarEvent[];
}

/** Get events for a specific month. */
export async function getMonthEvents(
  year: number,
  month: number
): Promise<CalendarEvent[]> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return getCalendarEvents(start.toISOString(), end.toISOString());
}

/** Get events for today. */
export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return getCalendarEvents(start.toISOString(), end.toISOString());
}
