"""Fix OpenRouter streaming to capture usage tokens. Run on VPS."""
with open("/root/harv/lib/harv_brain.py") as f:
    code = f.read()

# 1. Fix PLAN_MODELS to all DeepSeek
code = code.replace(
    '"pro":      ("anthropic",  "claude-sonnet-4-20250514"),     # $3/M in, $15/M out',
    '"pro":      ("openrouter", "deepseek/deepseek-chat"),      # same as free for now'
)
code = code.replace(
    '"business": ("anthropic",  "claude-sonnet-4-20250514"),     # same as pro for now',
    '"business": ("openrouter", "deepseek/deepseek-chat"),      # same as free for now'
)
code = code.replace(
    '"owner":    ("anthropic",  "claude-sonnet-4-20250514"),     # owner gets the best',
    '"owner":    ("openrouter", "deepseek/deepseek-chat"),      # owner uses DeepSeek too for now'
)

# 2. Add stream_options
if "stream_options" not in code:
    code = code.replace(
        "        stream=True,\n    )",
        '        stream=True,\n        stream_options={"include_usage": True},\n    )'
    )

# 3. Fix usage check - move before delta check
old_loop = '''    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if not delta:
            # Check for usage in the final chunk
            if chunk.usage:
                in_tok = getattr(chunk.usage, 'prompt_tokens', 0) or getattr(chunk.usage, 'input_tokens', 0) or 0
                out_tok = getattr(chunk.usage, 'completion_tokens', 0) or getattr(chunk.usage, 'output_tokens', 0) or 0
            continue'''

new_loop = '''    for chunk in stream:
        # Check usage on every chunk (OpenRouter sends it after finish)
        if chunk.usage:
            in_tok = getattr(chunk.usage, 'prompt_tokens', 0) or getattr(chunk.usage, 'input_tokens', 0) or 0
            out_tok = getattr(chunk.usage, 'completion_tokens', 0) or getattr(chunk.usage, 'output_tokens', 0) or 0

        delta = chunk.choices[0].delta if chunk.choices else None
        if not delta:
            continue'''

if old_loop in code:
    code = code.replace(old_loop, new_loop)
    print("Fixed usage check in streaming loop")
else:
    print("WARNING: Could not find streaming loop pattern")

with open("/root/harv/lib/harv_brain.py", "w") as f:
    f.write(code)

print("All patches applied")
