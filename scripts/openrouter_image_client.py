"""
openrouter_image_client.py — Image generation via OpenRouter (Gemini Flash Image).

Drop-in replacement for GeminiImageClient. Same interface:
  client.generate_image(prompt, save_path) -> {"success": True, "images": [path], "model": "..."}
"""

import base64
import os
import re
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import openai

DEFAULT_SAVE_DIR = '/root/harv/media/generated'
MODEL = 'google/gemini-2.5-flash-image'
EST = ZoneInfo('America/New_York')


class OpenRouterImageClient:
    """Image generation via OpenRouter chat completions API."""

    def __init__(self):
        self._client = openai.OpenAI(
            base_url='https://openrouter.ai/api/v1',
            api_key=os.environ.get('OPENROUTER_API_KEY', ''),
        )

    def generate_image(self, prompt: str, save_path: str = None,
                       number_of_images: int = 1) -> dict:
        """Generate an image from a text prompt.

        Returns:
            {"success": True, "images": [path], "model": MODEL, "prompt": prompt,
             "tokens_in": N, "tokens_out": N, "cost": X}
        """
        try:
            response = self._client.chat.completions.create(
                model=MODEL,
                messages=[
                    {
                        'role': 'user',
                        'content': f'Generate an image: {prompt}. Return ONLY the image, no text.',
                    }
                ],
                max_tokens=4096,
            )

            # Extract image from response
            msg = response.choices[0].message if response.choices else None
            if not msg or not msg.content:
                return {'success': False, 'error': 'No response from model', 'prompt': prompt}

            # Check for inline image data (base64)
            image_data = None
            if hasattr(msg, 'content') and isinstance(msg.content, list):
                for part in msg.content:
                    if hasattr(part, 'type') and part.type == 'image':
                        image_data = part.image.data if hasattr(part, 'image') else None
            elif hasattr(msg, 'content') and isinstance(msg.content, str):
                # Check if content contains base64 image data
                b64_match = re.search(r'data:image/\w+;base64,([A-Za-z0-9+/=]+)', msg.content)
                if b64_match:
                    image_data = b64_match.group(1)
                # Or raw base64
                elif len(msg.content) > 1000 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n' for c in msg.content[:100]):
                    image_data = msg.content

            if not image_data:
                return {'success': False, 'error': 'No image data in response', 'prompt': prompt}

            # Decode and save
            image_bytes = base64.b64decode(image_data)

            # Determine save path
            if save_path and os.path.isdir(save_path):
                ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
                slug = re.sub(r'[^a-z0-9]+', '_', prompt.lower())[:40].strip('_')
                save_path = os.path.join(save_path, f'{slug}_{ts}.png')

            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            with open(save_path, 'wb') as f:
                f.write(image_bytes)

            # Token usage
            usage = response.usage
            in_tok = getattr(usage, 'prompt_tokens', 0) if usage else 0
            out_tok = getattr(usage, 'completion_tokens', 0) if usage else 0

            return {
                'success': True,
                'images': [save_path],
                'model': MODEL,
                'prompt': prompt,
                'tokens_in': in_tok,
                'tokens_out': out_tok,
            }

        except Exception as e:
            return {'success': False, 'error': str(e), 'prompt': prompt}

    def get_daily_usage(self) -> dict:
        """Compatibility stub — OpenRouter handles rate limits."""
        return {'count': 0, 'remaining': 999, 'limit': 999}
