#!/usr/bin/env python3
"""
journal_compress.py — 3am EST cron: compress today's conversations into a journal entry.

Pulls all conversations + messages from Supabase for the current day (3am-3am boundary),
sends them to MiniMax M2.1 for compression, and writes the result to journal_entries.

Cron (UTC): 0 7 * * *   (3am EDT = 7am UTC)
"""

import json
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

sys.path.insert(0, '/root/harv')
load_dotenv('/root/harv/.env')

from lib.harv_lib import log_api_cost

EST = ZoneInfo('America/New_York')
LOG = '/root/harv/logs/journal_compress.log'
MODEL = 'minimax/minimax-m2.1'

COMPRESS_PROMPT = """You are Harv's journal compressor. Summarize the day's conversations as JSON.
CRITICAL: Return ONLY valid JSON. No markdown. No trailing commas. Keep strings SHORT (under 80 chars each).

{"summary":"Brief overview","accomplishments":["item1","item2"],"agents_used":["Harv"],"pending_tasks":["item"],"key_info":["fact"],"total_cost_usd":0.00}

Rules:
- Max 5 accomplishments, 3 key_info items, 3 pending_tasks
- Each array item must be a SHORT string (under 80 chars)
- summary must be 1-2 sentences max
- No nested objects. No special characters in strings. No newlines in strings.
- If nothing happened, use empty arrays and "No activity" summary."""


def _log(msg):
    ts = datetime.now(EST).strftime('%Y-%m-%d %H:%M:%S')
    line = f'{ts}  {msg}'
    print(line)
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, 'a') as f:
        f.write(line + '\n')


def _get_supabase():
    from supabase import create_client
    url = os.environ.get('SUPABASE_URL', '')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        raise RuntimeError('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
    return create_client(url, key)


def _get_day_boundaries():
    """Return (start, end) ISO timestamps for the 3am-3am EST day that just ended.
    If run at 3am April 12, covers April 11 3:00am to April 12 3:00am."""
    now = datetime.now(EST)
    # End = today at 3am
    end = now.replace(hour=3, minute=0, second=0, microsecond=0)
    # If somehow running before 3am, shift back
    if now.hour < 3:
        end = end - timedelta(days=1)
    # Start = yesterday at 3am
    start = end - timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _get_date_label(end_iso):
    """The journal date = the day the session covered (start day)."""
    end = datetime.fromisoformat(end_iso)
    session_date = end - timedelta(days=1)
    return session_date.strftime('%Y-%m-%d')


def _fetch_conversations(sb, start_iso, end_iso):
    """Fetch conversations that were active during the 3am-3am window.

    A conversation belongs to this day if it was CREATED during the window,
    even if messages continued past the 3am boundary. This prevents splitting
    a late-night conversation across two journal entries.

    Conversations created before the window that had new messages during it
    are also included (they resumed today).
    """
    # Get conversations that had any activity during the window:
    # - created during the window, OR
    # - updated during the window (resumed from before)
    result = sb.table('conversations').select('id, agent_name, title, created_at') \
        .gte('updated_at', start_iso) \
        .order('created_at', desc=False) \
        .execute()

    # Filter: include if created_at is within window OR updated_at is within window
    # but exclude conversations that were CREATED after the end boundary
    # (those belong to tomorrow's journal)
    filtered = []
    for conv in (result.data or []):
        created = conv.get('created_at', '')
        # If conversation was created AFTER the end boundary, it belongs to tomorrow
        if created >= end_iso:
            continue
        # If conversation was created before the start AND had no messages in window,
        # skip it (it belongs to an earlier day) — but updated_at >= start_iso
        # already ensures it had activity during the window
        filtered.append(conv)

    return filtered


def _fetch_messages(sb, conversation_ids):
    """Fetch all messages for given conversation IDs."""
    if not conversation_ids:
        return []
    # Supabase doesn't support IN with .in_() well for large lists, batch if needed
    all_messages = []
    for cid in conversation_ids:
        result = sb.table('messages').select('role, content, created_at') \
            .eq('conversation_id', cid) \
            .order('created_at', desc=False) \
            .execute()
        all_messages.extend(result.data or [])
    return all_messages


def _build_transcript(conversations, messages_by_conv):
    """Build a readable transcript from conversations and their messages."""
    lines = []
    for conv in conversations:
        agent = conv.get('agent_name', 'Unknown')
        title = conv.get('title') or 'Untitled'
        cid = conv['id']
        msgs = messages_by_conv.get(cid, [])
        if not msgs:
            continue
        lines.append(f'\n--- Conversation with {agent}: {title} ---')
        for m in msgs:
            role = m.get('role', 'unknown').upper()
            content = (m.get('content') or '')[:500]  # truncate long messages
            lines.append(f'{role}: {content}')
    return '\n'.join(lines)


def _call_llm(transcript):
    """Call MiniMax M2.1 via OpenRouter to compress the transcript."""
    import openai
    client = openai.OpenAI(
        base_url='https://openrouter.ai/api/v1',
        api_key=os.environ.get('OPENROUTER_API_KEY', ''),
    )
    now_str = datetime.now(EST).strftime('%Y-%m-%d %-I:%M %p EST')
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=500,
        messages=[
            {'role': 'system', 'content': COMPRESS_PROMPT},
            {'role': 'user', 'content': f'Date: {now_str}\n\nTranscript:\n{transcript}'},
        ],
    )
    text = (response.choices[0].message.content or '').strip()
    usage = response.usage
    in_tok = getattr(usage, 'prompt_tokens', 0) or 0
    out_tok = getattr(usage, 'completion_tokens', 0) or 0
    return text, int(in_tok), int(out_tok)


