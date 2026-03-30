# Harv Dashboard — Full Project Context Document

> Upload this file to Claude AI to catch up on the entire Harv Dashboard project.
> Last updated: 2026-03-26

---

## Who Is This For?

This document gives you (Claude) everything you need to understand the Harv Dashboard project, its architecture, what has been built, and what's planned. The user is **Mack West** — treat him casually, no corporate speak.

---

## 1. Owner

- **Name:** Mack West, 22, North Myrtle Beach SC
- **Background:** Former D1 defensive lineman #95 at Coastal Carolina University (CCU Chanticleers), professional Carolina Shag dancer, business degree
- **Interests:** Cars (especially Lightning McQueen), fitness/nutrition/recovery, health-focused lifestyle
- **Communication style:** Casual and direct. Short messages are fine. No filler.

---

## 2. What Is Harv?

Harv is a **personal AI assistant ecosystem** — a network of 20+ specialized agents that manage different areas of life (finance, fitness, email, scheduling, research, etc.), all orchestrated by a central brain called **Harv** with a Cars 1 (Lightning McQueen) personality.

The system has three layers:
1. **Frontend:** Next.js 16 web dashboard (the "Harv Dashboard" — this project)
2. **Backend:** Flask API running on a Hostinger VPS
3. **Interfaces:** Telegram bot, WhatsApp bot, and the web dashboard all talk to the same backend

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Interfaces                      │
│  Telegram Bot  │  WhatsApp Bot  │  Next.js Dashboard     │
└───────┬────────┴───────┬────────┴──────────┬─────────────┘
        │                │                   │
        ▼                ▼                   │
┌─────────────────────────────┐              │
│  Flask API (harv_api.py)    │◄─────────────┘ (proxy)
│  127.0.0.1:8765 (internal)  │
│  Port 5050 (external HTTPS) │
│  Harv Brain (harv_brain.py) │
└──────────┬──────────────────┘
           │
           ├──► Supabase Cloud (PostgreSQL + pgvector)
           ├──► Google Sheets (Mission Control — task queue, logs)
           ├──► Anthropic API (Claude Sonnet 4.6 — main brain)
           ├──► OpenRouter (DeepSeek, MiniMax, Qwen3 for agents)
           └──► Ollama (local on VPS — Qwen 2.5:0.5b for free tasks)
