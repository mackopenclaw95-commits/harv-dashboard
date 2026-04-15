-- ============================================================
-- Marketing queue — shared Twitter + Reddit scheduling
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('twitter', 'reddit')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'posted', 'failed', 'rejected', 'submit_url_ready')),
  scheduled_for timestamptz,           -- null = manual approve only
  content text NOT NULL,                -- tweet body or reddit self-text
  title text,                            -- reddit title (null for tweets)
  subreddit text,                        -- reddit only
  post_url text,                         -- populated after posting
  posted_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_queue_status
  ON marketing_queue (status, scheduled_for);

ALTER TABLE marketing_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketing_queue' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON marketing_queue FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
