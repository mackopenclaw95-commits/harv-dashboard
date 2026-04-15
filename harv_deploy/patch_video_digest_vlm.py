"""Patch video_digest.py to use Gemini VLM when an admin triggers visual mode.

Trigger rules:
  - Task text contains keyword `vlm:` or `visual:` or `[vlm]` or `[visual]`
  - Caller role is 'admin' or 'owner' (checked in BaseAgent context)
  - Otherwise the existing Whisper/caption path runs unchanged

When triggered:
  - Calls gemini_vlm_client.analyze_url(url, prompt=...) INSTEAD of the normal
    transcript-only flow. The VLM response becomes the "transcript" field so
    downstream summarization still works, but is also stored separately as
    `vlm_text` for cleaner presentation.
  - Emits an api_cost event with the actual Gemini cost so it shows in
    /admin analytics.

This patch is IDEMPOTENT — re-running is a no-op once applied.
"""
import re
import sys

PATH = '/root/harv/agents/video_digest.py'

with open(PATH) as f:
    content = f.read()

# Check if already patched
if 'gemini_vlm_client' in content:
    print('already patched')
    sys.exit(0)

# --- 1. Add gemini_vlm_client import near the existing whisper_client import ---
old_import_block = (
    "try:\n"
    "    from lib.whisper_client import transcribe_url as _whisper_transcribe, is_configured as _whisper_ok\n"
    "except Exception:\n"
    "    _whisper_transcribe = None\n"
    "    _whisper_ok = lambda: False"
)
new_import_block = (
    "try:\n"
    "    from lib.whisper_client import transcribe_url as _whisper_transcribe, is_configured as _whisper_ok\n"
    "except Exception:\n"
    "    _whisper_transcribe = None\n"
    "    _whisper_ok = lambda: False\n"
    "\n"
    "try:\n"
    "    from lib.gemini_vlm_client import analyze_url as _vlm_analyze, is_configured as _vlm_ok\n"
    "except Exception:\n"
    "    _vlm_analyze = None\n"
    "    _vlm_ok = lambda: False"
)

if old_import_block not in content:
    print('ERROR: whisper import block not found — run patch_video_digest_whisper.py first')
    sys.exit(1)
content = content.replace(old_import_block, new_import_block, 1)

# --- 2. Add a helper to detect the VLM trigger at module level ---
helper_block = '''

def _should_use_vlm(task_text: str, user_role: str = '') -> bool:
    """Return True if the task is admin-triggered for visual/VLM analysis."""
    if not task_text or not _vlm_ok() or _vlm_analyze is None:
        return False
    if user_role not in ('admin', 'owner'):
        return False
    t = task_text.lower()
    return any(kw in t for kw in ('vlm:', 'visual:', '[vlm]', '[visual]', ' --vlm', ' --visual'))


def _strip_vlm_flags(task_text: str) -> str:
    """Remove the trigger keywords so downstream URL extraction still works."""
    out = task_text
    for kw in ('vlm:', 'visual:', '[vlm]', '[visual]', '--vlm', '--visual', 'VLM:', 'VISUAL:'):
        out = out.replace(kw, '')
    return out.strip()

'''

# Insert the helper right after the import block
content = content.replace(new_import_block, new_import_block + helper_block, 1)

# --- 3. In _resolve_video, check for VLM mode and run it for any platform ---
# We insert a branch at the top of _resolve_video that short-circuits when
# the user is admin and used the keyword. The platform is still detected
# normally for URL extraction.

# Find the start of _resolve_video — match the signature line
sig_match = re.search(r'(    def _resolve_video\(self,[^\n]*\):\n)', content)
if not sig_match:
    print('ERROR: _resolve_video method not found')
    sys.exit(1)

sig_end = sig_match.end()

vlm_branch = '''        # --- VLM MODE (admin-only testing) ---
        user_role = getattr(task, 'user_role', '') or getattr(self, 'current_user_role', '') or ''
        task_text = getattr(task, 'text', '') or getattr(task, 'task', '') or str(task)
        if _should_use_vlm(task_text, user_role):
            clean_text = _strip_vlm_flags(task_text)
            # Reuse platform detection on the cleaned text
            try:
                platform = detect_platform(clean_text)
            except Exception:
                platform = PLATFORM_YOUTUBE
            # Resolve URL the same way the normal branches would
            url = ''
            video_id = ''
            try:
                if platform == PLATFORM_YOUTUBE:
                    video_id = extract_video_id(clean_text) or ''
                    url = f'https://youtube.com/watch?v={video_id}' if video_id else ''
                elif platform == PLATFORM_TIKTOK:
                    video_id = extract_tiktok_id(clean_text) or ''
                    url = extract_tiktok_url(clean_text) or (f'https://www.tiktok.com/video/{video_id}' if video_id else '')
                elif platform == PLATFORM_TWITTER:
                    video_id = extract_twitter_id(clean_text) or ''
                    url = extract_twitter_url(clean_text) or (f'https://x.com/i/status/{video_id}' if video_id else '')
            except Exception as e:
                self.log(f'VLM url resolution error: {e}')

            if not url:
                return {'platform': platform, 'video_id': video_id, 'url': '',
                        'meta': {}, 'transcript': '', 'error': 'VLM mode: could not resolve URL'}

            self.log(f'VLM mode: analyzing {url} for admin {user_role}')
            vlm_result = _vlm_analyze(url, max_duration_sec=900)
            if vlm_result.get('error'):
                return {'platform': platform, 'video_id': video_id, 'url': url,
                        'meta': {}, 'transcript': '',
                        'error': f"VLM failed: {vlm_result['error']}"}

            # Emit an api_cost event so this shows in /admin analytics
            try:
                from lib.event_log import log_event
                log_event(
                    agent='Video Digest',
                    action='api_cost',
                    status='success',
                    summary=f"{vlm_result['model']} | {vlm_result['tokens_in'] + vlm_result['tokens_out']} tokens | ${vlm_result['cost_est']:.6f}",
                    tokens=vlm_result['tokens_in'] + vlm_result['tokens_out'],
                    cost=vlm_result['cost_est'],
                )
            except Exception as e:
                self.log(f'VLM cost log failed: {e}')

            return {
                'platform': platform,
                'video_id': video_id,
                'url': url,
                'meta': {'vlm': True, 'model': vlm_result['model']},
                'transcript': vlm_result['text'],
                'vlm_text': vlm_result['text'],
                'error': '',
            }
        # --- END VLM MODE ---

'''

content = content[:sig_end] + vlm_branch + content[sig_end:]

# --- 4. Write + syntax check ---
with open(PATH, 'w') as f:
    f.write(content)

import py_compile
try:
    py_compile.compile(PATH, doraise=True)
    print('OK — patched and syntax verified')
except py_compile.PyCompileError as e:
    print(f'SYNTAX ERROR after patch: {e}')
    sys.exit(1)
