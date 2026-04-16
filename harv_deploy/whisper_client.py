"""
whisper_client.py — Audio transcription for Harv digest agents.

Uses Groq's whisper-large-v3 model ($0.0018/min, fast ~1-2s for a 60s clip).
Falls back to OpenAI's whisper-1 if Groq is not configured.

Flow:
  1. Caller passes a media URL (TikTok, Twitter/X, YouTube, etc).
  2. yt-dlp extracts audio to a temp mp3 (no video).
  3. Audio file is POSTed to Groq's openai-compatible /audio/transcriptions.
  4. Returns the plain-text transcript or '' on failure.

Exports:
  transcribe_url(url: str, max_duration_sec: int = 600) -> str
  transcribe_file(path: str) -> str
  is_configured() -> bool
"""

import json
import logging
import os
import subprocess
import sys
import tempfile
from typing import Optional

sys.path.insert(0, '/root/harv')

log = logging.getLogger('whisper_client')

# Groq is primary — cheaper and faster than OpenAI for Whisper
GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
GROQ_MODEL = 'whisper-large-v3'

OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions'
OPENAI_MODEL = 'whisper-1'

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25MB — Groq + OpenAI limit

# Default UA that looks like a real desktop browser — yt-dlp's default UA is
# frequently bot-flagged by YouTube on datacenter IPs.
DEFAULT_UA = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    'AppleWebKit/605.1.15 (KHTML, like Gecko) '
    'Version/17.4 Safari/605.1.15'
)

# YouTube-specific: rotate through player clients. Datacenter IPs get bot-gated
# on the default `web` client but the mobile/embed clients often still work.
# Ordered from most-reliable-for-VPS to least.
YT_PLAYER_CLIENTS = ['android', 'ios', 'web_safari', 'tv_embedded']


def _is_youtube(url: str) -> bool:
    return 'youtube.com' in url or 'youtu.be' in url


def _get_groq_key() -> Optional[str]:
    return os.environ.get('GROQ_API_KEY') or None


def _get_openai_key() -> Optional[str]:
    return os.environ.get('OPENAI_API_KEY') or None


def is_configured() -> bool:
    return bool(_get_groq_key() or _get_openai_key())


def _ytdlp_auth_args() -> list:
    """Env-driven yt-dlp args for bot-gate mitigations.

    Env vars (all optional):
      YT_DLP_COOKIES_FILE — path to a Netscape-format cookies.txt
      YT_DLP_PROXY        — http(s)://user:pass@host:port
      YT_DLP_USER_AGENT   — override the default desktop Safari UA
    """
    args: list = []
    cookies = os.environ.get('YT_DLP_COOKIES_FILE')
    if cookies and os.path.exists(cookies):
        args += ['--cookies', cookies]
    proxy = os.environ.get('YT_DLP_PROXY')
    if proxy:
        args += ['--proxy', proxy]
    ua = os.environ.get('YT_DLP_USER_AGENT') or DEFAULT_UA
    args += ['--user-agent', ua]
    return args


def _run_ytdlp_audio(url: str, out_path: str, max_duration_sec: int,
                     player_client: Optional[str]) -> tuple:
    """One attempt at downloading audio. Returns (success: bool, stderr: str)."""
    cmd = [
        'yt-dlp',
        '-x',                               # audio only
        '--audio-format', 'mp3',
        '--audio-quality', '0',             # best quality for Whisper
        '--no-playlist',
        '--no-warnings',
        # Allow videos whose duration is unknown (metadata blocked) through —
        # the old `duration<N` filter silently rejected them.
        '--match-filter', f'!duration | duration < {max_duration_sec}',
        '--retries', '3',
        '--fragment-retries', '3',
        '-o', out_path.replace('.mp3', '.%(ext)s'),
    ]
    cmd += _ytdlp_auth_args()
    if player_client:
        cmd += ['--extractor-args', f'youtube:player_client={player_client}']
    cmd.append(url)
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=180, text=True)
        if result.returncode != 0:
            return False, (result.stderr or '')[:500]
        return os.path.exists(out_path), ''
    except subprocess.TimeoutExpired:
        return False, 'timeout'
    except Exception as e:
        return False, str(e)[:300]


