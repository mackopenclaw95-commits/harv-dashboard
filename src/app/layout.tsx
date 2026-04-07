import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harv AI — Your AI-Powered Command Center",
  description:
    "Meet your AI team. Harv manages your digital life with specialized agents for research, finance, scheduling, and more.",
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
      <body className="bg-background text-foreground">
        <ThemeProvider>
          <div
            className="fixed inset-0 -z-10 overflow-hidden"
            aria-hidden="true"
          >
            <div className="orb orb-1" />
            <div className="orb orb-2" />
            <div className="orb orb-3" />
          </div>
          {children}
          <Toaster richColors theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  );
}
