"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { setTokenUserId } from "@/lib/google-calendar";
import type { User, Session } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
  plan: string;
  plan_status: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  promo_code: string | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  isLoading: true,
  isAdmin: false,
  signInWithEmail: async () => ({ error: null }),
  signUpWithEmail: async () => ({ error: null }),
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createBrowserSupabase());
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      setProfile(data);
      return data;
    }

    // No profile row yet — create one via server endpoint
    try {
      const res = await fetch("/api/auth/ensure-profile", { method: "POST" });
      if (res.ok) {
        const { profile: newProfile } = await res.json();
        if (newProfile) {
          setProfile(newProfile);
          return newProfile;
        }
      }
    } catch {}

    return null;
  }

  useEffect(() => {
    // Supabase fires onAuthStateChange with an INITIAL_SESSION event on
    // mount — use that as the single source of truth. No separate
    // getSession() call, which would cause loadProfile() to run twice
    // (the previous implementation triple-fetched /profiles on every load).
    let cancelled = false;
    const seenUserIds = new Set<string>();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);

      if (!s?.user) {
        setProfile(null);
        if (event === "INITIAL_SESSION") setIsLoading(false);
        return;
      }

      setTokenUserId(s.user.id);

      // Skip profile re-fetch on events that don't imply a user change
      // (TOKEN_REFRESHED, USER_UPDATED, etc. for the same user).
      if (seenUserIds.has(s.user.id) && event !== "SIGNED_IN") {
        if (event === "INITIAL_SESSION") setIsLoading(false);
        return;
      }
      seenUserIds.add(s.user.id);

      loadProfile(s.user.id).finally(() => {
        if (!cancelled && event === "INITIAL_SESSION") setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function signInWithEmail(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUpWithEmail(email: string, password: string, name: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return { error: error?.message ?? null };
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  const isAdmin = profile?.role === "owner" || profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        isLoading,
        isAdmin,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
