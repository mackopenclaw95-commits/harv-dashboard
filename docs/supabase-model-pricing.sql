-- Single source of truth for LLM / service pricing
-- Rates are USD per million tokens (input/output) for text models,
-- or USD per unit for other modalities (image/minute of audio/etc.)
--
-- VPS and Next.js both read from here. Update rates without redeploying.

CREATE TABLE IF NOT EXISTS model_pricing (
  model text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'openrouter',
  input_per_million numeric(10,6) NOT NULL DEFAULT 0,
  output_per_million numeric(10,6) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'tokens',        -- 'tokens' | 'image' | 'audio_minute' | 'tts_char'
  per_unit_cost numeric(10,6) NOT NULL DEFAULT 0, -- used when unit != 'tokens'
  modality text NOT NULL DEFAULT 'text',      -- 'text' | 'image' | 'audio' | 'vlm' | 'tts'
  is_free boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_provider ON model_pricing (provider);
CREATE INDEX IF NOT EXISTS idx_model_pricing_modality ON model_pricing (modality);

ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (for client-side cost display)
CREATE POLICY "Auth read pricing" ON model_pricing
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can write
CREATE POLICY "Service role write" ON model_pricing
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ── Seed current rates (as of 2026-04-15) ──────────────────────────────

INSERT INTO model_pricing (model, provider, input_per_million, output_per_million, modality, is_free, notes) VALUES
  -- Text models via OpenRouter
  ('deepseek/deepseek-chat',           'openrouter', 0.32,  0.89,  'text', false, 'DeepSeek Chat'),
  ('deepseek/deepseek-chat-v3-0324',   'openrouter', 0.27,  1.10,  'text', false, 'DeepSeek V3 0324 (help-chat)'),
  ('deepseek/deepseek-v3.2',           'openrouter', 0.26,  0.38,  'text', false, 'DeepSeek V3.2 (Marketing)'),
  ('deepseek/deepseek-r1',             'openrouter', 0.55,  2.19,  'text', false, 'DeepSeek R1 reasoning'),
  ('x-ai/grok-4.1-fast',               'openrouter', 0.05,  0.10,  'text', false, 'Grok 4.1 Fast'),
  ('x-ai/grok-3',                      'openrouter', 3.00,  15.00, 'text', false, 'Grok 3'),
  ('minimax/minimax-m2.1',             'openrouter', 0.30,  1.20,  'text', false, 'MiniMax M2.1 (agent default)'),
  ('qwen/qwen3-8b',                    'openrouter', 0.04,  0.09,  'text', false, 'Qwen3 8B'),
  -- Free models — verified alive on OpenRouter /v1/models 2026-04-15
  ('meta-llama/llama-3.3-70b-instruct:free', 'openrouter', 0.00, 0.00, 'text', true, 'Llama 3.3 70B free — user-facing fallback'),
  ('google/gemma-3-4b-it:free',        'openrouter', 0.00,  0.00,  'text', true,  'Gemma 3 4B free — background agents'),
  ('google/gemini-2.0-flash-lite-001', 'openrouter', 0.075, 0.30,  'text', false, 'Gemini 2.0 Flash Lite'),
  ('google/gemini-2.5-flash',          'openrouter', 0.10,  0.40,  'vlm',  false, 'Gemini 2.5 Flash VLM'),
  ('openai/gpt-4.1',                   'openrouter', 2.00,  8.00,  'text', false, 'GPT-4.1'),

  -- Audio transcription (per-minute pricing, not tokens)
  ('groq/whisper-large-v3-turbo',      'groq',       0,     0,     'audio', false, 'Groq Whisper Turbo — $0.04/hr')
ON CONFLICT (model) DO UPDATE SET
  input_per_million = EXCLUDED.input_per_million,
  output_per_million = EXCLUDED.output_per_million,
  modality = EXCLUDED.modality,
  updated_at = now();

-- Remove dead models that OpenRouter no longer serves (2026-04-15 cleanup)
DELETE FROM model_pricing WHERE model IN (
  'qwen/qwen3-8b:free',
  'deepseek/deepseek-r1-0528-qwen3-8b:free',
  'deepseek/deepseek-v3'
);

-- Set audio/image per-unit costs
UPDATE model_pricing SET unit = 'audio_minute', per_unit_cost = 0.00067
  WHERE model = 'groq/whisper-large-v3-turbo';

INSERT INTO model_pricing (model, provider, modality, unit, per_unit_cost, notes) VALUES
  ('openai/whisper-1',            'openai',    'audio', 'audio_minute', 0.006,  'OpenAI Whisper — $0.006/min'),
  ('google/imagen-4',             'google',    'image', 'image',        0.030,  'Imagen 4 — ~$0.03/image'),
  ('kie/nano-banana',             'kie',       'image', 'image',        0.020,  'Nano Banana image gen'),
  ('openai/dall-e-3',             'openai',    'image', 'image',        0.040,  'DALL-E 3 standard 1024x1024')
ON CONFLICT (model) DO UPDATE SET
  unit = EXCLUDED.unit,
  per_unit_cost = EXCLUDED.per_unit_cost,
  updated_at = now();
