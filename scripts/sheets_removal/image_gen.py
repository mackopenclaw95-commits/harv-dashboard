"""
image_gen.py -- Image Generation agent for Harv.

Agent type : agent
Model      : None (no LLM -- uses Imagen 4.0 via Gemini API)
Provider   : gemini (image generation only, no text LLM)

Capabilities:
  - GENERATE IMAGE    — create an image from a text description
  - TWEET IMAGE       — generate a Twitter-optimized landscape image
  - PROFILE PIC       — generate + auto-resize to 400x400
  - BANNER            — generate + auto-resize to 1500x500
  - REGENERATE        — re-run last generation with variation
  - LIST IMAGES       — show recently generated images

All generated images are sent directly to Telegram for review.
Storage: /root/harv/media/generated/
Domain slice: image_gen.json — preferences, generation history.
"""

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent
from lib.harv_lib import AgentResponse, now_est
from lib.harv_errors import log_error

EST = ZoneInfo('America/New_York')
SAVE_DIR = '/root/harv/media/generated'
DOMAIN_SLICE_PATH = '/root/harv/memory/domains/image_gen.json'
CHAT_ID = '6899940023'


def _detect_intent(task: str) -> str:
    """Classify the user's request into an image gen intent."""
    t = task.lower()

    if any(kw in t for kw in ['list image', 'recent image', 'show image',
                               'show my generated', 'what images']):
        return 'list_images'

    if any(kw in t for kw in ['regenerate', 'try again', 'another version',
                               'redo', 'new version', 'variation']):
        return 'regenerate'

    if any(kw in t for kw in ['banner', 'header image', 'cover image']):
        return 'banner'

    if any(kw in t for kw in ['profile pic', 'profile picture', 'avatar',
                               'pfp', 'headshot']):
        return 'profile_pic'

    if any(kw in t for kw in ['tweet image', 'tweet graphic', 'twitter image',
                               'social media image', 'social graphic',
                               'image for twitter', 'image for a tweet']):
        return 'tweet_image'

    # Default: general image generation
    return 'generate'


def _strip_context_tags(text: str) -> str:
    """Remove [CONTEXT]...[/CONTEXT] and [PROJECT CONTEXT]...[END PROJECT CONTEXT] blocks."""
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    return text.strip()


def _extract_prompt(task: str) -> str:
    """Extract the image description from the user's message."""
    # Strip context tags first
    task = _strip_context_tags(task)

    # Remove common prefixes
    patterns = [
        r'^(?:please\s+)?(?:generate|create|make|draw|design|illustrate)\s+'
        r'(?:an?\s+)?(?:image|picture|photo|graphic|illustration|art)\s+'
        r'(?:of|about|showing|depicting|with)?\s*',
        r'^(?:please\s+)?(?:generate|create|make|draw|design|illustrate)\s+',
        r'^(?:image|picture|photo)\s+(?:of|about)\s+',
    ]
    prompt = task
    for pat in patterns:
        prompt = re.sub(pat, '', prompt, flags=re.IGNORECASE).strip()
    return prompt or task


