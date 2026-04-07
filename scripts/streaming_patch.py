"""
Patch script: Add streaming LLM callers and chat_with_harv_stream() to harv_brain.py.
Run on VPS: python3 /tmp/streaming_patch.py
"""

import re

BRAIN_PATH = '/root/harv/lib/harv_brain.py'

# Read current file
with open(BRAIN_PATH) as f:
    code = f.read()

# ── 1. Add streaming Anthropic caller after _call_anthropic ──

ANTHROPIC_STREAM = '''

def _call_anthropic_stream(model: str, system: str, messages: list):
    """
    Streaming Anthropic call. Yields (event_type, data) tuples:
      ("delta", "text chunk")
      ("tool_use", {"id": ..., "name": ..., "input": ...})
      ("usage", {"in": N, "out": N})
    """
    client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY', ''))
    tool_calls = []
    _current_tool = None

    with client.messages.stream(
        model=model, max_tokens=MAX_TOKENS,
        system=system, tools=TOOLS, messages=messages,
    ) as stream:
        for event in stream:
            if event.type == 'content_block_start':
                if event.content_block.type == 'tool_use':
                    _current_tool = {
                        'id': event.content_block.id,
                        'name': event.content_block.name,
                        'input_json': '',
                    }
            elif event.type == 'content_block_delta':
                if event.delta.type == 'text_delta':
                    yield ('delta', event.delta.text)
                elif event.delta.type == 'input_json_delta':
                    if _current_tool:
                        _current_tool['input_json'] += event.delta.partial_json
            elif event.type == 'content_block_stop':
                if _current_tool:
                    try:
                        parsed_input = json.loads(_current_tool['input_json']) if _current_tool['input_json'] else {}
                    except json.JSONDecodeError:
                        parsed_input = {}
                    tc = {
                        'id': _current_tool['id'],
                        'name': _current_tool['name'],
                        'input': parsed_input,
                    }
                    tool_calls.append(tc)
                    yield ('tool_use', tc)
                    _current_tool = None

        # After stream ends, get final message for usage
        final = stream.get_final_message()
        done = final.stop_reason != 'tool_use'
        yield ('usage', {
            'in': final.usage.input_tokens,
            'out': final.usage.output_tokens,
            'done': done,
            'tool_calls': tool_calls,
        })

'''

# Insert after _call_anthropic function
pattern = r'(def _call_anthropic\(.*?\n(?:.*?\n)*?    return text, tcs, done, response\.usage\.input_tokens, response\.usage\.output_tokens\n)'
match = re.search(pattern, code)
if match:
    insert_pos = match.end()
    code = code[:insert_pos] + ANTHROPIC_STREAM + code[insert_pos:]
    print('✓ Added _call_anthropic_stream')
else:
    print('✗ Could not find _call_anthropic to insert after')

# ── 2. Add streaming OpenRouter caller after _call_openrouter ──

OPENROUTER_STREAM = '''

def _call_openrouter_stream(model: str, system: str, messages: list):
    """
    Streaming OpenRouter call. Same yield format as _call_anthropic_stream.
    """
    try:
        import openai
    except ImportError:
        raise RuntimeError('openai package not installed')

    cfg    = load_core()['llm']['openrouter']
    client = openai.OpenAI(
        base_url=cfg['base_url'],
        api_key=os.environ.get('OPENROUTER_API_KEY', ''),
    )

    stream = client.chat.completions.create(
        model=model,
        max_tokens=MAX_TOKENS,
        messages=_to_openai_messages(system, messages),
        tools=_tools_for_openai(),
        stream=True,
    )

    tool_calls = {}  # id -> {name, arguments_str}
    full_text = ''
    in_tok, out_tok = 0, 0

    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if not delta:
            # Check for usage in the final chunk
            if chunk.usage:
                in_tok = getattr(chunk.usage, 'prompt_tokens', 0) or getattr(chunk.usage, 'input_tokens', 0) or 0
                out_tok = getattr(chunk.usage, 'completion_tokens', 0) or getattr(chunk.usage, 'output_tokens', 0) or 0
            continue

        # Text content
        if delta.content:
            full_text += delta.content
            yield ('delta', delta.content)

        # Tool calls (streamed as deltas)
        if delta.tool_calls:
            for tc_delta in delta.tool_calls:
                idx = tc_delta.index
                if idx not in tool_calls:
                    tool_calls[idx] = {
                        'id': tc_delta.id or '',
                        'name': tc_delta.function.name if tc_delta.function and tc_delta.function.name else '',
                        'arguments': '',
                    }
                if tc_delta.id:
                    tool_calls[idx]['id'] = tc_delta.id
                if tc_delta.function:
                    if tc_delta.function.name:
                        tool_calls[idx]['name'] = tc_delta.function.name
                    if tc_delta.function.arguments:
                        tool_calls[idx]['arguments'] += tc_delta.function.arguments

    # Emit completed tool calls
    tcs = []
    for idx in sorted(tool_calls.keys()):
        tc = tool_calls[idx]
        try:
            parsed = json.loads(tc['arguments']) if tc['arguments'] else {}
        except json.JSONDecodeError:
            parsed = {}
        final_tc = {'id': tc['id'], 'name': tc['name'], 'input': parsed}
        tcs.append(final_tc)
        yield ('tool_use', final_tc)

    finish = chunk.choices[0].finish_reason if chunk.choices else 'stop'
    done = finish != 'tool_calls'

    yield ('usage', {
        'in': int(in_tok),
        'out': int(out_tok),
        'done': done,
        'tool_calls': tcs,
    })

'''

