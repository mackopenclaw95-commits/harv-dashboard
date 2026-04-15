"""Sync VPS _MODEL_PRICING dict with the current launch-ready rates.

Replaces the existing dict in /root/harv/lib/harv_lib.py with an expanded one
covering all models Harv/agents actually call. Safe to re-run.
"""
import py_compile, re, sys

PATH = '/root/harv/lib/harv_lib.py'
SENTINEL = '# --- VPS_PRICING_SYNC_V1 ---'

NEW_DICT = """_MODEL_PRICING = {
    # --- VPS_PRICING_SYNC_V2 --- (verified against OpenRouter live /v1/models 2026-04-15)
    # Legacy Claude rows kept so any stray call still gets logged correctly
    'claude-sonnet-4-6':               {'input': 3.00,  'output': 15.00},
    'claude-opus-4-6':                 {'input': 15.00, 'output': 75.00},
    'claude-haiku-4-5-20251001':       {'input': 0.80,  'output':  4.00},
    'claude-haiku-4-5':                {'input': 0.80,  'output':  4.00},
    'claude-3-5-haiku-20241022':       {'input': 0.80,  'output':  4.00},

    # OpenRouter — text (live-verified rates)
    'deepseek/deepseek-chat':          {'input': 0.32,  'output':  0.89},
    'deepseek/deepseek-chat-v3-0324':  {'input': 0.20,  'output':  0.77},
    'deepseek/deepseek-v3':            {'input': 0.27,  'output':  1.10},
    'deepseek/deepseek-v3.2':          {'input': 0.26,  'output':  0.38},
    'deepseek/deepseek-r1':            {'input': 0.70,  'output':  2.50},
    'x-ai/grok-4.1-fast':              {'input': 0.20,  'output':  0.50},
    'x-ai/grok-3':                     {'input': 3.00,  'output': 15.00},
    'minimax/minimax-m2.1':            {'input': 0.29,  'output':  0.95},
    'minimax/minimax-m2':              {'input': 0.255, 'output':  1.00},
    'qwen/qwen3-8b':                   {'input': 0.05,  'output':  0.40},
    'qwen/qwen3-8b:free':              {'input': 0.00,  'output':  0.00},
    'qwen/qwen3-14b':                  {'input': 0.08,  'output':  0.23},
    'google/gemini-2.0-flash-lite-001':{'input': 0.075, 'output':  0.30},
    'google/gemini-2.5-flash':         {'input': 0.30,  'output':  2.50},

    # OpenAI via OpenRouter (used by Harv Max tier — verified match OpenAI base)
    'openai/gpt-4.1':                  {'input': 2.00,  'output':  8.00},
    'gpt-4.1':                         {'input': 2.00,  'output':  8.00},
    'gpt-4o':                          {'input': 2.50,  'output': 10.00},
    'gpt-4o-mini':                     {'input': 0.15,  'output':  0.60},
}
"""

with open(PATH, 'r') as f:
    content = f.read()

# Brace-matching scan — the dict contains nested `{...}` per row so naive
# regex is insufficient.
start = content.find('_MODEL_PRICING = {')
if start < 0:
    print('FATAL: could not find _MODEL_PRICING = {')
    sys.exit(2)
depth = 0
i = start
end = -1
while i < len(content):
    ch = content[i]
    if ch == '{':
        depth += 1
    elif ch == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            break
    i += 1
if end < 0:
    print('FATAL: unbalanced braces in _MODEL_PRICING')
    sys.exit(2)

# Preserve the trailing newline if present
if end < len(content) and content[end] == '\n':
    end += 1
new_content = content[:start] + NEW_DICT + content[end:]

with open(PATH, 'w') as f:
    f.write(new_content)

py_compile.compile(PATH, doraise=True)
print('pricing dict synced + compiled OK')