def _parse_llm_response(raw):
    """Parse LLM JSON response, stripping markdown fences and repairing common issues."""
    raw = raw.strip()
    if raw.startswith('```'):
        raw = raw.split('```')[1]
        if raw.startswith('json'):
            raw = raw[4:]
        raw = raw.strip()

    # Try direct parse first
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Repair: find the JSON object boundaries
    start = raw.find('{')
    end = raw.rfind('}')
    if start >= 0 and end > start:
        raw = raw[start:end + 1]
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

    # Repair: try to close unclosed strings/arrays/objects
    repaired = raw
    # Close any unclosed strings
    if repaired.count('"') % 2 != 0:
        repaired += '"'
    # Close unclosed arrays
    open_brackets = repaired.count('[') - repaired.count(']')
    repaired += ']' * max(0, open_brackets)
    # Close unclosed objects
    open_braces = repaired.count('{') - repaired.count('}')
    repaired += '}' * max(0, open_braces)

    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        raise ValueError(f'Could not parse LLM response as JSON: {raw[:200]}')


def _generate_session_id(date_str):
    """Generate S-YYYYMMDD-01 format session ID."""
    d = date_str.replace('-', '')
    return f'S-{d}-01'


def _save_journal_entry(sb, date_str, session_id, summary):
    """Write to journal_entries table in Supabase."""
    row = {
        'date': date_str,
        'session_id': session_id,
        'summary': summary.get('summary'),
        'accomplishments': summary.get('accomplishments', []),
        'agents_used': summary.get('agents_used', []),
        'pending_tasks': summary.get('pending_tasks', []),
        'key_info': summary.get('key_info', []),
        'total_cost_usd': float(summary.get('total_cost_usd', 0.0)),
    }
    # Upsert by date (one entry per day)
    existing = sb.table('journal_entries').select('id').eq('date', date_str).execute()
    if existing.data:
        sb.table('journal_entries').update(row).eq('date', date_str).execute()
        _log(f'Updated existing journal entry for {date_str}')
    else:
        sb.table('journal_entries').insert(row).execute()
        _log(f'Inserted new journal entry for {date_str}')


def _save_memory_entry(sb, session_id, summary):
    """Also persist to memory_entries for semantic search."""
    try:
        content = f"[Journal {session_id}] " + " | ".join(
            summary.get('accomplishments', []) + summary.get('key_info', [])
        )
        sb.table('memory_entries').insert({
            'content': content,
            'agent_name': 'Journal',
            'metadata': {
                'session_id': session_id,
                'source': 'journal_compress',
                'timestamp': datetime.now(EST).isoformat(),
            },
        }).execute()
    except Exception as e:
        _log(f'memory_entries save failed (non-critical): {e}')


