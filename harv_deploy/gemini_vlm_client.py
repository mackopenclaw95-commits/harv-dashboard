"""
gemini_vlm_client.py — Video understanding (vision+language) for Harv digest agents.

Uses Google Gemini 2.5 Flash's video understanding capability via the Files API.
Unlike Whisper (audio only), this reads on-screen content: code, UI, charts,
diagrams, demos, text — everything a visual learner would see.

Flow:
  1. Caller passes a media URL (YouTube, TikTok, Twitter/X).
  2. yt-dlp downloads the video (capped at 720p to keep size reasonable).
  3. Video is uploaded to Gemini via the Files API (resumable upload).
  4. Poll until state is ACTIVE, then generate_content with the file + prompt.
  5. Returns a dict: { 'text': str, 'tokens': int, 'cost_est': float, 'error': str }

Cost (as of 2026-04):
  gemini-2.0-flash — $0.10/M input tokens, $0.40/M output
  Video uses 258 tokens per second of video at default resolution (1 fps).
  A 10-min video ~155k input tokens ≈ $0.016 before any output.

Exports:
  analyze_url(url, prompt='Summarize this video...', max_duration_sec=600) -> dict
  is_configured() -> bool
"""

import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from typing import Optional

sys.path.insert(0, '/root/harv')

log = logging.getLogger('gemini_vlm_client')

GEMINI_MODEL = 'gemini-2.5-flash'
GEMINI_BASE = 'https://generativelanguage.googleapis.com'
UPLOAD_URL = f'{GEMINI_BASE}/upload/v1beta/files'
GENERATE_URL = f'{GEMINI_BASE}/v1beta/models/{GEMINI_MODEL}:generateContent'
FILE_GET_URL = f'{GEMINI_BASE}/v1beta/files'

# Gemini file upload limit is 2GB but practically we cap far below
MAX_FILE_BYTES = 500 * 1024 * 1024  # 500MB safety cap

# Pricing per million tokens (gemini-2.5-flash, 2026-04 public rates)
INPUT_PRICE_PER_M = 0.30
OUTPUT_PRICE_PER_M = 2.50

# Default prompt when the caller doesn't supply one — tuned for Harv's
# "implementation assistant" use case.
DEFAULT_PROMPT = (
    "Watch this video and produce a detailed digest for someone who wants to "
    "IMPLEMENT what it teaches. Include:\n"
    "1. A 2-3 sentence overview of what the video demonstrates.\n"
    "2. Key visual moments with timestamps — what's on screen, code snippets "
    "shown, UI elements demoed, charts/diagrams/slides.\n"
    "3. A bulleted list of concrete steps to replicate the main thing being taught.\n"
    "4. Any code, commands, URLs, or tool names visible on screen.\n"
    "Keep the total response under 1500 words."
)


def _get_key() -> Optional[str]:
    # Reuse the existing image-gen Gemini key if present; fall back to a dedicated one.
    return (
        os.environ.get('GEMINI_API_KEY')
        or os.environ.get('GOOGLE_AI_STUDIO_KEY')
        or os.environ.get('GOOGLE_GENAI_KEY')
        or None
    )


def is_configured() -> bool:
    return bool(_get_key())


def _download_video(url: str, out_path: str, max_duration_sec: int = 600) -> bool:
    """Download the video (not just audio) via yt-dlp. Capped at 720p for size/cost."""
    try:
        cmd = [
            'yt-dlp',
            '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
            '--merge-output-format', 'mp4',
            '--no-playlist',
            '--no-warnings',
            '--match-filter', f'duration<{max_duration_sec}',
            '-o', out_path,
            url,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=240, text=True)
        if result.returncode != 0:
            log.error(f'yt-dlp video download failed: {result.stderr[:300]}')
            return False
        return os.path.exists(out_path)
    except subprocess.TimeoutExpired:
        log.error('yt-dlp video download timeout')
        return False
    except Exception as e:
        log.error(f'yt-dlp video download exception: {e}')
        return False


def _upload_file(path: str, api_key: str) -> Optional[dict]:
    """Upload a local file to Gemini Files API. Returns the file resource dict or None."""
    import requests

    size = os.path.getsize(path)
    if size > MAX_FILE_BYTES:
        log.error(f'video too large for Gemini upload: {size} bytes')
        return None

    display_name = os.path.basename(path)

    # Start a resumable upload session
    start_headers = {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': str(size),
        'X-Goog-Upload-Header-Content-Type': 'video/mp4',
        'Content-Type': 'application/json',
    }
    start_body = {'file': {'display_name': display_name}}
    try:
        start_resp = requests.post(
            f'{UPLOAD_URL}?key={api_key}',
            headers=start_headers,
            data=json.dumps(start_body),
            timeout=30,
        )
    except Exception as e:
        log.error(f'Gemini upload start failed: {e}')
        return None

    if start_resp.status_code != 200:
        log.error(f'Gemini upload start {start_resp.status_code}: {start_resp.text[:300]}')
        return None

    upload_url = start_resp.headers.get('X-Goog-Upload-URL')
    if not upload_url:
        log.error('Gemini upload start did not return X-Goog-Upload-URL')
        return None

    # Upload the bytes
    try:
        with open(path, 'rb') as f:
            upload_headers = {
                'Content-Length': str(size),
                'X-Goog-Upload-Offset': '0',
                'X-Goog-Upload-Command': 'upload, finalize',
            }
            resp = requests.post(upload_url, headers=upload_headers, data=f, timeout=300)
    except Exception as e:
        log.error(f'Gemini upload finalize failed: {e}')
        return None

    if resp.status_code != 200:
        log.error(f'Gemini upload finalize {resp.status_code}: {resp.text[:300]}')
        return None

    try:
        file_info = resp.json().get('file', {})
        return file_info or None
    except Exception as e:
        log.error(f'Gemini upload parse failed: {e}')
        return None


