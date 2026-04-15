"""
VPS patch: add cost emission to whisper_client.py

Wraps the Whisper call so that every transcription emits an `api_cost`
event via lib.event_log with:
  - provider/model
  - audio duration (minutes) in `units`
  - computed cost
  - user_id (passed through by the calling agent)

Apply from VPS:
    cd /root/harv
    python3 /path/to/whisper_cost_logging.py

Safe to re-run — uses a sentinel comment to detect prior application.
"""

import os
import re
import sys

PATH = '/root/harv/whisper_client.py'
SENTINEL = '# --- COST_LOGGING_PATCH_APPLIED ---'

# Cost rates (USD per audio minute)
GROQ_RATE_PER_MIN = 0.00067   # Groq whisper-large-v3-turbo
OPENAI_RATE_PER_MIN = 0.006   # OpenAI whisper-1


def main():
    if not os.path.exists(PATH):
        print(f'ERROR: {PATH} not found')
        sys.exit(1)

    with open(PATH, 'r') as f:
        content = f.read()

    if SENTINEL in content:
        print('Patch already applied — skipping')
        return

    # 1. Import event_log helper at the top
    import_block = (
        '\n' + SENTINEL + '\n'
        'try:\n'
        '    from lib.event_log import log_event as _log_event\n'
        'except Exception:\n'
        '    _log_event = None\n'
        '\n'
        'try:\n'
        '    from mutagen import File as _MutagenFile\n'
        'except Exception:\n'
        '    _MutagenFile = None\n'
        '\n\n'
        'def _audio_duration_min(path):\n'
        '    """Best-effort audio duration in minutes (fallback to size-based estimate)."""\n'
        '    try:\n'
        '        if _MutagenFile is not None:\n'
        '            f = _MutagenFile(path)\n'
        '            if f and f.info and f.info.length:\n'
        '                return float(f.info.length) / 60.0\n'
        '    except Exception:\n'
        '        pass\n'
        '    # Fallback: assume 128kbps mp3 → ~0.94 MB/min\n'
        '    try:\n'
        '        mb = os.path.getsize(path) / (1024 * 1024)\n'
        '        return mb / 0.94\n'
        '    except Exception:\n'
        '        return 0.0\n'
        '\n\n'
        f'_GROQ_RATE_MIN = {GROQ_RATE_PER_MIN}\n'
        f'_OPENAI_RATE_MIN = {OPENAI_RATE_PER_MIN}\n'
        '\n\n'
        'def _emit_whisper_cost(provider, model, duration_min, user_id=None, parent_agent=None):\n'
        '    if _log_event is None or duration_min <= 0:\n'
        '        return\n'
        '    rate = _GROQ_RATE_MIN if provider == "Groq" else _OPENAI_RATE_MIN\n'
        '    cost = duration_min * rate\n'
        '    try:\n'
        '        _log_event(\n'
        '            agent="Video Digest",\n'
        '            action="api_cost",\n'
        '            status="success",\n'
        '            summary=f"{provider.lower()}/{model} | {duration_min:.2f}min | ${cost:.6f}",\n'
        '            cost=cost,\n'
        '            tokens=0,\n'
        '            user_id=user_id,\n'
        '            parent_agent=parent_agent,\n'
        '            modality="audio",\n'
        '            units=duration_min,\n'
        '        )\n'
        '    except Exception as e:\n'
        '        log.warning(f"whisper cost log failed: {e}")\n'
    )

    # Insert after the `log = logging.getLogger(...)` line
    content = re.sub(
        r"(log = logging\.getLogger\('whisper_client'\))",
        r"\1" + import_block,
        content,
        count=1,
    )

    # 2. Modify _post_to_whisper to emit cost after a successful response
    # Find `if resp.status_code == 200:` block and inject cost emission
    old_success = (
        "            if resp.status_code == 200:\n"
        "                text = resp.text.strip()\n"
        "                log.info(f'{provider_name} whisper: {len(text)} chars transcribed')\n"
        "                return text"
    )
    new_success = (
        "            if resp.status_code == 200:\n"
        "                text = resp.text.strip()\n"
        "                log.info(f'{provider_name} whisper: {len(text)} chars transcribed')\n"
        "                try:\n"
        "                    dur_min = _audio_duration_min(audio_path)\n"
        "                    _emit_whisper_cost(provider_name, model, dur_min,\n"
        "                                       user_id=_current_user_id.get(None) if hasattr(_current_user_id, 'get') else None,\n"
        "                                       parent_agent=_current_parent.get(None) if hasattr(_current_parent, 'get') else None)\n"
        "                except Exception as e:\n"
        "                    log.warning(f'whisper cost emit error: {e}')\n"
        "                return text"
    )
    if old_success in content:
        content = content.replace(old_success, new_success)
    else:
        print('WARN: could not find _post_to_whisper success block — cost emission not wired')

    # 3. Add contextvars for user_id + parent_agent so callers can set them
    ctx_block = (
        '\nimport contextvars\n'
        '_current_user_id = contextvars.ContextVar("whisper_user_id", default=None)\n'
        '_current_parent = contextvars.ContextVar("whisper_parent_agent", default=None)\n'
        '\n'
        'def set_request_context(user_id=None, parent_agent=None):\n'
        '    """Call before transcribe_url/transcribe_file to attach user+parent to cost events."""\n'
        '    _current_user_id.set(user_id)\n'
        '    _current_parent.set(parent_agent)\n'
    )
    content = content.replace(
        "log = logging.getLogger('whisper_client')",
        "log = logging.getLogger('whisper_client')" + ctx_block,
    )

    with open(PATH, 'w') as f:
        f.write(content)

    # Syntax check
    import py_compile
    try:
        py_compile.compile(PATH, doraise=True)
        print('OK — whisper_client.py patched and syntax-verified')
    except py_compile.PyCompileError as e:
        print(f'SYNTAX ERROR after patch: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
