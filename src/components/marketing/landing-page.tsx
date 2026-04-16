import {
  ArrowRight,
  Check,
  Play,
  Zap,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { MarketingNav } from "./marketing-nav";
import { Footer } from "./footer";
import { PLANS } from "@/lib/plan-config";

const STATS = [
  { value: "20+", label: "Agents" },
  { value: "24/7", label: "Always On" },
  { value: "<2s", label: "Response" },
  { value: "$0", label: "To Start" },
];

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
      </div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, oklch(1 0 0) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

      <MarketingNav />

      {/* ═══ HERO ═══ */}
      <section className="relative pt-28 md:pt-36 pb-10 md:pb-14 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/[0.08] border border-primary/20 text-xs font-medium text-primary backdrop-blur-sm mb-6" style={{ animation: "landing-fade-up 0.6s ease-out both" }}>
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" /><span className="relative inline-flex rounded-full h-2 w-2 bg-primary" /></span>
            20+ agents live
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-[5.5rem] font-bold tracking-tight leading-[0.95] mb-6" style={{ animation: "landing-fade-up 0.7s ease-out 0.1s both" }}>
            One AI That<br /><span className="text-primary">Runs Your Life</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground/60 max-w-xl mx-auto mb-8 leading-relaxed" style={{ animation: "landing-fade-up 0.7s ease-out 0.2s both" }}>
            Research anything. Manage your inbox. Control Spotify. Track spending. Plan trips. Build custom agents. All by just asking.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12" style={{ animation: "landing-fade-up 0.7s ease-out 0.3s both" }}>
            <ButtonLink href="/auth/signup" size="lg" className="h-12 px-8 text-sm gap-2 shadow-[0_0_30px_-5px] shadow-primary/25 hover:shadow-primary/40 transition-shadow">
              Start Free &mdash; No Card Required <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="#demo" variant="outline" size="lg" className="h-12 px-8 text-sm bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] backdrop-blur-sm gap-2">
              <Play className="h-3.5 w-3.5" /> Watch Demo
            </ButtonLink>
          </div>
          <div className="flex items-center justify-center gap-8 md:gap-12 text-center" style={{ animation: "landing-fade-up 0.7s ease-out 0.4s both" }}>
            {STATS.map((s) => (
              <div key={s.label}>
                <span className="text-xl md:text-2xl font-bold text-primary">{s.value}</span>
                <span className="block text-[10px] text-muted-foreground/40 uppercase tracking-wider mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ A DAY WITH HARV — compact horizontal timeline ═══ */}
      <section className="relative py-10 md:py-14 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline gap-3 mb-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">A day with Harv</h2>
            <span className="text-xs text-muted-foreground/40">— just talk naturally</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {[
              { t: "7am", q: "What\u2019s my day look like?", a: "Calendar, emails, scores, weather" },
              { t: "12pm", q: "Compare headphones under $300", a: "Sourced breakdown from Research" },
              { t: "3pm", q: "Summarize my inbox, draft replies", a: "Email reads, prioritizes, drafts" },
              { t: "6pm", q: "Play something chill", a: "Spotify queues your vibe" },
              { t: "9pm", q: "Schedule dentist Thu 2pm", a: "Calendar booked, reminder set" },
            ].map((item) => (
              <div key={item.t} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.1] transition-colors">
                <span className="text-primary text-[10px] font-bold uppercase tracking-wider">{item.t}</span>
                <p className="text-xs font-medium mt-1.5 mb-1 leading-snug">&ldquo;{item.q}&rdquo;</p>
                <p className="text-[11px] text-muted-foreground/40 leading-snug">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHY HARV — no icons, just bold claims ═══ */}
      <section className="relative py-10 md:py-14 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline gap-3 mb-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Not just a chatbot</h2>
            <span className="text-xs text-muted-foreground/40">— ChatGPT answers questions, Harv does things</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {[
              { title: "One AI, every task", text: "Stop copy-pasting between apps. Tell Harv what you need and the right specialist handles it. Research, schedule, email — one conversation." },
              { title: "Works while you sleep", text: "Background agents run 24/7. Guardian monitors issues. Medic auto-fixes. Heartbeat syncs data. You wake up to a status report." },
              { title: "Remembers everything", text: "Most AI forgets you. Harv builds memory from every conversation. Preferences, decisions, context — it all carries forward." },
              { title: "Full cost transparency", text: "See what every agent costs, set daily/weekly/monthly caps, get alerts at 80%. No surprise bills, ever." },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-sm font-semibold mb-1.5">{item.title}</h3>
                <p className="text-xs text-muted-foreground/50 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ AGENT BUILDER — the mock conversation IS the section ═══ */}
      <section className="relative py-10 md:py-14 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Left — copy */}
            <div className="md:sticky md:top-24">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Build custom agents<br /><span className="text-primary">in 60 seconds</span>
              </h2>
              <p className="text-sm text-muted-foreground/50 mb-5 leading-relaxed">
                No code. No config. Describe what you want in plain English — Harv asks a few questions, then builds and schedules it automatically.
              </p>
              <ul className="space-y-2.5 text-xs text-muted-foreground/50 mb-6">
                <li className="flex items-start gap-2"><span className="text-primary font-bold text-sm leading-none mt-px">1</span> Describe what you need in one sentence</li>
                <li className="flex items-start gap-2"><span className="text-primary font-bold text-sm leading-none mt-px">2</span> Harv asks smart follow-up questions</li>
                <li className="flex items-start gap-2"><span className="text-primary font-bold text-sm leading-none mt-px">3</span> Set a schedule — daily, weekly, or on-demand</li>
                <li className="flex items-start gap-2"><span className="text-primary font-bold text-sm leading-none mt-px">4</span> Or start from a template (briefing, cleanup, report&hellip;)</li>
              </ul>
              <ButtonLink href="/meet-the-agents" variant="outline" size="sm" className="gap-2 bg-white/[0.03] border-white/[0.08] text-xs">
                See all 20+ agents <ArrowRight className="h-3 w-3" />
              </ButtonLink>
            </div>

            {/* Right — mock chat */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-400/50" /><div className="h-2 w-2 rounded-full bg-amber-400/50" /><div className="h-2 w-2 rounded-full bg-emerald-400/50" />
                <span className="ml-2 text-[10px] text-muted-foreground/30 font-medium">Agent Builder</span>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="flex gap-2.5">
                  <span className="text-[10px] text-muted-foreground/30 shrink-0 mt-1 w-6">You</span>
                  <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-xs text-muted-foreground/60">I want an agent that checks my email every morning and sends me a Telegram summary of anything urgent.</div>
                </div>
                <div className="flex gap-2.5">
                  <span className="text-[10px] text-primary/60 shrink-0 mt-1 w-6">Harv</span>
                  <div className="rounded-lg bg-primary/[0.05] border border-primary/10 px-3 py-2 text-xs text-muted-foreground/60 space-y-1.5">
                    <p>I&apos;ll create <span className="text-primary font-medium">&ldquo;Inbox Scout&rdquo;</span>. Quick questions:</p>
                    <p className="text-muted-foreground/40 text-[11px]">1. What counts as urgent? (keywords, senders?)<br />2. Run time? (e.g., 7am)<br />3. Include non-urgent count?</p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <span className="text-[10px] text-muted-foreground/30 shrink-0 mt-1 w-6">You</span>
                  <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-xs text-muted-foreground/60">From my boss or &ldquo;urgent&rdquo; in subject. 7am. Yeah include count.</div>
                </div>
                <div className="flex gap-2.5">
                  <span className="text-[10px] text-primary/60 shrink-0 mt-1 w-6">Harv</span>
                  <div className="rounded-lg bg-primary/[0.05] border border-primary/10 px-3 py-2 text-xs">
                    <p className="text-emerald-400 font-medium flex items-center gap-1"><Check className="h-3 w-3" /> Inbox Scout created</p>
                    <p className="text-muted-foreground/40 text-[10px] mt-0.5">Daily 7:00 AM &bull; Gmail &bull; Telegram summary</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TRUST — inline, no icon boxes ═══ */}
      <section className="relative py-10 md:py-14 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline gap-3 mb-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Built for trust</h2>
            <span className="text-xs text-muted-foreground/40">— we know AI agents are scary</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
            {[
              { label: "You see everything", text: "Full activity logs — what each agent did, when, and why. Every action is auditable." },
              { label: "You approve first", text: "Harv drafts emails for your review. Suggests events before booking. You always get final say." },
              { label: "No surprise bills", text: "Set daily, weekly, monthly caps. Alerts at 80%. Hit a limit? Model downgrades, never overcharges." },
              { label: "Your data stays yours", text: "Per-user encryption. We don\u2019t train on your data. Export or delete anytime. No third-party sharing." },
            ].map((item) => (
              <div key={item.label} className="flex gap-3 items-start">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className="text-xs text-muted-foreground/50 ml-1.5">&mdash; {item.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DEMO — small inline placeholder ═══ */}
      <section id="demo" className="relative py-10 md:py-14 px-6 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] py-5 px-6 flex items-center justify-center group cursor-pointer hover:border-primary/15 transition-all">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center group-hover:bg-primary/25 transition-all shrink-0">
                <Play className="h-3.5 w-3.5 text-primary ml-0.5" />
              </div>
              <div>
                <p className="text-sm font-medium">Watch the 2-min demo</p>
                <p className="text-[10px] text-muted-foreground/30">Dashboard, agents, builder walkthrough — coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section className="relative py-10 md:py-14 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">Simple pricing</h2>
            <p className="text-xs text-muted-foreground/40">No hidden fees. No credit card to start.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.entries(PLANS) as [string, (typeof PLANS)[keyof typeof PLANS]][]).map(([key, plan]) => {
              const pop = key === "pro";
              return (
                <div key={key} className={`relative rounded-xl border p-5 transition-all ${pop ? "border-primary/25 bg-primary/[0.03] ring-1 ring-primary/10" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]"}`}>
                  {pop && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider">Popular</div>}
                  <div className="flex items-baseline justify-between mb-4">
                    <h3 className="text-base font-bold">{plan.name}</h3>
                    <div><span className="text-2xl font-bold">${plan.price === 0 ? "0" : (plan.price / 100).toFixed(0)}</span>{plan.price > 0 && <span className="text-xs text-muted-foreground/40">/mo</span>}</div>
                  </div>
                  <ul className="space-y-2 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground/60"><Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />{f}</li>
                    ))}
                  </ul>
                  <ButtonLink href="/auth/signup" className={`w-full text-xs ${pop ? "shadow-[0_0_15px_-5px] shadow-primary/15" : ""}`} variant={pop ? "default" : "outline"} size="sm">
                    {plan.price === 0 ? "Start Free Trial" : "Get Started"}
                  </ButtonLink>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA — tight ═══ */}
      <section className="relative py-14 md:py-20 px-6 border-t border-white/[0.04]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Stop switching tabs.<br /><span className="text-primary">Start delegating.</span>
          </h2>
          <p className="text-sm text-muted-foreground/50 mb-6">7-day free trial. No credit card. Cancel anytime.</p>
          <ButtonLink href="/auth/signup" size="lg" className="h-12 px-10 text-sm gap-2 shadow-[0_0_30px_-5px] shadow-primary/25 hover:shadow-primary/40 transition-shadow">
            Get Started Free <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
      </section>

      <Footer />
    </div>
  );
}