```

### CRITICAL: Two Flask APIs on VPS

There are **two separate Flask services** running:

| Service | File | Port | Purpose |
|---------|------|------|---------|
| `harv-api.service` | `/root/harv/scripts/harv_api.py` | 8765 | Internal API (Telegram/WhatsApp) |
| `harv-dashboard.service` | `/root/harv/api/harv_api.py` | 5050 | External HTTPS proxy (dashboard) |

**Always restart BOTH** when making backend changes:
```bash
systemctl restart harv-api harv-dashboard
```

### VPS Details

- **Provider:** Hostinger KVM VPS (ID: 1420157)
- **IP:** 187.77.220.169
- **OS:** Ubuntu 24.04, Python 3.12
- **Domain:** `api.openclaw-yqar.srv1420157.hstgr.cloud` (HTTPS via Let's Encrypt)
- **SSH:** Key-based as root (`~/.ssh/harv_vps`)
- **Project root:** `/root/harv/`
- **Live brain:** `/root/harv/lib/harv_brain.py` (~628 lines)
- **Env file:** `/root/harv/.env`
- **Logs:** `/root/harv/logs/harv_api.log`

### Hostinger Proxy Limitation

The Hostinger HTTPS proxy blocks new API path prefixes with 401 Basic Auth. Existing registered paths work fine (`/api/agents/`, `/api/health/`, `/api/crons/`, `/chat`, etc.), but **new paths** like `/api/settings/*` or `/api/config/*` get blocked. This affects features like the personality toggle endpoint.

---

## 4. Database — Supabase Cloud

**URL:** `https://ecqlftxcscddyminhylh.supabase.co` (Free tier)

### Tables

**`conversations`** — Chat sessions grouped by agent
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| agent_name | text | "Harv", "Finance", etc. |
| title | text | Optional conversation title |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last activity |

**`messages`** — Individual chat messages
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| conversation_id | uuid (FK) | Links to conversations |
| role | text | "user", "assistant", or "system" |
| content | text | Message content |
| created_at | timestamptz | When sent |

**`memory_entries`** — Knowledge base (persistent memory)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| content | text | The memory content |
| embedding | vector(1536) | For semantic search (pgvector) — NOT YET POPULATED |
| metadata | jsonb | session_id, source, timestamp, tags |
| agent_name | text | Which agent created this |
| created_at | timestamptz | When created |

**`documents`** — Files created by agents or uploaded manually
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| filename | text | Original file name |
| file_type | text | image, pdf, document, spreadsheet, presentation, other |
| mime_type | text | MIME type |
| file_size | bigint | Size in bytes |
| storage_path | text | Path in Supabase Storage `documents` bucket |
| agent_name | text | Which agent created this (null for manual) |
| tags | text[] | User/agent-assigned tags |
| description | text | Optional description |
| created_at / updated_at | timestamptz | Timestamps |

**`journal_entries`** — Daily compressed session summaries
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| date | date | Session date (3am EST boundary) |
| session_id | text | e.g. S-20260325-01 |
| summary | text | Overall day summary |
| accomplishments | text[] | What was completed |
| agents_used | text[] | Which agents were active |
| pending_tasks | text[] | Unfinished items |
| key_info | text[] | Notable facts/decisions |
| total_cost_usd | numeric(10,6) | Day's total API cost |
| created_at | timestamptz | When created |

**RLS:** Enabled on all tables with permissive "allow_all" policies (single-user system).

**Storage:** `documents` bucket (public URLs for download/preview).

**Functions:** `match_memories()` for vector similarity search (for future use when embeddings are populated).

**Indexes:** Full-text GIN on messages.content, memory_entries.content, documents (filename + description). B-tree on FKs, timestamps, file_type, agent_name.

---

## 5. Dashboard — Next.js 16

### Tech Stack

- **Framework:** Next.js 16.2.1
- **React:** 19.2.4
- **Styling:** Tailwind CSS v4 + shadcn/ui v4
- **Fonts:** Outfit (headings) + JetBrains Mono (code/mono)
- **AI SDK:** Vercel `ai` + `@ai-sdk/react`
- **Icons:** Lucide React
- **Charts:** Recharts
- **Notifications:** Sonner toasts
- **Database client:** `@supabase/supabase-js`

### Design System — "Obsidian Glass"

A custom glassmorphism theme:
- **Background:** Deep navy (`oklch(0.085 0.02 265)`)
- **Primary accent:** Teal/cyan (`oklch(0.78 0.145 192)`)
- **3 animated gradient orbs** (teal, purple, sea-green) floating in background via CSS keyframes
- **Cards:** `bg-card/50 backdrop-blur-xl` with `ring-white/[0.08]` borders
- **Sidebar:** `bg-sidebar/65 backdrop-blur-2xl` with glowing teal active states
- **Custom thin scrollbar**, `rounded-2xl` cards, colored accent stripes on cards
- Fully dark-mode, OKLCH color space throughout

### Next.js 16 Gotchas

- `params` in page components is a **Promise** — must use `use(params)` from React
- `useSearchParams()` requires wrapping in `<Suspense>`
- Some lucide-react icons were renamed (e.g., `Twitter` → `Timer`, `Heart` → `HeartPulse`)
- Check `node_modules/next/dist/docs/` for breaking changes before writing code

### All Pages

| Path | Purpose | Status |
|------|---------|--------|
| `/` | Dashboard — stats (agents, crons, API calls, daily burn), quick links, system overview | Done |
| `/chat` | Chat with Harv — Supabase persistence, file attachments, routing indicators | Done |
| `/agents` | Agent list — flowchart header, type-grouped sections, inline chat, sub-agent nesting | Done |
| `/agents/[name]` | Full agent chat — sidebar info panel, file attachments, conversation history | Done |
| `/crons` | Cron jobs — grouped by category, color-coded, task breakdowns, schedule parsing | Done |
| `/documents` | File manager — grid/list view, search, type/agent filters, upload/download/delete | Done |
| `/memory` | Two tabs: "Chat History" (conversations) + "Knowledge Base" (memory entries) | Done |
| `/calendar` | Google Calendar — month grid + agenda view, OAuth connect/disconnect | Done |
| `/journal` | Daily journal — auto-generated at 3am EST, search, date filter | Done |
| `/analytics` | API costs — spend tracking, cost by agent/model, daily burn projection | Done |
| `/settings` | System config — health check, personality toggle, API key status, VPS info | Done |
| `/onboarding` | First-time setup wizard — personality choice, Google connect, permissions | Done |

### API Routes (Next.js)

| Route | Purpose |
|-------|---------|
| `/api/proxy` | Generic proxy to Flask backend (GET + POST), adds X-API-Key, cache-busting |
| `/api/chat` | Chat forwarding to Flask `/chat` endpoint |
| `/api/chat/agent` | Agent-specific chat with `[DIRECT:AgentName]` routing prefix |
| `/api/documents` | Document upload (multipart → Supabase Storage) |
| `/api/auth/google/callback` | Google OAuth callback for Calendar integration |
| `/api/auth/google/refresh` | Google token refresh endpoint |

### Key Library Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Supabase client (browser + service role) |
| `src/lib/supabase-chat.ts` | Chat CRUD — conversations, messages, search, stats |
| `src/lib/supabase-memory.ts` | Memory entry queries, stats, text search |
| `src/lib/supabase-documents.ts` | Document CRUD — upload, list, filter, delete, stats |
| `src/lib/supabase-journal.ts` | Journal entry CRUD — list, search, stats, date filtering |
| `src/lib/chat-history.ts` | Adapter — delegates to Supabase, handles localStorage migration |
| `src/lib/google-calendar.ts` | Google Calendar API client — OAuth, events, token refresh |
| `src/lib/constants.ts` | Routing messages per agent (e.g., "Crunching the numbers..." for Finance) |
| `src/lib/onboarding.ts` | Onboarding state management (localStorage) |

### Data Flow

- **Chat/Memory/Documents/Journal:** Dashboard ↔ Supabase Cloud (direct via `@supabase/supabase-js`)
- **Document files:** Supabase Storage `documents` bucket (public URLs)
- **Agent/Cron/Analytics/Health:** Dashboard → Next.js `/api/proxy` → Flask backend
- **Agent chat:** Dashboard → `/api/chat/agent` → Flask `/chat` with `[DIRECT:AgentName]` routing
- **Calendar:** Dashboard → Google Calendar API (OAuth tokens stored client-side)

---

## 6. Agent System

### Hierarchy

```
User (Mack) → Harv (main brain, Cars 1 personality)
                └→ Router (two-tier confidence routing)
                    ├→ Active Agents
                    │   ├─ Journal (daily memory, 3am EST cutoff)
                    │   ├─ Scheduler (Google Calendar)
                    │   ├─ Email (Gmail via Postman)
                    │   ├─ Learning (tutor — flashcards, quizzes, study plans)
                    │   ├─ Travel (proactive trip planner)
                    │   ├─ Research
                    │   │   ├─ Product Research
                    │   │   ├─ Market Research
                    │   │   └─ Data Viz
                    │   ├─ Media Manager
                    │   │   ├─ Image Gen (Imagen 4.0, DALL-E, Midjourney, Flux)
                    │   │   ├─ Video Gen
                    │   │   └─ Video Editor
                    │   ├─ Video Digest (implementation assistant)
                    │   │   ├─ YouTube Digest
                    │   │   ├─ TikTok Digest
                    │   │   └─ Twitter Digest
                    │   └─ Auto Marketing (ADMIN ONLY — hidden from regular users)
                    ├→ Tools
                    │   ├─ Scribe (Google Sheets/Drive)
                    │   └─ Guardian (security monitoring)
                    ├→ Background
                    │   ├─ Memory (Supabase persistent store)
                    │   └─ Tools Agent (internal utility)
                    └→ Coming Soon (planned, not built)
                        ├─ Music, Fitness, Finance
                        ├─ Shopping, Sports, Trading
```

### LLM Models Used

| Model | Provider | Used By | Cost |
|-------|----------|---------|------|
| claude-sonnet-4-6 | Anthropic | Harv brain | ~$0.01/call |
| deepseek-v3 | OpenRouter | Finance, Learning, Research, Sports, Music, Trading, YouTube, Marketing | ~$0.0003-0.0016/call |
| minimax-m2.1 | OpenRouter | Journal, Scheduler, Email, Travel | ~$0.0001-0.0004/call |
| qwen3-8b | OpenRouter | Router (task classification) | ~$0.00001/call |
| qwen2.5:0.5b | Ollama (local) | Fitness, Shopping, Guardian | FREE |

### Harv Personality

- **Cars 1 mode (default):** Lightning McQueen Hollywood agent energy. Short, punchy responses. "I got this." Drops Cars quotes naturally. Agent responses filtered through Harv's personality.
- **Default mode:** Professional assistant without the character
- **Toggle:** `/api/config/personality` endpoint (blocked by Hostinger proxy currently)
- **Config:** `core.json` → `agents.harv.personality` field (`cars1` or `default`)

### Router

- Two-tier routing: Router LLM classifies intent with confidence level
- High confidence → route to specific agent
- Low confidence → fall back to Harv (general conversation)
- Test suite: 105 prompts, 78.1% accuracy (up from 72.4%)
- Known weak spots: Drive queries (0/3), "explain X" misroutes to Harv instead of Learning

### Key Agent Details

- **Journal:** 3:01am–3:00am EST daily sessions. 15-min quiet window before cutoff. Supabase `journal_entries` table. Also uses local ChromaDB for internal semantic search.
- **Video Digest:** Not just summarization — it's an implementation assistant. Drop a URL → detect platform → transcribe → summarize → help implement what was taught.
- **Auto Marketing:** Admin-only. Auto-drafts social media posts. Uses Image Gen + Journal for content.
- **No chat** for: Router, Tools, Background, Coming Soon agents (disabled in UI)

---

## 7. Flask Backend

### Key Files (on VPS at `/root/harv/`)

| File | Purpose |
|------|---------|
| `/root/harv/lib/harv_brain.py` (~628 lines) | Core AI brain — Claude loop, tool execution, session history, Supabase persistence |
| `/root/harv/scripts/harv_api.py` | Flask HTTP API (internal, port 8765) |
| `/root/harv/api/harv_api.py` | Flask HTTP API (external, port 5050) |
| `/root/harv/lib/harv_lib.py` | Shared utilities — Google Sheets client, logging, config |
| `/root/harv/core.json` | Master config — paths, Google IDs, LLM settings, agent registry |
| `/root/harv/agents/` | Individual agent implementations |
| `/root/harv/lib/feedback.py` | Outcome tracking and pattern recognition |

### API Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/chat` | POST | Send message to Harv `{session_id, text, agent?}` → `{reply}` |
| `/clear` | POST | Clear conversation history `{session_id}` |
| `/run_router` | POST | Manually run task router |
| `/health` | GET | Health check |
| `/api/agents/list` | GET | List all registered agents |
| `/api/agents/<name>/status` | GET | Individual agent status |
| `/api/crons/list` | GET | List all cron jobs |
| `/api/analytics/costs` | GET | Cost analytics data |
| `/api/memory/dashboard` | GET | Memory stats |
| `/api/memory/search?q=` | GET | Text search across memory |
| `/api/config/personality` | GET/POST | Read/toggle personality mode |

### How Harv Brain Works

1. `chat_with_harv(session_id, user_text)` is the entry point
2. Maintains in-memory session history (max 20 turns — **ephemeral, lost on restart**)
3. Builds system prompt with owner info, VPS details, agent hierarchy
4. Runs agentic loop (up to 10 iterations): sends to Claude → processes tool calls → loops
5. Tools: `queue_task` (Google Sheets + Router dispatch), `get_queue_status`
6. After each exchange, saves to Supabase `memory_entries` via background thread
7. Supports Anthropic (Claude) and OpenRouter providers — model routing based on prefix

---

## 8. What Has Been Built (Session-by-Session)

### Session 1: Initial Build (Commit: 5f505a1)
- Scaffolded Next.js 16 + shadcn/ui project
- Dashboard home page with system stats
- Basic chat page
- Settings page
- Analytics page with cost charts
- Memory page
- API proxy route to Flask backend
- "Obsidian Glass" design system implemented

### Session 2: Agents & Crons (Commit: 96273ff)
- Agents list page with detail view
- Agent detail page with full chat
- Cron Jobs tab with monitoring

### Session 3: Chat History & Sidebar (Commits: fae1afb, e104bf2)
- Inline agent chat on agents page
- Sidebar agent dropdown with recent conversations
- Chat history persistence via Supabase
- Fixed chat history loading reliability

### Session 4: Supabase Migration
- Migrated from localStorage/ChromaDB to Supabase Cloud
- Created 3 core tables (conversations, messages, memory_entries)
- Built `supabase-chat.ts`, `supabase-memory.ts` adapters
- Redesigned Memory page: two tabs (Chat History + Knowledge Base)
- Patched Flask backend to save conversations to Supabase
- Added `/api/memory/dashboard` and `/api/memory/search` endpoints

### Session 5: Full Agent Audit & Specs
- Reviewed every agent 1-by-1, locked specs
- File upload (paperclip button) in chat and agent detail pages
- Agents page redesign: flowchart header, type-grouped sections, sub-agent nesting
- "Coming Soon" section for 6 planned agents
- Journal fix (ValueError on plain text input)
- Router accuracy improved: 72.4% → 79.7% (59 prompts)
- Business model decided: blended pricing (Free → $20 → $50 → BYOK)
- Personality toggle on Settings page

### Session 6: Full Feature Build (2026-03-26)
- **Calendar page:** 4 views (month grid, agenda, week, day) + cron integration + Google OAuth
- **Journal page:** Daily entries, search, date filter, auto-generated at 3am EST
- **Documents page:** File manager with grid/list view, upload, download, delete, type/agent filters
- **Onboarding wizard:** Personality choice, Google connect, permissions setup
- **Crons redesign:** Grouped by category, color-coded badges, task breakdowns, 90-min display, EST times
- **Routing indicators:** Agent-specific typing messages ("Crunching the numbers...", "Checking your calendar...")
- **Agent hierarchy updates:** Media Manager made live, Research sub-agents added
- **Sidebar updates:** Journal + Calendar links, scrollable agent dropdown
- **Backend:** Media Manager agent registered, Video Digest prompt tuning, 6 blueprints registered, personality blueprint, cron cleanup (removed 8 unused), OpenClaw merged into Heartbeat, Router test suite expanded (105 prompts, 78.1%)
- **Bug fixes:** 16→2 API console errors, Supabase `.single()` 406 fix, proxy caching fix, Next.js dev indicator hidden
- **Discovery:** Dual Flask API architecture (port 8765 internal, port 5050 external)

---

## 9. Business Model

| Tier | Price | Details |
|------|-------|---------|
| Free Demo | $0 | Full access, 7-14 day time limit |
| Starter | $20/mo | Usage cap, all core agents, Google integrations |
| Pro | $50/mo | Higher cap, premium models, proactive agents |
| BYOK Unlock | Any tier | Plug in own API keys for unlimited usage |

- Revenue is the **platform fee**, not the LLM calls
- Per-user usage tracking + Stripe subscriptions (not yet built)
- **User Harv** (public) vs **Dev/Admin Harv** (Mack's personal instance with Auto Marketing, system access)
- Each user gets own dashboard, stats, integration settings

---

## 10. Known Issues & Limitations

1. **Hostinger proxy blocks new API paths** — `/api/settings/*` and `/api/config/*` return 401. Personality toggle works internally but not through external HTTPS.
2. **Vector embeddings not populated** — `memory_entries.embedding` column exists but is empty. Text search (ilike) works. Semantic search via pgvector needs an embedding provider.
3. **Session memory is ephemeral** — Harv's in-process history (20 turns) resets on service restart. Supabase is the persistent store.
4. **Router accuracy at 78.1%** — 12 remaining misroutes. Drive queries broken (0/3). "Explain X" goes to Harv instead of Learning.
5. **Local vs VPS code divergence** — `C:\Users\macko\harv_deploy\` has a simpler (~350 line) harv_brain.py. The live VPS version is ~628 lines with OpenRouter, multi-provider routing, personality, Ledger. Never overwrite the live file.
6. **ChromaDB + Supabase coexist** — Journal uses ChromaDB for internal semantic search. Supabase is the primary dashboard-facing store.

---

## 11. What's Not Built Yet

- Auth system (user accounts, login)
- Stripe integration (subscriptions, billing)
- Per-user usage tracking and caps
- Admin vs User dashboard separation
- Embedding provider for semantic memory search
- Most "Coming Soon" agents (Music, Fitness, Finance, Shopping, Sports, Trading)
- Gmail integration (Email/Postman agent)
- Production deployment of the Next.js dashboard (currently local dev only)

---

## 12. Git History

```
e104bf2 (HEAD) feat: inline agent chat, sidebar agent dropdown, and chat history
fae1afb        fix: load chat history reliably on agent detail page
96273ff        Add Agents detail view and Cron Jobs tab
5f505a1        Initial Harv Dashboard — Next.js 15 + shadcn/ui
```

Note: Many features were built in uncommitted sessions (Sessions 4-6 above). The working tree has extensive uncommitted changes across 30+ files including all new pages (calendar, journal, documents, onboarding), Supabase integration, and the full agent hierarchy restructure.

---

## 13. Project File Structure

```
harv-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Dashboard home
│   │   ├── layout.tsx                  # Root layout (fonts, orbs, sidebar)
│   │   ├── globals.css                 # Obsidian Glass theme
│   │   ├── chat/page.tsx               # Main Harv chat
│   │   ├── agents/
│   │   │   ├── page.tsx                # Agent list + inline chat
│   │   │   └── [name]/page.tsx         # Agent detail chat
│   │   ├── calendar/page.tsx           # Google Calendar integration
│   │   ├── crons/page.tsx              # Cron job monitoring
│   │   ├── documents/page.tsx          # File manager
│   │   ├── journal/page.tsx            # Daily journal entries
│   │   ├── memory/page.tsx             # Chat history + knowledge base
│   │   ├── analytics/page.tsx          # Cost tracking & metrics
│   │   ├── settings/page.tsx           # System config
│   │   ├── onboarding/page.tsx         # First-time setup wizard
│   │   └── api/
│   │       ├── proxy/route.ts          # Generic Flask proxy
│   │       ├── chat/route.ts           # Chat forwarding
│   │       ├── chat/agent/route.ts     # Agent-specific chat
│   │       ├── documents/route.ts      # Document upload
│   │       └── auth/google/            # OAuth callback + refresh
│   ├── components/
│   │   ├── sidebar.tsx                 # Navigation sidebar
│   │   └── ui/                         # shadcn components
│   └── lib/
│       ├── supabase.ts                 # Supabase client
│       ├── supabase-chat.ts            # Chat CRUD
│       ├── supabase-memory.ts          # Memory queries
│       ├── supabase-documents.ts       # Document CRUD
│       ├── supabase-journal.ts         # Journal CRUD
│       ├── chat-history.ts             # Supabase adapter
│       ├── google-calendar.ts          # Calendar API client
│       ├── constants.ts                # Routing messages
│       ├── onboarding.ts               # Onboarding state
│       └── utils.ts                    # Utilities (cn helper)
├── docs/
│   └── harv-system-summary.md          # Full system documentation
├── scripts/                            # Build/deploy scripts
├── tests/                              # Test files
├── CLAUDE.md                           # Claude Code instructions
├── AGENTS.md                           # Next.js 16 warnings
└── package.json                        # Dependencies
```

---

## 14. Environment Variables

### Dashboard (.env.local)
```
NEXT_PUBLIC_API_URL=https://api.openclaw-yqar.srv1420157.hstgr.cloud
API_URL=https://api.openclaw-yqar.srv1420157.hstgr.cloud
HARV_API_KEY=<needs key>
NEXT_PUBLIC_SUPABASE_URL=https://ecqlftxcscddyminhylh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<needs key>
SUPABASE_SERVICE_ROLE_KEY=<needs key>
```

### VPS (/root/harv/.env)
```
ANTHROPIC_API_KEY=<needs key>
TELEGRAM_BOT_TOKEN=<needs key>
SUPABASE_URL=https://ecqlftxcscddyminhylh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<needs key>
```

---

*This document covers everything built through 2026-03-26. When working on this project, always read the actual source files for current implementation details — this document provides the architectural context and history.*
