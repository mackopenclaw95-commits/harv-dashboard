-- ============================================================
-- Learning agent schema — replaces Google Sheets backend
-- Run once in Supabase SQL editor.
-- ============================================================

-- A "track" = one topic a user is studying (e.g. "FINRA SIE Exam", "TypeScript Generics")
CREATE TABLE IF NOT EXISTS learning_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  description text,
  level text DEFAULT 'beginner',          -- beginner | intermediate | advanced
  goal text,                               -- "pass exam", "build project", "general understanding"
  outline jsonb,                           -- [{title, topics: [...], done: bool}]
  status text DEFAULT 'active',            -- active | paused | completed
  progress_pct int DEFAULT 0,
  hours_logged numeric(10,2) DEFAULT 0,
  target_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_studied_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_learning_tracks_user ON learning_tracks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_learning_tracks_updated ON learning_tracks (updated_at DESC);

-- Generated study materials for a track (guides, flashcards, quizzes, resources)
CREATE TABLE IF NOT EXISTS learning_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES learning_tracks(id) ON DELETE CASCADE,
  type text NOT NULL,                      -- guide | flashcards | quiz | resources | summary | outline
  title text,
  content text,                            -- markdown content
  metadata jsonb,                          -- extra structured data (flashcard pairs, quiz answers)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_materials_track ON learning_materials (track_id, type);
CREATE INDEX IF NOT EXISTS idx_learning_materials_user ON learning_materials (user_id, created_at DESC);

-- Study sessions — hours logged per track
CREATE TABLE IF NOT EXISTS learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES learning_tracks(id) ON DELETE CASCADE,
  hours numeric(5,2) NOT NULL,
  notes text,
  logged_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_track ON learning_sessions (track_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user ON learning_sessions (user_id, logged_at DESC);

-- ============================================================
-- RLS — users see only their own data, owner sees all
-- ============================================================
ALTER TABLE learning_tracks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='learning_tracks' AND policyname='own tracks') THEN
    CREATE POLICY "own tracks" ON learning_tracks FOR ALL
      USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'))
      WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='learning_materials' AND policyname='own materials') THEN
    CREATE POLICY "own materials" ON learning_materials FOR ALL
      USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'))
      WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='learning_sessions' AND policyname='own sessions') THEN
    CREATE POLICY "own sessions" ON learning_sessions FOR ALL
      USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'))
      WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
  END IF;
END $$;