def _wait_for_idle(sb, max_wait_min=15, idle_threshold_min=5):
    """Wait until no messages have been sent in the last idle_threshold_min minutes.
    Gives up after max_wait_min. Returns True if idle, False if timed out."""
    import time
    deadline = datetime.now(EST) + timedelta(minutes=max_wait_min)

    while datetime.now(EST) < deadline:
        cutoff = (datetime.now(EST) - timedelta(minutes=idle_threshold_min)).isoformat()
        recent = sb.table('messages').select('id', count='exact') \
            .gte('created_at', cutoff).execute()
        count = recent.count or 0
        if count == 0:
            return True
        _log(f'Active conversation detected ({count} msgs in last {idle_threshold_min}min), '
             f'waiting 2min...')
        time.sleep(120)

    _log(f'Timed out waiting for idle after {max_wait_min}min, proceeding anyway')
    return False


def main():
    _log('=== Journal compression started ===')

    sb = _get_supabase()

    # Wait for active conversations to go idle before compressing
    _wait_for_idle(sb, max_wait_min=15, idle_threshold_min=5)

    start_iso, end_iso = _get_day_boundaries()
    date_str = _get_date_label(end_iso)
    session_id = _generate_session_id(date_str)

    _log(f'Window: {start_iso} to {end_iso} (date={date_str}, sid={session_id})')

    # Fetch conversations (includes full conversations that span the boundary)
    conversations = _fetch_conversations(sb, start_iso, end_iso)
    _log(f'Found {len(conversations)} conversation(s)')

    if not conversations:
        _log('No conversations found — writing empty journal entry')
        empty = {
            'summary': 'No activity recorded for this day.',
            'accomplishments': [],
            'agents_used': [],
            'pending_tasks': [],
            'key_info': [],
            'total_cost_usd': 0.0,
        }
        _save_journal_entry(sb, date_str, session_id, empty)
        _log('=== Done (empty day) ===')
        return

    # Fetch messages
    conv_ids = [c['id'] for c in conversations]
    all_messages = []
    messages_by_conv = {}
    for cid in conv_ids:
        result = sb.table('messages').select('role, content, created_at') \
            .eq('conversation_id', cid) \
            .order('created_at', desc=False) \
            .execute()
        msgs = result.data or []
        messages_by_conv[cid] = msgs
        all_messages.extend(msgs)

    _log(f'Fetched {len(all_messages)} message(s) across {len(conv_ids)} conversation(s)')

    # Build transcript (cap at ~8000 chars to stay within model context)
    transcript = _build_transcript(conversations, messages_by_conv)
    if len(transcript) > 8000:
        transcript = transcript[:8000] + '\n\n[... truncated ...]'
    _log(f'Transcript built ({len(transcript)} chars)')

    # Call LLM
    try:
        raw_text, in_tok, out_tok = _call_llm(transcript)
        _log(f'LLM response ({in_tok}+{out_tok} tokens)')
        summary = _parse_llm_response(raw_text)
    except Exception as e:
        _log(f'LLM compression failed: {e}')
        # Fallback: basic summary from conversation metadata
        agents = list(set(c.get('agent_name', '') for c in conversations if c.get('agent_name')))
        summary = {
            'summary': f'{len(conversations)} conversation(s) with {len(all_messages)} messages.',
            'accomplishments': [],
            'agents_used': agents,
            'pending_tasks': [],
            'key_info': [f'Agents active: {", ".join(agents)}'],
            'total_cost_usd': 0.0,
        }
        in_tok, out_tok = 0, 0

    # Ensure schema defaults
    summary.setdefault('summary', '')
    summary.setdefault('accomplishments', [])
    summary.setdefault('agents_used', [])
    summary.setdefault('pending_tasks', [])
    summary.setdefault('key_info', [])
    summary.setdefault('total_cost_usd', 0.0)

    # Save to journal_entries
    _save_journal_entry(sb, date_str, session_id, summary)

    # Save to memory_entries (for semantic search)
    _save_memory_entry(sb, session_id, summary)

    # Log API cost
    if in_tok > 0:
        try:
            log_api_cost(
                session_id=session_id,
                agent='Journal',
                model=MODEL,
                input_tokens=in_tok,
                output_tokens=out_tok,
                task_type='journal_compress',
            )
        except Exception as e:
            _log(f'Cost logging failed (non-critical): {e}')

    _log(f'=== Done: {date_str} — {len(summary.get("accomplishments", []))} accomplishments, '
         f'{len(summary.get("agents_used", []))} agents ===')


if __name__ == '__main__':
    main()
