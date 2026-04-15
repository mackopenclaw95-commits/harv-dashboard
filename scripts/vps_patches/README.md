# VPS Patches — Cost Tracking Upgrade

Apply these in order on the VPS (`/root/harv`) after the Supabase migrations
(`docs/supabase-model-pricing.sql` and `docs/supabase-api-cost-events-v2.sql`)
have been run.

## 1. Schema prerequisite (Supabase SQL editor)

Run both files:
- `docs/supabase-model-pricing.sql` — creates pricing table + seeds rates
- `docs/supabase-api-cost-events-v2.sql` — adds user_id, parent_agent,
  tokens_in/out, cached_tokens, modality, units columns

## 2. Update `lib/event_log.py` on VPS (manual edit)

The existing `log_event()` helper must accept and forward the new kwargs:
```python
def log_event(agent, action, status, summary, cost=0, tokens=0,
              user_id=None, parent_agent=None,
              tokens_in=0, tokens_out=0, cached_tokens=0,
              modality='text', units=0):
    # ... existing logic ...
    # Include new fields in the emitted event dict so /api/events/recent
    # returns them to the Next.js sync loop.
```

Then the Flask `/api/events/recent` response must include the new fields in
each event — typically a one-line JSON serializer change.

## 3. Apply whisper cost logging

```bash
cd /root/harv
python3 /path/to/scripts/vps_patches/whisper_cost_logging.py
systemctl restart harv-dashboard.service
```

This wraps every Whisper call in audio-duration measurement and emits an
`api_cost` event with `modality='audio'` and `units=<minutes>`.

## 4. Propagate user_id through agent entry points

In `harv_brain.py` (or whichever module owns request dispatch), store the
incoming `user_id` in a contextvar at the start of each request:
```python
import contextvars
_request_user = contextvars.ContextVar('user_id', default=None)
_request_parent = contextvars.ContextVar('parent_agent', default=None)
```

Then before calling any agent or Whisper:
```python
_request_user.set(payload.get('user_id'))
_request_parent.set(payload.get('parent_agent'))  # or 'Router' when chaining
whisper_client.set_request_context(
    user_id=_request_user.get(),
    parent_agent=_request_parent.get(),
)
```

When agents emit their own `api_cost` events, pass `user_id` from the
contextvar:
```python
log_event(
    agent='Auto Marketing',
    action='api_cost',
    ...,
    user_id=_request_user.get(),
    parent_agent=_request_parent.get(),
    tokens_in=usage['prompt_tokens'],
    tokens_out=usage['completion_tokens'],
    cached_tokens=usage.get('cached_tokens', 0),
)
```

## 5. Frontend (Next.js) — already done in this commit

- `src/lib/model-pricing.ts` — pricing reader with 5min cache + fallback
- `src/app/api/usage/log/route.ts` — server-side cost computation from model
- `src/app/api/admin/stats/route.ts` — consumes new fields, aggregates
  per-user agent cost from `api_cost_events`
- `src/app/api/usage/breakdown/route.ts` — new per-user breakdown endpoint
- `src/app/api/help-chat/route.ts` — logs cost with user_id
- `src/app/(dashboard)/settings/page.tsx` — Usage tab shows cost breakdown

## 6. After deploy, verify

1. Send a chat message → check `usage_logs` row has correct `estimated_cost`
2. Visit `/settings?tab=usage` → "Cost Breakdown" card populates
3. `/admin` → per-user cost column reflects both chat and agent costs
4. Transcribe a video (digest agent) → new `api_cost_events` row with
   `modality='audio'` and the transcribing user's `user_id`
