"use client";

import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading, user } = useAuth();
  const router = useRouter();
  // Wait a tick after isLoading resolves to avoid racing Supabase cookie hydration
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    // Give Supabase one extra frame to fire a follow-up auth event
    const t = setTimeout(() => setSettled(true), 100);
    return () => clearTimeout(t);
  }, [isLoading]);

  useEffect(() => {
    if (settled && !isAdmin) {
      router.push("/dashboard");
    }
  }, [settled, isAdmin, router]);

  if (!settled) {
    return (
      <div className="flex h-full items-center justify-center">
        <Shield className="h-8 w-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