# Insert after _call_openrouter return statement
pattern2 = r'(    return text, tcs, done, int\(in_t\), int\(out_t\)\n)'
matches = list(re.finditer(pattern2, code))
if matches:
    # Use the last match (which is in _call_openrouter, not _call_anthropic)
    insert_pos = matches[-1].end()
    code = code[:insert_pos] + OPENROUTER_STREAM + code[insert_pos:]
    print('✓ Added _call_openrouter_stream')
else:
    print('✗ Could not find _call_openrouter return to insert after')

# ── 3. Add chat_with_harv_stream() after chat_with_harv ──

STREAM_CHAT = '''

def chat_with_harv_stream(session_id: str, user_text: str):
    """
    Streaming version of chat_with_harv. Yields SSE-formatted strings:
      data: {"type":"delta","text":"..."}\n\n
      data: {"type":"tool","name":"...","description":"..."}\n\n
      data: {"type":"tool_result","output":"..."}\n\n
      data: {"type":"done","full_text":"..."}\n\n
    """
    provider, model = _load_model_config()
    stream_fn = _call_anthropic_stream if provider == 'anthropic' else _call_openrouter_stream
    system    = build_system_prompt()

    # Pre-routing (non-streaming — instant results)
    pre_result = _pre_route(user_text)
    if pre_result is not None:
        if session_id not in _history:
            _history[session_id] = []
        _history[session_id].append({'role': 'user',      'content': user_text})
        _history[session_id].append({'role': 'assistant', 'content': pre_result})
        if len(_history[session_id]) > MAX_HISTORY:
            _history[session_id] = _history[session_id][-MAX_HISTORY:]
        yield f'data: {json.dumps({"type": "delta", "text": pre_result})}\\n\\n'
        yield f'data: {json.dumps({"type": "done", "full_text": pre_result})}\\n\\n'
        return

    if session_id not in _history:
        _history[session_id] = []

    messages       = list(_history[session_id]) + [{'role': 'user', 'content': user_text}]
    final_text     = ''
    _total_in_tok  = 0
    _total_out_tok = 0

    try:
        for iteration in range(MAX_TOOL_ITER):
            turn_text   = ''
            turn_tools  = []
            turn_usage  = {}

            for event_type, data in stream_fn(model, system, messages):
                if event_type == 'delta':
                    turn_text += data
                    yield f'data: {json.dumps({"type": "delta", "text": data})}\\n\\n'
                elif event_type == 'tool_use':
                    turn_tools.append(data)
                    yield f'data: {json.dumps({"type": "tool", "name": data["name"]})}\\n\\n'
                elif event_type == 'usage':
                    turn_usage = data
                    _total_in_tok  += data.get('in', 0)
                    _total_out_tok += data.get('out', 0)

            log_api_cost(session_id, 'Harv', model,
                         turn_usage.get('in', 0), turn_usage.get('out', 0),
                         task_type='conversation')

            is_done    = turn_usage.get('done', True)
            tool_calls = turn_usage.get('tool_calls', turn_tools)

            if is_done or not tool_calls:
                final_text = turn_text
                break

            # Record assistant turn in Anthropic format
            assistant_content = []
            if turn_text:
                assistant_content.append({'type': 'text', 'text': turn_text})
            for tc in tool_calls:
                assistant_content.append({
                    'type': 'tool_use', 'id': tc['id'],
                    'name': tc['name'], 'input': tc['input'],
                })
            messages.append({'role': 'assistant', 'content': assistant_content})

            # Execute tools (blocking — but user already saw LLM text)
            tool_results = []
            for tc in tool_calls:
                log.info(f"Tool call: {tc['name']} {json.dumps(tc['input'])[:120]}")
                handler = TOOL_HANDLERS.get(tc['name'])
                try:
                    result = handler(tc['input']) if handler else f"Unknown tool: {tc['name']}"
                except Exception as e:
                    result = f'Tool error: {e}'
                log.info(f'Tool result: {str(result)[:120]}')
                tool_results.append({
                    'type': 'tool_result', 'tool_use_id': tc['id'], 'content': result,
                })
                yield f'data: {json.dumps({"type": "tool_result", "name": tc["name"], "output": str(result)[:200]})}\\n\\n'

            messages.append({'role': 'user', 'content': tool_results})
            # Loop continues — next LLM turn will also stream

        else:
            final_text = final_text or '[Max tool iterations reached]'

        # Persist history
        _history[session_id].append({'role': 'user',      'content': user_text})
        _history[session_id].append({'role': 'assistant', 'content': final_text})
        if len(_history[session_id]) > MAX_HISTORY:
            _history[session_id] = _history[session_id][-MAX_HISTORY:]

    finally:
        _call_ledger_for_harv(user_text, calc_cost(model, _total_in_tok, _total_out_tok))

    # Background Supabase save
    threading.Thread(
        target=_save_to_supabase,
        args=(session_id, user_text, final_text),
        daemon=True,
    ).start()

    yield f'data: {json.dumps({"type": "done", "full_text": final_text})}\\n\\n'

'''

# Insert after clear_history function
pattern3 = r'(def clear_history\(session_id: str\) -> None:\n    _history\.pop\(session_id, None\)\n)'
match3 = re.search(pattern3, code)
if match3:
    insert_pos = match3.end()
    code = code[:insert_pos] + STREAM_CHAT + code[insert_pos:]
    print('✓ Added chat_with_harv_stream')
else:
    print('✗ Could not find clear_history to insert after')

# Write patched file
with open(BRAIN_PATH, 'w') as f:
    f.write(code)

print('\\nDone. Patched', BRAIN_PATH)
