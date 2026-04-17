#!/usr/bin/env python3
"""Drop the Gemini metadata fallback in get_video_metadata (video_digest.py).

The Gemini metadata call uploads the entire video for analysis, taking ~70s for a
22-minute video. Title/channel/duration are only used for display — falling back
to 'Unknown' is preferable to a timeout. yt-dlp remains the primary source;
Gemini transcript fetch is unaffected (that path actually provides value).
"""
import py_compile
import shutil
import sys

VD = '/root/harv/agents/video_digest.py'

with open(VD) as f:
    code = f.read()

old = """def get_video_metadata(video_id: str) -> dict:
    \"\"\"Get video metadata via yt-dlp for a YouTube video, Gemini fallback.\"\"\"
    url = f'https://www.youtube.com/watch?v={video_id}'
    meta = get_metadata_via_ytdlp(url)
    if meta and meta.get('title', 'Unknown') != 'Unknown':
        return meta
    # Fallback: Gemini
    try:
        from lib.youtube_transcript import get_video_metadata_via_gemini
        gemini_meta = get_video_metadata_via_gemini(video_id)
        if gemini_meta:
            gemini_meta.setdefault('platform', 'YouTube')
            return gemini_meta
    except Exception:
        pass
    return meta or {}"""

new = """def get_video_metadata(video_id: str) -> dict:
    \"\"\"Get video metadata via yt-dlp; falls back to cached Gemini metadata only.

    The live Gemini metadata fetch is skipped — it uploads the full video for
    analysis and routinely takes 60-90s, which blows serverless function timeouts.
    Cached Gemini metadata from previous digests is still honored.
    \"\"\"
    url = f'https://www.youtube.com/watch?v={video_id}'
    meta = get_metadata_via_ytdlp(url)
    if meta and meta.get('title', 'Unknown') != 'Unknown':
        return meta
    # yt-dlp blocked: try the cached-only path (no live Gemini upload).
    try:
        from lib.youtube_transcript import _cache_get_meta
        cached = _cache_get_meta(video_id)
        if cached:
            cached.setdefault('platform', 'YouTube')
            return cached
    except Exception:
        pass
    return meta or {'title': 'Unknown', 'channel': 'Unknown', 'duration': '?', 'platform': 'YouTube'}"""

if new in code:
    print('Already patched.')
    sys.exit(0)
if old not in code:
    print('FAILED: old block not found', file=sys.stderr)
    sys.exit(1)

shutil.copy(VD, VD + '.bak_meta')
code = code.replace(old, new)
with open(VD, 'w') as f:
    f.write(code)
py_compile.compile(VD, doraise=True)
print(f'Done. Backup: {VD}.bak_meta')
