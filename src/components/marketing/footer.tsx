import Link from "next/link";
import { Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-background/40">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="font-bold">Harv</span>
            </div>
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              Your AI-powered command center.
              <br />
              Built for people who get things done.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 mb-3">
              Product
            </h4>
            <div className="space-y-2">
              <Link href="/features" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Features</Link>
              <Link href="/pricing" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 mb-3">
              Company
            </h4>
            <div className="space-y-2">
              <Link href="/about" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">About</Link>
            </div>
          </div>

          {/* Get Started */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 mb-3">
              Get Started
            </h4>
            <div className="space-y-2">
              <Link href="/auth/signup" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Sign Up</Link>
              <Link href="/auth/login" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Log In</Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.04] text-center">
          <p className="text-xs text-muted-foreground/40">
            &copy; {new Date().getFullYear()} Harv AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
