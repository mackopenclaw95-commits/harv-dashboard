# Harv Dashboard — Full Testing Report
**Date:** April 13, 2026
**Tested by:** Claude Code (automated + Chrome extension browser testing)
**Environment:** Live Vercel deployment (harv-dashboard.vercel.app)
**Logged in as:** Mack West (pro plan, tester role)

---

## EXECUTIVE SUMMARY

Tested all pages, features, and API routes. Found **4 critical security issues** (all fixed), **2 functional bugs** (both fixed), and **15+ configuration/UX issues** (documented below). Core functionality (chat, agents, image generation, research) works well. The Obsidian Glass theme is polished and consistent.

---

## FIXES APPLIED THIS SESSION

### Critical Security Fixes
| Fix | File | Description |
|-----|------|-------------|
| Admin stats auth | `api/admin/stats/route.ts` | Added authentication + owner/admin role check — was completely open |
| Admin user detail auth | `api/admin/users/[id]/route.ts` | Added authentication + owner/admin role check |
| Admin user action auth | `api/admin/users/[id]/action/route.ts` | Added authentication + owner/admin role check — anyone could ban users |
| Migrate auth | `api/migrate/route.ts` | Added authentication + owner/admin role check — anyone could run migrations |

### Configuration Fixes
| Fix | File | Description |
|-----|------|-------------|
| Duplicate Video Gen | `lib/plan-config.ts` | Removed duplicate "Video Gen" from PRO_ONLY_AGENTS (it's in MAX_ONLY) |
| Missing agent gating | `lib/plan-config.ts` | Added TikTok Digest, Twitter Digest, Product Research, Market Research, Marketing to PRO_ONLY_AGENTS |
| Unused import | `settings/page.tsx` | Removed unused `dynamic` import |

### Functional Bug Fixes
| Fix | File | Description |
|-----|------|-------------|
| Trial banner for paid users | `dashboard/page.tsx` | Banner now checks `plan === "free" && plan_status === "trial"` — was showing for Pro users |
| Usage display for owner/tester | `api/usage/check/route.ts` | Owner/tester now see real usage counts instead of hardcoded 0 |
| Silent usage log failures | `chat/chat-panel.tsx` | Usage log errors now logged to console instead of swallowed silently |

---

## PAGE-BY-PAGE TEST RESULTS

### Dashboard (/dashboard)
- **Status:** PASS (with fix applied)
- Stats load: 28 agents, 57 API calls, $0.0134 daily burn
- Quick Access cards work
- Recent Activity shows conversations correctly
- System Online badge works
- ~~BUG: "Free Trial 1 days remaining" showing for Pro user~~ **FIXED**
- Automations shows "0 active" but Crons page shows 1 active + 3 always running (stats mismatch)

### Chat (/chat)
- **Status:** PASS
- Harv main chat: sends and receives messages correctly
- Agent-specific chat: works (tested Image Gen, Research)
- Tabs: Harv / Agents / History all functional
- History shows 8+ conversations with correct timestamps
- File attachment button present
- Personality greeting "Good afternoon, Mack West" works

### Agents (/agents)
- **Status:** PASS with notes
- 28 agents displayed across categories: Agents (14), Sub-agents (10), System (3), Personal (1)
- All show LIVE status with green badges
- "New Agent" button present
- "View interactive team map" link works
- **NOTE:** Media Manager shows "none" as model — should display a model or "orchestrator"
- **NOTE:** Fitness and Shopping agents defined in `agent-data.ts` as COMING_SOON but not shown on agents page
- **NOTE:** "Auto Marketing" naming inconsistency — called "Marketing" in `agent-data.ts` and routing messages

### Automations (/crons)
- **Status:** PASS
- Shows 1 active (Journal_Compress.Log, daily 7AM), 3 always running
- Health Monitor (15min), System Heartbeat (90min), Error Scanner (on-demand)
- Toggle switches present
- "New Automation" button present

### Calendar (/calendar)
- **Status:** PASS with notes
- Week view loads correctly (Apr 13-19, 2026)
- Today highlighted
- Google Calendar connected (Disconnect button visible)
- Background tasks displayed
- **NOTE:** "1 tasks" grammar issue — should be "1 task" (singular)

### Files (/documents)
- **Status:** PASS
- Clean empty state with Upload button
- Grid/list view toggle
- Search bar present

### Projects (/projects)
- **Status:** PASS
- Clean empty state with "Create Your First Project" CTA
- Search bar present
- "New Project" button

### Journal (/journal)
- **Status:** PASS
- 0 entries — expected for new account
- Date filter with mm/dd/yyyy pickers
- Search bar present
- Explains auto-generation at 3am EST

### Memory (/memory)
- **Status:** PASS
- Chat History tab: 9 conversations
- Knowledge Base tab: 0 entries
- Search bar present
- Conversations show agent names, message counts, timestamps

### Activity (/activity)
- **Status:** PASS with notes
- Shows 0 events for today
- Date picker, status filter, search present
- **NOTE:** Chat messages and image generation don't create activity events — may only track VPS-side events

### Team (/team)
- **Status:** PASS
- Beautiful agent hierarchy visualization
- Harv → Router → categorized teams (Productivity, Creative, Research)
- System Protection Layer with Guardian/Heartbeat/Medic
- Agent Profiles section (22 agents)

### Integrations (/integrations)
- **Status:** PASS
- 4 Active: Google, Spotify, Telegram, Discord — all showing Connected + Active
- Google shows service badges (Calendar, Gmail, Drive, Docs, Sheets)
- Coming Soon properly categorized: Productivity (Notion Q3), Communication (Slack Q4, WhatsApp Q3), Social Media (Twitter/X Q3, TikTok Q4), Developer Tools (GitHub Q3, Linear Q4)
- "Notify Me" buttons on coming soon items

### Personal Agent Pages
| Page | Status | Notes |
|------|--------|-------|
| Sports (/sports) | PASS | Favorite Teams/Sports/Players, Live Scores/Standings/Schedule/News, Ask Agent |
| Music (/music) | PASS | Create Playlist, quick buttons (Discover, Workout, Chill, Road Trip), Search & Ask |
| Finance (/finance) | PASS | Quick Log (Expense/Income), budgets, action buttons, Ask Agent |
| Travel (/travel) | PASS | Plan a Trip form, Find Flights/Hotels/Things/Packing, Ask Agent |

### Settings (/settings)
- **Status:** PASS
- General: Appearance (Dark/Light), Notification Sounds, Timezone, Sidebar Order
- Billing: Shows correct plan (Pro), three plan cards with pricing, Billing Portal link
- Usage: Shows plan limits (150/day, 750/week, 10 images), current model info
- ~~BUG: Usage showing 0/150 and 0/10 for owner/tester~~ **FIXED (display issue)**

### Admin (/admin)
- **Status:** PASS — correctly redirects non-owner to dashboard

---

## API ROUTE AUDIT

### Critical Issues (FIXED)
- 4 admin routes had NO authentication checks

### Medium Issues (Not Yet Fixed)
| Issue | Files | Description |
|-------|-------|-------------|
| Hardcoded backend URLs | 6 API files | `api.openclaw-yqar.srv1420157.hstgr.cloud` hardcoded as fallback |
| No rate limiting | `integrations/link`, `integrations/verify` | 6-digit code verification can be brute-forced |
| Missing user validation | `billing/checkout`, `billing/upgrade`, `billing/downgrade` | Don't verify userId matches authenticated user |
| No fetch timeouts | 15+ API files | All fetch() calls can hang indefinitely |
| API key validation inconsistency | `documents/route.ts` | If HARV_API_KEY is unset, any key passes |

### Low Issues
- `/proxy/route.ts` leaks up to 200 chars of backend errors
- `/migrate/route.ts` returns raw SQL in response
- `/personality/route.ts` returns default "cars1" without indicating it's a fallback
- Inconsistent environment variable naming (API_URL vs HARV_API_URL)

---

## CONFIGURATION AUDIT

### Agent Status Mismatches (agent-data.ts vs agents/page.tsx)
Several agents defined in `agent-data.ts` PLANNED_AGENTS array have different statuses in agents/page.tsx. The agents page shows them as LIVE but agent-data.ts lists them as planned. Needs reconciliation.

### Missing Agents on Agents Page
- **Fitness** — defined as COMING_SOON in agent-data.ts but not on /agents page
- **Shopping** — defined as COMING_SOON in agent-data.ts but not on /agents page

### Naming Inconsistencies
- "Auto Marketing" on agents page vs "Marketing" in agent-data.ts and routing messages
- Missing routing message for "Auto Marketing"
- Model name formats inconsistent across files

---

## REAL API CALL TESTS

| Test | Agent | Result | Notes |
|------|-------|--------|-------|
| Image Generation | Image Gen | PASS | Generated futuristic city image, 200.6KB via google/nano-banana |
| Web Research | Research | PASS | Returned detailed answer with 5+ source citations and clickable links |
| General Chat | Harv | PASS | Listed available agents, personalized greeting |

---

## UX OBSERVATIONS & SUGGESTIONS

### Good
1. **Obsidian Glass theme is beautiful** — consistent across all pages, great contrast
2. **Empty states are well-designed** — clear CTAs, helpful descriptions
3. **Agent chat welcome messages are helpful** — each agent introduces itself
4. **Image gen UX is excellent** — shows prompt, file size, model, download/copy/open buttons
5. **Research agent cites sources** — professional and trustworthy feel
6. **Team visualization is impressive** — clear hierarchy, good use of space

### Needs Improvement
1. **Trial banner logic** — Should not show for paid/active users (FIXED)
2. **Calendar "1 tasks" grammar** — Should be "1 task" when singular
3. **Activity page seems disconnected** — 0 events despite active usage; needs chat/API events
4. **Dashboard automations count mismatch** — Shows 0 but crons page shows 1+3
5. **Media Manager model shows "none"** — Should show "orchestrator" or similar
6. **Personal Agent pages lack response area** — The Ask Agent inputs don't show previous responses
7. **No loading indicator on chat send** — After clicking send, there's no visible loading state until the response arrives (the text just appears)
8. **Settings tabs could show active state more clearly** — The left nav active state is subtle
9. **Sidebar Personal Agents dropdown** — Consider showing agent status dots like the chat agent grid does
10. **Consider breadcrumbs** — When in agent chat, the back arrow works but breadcrumbs would be clearer

---

## ITEMS NOT TESTED (Requires Specific Setup)

1. **Video Generation** — Requires Max plan
2. **Document Upload** — Needs a real file to upload via browser
3. **Stripe Checkout Flow** — Would require actual payment
4. **Telegram/Discord Integration** — Needs mobile device or separate app
5. **Onboarding Tour** — Would need a fresh account
6. **Plan Downgrade Cooldown** — Needs plan change to test
7. **Model Degradation** — Would need to hit daily message limit
8. **Light Mode** — Marked as Beta, not tested

---

## PRIORITY ACTION ITEMS

### P0 — Deploy These Fixes Now
1. ~~Admin route auth~~ FIXED
2. ~~Trial banner for paid users~~ FIXED
3. ~~Duplicate Video Gen in plan gating~~ FIXED
4. ~~Usage display for owner/tester~~ FIXED

### P1 — Fix Soon
5. Rate limiting on integration link/verify endpoints
6. Fetch timeouts on all API routes
7. Dashboard automation count mismatch with crons page
8. Calendar "1 tasks" → "1 task" grammar
9. Reconcile agent statuses between agent-data.ts and agents/page.tsx
10. Add Fitness and Shopping to Coming Soon on agents page

### P2 — Polish
11. Remove hardcoded backend URLs from API routes
12. Fix Media Manager "none" model display
13. Activity page: log chat and API events
14. Auto Marketing → Marketing naming consistency
15. Add loading indicators to chat
16. Personal agent pages: show conversation history
