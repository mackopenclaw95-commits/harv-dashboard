import { UserPlus, Settings, Zap, ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Harv AI",
  description: "Learn about Harv AI and our mission to build the ultimate AI command center.",
};

const STEPS = [
  {
    icon: UserPlus,
    title: "Sign Up",
    desc: "Create your account in seconds. No credit card required. Start with a 7-day free trial.",
  },
  {
    icon: Settings,
    title: "Configure Your Agents",
    desc: "Choose which agents to activate. Connect your calendar, email, and other services.",
  },
  {
    icon: Zap,
    title: "Let Harv Work",
    desc: "Chat with Harv, automate tasks, and let your AI team handle the rest. Harv learns and improves over time.",
  },
];

export default function AboutPage() {
  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Mission */}
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            One AI to rule them all
          </h1>
          <p className="text-lg text-muted-foreground/70 max-w-2xl mx-auto leading-relaxed mb-4">
            We believe AI should work for you, not the other way around. Instead
            of juggling a dozen apps and AI tools, Harv gives you one unified
            command center with a team of specialized agents — each an expert in
            their domain.
          </p>
          <p className="text-lg text-muted-foreground/70 max-w-2xl mx-auto leading-relaxed">
            Talk to Harv like you&apos;d talk to a friend. Behind the scenes, your
            message gets routed to the right agent automatically. Research,
            finance, scheduling, email, music — it all just works.
          </p>
        </div>

        {/* How It Works */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 ring-1 ring-primary/20">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                  Step {i + 1}
                </div>
                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground/60 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10">
          <h2 className="text-2xl font-bold mb-3">Ready to get started?</h2>
          <p className="text-muted-foreground/70 mb-6">
            Join Harv and let your AI team handle the busy work.
          </p>
          <ButtonLink href="/auth/signup" size="lg" className="h-12 px-8 gap-2">
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
