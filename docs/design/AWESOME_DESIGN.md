# Awesome Design — Harv's Established Taste

> A reference doc for AI coding agents (and humans) working on Harv's frontend. This is the design system Harv has already landed on — don't drift from it toward generic "AI slop." When in doubt, check here first.

Inspired by `awesome-design.md` — the concept of encoding a specific, opinionated design system as a prompt-shaped document so agents stop defaulting to purple-gradient-Inter-bento-box slop.

---

## 1. The North Star

**Harv's visual voice:** confident, technical, understated. A personal command center — not a consumer SaaS trying to please everyone.

Three words: **dark, precise, teal.** Obsidian Glass is the internal name for the look.

**What we're NOT:**
- Not a purple-gradient AI startup
- Not a glassmorphic B-tier SaaS
- Not Inter + bento boxes + spark lines
- Not a marketing-heavy landing page with 14 sections of social proof

---

## 2. Typography

**Loaded in `src/app/layout.tsx`:**
- **Sans (UI + headings):** `Outfit` via `next/font/google` → `--font-sans`
- **Mono (code + numeric):** `JetBrains Mono` → `--font-geist-mono`
- **No Inter. No "system-ui".** Outfit is the established choice — geometric, modern, not the generic default.

**Hierarchy rules:**
- H1 (hero): `text-5xl sm:text-6xl md:text-[5.5rem] font-bold tracking-tight leading-[0.95]`
- H2 (section): `text-2xl md:text-3xl font-bold tracking-tight`
- Body: `text-base md:text-lg text-muted-foreground/60` (faded on marketing — not full-opacity walls of text)
- Micro labels: `text-[10px] uppercase tracking-wider text-muted-foreground/40`
- Numbers / costs / dates: use mono (`font-mono`) for alignment

**Don't:**
- Don't switch to Inter "because it's clean"
- Don't use Geist — we're on JetBrains Mono for the mono role
- Don't make body text at 100% opacity on dark backgrounds — it screams

---

## 3. Color System

**Engine: `oklch` only.** No hex, no rgb, no hsl. Defined in `src/app/globals.css` under `.dark`.

### Core palette (dark theme — default + only theme that matters pre-launch)

| Token | Value | Role |
|---|---|---|
| `--background` | `oklch(0.085 0.02 265)` | Deep blue-black base |
| `--card` | `oklch(0.13 0.015 265)` | Cards lift slightly off bg |
| `--primary` | `oklch(0.78 0.145 192)` | **Teal** — the Harv accent |
| `--muted-foreground` | `oklch(0.65 0.015 265)` | De-emphasized text |
| `--border` | `oklch(1 0 0 / 8%)` | White at 8% — subtle, not harsh |
| `--destructive` | `oklch(0.704 0.191 22.216)` | Warm red |

### Chart colors (for recharts)

Teal primary → green → purple → amber → pink. Never monochrome, never rainbow.

```
oklch(0.78 0.145 192)  /* chart-1 teal */
oklch(0.72 0.12 160)   /* chart-2 green */
oklch(0.68 0.15 280)   /* chart-3 purple */
oklch(0.74 0.16 50)    /* chart-4 amber */
oklch(0.70 0.14 330)   /* chart-5 pink */
```

### Ka-chow mode (easter egg)

A red/orange Lightning McQueen theme under `.dark.kachow`. Only reached via opt-in. Don't treat it as the default.

**Don't:**
- Don't introduce purple gradients as "AI accents"
- Don't use straight black (`#000`) — we're on `oklch(0.085 0.02 265)` for warmth
- Don't add a third theme. Dark + Ka-chow is the full menu until launch.

---

## 4. Borders, Shadows, Elevation

**Philosophy: subtle borders over heavy glassmorphism.**

Current patterns (use these verbatim):
- Card border: `border border-white/[0.06]`
- Card hover: `hover:border-white/[0.1]`
- Card bg: `bg-white/[0.02]` (2% white wash — lifts without glass)
- Inner dividers: `border-t border-white/[0.04]`
- Elevated card (rare): add `backdrop-blur-sm` only — **don't** stack blur + heavy transparency + gradient border

**Shadows:**
- Avoid by default on dark theme — borders do the lifting
- Accent glow (CTAs only): `shadow-[0_0_30px_-5px] shadow-primary/25 hover:shadow-primary/40`
- Never use `shadow-lg` / `shadow-xl` with default colors on dark backgrounds (creates muddy halo)

**Don't:**
- Don't apply glassmorphism (heavy blur + 30%+ opacity + rainbow border) to cards
- Don't use `ring-2` on every interactive element — ring is for focus only
- Don't add drop shadows to text

---

## 5. Radii

Defined as a scale in `globals.css`:

```
--radius: 0.75rem;  /* base — used for cards */
--radius-sm: 0.45rem
--radius-md: 0.6rem
--radius-lg: 0.75rem
--radius-xl: 1.05rem
--radius-2xl: 1.35rem
```

