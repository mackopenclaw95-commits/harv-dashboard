import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harv Dashboard",
  description: "AI Assistant Command Center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex h-screen overflow-hidden bg-background text-foreground">
        <ThemeProvider>
          <AuthProvider>
            <div
              className="fixed inset-0 -z-10 overflow-hidden"
              aria-hidden="true"
            >
              <div className="orb orb-1" />
              <div className="orb orb-2" />
              <div className="orb orb-3" />
            </div>
            <Sidebar />
            <main className="relative flex-1 overflow-auto">{children}</main>
            <Toaster richColors theme="dark" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
