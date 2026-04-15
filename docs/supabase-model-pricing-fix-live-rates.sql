-- Fix pricing rates to match OpenRouter live values (verified 2026-04-15
-- via /api/v1/models endpoint). Run once.

UPDATE model_pricing SET input_per_million = 0.20, output_per_million = 0.77, updated_at = now()
  WHERE model = 'deepseek/deepseek-chat-v3-0324';

UPDATE model_pricing SET input_per_million = 0.70, output_per_million = 2.50, updated_at = now()
  WHERE model = 'deepseek/deepseek-r1';

UPDATE model_pricing SET input_per_million = 0.30, output_per_million = 2.50, updated_at = now()
  WHERE model = 'google/gemini-2.5-flash';

UPDATE model_pricing SET input_per_million = 0.29, output_per_million = 0.95, updated_at = now()
  WHERE model = 'minimax/minimax-m2.1';

UPDATE model_pricing SET input_per_million = 0.05, output_per_million = 0.40, updated_at = now()
  WHERE model = 'qwen/qwen3-8b';

UPDATE model_pricing SET input_per_million = 0.20, output_per_million = 0.50, updated_at = now()
  WHERE model = 'x-ai/grok-4.1-fast';

-- Sanity check — should return 6 rows
SELECT model, input_per_million, output_per_million, updated_at
FROM model_pricing
WHERE model IN (
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-r1',
  'google/gemini-2.5-flash',
  'minimax/minimax-m2.1',
  'qwen/qwen3-8b',
  'x-ai/grok-4.1-fast'
)
ORDER BY model;
