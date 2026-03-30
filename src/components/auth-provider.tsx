"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { HarvUser } from "@/lib/auth";
import { getUser, mockGoogleSignIn, signOut as authSignOut, updateUser as authUpdateUser } from "@/lib/auth";

interface AuthContextValue {
  user: HarvUser | null;
  isLoading: boolean;
  signIn: (name?: string) => void;
  signOut: () => void;
  updateUser: (updates: Partial<HarvUser>) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signIn: () => {},
  signOut: () => {},
  updateUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<HarvUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUser(getUser());
    setIsLoading(false);
  }, []);

  const signIn = useCallback((name?: string) => {
    const u = mockGoogleSignIn(name);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    authSignOut();
    setUser(null);
  }, []);

  const updateUser = useCallback((updates: Partial<HarvUser>) => {
    const updated = authUpdateUser(updates);
    if (updated) setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
