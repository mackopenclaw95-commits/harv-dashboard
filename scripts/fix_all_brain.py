"""Apply all brain patches: PLAN_MODELS, plan params, stream usage fix. Run on VPS."""
with open("/root/harv/lib/harv_brain.py") as f:
    code = f.read()

# 1. Add PLAN_MODELS + _get_model_for_plan after _load_model_config
PLAN_BLOCK = '''

# ---------------------------------------------------------------------------
# Tiered model selection based on user plan
# ---------------------------------------------------------------------------
PLAN_MODELS = {
    "free":     ("openrouter", "deepseek/deepseek-chat"),
    "pro":      ("openrouter", "deepseek/deepseek-chat"),
    "business": ("openrouter", "deepseek/deepseek-chat"),
    "owner":    ("openrouter", "deepseek/deepseek-chat"),
}

def _get_model_for_plan(plan: str = "free"):
    """Return (provider, model) based on user plan tier."""
    provider, model = PLAN_MODELS.get(plan, PLAN_MODELS["free"])
    return provider, model

'''

if "PLAN_MODELS" not in code:
    # Insert after _load_model_config function
    marker = "def _tools_for_openai():"
    idx = code.find(marker)
    if idx > 0:
        comment_idx = code.rfind("# ---", 0, idx)
        code = code[:comment_idx] + PLAN_BLOCK + code[comment_idx:]
        print("Added PLAN_MODELS + _get_model_for_plan")
else:
    print("PLAN_MODELS already exists")

# 2. Add plan param to both chat functions
code = code.replace(
    'def chat_with_harv(session_id: str, user_text: str) -> str:',
    'def chat_with_harv(session_id: str, user_text: str, plan: str = "free") -> str:'
)
code = code.replace(
    'def chat_with_harv_stream(session_id: str, user_text: str):',
    'def chat_with_harv_stream(session_id: str, user_text: str, plan: str = "free"):'
)

# 3. Use _get_model_for_plan in both functions (replace _load_model_config calls in chat functions)
# Find the two chat functions and replace their model loading
lines = code.split('\n')
new_lines = []
in_chat_func = False
for i, line in enumerate(lines):
    if 'def chat_with_harv' in line and 'plan' in line:
        in_chat_func = True
    if in_chat_func and 'provider, model = _load_model_config()' in line:
        line = line.replace('_load_model_config()', '_get_model_for_plan(plan)')
        in_chat_func = False
        print(f"Replaced _load_model_config with _get_model_for_plan at line {i+1}")
    new_lines.append(line)
code = '\n'.join(new_lines)

# 4. Add stream_options for usage reporting
if "stream_options" not in code:
    code = code.replace(
        "        stream=True,\n    )",
        '        stream=True,\n        stream_options={"include_usage": True},\n    )'
    )
    print("Added stream_options")

# 5. Fix usage check - move before delta check
old_usage = """    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if not delta:
            # Check for usage in the final chunk
            if chunk.usage:
                in_tok = getattr(chunk.usage, 'prompt_tokens', 0) or getattr(chunk.usage, 'input_tokens', 0) or 0
                out_tok = getattr(chunk.usage, 'completion_tokens', 0) or getattr(chunk.usage, 'output_tokens', 0) or 0
            continue"""

new_usage = """    for chunk in stream:
        # Check usage on every chunk (OpenRouter sends it after finish)
        if chunk.usage:
            in_tok = getattr(chunk.usage, 'prompt_tokens', 0) or getattr(chunk.usage, 'input_tokens', 0) or 0
            out_tok = getattr(chunk.usage, 'completion_tokens', 0) or getattr(chunk.usage, 'output_tokens', 0) or 0

        delta = chunk.choices[0].delta if chunk.choices else None
        if not delta:
            continue"""

if old_usage in code:
    code = code.replace(old_usage, new_usage)
    print("Fixed usage check in streaming loop")
else:
    print("WARNING: Could not find streaming loop for usage fix")

with open("/root/harv/lib/harv_brain.py", "w") as f:
    f.write(code)

print("All patches applied successfully")
