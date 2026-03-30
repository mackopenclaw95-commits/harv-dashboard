-- ============================================================
-- Per-user Row Level Security (RLS) policies
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Conversations: users see only their own
DROP POLICY IF EXISTS "Users see own conversations" ON conversations;
CREATE POLICY "Users see own conversations" ON conversations
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IS NULL  -- legacy data without user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- Messages: users see messages from their own conversations
DROP POLICY IF EXISTS "Users see own messages" ON messages;
CREATE POLICY "Users see own messages" ON messages
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IS NULL
    OR conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- Documents: users see only their own
DROP POLICY IF EXISTS "Users see own documents" ON documents;
CREATE POLICY "Users see own documents" ON documents
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IS NULL
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- Projects: users see only their own
DROP POLICY IF EXISTS "Users see own projects" ON projects;
CREATE POLICY "Users see own projects" ON projects
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IS NULL
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- Memory entries: users see only their own
DROP POLICY IF EXISTS "Users see own memory" ON memory_entries;
CREATE POLICY "Users see own memory" ON memory_entries
  FOR ALL USING (true);  -- memory is currently shared, will scope later

-- Enable RLS on all tables (idempotent)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
