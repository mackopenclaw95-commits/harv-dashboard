"use client";

import dynamic from "next/dynamic";
import { AuthProvider } from "@/components/auth-provider";
import { PersonalityProvider } from "@/components/personality-provider";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { NotificationProvider } from "@/components/notification-provider";
import { Sidebar } from "@/components/sidebar";

const TourProvider = dynamic(
  () => import("@/components/tour/tour-provider").then((m) => m.TourProvider),
  { ssr: false }
);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden">
        <PersonalityProvider />
        <KeyboardShortcuts />
        <NotificationProvider />
        <Sidebar />
        <TourProvider>
          <main className="relative flex-1 overflow-auto">{children}</main>
        </TourProvider>
      </div>
    </AuthProvider>
  );
}
