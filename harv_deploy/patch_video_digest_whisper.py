"""Patch video_digest.py to fall back to Whisper when captions aren't available.

Changes:
  1. _resolve_video now calls whisper_client.transcribe_url when the caption
     extraction returns empty (TikTok / Twitter especially, but YouTube too).
  2. The "no transcript available" error message is updated to reference
     Whisper being attempted.
"""
import re
import sys

PATH = '/root/harv/agents/video_digest.py'

with open(PATH) as f:
    content = f.read()

# Check if already patched
if 'whisper_client' in content:
    print('already patched')
    sys.exit(0)

# --- 1. Add whisper_client import at the top (after other imports) ---
old_import = 'from lib.harv_lib import now_est'
if old_import not in content:
    # Try an alternative known import
    old_import = 'from agents.base_agent import BaseAgent'
if old_import in content:
    content = content.replace(
        old_import,
        old_import + '\n\ntry:\n    from lib.whisper_client import transcribe_url as _whisper_transcribe, is_configured as _whisper_ok\nexcept Exception:\n    _whisper_transcribe = None\n    _whisper_ok = lambda: False',
        1,
    )
else:
    # Fallback — insert near the top after the docstring
    content = content.replace(
        'import os\n',
        'import os\n\ntry:\n    from lib.whisper_client import transcribe_url as _whisper_transcribe, is_configured as _whisper_ok\nexcept Exception:\n    _whisper_transcribe = None\n    _whisper_ok = lambda: False\n',
        1,
    )

# --- 2. Patch TikTok branch in _resolve_video ---
old_tiktok = """        elif platform == PLATFORM_TIKTOK:
            tiktok_id = extract_tiktok_id(task)
            url = extract_tiktok_url(task) or f'https://www.tiktok.com/video/{tiktok_id}'
            meta = get_metadata_via_ytdlp(url)
            transcript = get_subtitles_via_ytdlp(url)
            return {'platform': platform, 'video_id': tiktok_id, 'url': url,
                    'meta': meta, 'transcript': transcript, 'error': ''}"""

new_tiktok = """        elif platform == PLATFORM_TIKTOK:
            tiktok_id = extract_tiktok_id(task)
            url = extract_tiktok_url(task) or f'https://www.tiktok.com/video/{tiktok_id}'
            meta = get_metadata_via_ytdlp(url)
            transcript = get_subtitles_via_ytdlp(url)
            if not transcript and _whisper_ok() and _whisper_transcribe:
                self.log(f'No captions for TikTok {tiktok_id}, falling back to Whisper')
                transcript = _whisper_transcribe(url, max_duration_sec=600) or ''
                if transcript:
                    self.log(f'Whisper transcribed TikTok {tiktok_id}: {len(transcript)} chars')
            return {'platform': platform, 'video_id': tiktok_id, 'url': url,
                    'meta': meta, 'transcript': transcript, 'error': ''}"""

if old_tiktok not in content:
    print('ERROR: TikTok branch not found — file may have changed')
    sys.exit(1)
content = content.replace(old_tiktok, new_tiktok, 1)

# --- 3. Patch Twitter branch ---
old_twitter = """        elif platform == PLATFORM_TWITTER:
            twitter_id = extract_twitter_id(task)
            url = extract_twitter_url(task) or f'https://x.com/i/status/{twitter_id}'
            meta = get_metadata_via_ytdlp(url)
            transcript = get_subtitles_via_ytdlp(url)
            return {'platform': platform, 'video_id': twitter_id, 'url': url,
                    'meta': meta, 'transcript': transcript, 'error': ''}"""

new_twitter = """        elif platform == PLATFORM_TWITTER:
            twitter_id = extract_twitter_id(task)
            url = extract_twitter_url(task) or f'https://x.com/i/status/{twitter_id}'
            meta = get_metadata_via_ytdlp(url)
            transcript = get_subtitles_via_ytdlp(url)
            if not transcript and _whisper_ok() and _whisper_transcribe:
                self.log(f'No captions for Twitter {twitter_id}, falling back to Whisper')
                transcript = _whisper_transcribe(url, max_duration_sec=600) or ''
                if transcript:
                    self.log(f'Whisper transcribed Twitter {twitter_id}: {len(transcript)} chars')
            return {'platform': platform, 'video_id': twitter_id, 'url': url,
                    'meta': meta, 'transcript': transcript, 'error': ''}"""

if old_twitter not in content:
    print('ERROR: Twitter branch not found')
    sys.exit(1)
content = content.replace(old_twitter, new_twitter, 1)

# --- 4. Patch YouTube branch so it also falls back if captions fail ---
old_yt = """        if platform == PLATFORM_YOUTUBE:
            video_id = extract_video_id(task)
            url = f'https://youtube.com/watch?v={video_id}'
            meta = get_video_metadata(video_id)
            transcript = get_transcript(video_id)
            return {'platform': platform, 'video_id': video_id, 'url': url,
                    'meta': meta, 'transcript': transcript, 'error': ''}"""

new_yt = """        if platform == PLATFORM_YOUTUBE:
            video_id = extract_video_id(task)
            url = f'https://youtube.com/watch?v={video_id}'
            meta = get_video_metadata(video_id)
            transcript = get_transcript(video_id)
            if not transcript and _whisper_ok() and _whisper_transcribe:
                self.log(f'No captions for YouTube {video_id}, falling back to Whisper')
                transcript = _whisper_transcribe(url, max_duration_sec=900) or ''
                if transcript:
                    self.log(f'Whisper transcribed YouTube {video_id}: {len(transcript)} chars')
            return {'platform': platform, 'video_id': video_id, 'url': url,
                    'meta': meta, 'transcript': transcript, 'error': ''}"""

if old_yt not in content:
    print('ERROR: YouTube branch not found')
    sys.exit(1)
content = content.replace(old_yt, new_yt, 1)

# --- 5. Update the "no transcript" error messages ---
content = content.replace(
    'This {plabel} video has no captions/subtitles. Audio-only content would require Whisper transcription (not yet integrated).',
    'No captions found and Whisper transcription also failed (file may be too long, audio-less, or download blocked).',
    1,
)
content = content.replace(
    'This {plabel} video has no captions. Audio transcription (Whisper) not yet integrated.',
    'No captions found and Whisper transcription also failed.',
    1,
)

with open(PATH, 'w') as f:
    f.write(content)

# Verify syntax
import py_compile
py_compile.compile(PATH, doraise=True)
print('OK — patched and syntax verified')
