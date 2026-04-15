"""Patch video_digest.py to use Gemini VLM for visual video analysis.

Gate model (admin-only testing phase):
  - Env var HARV_VLM_ENABLED=1 must be set in /root/harv/.env
  - AND task text must contain one of: `[vlm]`, `[visual]`, `vlm:`, `visual:`
  - If either is missing, the normal Whisper/caption path runs unchanged

This is a pragmatic gate — the agent layer doesn't currently know the caller's
role, so we rely on (a) the feature flag being off by default, and (b) a
keyword that a regular user won't accidentally type. When we're ready to ship
this to users, we'll plumb user_role through the router and replace the
keyword with a UI toggle.

The patch is IDEMPOTENT — re-running is a no-op once applied.
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

# --- 2. Module-level helpers: detect trigger, strip keyword, check env gate ---
helper_block = '''

def _vlm_feature_enabled() -> bool:
    """Admin-only feature flag — must be explicitly enabled in env."""
    import os as _os
    return _os.environ.get('HARV_VLM_ENABLED', '').strip() in ('1', 'true', 'yes')


def _vlm_keyword_triggered(task_text: str) -> bool:
    """True if the task text contains an explicit VLM trigger keyword."""
    if not task_text:
        return False
    t = task_text.lower()
    return any(kw in t for kw in ('[vlm]', '[visual]', 'vlm:', 'visual:'))


def _should_use_vlm(task_text: str) -> bool:
    if not _vlm_ok() or _vlm_analyze is None:
        return False
    if not _vlm_feature_enabled():
        return False
    return _vlm_keyword_triggered(task_text)


def _strip_vlm_flags(task_text: str) -> str:
    out = task_text
    for kw in ('[vlm]', '[visual]', '[VLM]', '[VISUAL]', 'vlm:', 'visual:', 'VLM:', 'VISUAL:'):
        out = out.replace(kw, '')
    return out.strip()

'''

content = content.replace(new_import_block, new_import_block + helper_block, 1)

# --- 3. Insert VLM branch at the top of _resolve_video ---
# Signature on the VPS: `    def _resolve_video(self, task: str) -> dict:`
sig_match = re.search(r'(    def _resolve_video\(self,[^\n]*?\)[^\n]*:\n)', content)
if not sig_match:
    print('ERROR: _resolve_video method not found')
    sys.exit(1)

sig_end = sig_match.end()

vlm_branch = '''        # --- VLM MODE (env-flagged, admin-only testing) ---
        if isinstance(task, str) and _should_use_vlm(task):
            clean_text = _strip_vlm_flags(task)
            try:
                platform = detect_platform(clean_text)
            except Exception:
                platform = PLATFORM_YOUTUBE
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
                        'meta': {}, 'transcript': '',
                        'error': 'VLM mode: could not resolve URL from task'}

            self.log(f'VLM mode engaged for {url}')
            vlm_result = _vlm_analyze(url, max_duration_sec=900)
            if vlm_result.get('error'):
                return {'platform': platform, 'video_id': video_id, 'url': url,
                        'meta': {}, 'transcript': '',
                        'error': f"VLM failed: {vlm_result['error']}"}

            # Emit an api_cost event so VLM spend shows in /admin analytics
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
                'error': '',
            }
        # --- END VLM MODE ---

'''

content = content[:sig_end] + vlm_branch + content[sig_end:]

with open(PATH, 'w') as f:
    f.write(content)

import py_compile
try:
    py_compile.compile(PATH, doraise=True)
    print('OK — patched and syntax verified')
except py_compile.PyCompileError as e:
    print(f'SYNTAX ERROR after patch: {e}')
    sys.exit(1)
