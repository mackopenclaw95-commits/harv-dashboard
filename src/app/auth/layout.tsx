"use client";

import { AuthProvider } from "@/components/auth-provider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="fixed inset-0 z-50 bg-background">
        <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
        </div>
        {children}
      </div>
    </AuthProvider>
  );
}