def _wait_for_active(file_name: str, api_key: str, timeout_sec: int = 180) -> bool:
    """Poll until the uploaded file transitions from PROCESSING to ACTIVE."""
    import requests

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            # file_name is like "files/abc123"
            r = requests.get(f'{GEMINI_BASE}/v1beta/{file_name}?key={api_key}', timeout=15)
            if r.status_code != 200:
                log.error(f'Gemini file get {r.status_code}: {r.text[:200]}')
                return False
            state = r.json().get('state', '')
            if state == 'ACTIVE':
                return True
            if state == 'FAILED':
                log.error('Gemini file processing FAILED')
                return False
        except Exception as e:
            log.error(f'Gemini file poll exception: {e}')
            return False
        time.sleep(3)
    log.error('Gemini file processing timeout')
    return False


def _generate_content(file_uri: str, mime_type: str, prompt: str, api_key: str) -> dict:
    """Call generate_content with the uploaded file + text prompt."""
    import requests

    body = {
        'contents': [{
            'parts': [
                {'file_data': {'mime_type': mime_type, 'file_uri': file_uri}},
                {'text': prompt},
            ],
        }],
        'generationConfig': {
            'temperature': 0.3,
            'maxOutputTokens': 2048,
        },
    }

    try:
        resp = requests.post(
            f'{GENERATE_URL}?key={api_key}',
            headers={'Content-Type': 'application/json'},
            data=json.dumps(body),
            timeout=300,
        )
    except Exception as e:
        return {'text': '', 'tokens_in': 0, 'tokens_out': 0, 'error': f'request failed: {e}'}

    if resp.status_code != 200:
        return {
            'text': '',
            'tokens_in': 0,
            'tokens_out': 0,
            'error': f'Gemini {resp.status_code}: {resp.text[:400]}',
        }

    try:
        data = resp.json()
        candidates = data.get('candidates') or []
        text = ''
        if candidates:
            parts = (candidates[0].get('content') or {}).get('parts') or []
            text = ''.join(p.get('text', '') for p in parts).strip()

        usage = data.get('usageMetadata') or {}
        tokens_in = int(usage.get('promptTokenCount') or 0)
        tokens_out = int(usage.get('candidatesTokenCount') or 0)

        return {'text': text, 'tokens_in': tokens_in, 'tokens_out': tokens_out, 'error': ''}
    except Exception as e:
        return {'text': '', 'tokens_in': 0, 'tokens_out': 0, 'error': f'parse failed: {e}'}


def analyze_url(url: str, prompt: str = '', max_duration_sec: int = 600) -> dict:
    """Download a video and ask Gemini VLM to analyze it visually.

    Args:
        url: Media URL (YouTube, TikTok, Twitter/X — anything yt-dlp handles)
        prompt: The question/instruction for Gemini. If empty, uses DEFAULT_PROMPT.
        max_duration_sec: Skip videos longer than this (cost control). Default 10min.

    Returns dict:
        { 'text': str, 'tokens_in': int, 'tokens_out': int,
          'cost_est': float, 'model': str, 'error': str }
    """
    result = {
        'text': '',
        'tokens_in': 0,
        'tokens_out': 0,
        'cost_est': 0.0,
        'model': GEMINI_MODEL,
        'error': '',
    }

    if not is_configured():
        result['error'] = 'No Gemini API key configured (set GEMINI_API_KEY)'
        return result

    api_key = _get_key()
    prompt = prompt or DEFAULT_PROMPT

    with tempfile.TemporaryDirectory(prefix='harv_vlm_') as tmpdir:
        video_path = os.path.join(tmpdir, 'video.mp4')
        if not _download_video(url, video_path, max_duration_sec=max_duration_sec):
            result['error'] = 'yt-dlp video download failed'
            return result

        file_info = _upload_file(video_path, api_key)
        if not file_info:
            result['error'] = 'Gemini file upload failed'
            return result

        file_name = file_info.get('name', '')  # "files/abc123"
        file_uri = file_info.get('uri', '')
        mime_type = file_info.get('mimeType', 'video/mp4')

        if not _wait_for_active(file_name, api_key):
            result['error'] = 'Gemini file never became ACTIVE'
            return result

        gen = _generate_content(file_uri, mime_type, prompt, api_key)
        result['text'] = gen['text']
        result['tokens_in'] = gen['tokens_in']
        result['tokens_out'] = gen['tokens_out']
        result['error'] = gen['error']
        result['cost_est'] = (
            (gen['tokens_in'] * INPUT_PRICE_PER_M + gen['tokens_out'] * OUTPUT_PRICE_PER_M)
            / 1_000_000
        )
        if result['text']:
            log.info(
                f'Gemini VLM: {len(result["text"])} chars, '
                f'{result["tokens_in"]}+{result["tokens_out"]} tokens, '
                f'${result["cost_est"]:.4f}'
            )
        return result
