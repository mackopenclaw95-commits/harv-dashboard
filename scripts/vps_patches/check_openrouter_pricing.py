"""Fetch live OpenRouter model pricing for every model we use.
Compare against our Supabase model_pricing table and VPS _MODEL_PRICING dict.
"""
import json
import os
import sys
import urllib.request

# Load API key from .env
or_key = None
try:
    with open('/root/harv/.env', 'r') as f:
        for line in f:
            if line.startswith('OPENROUTER_API_KEY'):
                or_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                break
except Exception as e:
    print(f'ERROR reading .env: {e}')
    sys.exit(1)

if not or_key:
    print('OPENROUTER_API_KEY not found in /root/harv/.env')
    sys.exit(1)

# Models we care about (keep in sync with Supabase model_pricing)
TARGETS = {
    'openai/gpt-4.1',
    'deepseek/deepseek-chat',
    'deepseek/deepseek-chat-v3-0324',
    'deepseek/deepseek-v3.2',
    'deepseek/deepseek-r1',
    'google/gemini-2.0-flash-lite-001',
    'google/gemini-2.5-flash',
    'x-ai/grok-4.1-fast',
    'x-ai/grok-3',
    'qwen/qwen3-8b',
    'minimax/minimax-m2.1',
    'minimax/minimax-m2',
    # Free models — verified alive 2026-04-15
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-3-4b-it:free',
}

# Our current rates (mirror of VPS _MODEL_PRICING + Supabase)
OUR_RATES = {
    'openai/gpt-4.1':                        (2.00,  8.00),
    'deepseek/deepseek-chat':                (0.32,  0.89),
    'deepseek/deepseek-chat-v3-0324':        (0.27,  1.10),
    'deepseek/deepseek-v3.2':                (0.26,  0.38),
    'deepseek/deepseek-r1':                  (0.55,  2.19),
    'google/gemini-2.0-flash-lite-001':      (0.075, 0.30),
    'google/gemini-2.5-flash':               (0.10,  0.40),
    'x-ai/grok-4.1-fast':                    (0.05,  0.10),
    'x-ai/grok-3':                           (3.00,  15.00),
    'qwen/qwen3-8b':                         (0.04,  0.09),
    'minimax/minimax-m2.1':                  (0.30,  1.20),
    'minimax/minimax-m2':                    (0.255, 1.00),
    'meta-llama/llama-3.3-70b-instruct:free':(0.00,  0.00),
    'google/gemma-3-4b-it:free':             (0.00,  0.00),
}

req = urllib.request.Request(
    'https://openrouter.ai/api/v1/models',
    headers={'Authorization': f'Bearer {or_key}'},
)
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)

found = {}
for m in data.get('data', []):
    mid = m.get('id', '')
    if mid in TARGETS:
        p = m.get('pricing', {}) or {}
        in_rate = float(p.get('prompt', 0) or 0) * 1_000_000
        out_rate = float(p.get('completion', 0) or 0) * 1_000_000
        found[mid] = (round(in_rate, 4), round(out_rate, 4))

print('=' * 90)
print(f'{"MODEL":<42} {"OUR IN":>10} {"LIVE IN":>10} {"OUR OUT":>10} {"LIVE OUT":>10}  {"DIFF":<10}')
print('=' * 90)
any_mismatch = False
for mid in sorted(TARGETS):
    ours = OUR_RATES.get(mid)
    live = found.get(mid)
    if live is None:
        print(f'{mid:<42} {"N/A":>10} {"MISSING":>10}')
        continue
    if ours is None:
        print(f'{mid:<42} {"UNKNOWN":>10} {live[0]:>10.4f} {"":<10} {live[1]:>10.4f}')
        continue
    in_diff = abs(ours[0] - live[0])
    out_diff = abs(ours[1] - live[1])
    mark = ''
    if in_diff > 0.001 or out_diff > 0.001:
        mark = ' ← MISMATCH'
        any_mismatch = True
    print(f'{mid:<42} {ours[0]:>10.4f} {live[0]:>10.4f} {ours[1]:>10.4f} {live[1]:>10.4f}  {mark}')

print('=' * 90)
if any_mismatch:
    print('⚠  One or more rates differ from OpenRouter live pricing — update the pricing table.')
    sys.exit(1)
else:
    print('✓  All rates match OpenRouter live pricing.')
