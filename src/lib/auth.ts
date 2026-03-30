const AUTH_KEY = "harv-auth-user";

export interface HarvUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  provider: "google" | "mock";
  created_at: string;
  role?: "owner" | "admin" | "member";
  team_id?: string;
}

export function getUser(): HarvUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function updateUser(updates: Partial<HarvUser>): HarvUser | null {
  const current = getUser();
  if (!current) return null;
  const updated = { ...current, ...updates };
  localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
  return updated;
}

export function mockGoogleSignIn(name?: string): HarvUser {
  const user: HarvUser = {
    id: `user-${Date.now()}`,
    email: name ? `${name.toLowerCase().replace(/\s/g, ".")}@harv.ai` : "user@harv.ai",
    name: name || "User",
    avatar_url: "",
    provider: "google",
    created_at: new Date().toISOString(),
    role: "owner",
    team_id: `team-${Date.now()}`,
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export function signOut(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return !!getUser();
}
