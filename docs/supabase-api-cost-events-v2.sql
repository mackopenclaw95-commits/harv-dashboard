-- Migration: add per-user attribution + richer cost fields to api_cost_events
--
-- Run this ONCE after the initial supabase-api-cost-events.sql has been applied.
-- Safe to re-run (all changes use IF NOT EXISTS / IF EXISTS guards).

ALTER TABLE api_cost_events
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS parent_agent text,        -- e.g. 'Router' when a router call chained into an agent
  ADD COLUMN IF NOT EXISTS tokens_in int DEFAULT 0,  -- split input/output so caching discounts can apply
  ADD COLUMN IF NOT EXISTS tokens_out int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_tokens int DEFAULT 0, -- prompt-cache hit tokens
  ADD COLUMN IF NOT EXISTS modality text DEFAULT 'text', -- text | image | audio | vlm | tts
  ADD COLUMN IF NOT EXISTS units numeric(10,4) DEFAULT 0; -- for non-token modalities (minutes, images, etc.)

CREATE INDEX IF NOT EXISTS idx_api_cost_events_user_id
  ON api_cost_events (user_id, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_api_cost_events_agent_user
  ON api_cost_events (agent, user_id);

-- Loosen the insert policy so users can see their own events (not just service role)
DROP POLICY IF EXISTS "Users read own cost events" ON api_cost_events;
CREATE POLICY "Users read own cost events" ON api_cost_events
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
  );