def _download_audio(url: str, out_path: str, max_duration_sec: int = 600) -> bool:
    """Download audio only from a media URL via yt-dlp. Returns True on success.

    For YouTube URLs, cycles through player clients (android, ios, web_safari,
    tv_embedded) because datacenter IPs are bot-gated on the default `web`
    client. Respects YT_DLP_COOKIES_FILE / YT_DLP_PROXY env vars.
    """
    attempts: list = []
    if _is_youtube(url):
        attempts = list(YT_PLAYER_CLIENTS)
    else:
        attempts = [None]  # default client for TikTok/Twitter/etc.

    last_err = ''
    for client in attempts:
        # Clean up any partial file from previous attempt
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except OSError:
                pass
        ok, err = _run_ytdlp_audio(url, out_path, max_duration_sec, client)
        if ok:
            if client:
                log.info(f'yt-dlp audio ok via player_client={client}')
            return True
        last_err = err
        log.warning(
            f'yt-dlp audio attempt failed (player_client={client or "default"}): {err[:200]}'
        )

    log.error(f'yt-dlp audio extract failed after {len(attempts)} attempt(s): {last_err[:300]}')
    return False


def _post_to_whisper(audio_path: str) -> str:
    """Upload audio file to Groq (primary) or OpenAI (fallback). Returns transcript text."""
    import requests

    size = os.path.getsize(audio_path)
    if size > MAX_FILE_BYTES:
        log.warning(f'audio too large for Whisper: {size} bytes (max {MAX_FILE_BYTES})')
        return ''

    groq_key = _get_groq_key()
    openai_key = _get_openai_key()

    providers = []
    if groq_key:
        providers.append(('Groq', GROQ_URL, GROQ_MODEL, groq_key))
    if openai_key:
        providers.append(('OpenAI', OPENAI_URL, OPENAI_MODEL, openai_key))

    if not providers:
        log.error('No Whisper provider configured (set GROQ_API_KEY or OPENAI_API_KEY)')
        return ''

    for provider_name, url, model, key in providers:
        try:
            with open(audio_path, 'rb') as f:
                files = {'file': ('audio.mp3', f, 'audio/mpeg')}
                data = {'model': model, 'response_format': 'text'}
                headers = {'Authorization': f'Bearer {key}'}
                resp = requests.post(url, headers=headers, files=files, data=data, timeout=120)

            if resp.status_code == 200:
                text = resp.text.strip()
                log.info(f'{provider_name} whisper: {len(text)} chars transcribed')
                return text
            else:
                log.error(f'{provider_name} whisper {resp.status_code}: {resp.text[:300]}')
        except Exception as e:
            log.error(f'{provider_name} whisper exception: {str(e)[:300]}')
            continue

    return ''


def transcribe_file(path: str) -> str:
    """Transcribe an existing audio file. Returns empty string on failure."""
    if not os.path.exists(path):
        log.error(f'audio file not found: {path}')
        return ''
    return _post_to_whisper(path)


def transcribe_url(url: str, max_duration_sec: int = 600) -> str:
    """Download audio from a media URL and transcribe it.

    Args:
        url: Media URL (YouTube, TikTok, Twitter/X, etc — anything yt-dlp handles)
        max_duration_sec: Skip videos longer than this (prevents expensive
                          transcriptions of multi-hour content). Default 10min.

    Returns the transcript string, or '' on failure.
    """
    if not is_configured():
        log.warning('transcribe_url called but no Whisper provider configured')
        return ''

    with tempfile.TemporaryDirectory(prefix='harv_whisper_') as tmpdir:
        audio_path = os.path.join(tmpdir, 'audio.mp3')
        if not _download_audio(url, audio_path, max_duration_sec=max_duration_sec):
            return ''
        return _post_to_whisper(audio_path)
