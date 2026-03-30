-- ============================================
-- Supabase Setup: Documents Table + Storage
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create the documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  file_type text NOT NULL,  -- 'image', 'document', 'spreadsheet', 'presentation', 'pdf', 'other'
  mime_type text,
  file_size bigint DEFAULT 0,
  storage_path text NOT NULL,
  agent_name text,
  tags text[] DEFAULT '{}',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Enable RLS with permissive policy (single-user system)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON documents
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_documents_agent ON documents(agent_name);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);

-- 4. Full-text search index
CREATE INDEX IF NOT EXISTS idx_documents_search
  ON documents USING gin(
    to_tsvector('english', coalesce(filename, '') || ' ' || coalesce(description, ''))
  );

-- ============================================
-- IMPORTANT: Storage Bucket Setup
-- ============================================
-- Go to Supabase Dashboard > Storage > New Bucket
-- Name: documents
-- Public: YES (so files can be viewed/downloaded from dashboard)
-- File size limit: 50MB (or your preference)
-- Allowed MIME types: leave empty (allow all)
--
-- Then add this storage policy in SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow all operations on the documents bucket (single-user system)
CREATE POLICY "allow_all_documents_storage" ON storage.objects
  FOR ALL
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');