class ImageGenAgent(BaseAgent):
    """Image generation agent using Gemini Imagen models."""

    def __init__(self):
        super().__init__('Image Gen', provider=None)
        self._client = None
        self._last_prompt = None
        self._last_path = None
        os.makedirs(SAVE_DIR, exist_ok=True)

    def _get_client(self):
        """Lazy-init the Gemini image client."""
        if self._client is None:
            from lib.gemini_image_client import GeminiImageClient
            self._client = GeminiImageClient()
        return self._client

    def run(self, task: str) -> str:
        intent = _detect_intent(task)

        handlers = {
            'generate':    self._handle_generate,
            'tweet_image': self._handle_tweet_image,
            'profile_pic': self._handle_profile_pic,
            'banner':      self._handle_banner,
            'regenerate':  self._handle_regenerate,
            'list_images': self._handle_list_images,
        }

        handler = handlers.get(intent, self._handle_generate)
        return handler(task)

    # ------------------------------------------------------------------
    # Telegram image sending
    # ------------------------------------------------------------------

    def _send_telegram_image(self, image_path: str, caption: str = '') -> bool:
        """Send an image to Mack via Telegram. Returns True on success."""
        import requests
        bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
        if not bot_token:
            log_error('Image Gen', 'TELEGRAM_BOT_TOKEN not set')
            return False
        try:
            with open(image_path, 'rb') as img:
                resp = requests.post(
                    f'https://api.telegram.org/bot{bot_token}/sendPhoto',
                    data={'chat_id': CHAT_ID, 'caption': caption[:1024]},
                    files={'photo': img},
                    timeout=30,
                )
            if resp.status_code == 200 and resp.json().get('ok'):
                return True
            log_error('Image Gen', f'Telegram sendPhoto failed: {resp.text[:200]}')
            return False
        except Exception as e:
            log_error('Image Gen', f'Telegram sendPhoto error: {e}')
            return False

    # ------------------------------------------------------------------
    # Generation helpers
    # ------------------------------------------------------------------

    def _generate(self, prompt: str, save_path: str = None) -> dict:
        """Generate an image and track it. Returns gemini client result dict."""
        client = self._get_client()
        result = client.generate_image(prompt=prompt, save_path=save_path or SAVE_DIR)

        if result.get('success') and result.get('images'):
            self._last_prompt = prompt
            self._last_path = result['images'][0]
            self._record_generation(prompt, result['images'][0],
                                    result.get('model', 'unknown'))
        return result

    def _record_generation(self, prompt: str, path: str, model: str):
        """Record generation to domain slice history."""
        try:
            entry = {
                'timestamp': now_est(),
                'prompt': prompt[:200],
                'path': path,
                'model': model,
            }
            history = []
            if self.domain and 'history' in self.domain:
                history = self.domain['history']
            history.insert(0, entry)
            history = history[:20]  # keep last 20
            self.save_domain({'history': history, 'last_prompt': prompt,
                              'last_path': path})
        except Exception:
            pass

    def _resize_image(self, src: str, dest: str, width: int, height: int) -> str:
        """Resize an image using PIL. Returns output path."""
        from PIL import Image
        img = Image.open(src)

        # For banner: crop center to target aspect ratio first
        target_ratio = width / height
        img_ratio = img.width / img.height

        if abs(target_ratio - img_ratio) > 0.1:
            if target_ratio > img_ratio:
                new_h = int(img.width / target_ratio)
                top = (img.height - new_h) // 2
                img = img.crop((0, top, img.width, top + new_h))
            else:
                new_w = int(img.height * target_ratio)
                left = (img.width - new_w) // 2
                img = img.crop((left, 0, left + new_w, img.height))

        img = img.resize((width, height), Image.LANCZOS)
        img.save(dest)
        return dest

    # ------------------------------------------------------------------
    # Intent handlers
    # ------------------------------------------------------------------

    def _handle_generate(self, task: str) -> str:
        prompt = _extract_prompt(task)
        ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
        # Create a clean filename from the prompt
        slug = re.sub(r'[^a-z0-9]+', '_', prompt.lower())[:40].strip('_')
        save_path = os.path.join(SAVE_DIR, f'{slug}_{ts}.png')

        result = self._generate(prompt, save_path)
        if not result.get('success'):
            return f"Image generation failed: {result.get('error', 'unknown error')}"

        path = result['images'][0]
        size_kb = os.path.getsize(path) // 1024
        caption = f"Generated: {prompt[:200]}\nModel: {result.get('model', '?')}\nSize: {size_kb}KB"
        sent = self._send_telegram_image(path, caption)

        status = "sent to Telegram" if sent else "saved (Telegram send failed)"
        return (f"Image generated and {status}.\n"
                f"Prompt: {prompt}\n"
                f"Model: {result.get('model', '?')}\n"
                f"Path: {path}\n"
                f"Size: {size_kb}KB")

    def _handle_tweet_image(self, task: str) -> str:
        prompt = _extract_prompt(task)
        # Add Twitter optimization hints
        prompt_enhanced = prompt + ', clean social media graphic, 16:9 landscape aspect ratio'
        ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
        slug = re.sub(r'[^a-z0-9]+', '_', prompt.lower())[:30].strip('_')
        save_path = os.path.join(SAVE_DIR, f'tweet_{slug}_{ts}.png')

        result = self._generate(prompt_enhanced, save_path)
        if not result.get('success'):
            return f"Tweet image generation failed: {result.get('error', 'unknown error')}"

        path = result['images'][0]
        # Resize to Twitter optimal: 1200x675
        resized_path = path.replace('.png', '_1200x675.png')
        try:
            self._resize_image(path, resized_path, 1200, 675)
            final_path = resized_path
        except Exception:
            final_path = path

        size_kb = os.path.getsize(final_path) // 1024
        caption = f"Tweet image: {prompt[:150]}\n1200x675 • {size_kb}KB"
        self._send_telegram_image(final_path, caption)

        return (f"Tweet image generated.\n"
                f"Prompt: {prompt}\n"
                f"Path: {final_path}\n"
                f"Size: 1200x675 ({size_kb}KB)\n"
                f"Ready to attach via Auto Marketing.")

    def _handle_profile_pic(self, task: str) -> str:
        prompt = _extract_prompt(task)
        if not any(kw in prompt.lower() for kw in ['portrait', 'face', 'headshot', 'avatar']):
            prompt = prompt + ', portrait style, centered subject, clean background'
        ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
        save_path = os.path.join(SAVE_DIR, f'profile_{ts}.png')

        result = self._generate(prompt, save_path)
        if not result.get('success'):
            return f"Profile pic generation failed: {result.get('error', 'unknown error')}"

        path = result['images'][0]
        resized_path = path.replace('.png', '_400x400.png')
        try:
            self._resize_image(path, resized_path, 400, 400)
            final_path = resized_path
        except Exception:
            final_path = path

        size_kb = os.path.getsize(final_path) // 1024
        caption = f"Profile pic: {prompt[:150]}\n400x400 • {size_kb}KB"
        self._send_telegram_image(final_path, caption)

        return (f"Profile picture generated (400x400).\n"
                f"Prompt: {prompt}\n"
                f"Path: {final_path}\n"
                f"Size: {size_kb}KB")

    def _handle_banner(self, task: str) -> str:
        prompt = _extract_prompt(task)
        prompt = prompt + ', wide panoramic banner, 3:1 aspect ratio, clean design'
        ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
        save_path = os.path.join(SAVE_DIR, f'banner_{ts}.png')

        result = self._generate(prompt, save_path)
        if not result.get('success'):
            return f"Banner generation failed: {result.get('error', 'unknown error')}"

        path = result['images'][0]
        resized_path = path.replace('.png', '_1500x500.png')
        try:
            self._resize_image(path, resized_path, 1500, 500)
            final_path = resized_path
        except Exception:
            final_path = path

        size_kb = os.path.getsize(final_path) // 1024
        caption = f"Banner: {prompt[:150]}\n1500x500 • {size_kb}KB"
        self._send_telegram_image(final_path, caption)

        return (f"Banner generated (1500x500).\n"
                f"Prompt: {prompt}\n"
                f"Path: {final_path}\n"
                f"Size: {size_kb}KB")

    def _handle_regenerate(self, task: str) -> str:
        # Try to load last prompt from domain or instance
        prompt = self._last_prompt
        if not prompt and self.domain:
            prompt = self.domain.get('last_prompt')
        if not prompt:
            return ("No previous generation found. "
                    "Use 'generate an image of ...' first, then 'regenerate'.")

        # Add variation hint
        prompt_varied = prompt + ', alternative artistic interpretation'
        ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
        save_path = os.path.join(SAVE_DIR, f'regen_{ts}.png')

        result = self._generate(prompt_varied, save_path)
        if not result.get('success'):
            return f"Regeneration failed: {result.get('error', 'unknown error')}"

        path = result['images'][0]
        size_kb = os.path.getsize(path) // 1024
        caption = f"Regenerated: {prompt[:150]}\nModel: {result.get('model', '?')}"
        self._send_telegram_image(path, caption)

        return (f"Regenerated image.\n"
                f"Original prompt: {prompt}\n"
                f"Path: {path}\n"
                f"Size: {size_kb}KB")

    def _handle_list_images(self, task: str) -> str:
        gen_dir = Path(SAVE_DIR)
        if not gen_dir.exists():
            return "No generated images found."

        files = sorted(gen_dir.glob('*.png'), key=lambda f: f.stat().st_mtime,
                       reverse=True)
        # Also include jpg
        files += sorted(gen_dir.glob('*.jpg'), key=lambda f: f.stat().st_mtime,
                        reverse=True)
        # De-dup and re-sort
        files = sorted(set(files), key=lambda f: f.stat().st_mtime, reverse=True)

        if not files:
            return "No generated images found."

        count = 10
        lines = [f"Last {min(count, len(files))} generated images:\n"]
        for f in files[:count]:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, EST)
            size_kb = f.stat().st_size // 1024
            lines.append(f"  {mtime.strftime('%Y-%m-%d %H:%M')} | {f.name} | {size_kb}KB")

        lines.append(f"\nTotal images in folder: {len(files)}")
        return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Module-level entry point (used by router)
# ---------------------------------------------------------------------------

def run(raw_input: str, task=None) -> str:
    """Entry point called by the router."""
    agent = ImageGenAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    # Strip context tags that may leak from dashboard
    message = _strip_context_tags(message)
    return str(agent.execute(message))
