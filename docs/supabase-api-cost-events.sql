-- Persistent API cost tracking (survives VPS event rotation)
CREATE TABLE IF NOT EXISTS api_cost_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vps_event_id int UNIQUE NOT NULL,
  model text NOT NULL DEFAULT '',
  tokens int DEFAULT 0,
  cost numeric(10,6) DEFAULT 0,
  agent text DEFAULT '',
  summary text DEFAULT '',
  event_timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_cost_events_timestamp
  ON api_cost_events (event_timestamp);

-- Allow service role full access (admin-only table)
ALTER TABLE api_cost_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON api_cost_events
  FOR ALL USING (true) WITH CHECK (true);
