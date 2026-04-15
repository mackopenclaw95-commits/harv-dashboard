-- ============================================================
-- Support tickets — contact form submissions from /support page
-- Run once in Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  category text NOT NULL DEFAULT 'general', -- general | bug | billing | feature | account
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',      -- open | in_progress | resolved | closed
  admin_response text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, created_at DESC);

-- RLS: users see their own tickets; owner/admin can see all via service client
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_tickets" ON support_tickets;
CREATE POLICY "users_see_own_tickets" ON support_tickets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_tickets" ON support_tickets;
CREATE POLICY "users_insert_own_tickets" ON support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
