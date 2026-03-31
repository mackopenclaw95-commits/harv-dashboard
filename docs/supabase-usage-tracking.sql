-- Usage tracking table
CREATE TABLE IF NOT EXISTS usage_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  agent_name text NOT NULL DEFAULT 'Harv',
  message_count int NOT NULL DEFAULT 1,
  tokens_used int DEFAULT 0,
  estimated_cost numeric(10,6) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date
  ON usage_logs (user_id, created_at);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can read own usage, owner can read all
CREATE POLICY "Users read own usage" ON usage_logs
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- Insert allowed for authenticated users
CREATE POLICY "Users insert own usage" ON usage_logs
  FOR INSERT WITH CHECK (true);
