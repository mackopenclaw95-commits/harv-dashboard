"""
video_gen.py -- Video Generation agent for Harv.

Agent type : agent
Model      : bytedance/seedance-1-5-pro (via OpenRouter Video API)
Provider   : openrouter (video generation)

Capabilities:
  - GENERATE VIDEO    — create a short video from a text prompt
  - LIST VIDEOS       — show recently generated videos

Generated videos are saved to /root/harv/media/generated/
Uses OpenRouter's async /api/v1/videos endpoint.
"""

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent
from lib.harv_lib import AgentResponse, now_est
from lib.harv_errors import log_error

EST = ZoneInfo('America/New_York')
SAVE_DIR = '/root/harv/media/generated'
MODEL = 'bytedance/seedance-1-5-pro'
OPENROUTER_VIDEO_URL = 'https://openrouter.ai/api/v1/videos'
MAX_POLL_SECONDS = 180  # 3 minutes max wait
POLL_INTERVAL = 5  # check every 5 seconds


def _detect_intent(task: str) -> str:
    t = task.lower()
    if any(kw in t for kw in ['list video', 'recent video', 'show video',
                               'my videos', 'what videos']):
        return 'list_videos'
    return 'generate'


def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


def _extract_prompt(task: str) -> str:
    task = _strip_context_tags(task)
    patterns = [
        r'^(?:please\s+)?(?:generate|create|make|produce)\s+'
        r'(?:a\s+)?(?:video|clip|animation)\s+'
        r'(?:of|about|showing|depicting|with)?\s*',
        r'^(?:please\s+)?(?:generate|create|make|produce)\s+',
        r'^(?:video|clip)\s+(?:of|about)\s+',
    ]
    prompt = task
    for pat in patterns:
        prompt = re.sub(pat, '', prompt, flags=re.IGNORECASE).strip()
    return prompt or task