**Usage:**
- Buttons: `rounded-full` (pill) for CTAs, `rounded-md` for secondary
- Cards: `rounded-xl` — slightly soft, not pill-round
- Inputs: `rounded-md`
- Avatars: `rounded-full`
- Badges: `rounded-full`

---

## 6. Layout & Spacing

- Marketing max width: `max-w-5xl` or `max-w-4xl` centered. Never full-bleed walls of text.
- Dashboard: sidebar + main column, no fixed max width (utility UI, use the space)
- Section padding: `py-10 md:py-14` (compact) or `py-20` (hero/pricing)
- Card padding: `p-4` (compact) or `p-6` (default)
- Grid gap: `gap-3` (tight bentos) or `gap-6` (marketing cards)

**Rhythm:** marketing pages use `section` elements with `border-t border-white/[0.04]` dividers — not big empty vertical gaps.

---

## 7. Motion

Fade-up is the signature entrance. Defined as a named keyframe:

```css
animation: landing-fade-up 0.7s ease-out both;
/* Stagger children by 0.1s via inline style delays */
```

**Rules:**
- Every hero element fades up with 0.1s stagger (bad, ok, etc.)
- Hover transitions: `transition-colors` or `transition-shadow` — never `transition-all`
- No scroll-jacking, no heavy parallax, no particle backgrounds
- The existing `.orb-1/-2/-3` blobs in `layout.tsx` are a known AI-slop smell — acceptable for now, flag as polish candidate.

**Don't:**
- Don't add GSAP ScrollTrigger pins/scrubs — overkill for a dashboard
- Don't animate page loads with cascading everything — pick 2–3 elements

---

## 8. Components

Primitives live in `src/components/ui/` — shadcn-based, already themed. Use them. When you need something new:

1. Check `src/components/ui/` first.
2. Check `21st.dev` for inspiration (copy-prompt flow) — but adapt to our tokens.
3. Only add a new primitive if 3 similar ad-hoc ones already exist.

**Naming:** kebab-case files, PascalCase components (`agent-chat.tsx` → `AgentChat`).

---

## 9. Iconography

- **Library:** `lucide-react` — already installed.
- **Size:** `h-3.5 w-3.5` (inline button), `h-4 w-4` (standalone), `h-5 w-5` (nav), `h-6 w-6` (hero).
- **Color:** inherit from text. Never force `text-primary` on a decorative icon.
- Agent icons are mapped in `src/lib/agent-data.ts#AGENT_ICONS` — extend that map, don't hardcode icons in components.

**Lucide v1 rename gotcha:** Some icon names changed in lucide v1 (see `node_modules/next/dist/docs/` in doubt). If an import fails, grep the lucide package for the new name before inventing one.

---

## 10. The Anti-Slop Checklist

Before shipping a design change, run down this list (mirrors what the `impeccable`, `audit`, `critique` skills check):

- [ ] No Inter, no Geist Sans. Outfit or mono.
- [ ] No raw hex/rgb. Only oklch tokens.
- [ ] No purple gradient backgrounds. No rainbow gradient borders.
- [ ] No heavy glassmorphism (blur > 8px + >30% opacity + border-gradient).
- [ ] No "spark line" accent borders on every card.
- [ ] No bento-box-for-the-sake-of-it. Bento only when the cells genuinely differ in size/content.
- [ ] No `<h1>` stuffed with 3 sentences. One short line, optional second line.
- [ ] No 100%-opacity body text on pure dark bg. Fade to `/60` or `/70`.
- [ ] No shadow without a reason. Border or nothing.
- [ ] Mobile tested at 375px. Doesn't require horizontal scroll on any marketing page.
- [ ] Microcopy has personality (see Harv's voice — confident, dry, technical).
- [ ] Error states exist. Empty states exist.

---

## 11. Available design skills (Claude Code)

Installed under `.claude/skills/`. Use the `Skill` tool (or invoke via `/<name>`) when relevant:

**Impeccable family** (anti-AI-slop, 18 commands): `impeccable`, `adapt`, `animate`, `audit`, `bolder`, `clarify`, `colorize`, `critique`, `delight`, `distill`, `harden`, `layout`, `optimize`, `overdrive`, `polish`, `quieter`, `shape`, `typeset`.

**UI/UX Pro MAX family** (industry-specific reasoning, 161 product types): `ui-ux-pro-max`, `design`, `design-system`, `ui-styling`, `brand`, `banner-design`, `slides`.

**Taste family** (anti-generic design philosophies): `taste-skill`, `gpt-tasteskill`, `minimalist-skill`, `brutalist-skill`, `soft-skill`, `redesign-skill`, `stitch-skill`, `output-skill`.

When using any of these on Harv code, **this document overrides skill defaults** for typography, color, border, and motion choices. Skills provide technique; Harv's taste is defined here.

---

## 12. When to update this doc

- A design token changes in `globals.css` → update §3.
- A font changes in `layout.tsx` → update §2.
- A new category of anti-pattern is observed in shipped code → add to §10.
- Do **not** update for every one-off decision. This is the durable taste layer.
