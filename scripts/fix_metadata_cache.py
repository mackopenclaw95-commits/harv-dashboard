#!/usr/bin/env python3
"""Add metadata caching to youtube_transcript.py so get_video_metadata_via_gemini
hits cache after first call, eliminating the ~70s upload-and-scan hit that was
blowing Vercel Hobby's 60s function timeout on every implement call.

Reuses the existing transcript cache file; adds a 'meta' key. 7-day TTL same as transcript.
"""
import py_compile
import shutil
import sys

YT = '/root/harv/lib/youtube_transcript.py'

with open(YT) as f:
    code = f.read()

# --- 1. Add _cache_get_meta + _cache_set_meta helpers after _cache_set ---
anchor = '''def _cache_set(video_id: str, transcript: str, method: str) -> None:
    """Write transcript to cache. Silent no-op on failure."""
    if not transcript:
        return
    path = _cache_path(video_id)
    try:
        os.makedirs(_CACHE_DIR, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump({
                'video_id': video_id,
                'transcript': transcript,
                'method': method,
                'fetched_at': int(time.time()),
                'length': len(transcript),
            }, f)
        logger.info('transcript cached for %s via %s (%d chars)', video_id, method, len(transcript))
    except Exception as exc:
        logger.debug('cache write failed for %s: %s', video_id, exc)'''

additions = '''


def _cache_get_meta(video_id: str) -> dict:
    """Return cached metadata dict if present and fresh, else {}."""
    path = _cache_path(video_id)
    if not os.path.exists(path):
        return {}
    try:
        age = time.time() - os.path.getmtime(path)
        if age > _CACHE_TTL_SEC:
            return {}
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        meta = data.get('meta') or {}
        if meta:
            logger.info('metadata cache HIT for %s (age %.0fs)', video_id, age)
        return meta
    except Exception as exc:
        logger.debug('meta cache read failed for %s: %s', video_id, exc)
        return {}


def _cache_set_meta(video_id: str, meta: dict) -> None:
    """Merge metadata dict into the per-video cache file. Silent no-op on failure."""
    if not meta:
        return
    path = _cache_path(video_id)
    try:
        os.makedirs(_CACHE_DIR, exist_ok=True)
        existing = {}
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    existing = json.load(f) or {}
            except Exception:
                existing = {}
        existing['video_id'] = video_id
        existing['meta'] = meta
        existing['meta_fetched_at'] = int(time.time())
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(existing, f)
        logger.info('metadata cached for %s (%s)', video_id, meta.get('title', '?'))
    except Exception as exc:
        logger.debug('meta cache write failed for %s: %s', video_id, exc)'''

if '_cache_get_meta' in code:
    print('Cache helpers already added, skipping step 1.')
else:
    if anchor not in code:
        print('FAILED: could not find _cache_set anchor', file=sys.stderr)
        sys.exit(1)
    code = code.replace(anchor, anchor + additions)
    print('Added _cache_get_meta + _cache_set_meta helpers')

# --- 2. Wrap get_video_metadata_via_gemini with cache check + save ---
# Insert cache check right after the function signature.
old_fn_start = '''def get_video_metadata_via_gemini(video_id: str) -> dict:
    """Get video metadata via Gemini when yt-dlp is blocked.

    Returns dict with title, channel, duration, description keys.
    """
    _load_env()
    api_key = os.environ.get('GEMINI_API_KEY', '')
    if not api_key:
        return {}'''

new_fn_start = '''def get_video_metadata_via_gemini(video_id: str) -> dict:
    """Get video metadata via Gemini when yt-dlp is blocked.

    Returns dict with title, channel, duration, description keys.
    """
    cached_meta = _cache_get_meta(video_id)
    if cached_meta:
        return cached_meta
    _load_env()
    api_key = os.environ.get('GEMINI_API_KEY', '')
    if not api_key:
        return {}'''

if new_fn_start in code:
    print('Cache check already in get_video_metadata_via_gemini, skipping step 2.')
elif old_fn_start in code:
    code = code.replace(old_fn_start, new_fn_start)
    print('Added cache check at top of get_video_metadata_via_gemini')
else:
    print('FAILED: could not find get_video_metadata_via_gemini start', file=sys.stderr)
    sys.exit(1)

# --- 3. Save metadata to cache before returning on success ---
# The function has this line right before the success return:
#     logger.info('Gemini metadata OK: %s', meta.get('title', '?'))
#     return meta
# Insert _cache_set_meta call before that return.
old_return = """        logger.info('Gemini metadata OK: %s', meta.get('title', '?'))
        return meta"""

new_return = """        logger.info('Gemini metadata OK: %s', meta.get('title', '?'))
        _cache_set_meta(video_id, meta)
        return meta"""

if new_return in code:
    print('Cache save already in place, skipping step 3.')
elif old_return in code:
    code = code.replace(old_return, new_return)
    print('Added _cache_set_meta call before Gemini metadata return')
else:
    print('FAILED: could not find success return in get_video_metadata_via_gemini', file=sys.stderr)
    sys.exit(1)

shutil.copy(YT, YT + '.bak_meta')
with open(YT, 'w') as f:
    f.write(code)
py_compile.compile(YT, doraise=True)
print(f'Done. ({len(code)} bytes). Backup: {YT}.bak_meta')