class VideoGenAgent(BaseAgent):
    """Video generation agent using OpenRouter Video API (Seedance 1.5 Pro)."""

    def __init__(self):
        super().__init__('Video Gen', provider=None)
        os.makedirs(SAVE_DIR, exist_ok=True)

    def _get_api_key(self):
        return os.environ.get('OPENROUTER_API_KEY', '')

    def run(self, task: str) -> str:
        intent = _detect_intent(task)
        if intent == 'list_videos':
            return self._handle_list_videos()
        return self._handle_generate(task)

    def _handle_generate(self, task: str) -> str:
        prompt = _extract_prompt(task)
        self.log(f'Generating video: "{prompt[:80]}..."')

        # Parse optional parameters from prompt
        duration = 5  # default 5 seconds
        resolution = '720p'
        aspect_ratio = '16:9'

        # Check for duration hints
        dur_match = re.search(r'(\d+)\s*(?:sec|second|s\b)', task.lower())
        if dur_match:
            d = int(dur_match.group(1))
            if 4 <= d <= 12:
                duration = d

        # Check for portrait/vertical hints
        if any(kw in task.lower() for kw in ['portrait', 'vertical', 'tiktok', 'reel', 'story']):
            aspect_ratio = '9:16'

        # Check for square hints
        if any(kw in task.lower() for kw in ['square', 'instagram']):
            aspect_ratio = '1:1'

        # Submit generation request
        api_key = self._get_api_key()
        if not api_key:
            return 'Error: OPENROUTER_API_KEY not set'

        try:
            resp = requests.post(
                OPENROUTER_VIDEO_URL,
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': MODEL,
                    'prompt': prompt,
                    'aspect_ratio': aspect_ratio,
                    'duration': duration,
                    'resolution': resolution,
                    'generate_audio': True,
                },
                timeout=30,
            )
        except Exception as e:
            self.log(f'Request failed: {e}', level='ERROR')
            return f'Video generation request failed: {e}'

        if resp.status_code not in (200, 201, 202):
            self.log(f'API error {resp.status_code}: {resp.text[:200]}', level='ERROR')
            return f'Video generation failed (HTTP {resp.status_code}): {resp.text[:200]}'

        data = resp.json()
        generation_id = data.get('generation_id') or data.get('id', 'unknown')
        polling_url = data.get('polling_url', '')
        status = data.get('status', '')

        self.log(f'Submitted: id={generation_id}, status={status}')

        # If already completed (unlikely but possible)
        if status == 'completed' and data.get('unsigned_urls'):
            return self._download_and_respond(data, prompt, duration, resolution)

        # Poll for completion
        if not polling_url:
            return f'Video generation submitted (ID: {generation_id}) but no polling URL returned. Check manually.'

        start_time = time.time()
        while time.time() - start_time < MAX_POLL_SECONDS:
            time.sleep(POLL_INTERVAL)
            try:
                poll_resp = requests.get(
                    polling_url,
                    headers={'Authorization': f'Bearer {api_key}'},
                    timeout=15,
                )
                poll_data = poll_resp.json()
                poll_status = poll_data.get('status', '')

                if poll_status == 'completed':
                    self.log(f'Video completed after {int(time.time() - start_time)}s')
                    return self._download_and_respond(poll_data, prompt, duration, resolution)
                elif poll_status == 'failed':
                    error = poll_data.get('error', 'Unknown error')
                    self.log(f'Generation failed: {error}', level='ERROR')
                    return f'Video generation failed: {error}'
                elif poll_status in ('cancelled', 'expired'):
                    return f'Video generation {poll_status}.'

                # Still in progress
                elapsed = int(time.time() - start_time)
                self.log(f'Still generating... ({elapsed}s elapsed, status={poll_status})')

            except Exception as e:
                self.log(f'Poll error: {e}', level='WARNING')
                # Continue polling on transient errors

        return (f'Video generation timed out after {MAX_POLL_SECONDS}s. '
                f'Generation ID: {generation_id}. It may still complete — check later.')

    def _download_and_respond(self, data: dict, prompt: str,
                               duration: int, resolution: str) -> str:
        """Download the completed video and return structured response."""
        urls = data.get('unsigned_urls', [])
        if not urls:
            return 'Video completed but no download URL provided.'

        video_url = urls[0]
        ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
        slug = re.sub(r'[^a-z0-9]+', '_', prompt.lower())[:30].strip('_')
        filename = f'{slug}_{ts}.mp4'
        save_path = os.path.join(SAVE_DIR, filename)

        try:
            self.log(f'Downloading video from {video_url[:80]}...')
            dl = requests.get(video_url, headers={
                'Authorization': f'Bearer {self._get_api_key()}',
            }, timeout=120)
            dl.raise_for_status()
            with open(save_path, 'wb') as f:
                f.write(dl.content)
            size_kb = len(dl.content) // 1024
            self.log(f'Saved: {save_path} ({size_kb}KB)')
        except Exception as e:
            self.log(f'Download failed: {e}', level='ERROR')
            return (f'Video generated but download failed: {e}\n'
                    f'Direct URL: {video_url}')

        # Log cost
        cost = data.get('usage', {}).get('cost', duration * 0.001)
        try:
            from lib.event_bus import event_bus
            event_bus.emit('Video Gen', 'api_cost', 'success',
                           summary=f'{MODEL} | {duration}s | ${cost:.4f}',
                           cost=float(cost), tokens=0)
        except Exception:
            pass

        # Send to Telegram
        self._send_telegram_video(save_path, f'Video: {prompt[:150]}')

        return (f'Video generated\n'
                f'Prompt: {prompt}\n'
                f'Path: {save_path}\n'
                f'Duration: {duration}s\n'
                f'Resolution: {resolution}\n'
                f'Size: {size_kb}KB\n'
                f'Model: Seedance 1.5 Pro')

    def _send_telegram_video(self, video_path: str, caption: str = '') -> bool:
        bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
        if not bot_token:
            return False
        try:
            with open(video_path, 'rb') as vid:
                resp = requests.post(
                    f'https://api.telegram.org/bot{bot_token}/sendVideo',
                    data={'chat_id': '6899940023', 'caption': caption[:1024]},
                    files={'video': vid},
                    timeout=60,
                )
            return resp.status_code == 200 and resp.json().get('ok', False)
        except Exception as e:
            log_error('Video Gen', f'Telegram sendVideo error: {e}')
            return False

    def _handle_list_videos(self) -> str:
        gen_dir = Path(SAVE_DIR)
        if not gen_dir.exists():
            return 'No generated videos found.'

        files = sorted(gen_dir.glob('*.mp4'), key=lambda f: f.stat().st_mtime,
                       reverse=True)
        if not files:
            return 'No generated videos found.'

        count = 10
        lines = [f'Last {min(count, len(files))} generated videos:\n']
        for f in files[:count]:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, EST)
            size_kb = f.stat().st_size // 1024
            lines.append(f'  {mtime.strftime("%Y-%m-%d %H:%M")} | {f.name} | {size_kb}KB')

        lines.append(f'\nTotal videos: {len(files)}')
        return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Module-level entry point (used by router)
# ---------------------------------------------------------------------------

def run(raw_input: str, task=None) -> str:
    agent = VideoGenAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
