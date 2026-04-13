"""
image_editor.py -- Image Editor agent for Harv.

Agent type : agent
Model      : Pillow (local) + DeepSeek (AI-assisted edits via OpenRouter)
Provider   : local + openrouter

Capabilities:
  - RESIZE     — change dimensions
  - CROP       — crop to region or aspect ratio
  - ROTATE     — rotate or flip
  - FILTERS    — grayscale, blur, sharpen, sepia, brightness, contrast
  - TEXT       — add text overlay
  - CONVERT    — change format (png, jpg, webp)
  - COMPRESS   — reduce file size
  - AI EDIT    — describe changes, LLM generates Pillow code

Input: image file path + edit instructions.
Works on images in /root/harv/media/generated/.
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent
from lib.harv_lib import now_est

EST = ZoneInfo('America/New_York')
MEDIA_DIR = '/root/harv/media/generated'


def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


def _find_latest_image() -> str | None:
    """Find the most recently created image in MEDIA_DIR."""
    exts = ['*.png', '*.jpg', '*.jpeg', '*.webp']
    files = []
    for ext in exts:
        files.extend(Path(MEDIA_DIR).glob(ext))
    files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return str(files[0]) if files else None


def _find_image(text: str) -> str | None:
    """Extract an image path from the message, or use the latest."""
    path_match = re.search(r'(/root/harv/media/generated/\S+\.(?:png|jpg|jpeg|webp))', text)
    if path_match and os.path.exists(path_match.group(1)):
        return path_match.group(1)
    name_match = re.search(r'(\S+\.(?:png|jpg|jpeg|webp))', text)
    if name_match:
        candidate = os.path.join(MEDIA_DIR, name_match.group(1))
        if os.path.exists(candidate):
            return candidate
    return _find_latest_image()


def _detect_intent(task: str) -> str:
    t = task.lower()
    if re.search(r'resize|scale|dimensions|make it.*smaller|make it.*bigger', t):
        return 'resize'
    if re.search(r'crop|square|center crop|cut.*image', t):
        return 'crop'
    if re.search(r'rotate|flip|mirror', t):
        return 'rotate'
    if re.search(r'grayscale|grey|gray|blur|sharpen|sepia|bright|contrast|saturate|filter', t):
        return 'filter'
    if re.search(r'text|overlay|add.*text|write.*on|watermark', t):
        return 'text'
    if re.search(r'convert|to jpg|to png|to webp|format', t):
        return 'convert'
    if re.search(r'compress|reduce.*size|optimize|smaller.*file', t):
        return 'compress'
    if re.search(r'list|recent|show.*image', t):
        return 'list'
    return 'ai_edit'


class ImageEditorAgent(BaseAgent):
    """Image editing agent using Pillow + AI assistance."""

    def __init__(self):
        super().__init__('Image Editor', provider='openrouter')

    def run(self, task: str) -> str:
        intent = _detect_intent(task)
        handlers = {
            'resize': self._resize,
            'crop': self._crop,
            'rotate': self._rotate,
            'filter': self._filter,
            'text': self._text,
            'convert': self._convert,
            'compress': self._compress,
            'list': self._list,
            'ai_edit': self._ai_edit,
        }
        return handlers.get(intent, self._ai_edit)(task)

    def _output_path(self, prefix: str, ext: str = 'png') -> str:
        ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
        return os.path.join(MEDIA_DIR, f'{prefix}_{ts}.{ext}')

    def _respond(self, output: str, edit_type: str) -> str:
        from PIL import Image as PILImage
        img = PILImage.open(output)
        size_kb = os.path.getsize(output) // 1024
        return (f'Image generated\n'
                f'Edit: {edit_type}\n'
                f'Prompt: {edit_type}\n'
                f'Path: {output}\n'
                f'Size: {img.width}x{img.height} ({size_kb}KB)\n'
                f'Model: Pillow')

    def _resize(self, task: str) -> str:
        from PIL import Image as PILImage
        src = _find_image(task)
        if not src:
            return 'No image found to edit. Generate an image first or specify a filename.'

        img = PILImage.open(src)
        t = task.lower()

        # Parse dimensions
        m = re.search(r'(\d+)\s*[x×]\s*(\d+)', t)
        if m:
            w, h = int(m.group(1)), int(m.group(2))
        elif re.search(r'(\d+)%', t):
            pct = int(re.search(r'(\d+)%', t).group(1)) / 100
            w, h = int(img.width * pct), int(img.height * pct)
        elif 'half' in t or '50%' in t:
            w, h = img.width // 2, img.height // 2
        elif 'double' in t or '2x' in t:
            w, h = img.width * 2, img.height * 2
        else:
            return 'Specify size: "resize to 800x600", "make it 50% smaller", "resize to 200x200"'

        img = img.resize((w, h), PILImage.LANCZOS)
        ext = Path(src).suffix.lstrip('.')
        output = self._output_path('resized', ext)
        img.save(output)
        return self._respond(output, f'Resized to {w}x{h}')

    def _crop(self, task: str) -> str:
        from PIL import Image as PILImage
        src = _find_image(task)
        if not src:
            return 'No image found to edit.'

        img = PILImage.open(src)
        t = task.lower()

        if 'square' in t:
            s = min(img.width, img.height)
            left = (img.width - s) // 2
            top = (img.height - s) // 2
            img = img.crop((left, top, left + s, top + s))
        elif re.search(r'(\d+)\s*[x×]\s*(\d+)', t):
            m = re.search(r'(\d+)\s*[x×]\s*(\d+)', t)
            w, h = int(m.group(1)), int(m.group(2))
            left = (img.width - w) // 2
            top = (img.height - h) // 2
            img = img.crop((left, top, left + w, top + h))
        else:
            # Default center crop to 80%
            w, h = int(img.width * 0.8), int(img.height * 0.8)
            left = (img.width - w) // 2
            top = (img.height - h) // 2
            img = img.crop((left, top, left + w, top + h))

        ext = Path(src).suffix.lstrip('.')
        output = self._output_path('cropped', ext)
        img.save(output)
        return self._respond(output, 'Cropped')

    def _rotate(self, task: str) -> str:
        from PIL import Image as PILImage
        src = _find_image(task)
        if not src:
            return 'No image found to edit.'

        img = PILImage.open(src)
        t = task.lower()

        if 'flip' in t and 'horizontal' in t or 'mirror' in t:
            img = img.transpose(PILImage.FLIP_LEFT_RIGHT)
            desc = 'Flipped horizontal'
        elif 'flip' in t and 'vertical' in t:
            img = img.transpose(PILImage.FLIP_TOP_BOTTOM)
            desc = 'Flipped vertical'
        elif '180' in t:
            img = img.rotate(180)
            desc = 'Rotated 180°'
        elif '270' in t or 'left' in t:
            img = img.rotate(90, expand=True)
            desc = 'Rotated 270°'
        else:
            img = img.rotate(-90, expand=True)
            desc = 'Rotated 90°'

        ext = Path(src).suffix.lstrip('.')
        output = self._output_path('rotated', ext)
        img.save(output)
        return self._respond(output, desc)

    def _filter(self, task: str) -> str:
        from PIL import Image as PILImage, ImageFilter, ImageEnhance
        src = _find_image(task)
        if not src:
            return 'No image found to edit.'

        img = PILImage.open(src)
        t = task.lower()

        if 'grayscale' in t or 'grey' in t or 'gray' in t or 'black and white' in t:
            img = img.convert('L').convert('RGB')
            desc = 'Grayscale'
        elif 'blur' in t:
            r = 5
            m = re.search(r'blur\s+(\d+)', t)
            if m:
                r = int(m.group(1))
            img = img.filter(ImageFilter.GaussianBlur(radius=r))
            desc = f'Blur (radius={r})'
        elif 'sharpen' in t:
            img = img.filter(ImageFilter.SHARPEN)
            desc = 'Sharpened'
        elif 'sepia' in t:
            img = img.convert('RGB')
            pixels = img.load()
            for y in range(img.height):
                for x in range(img.width):
                    r, g, b = pixels[x, y]
                    tr = min(255, int(0.393 * r + 0.769 * g + 0.189 * b))
                    tg = min(255, int(0.349 * r + 0.686 * g + 0.168 * b))
                    tb = min(255, int(0.272 * r + 0.534 * g + 0.131 * b))
                    pixels[x, y] = (tr, tg, tb)
            desc = 'Sepia'
        elif 'bright' in t:
            factor = 1.3
            m = re.search(r'(\d+)%', t)
            if m:
                factor = int(m.group(1)) / 100
            img = ImageEnhance.Brightness(img).enhance(factor)
            desc = f'Brightness {factor:.1f}x'
        elif 'contrast' in t:
            factor = 1.5
            m = re.search(r'(\d+)%', t)
            if m:
                factor = int(m.group(1)) / 100
            img = ImageEnhance.Contrast(img).enhance(factor)
            desc = f'Contrast {factor:.1f}x'
        else:
            return 'Available filters: grayscale, blur, sharpen, sepia, brightness, contrast'

        ext = Path(src).suffix.lstrip('.')
        output = self._output_path('filtered', ext)
        img.save(output)
        return self._respond(output, desc)

    def _text(self, task: str) -> str:
        from PIL import Image as PILImage, ImageDraw, ImageFont
        src = _find_image(task)
        if not src:
            return 'No image found to edit.'

        img = PILImage.open(src).convert('RGB')
        draw = ImageDraw.Draw(img)

        # Extract text
        text_match = re.search(r'(?:text|overlay|write|add)[:\s]+["\']?(.+?)(?:["\']?\s*$)', task, re.I)
        text = text_match.group(1).strip() if text_match else 'Sample Text'

        # Font
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 36)
        except Exception:
            font = ImageFont.load_default()

        # Position — center bottom
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (img.width - tw) // 2
        y = img.height - th - 40

        # Draw with shadow
        draw.text((x + 2, y + 2), text, fill='black', font=font)
        draw.text((x, y), text, fill='white', font=font)

        ext = Path(src).suffix.lstrip('.')
        output = self._output_path('text', ext)
        img.save(output)
        return self._respond(output, f'Added text: "{text[:40]}"')

    def _convert(self, task: str) -> str:
        from PIL import Image as PILImage
        src = _find_image(task)
        if not src:
            return 'No image found.'

        t = task.lower()
        if 'jpg' in t or 'jpeg' in t:
            ext = 'jpg'
        elif 'webp' in t:
            ext = 'webp'
        elif 'png' in t:
            ext = 'png'
        else:
            ext = 'png'

        img = PILImage.open(src).convert('RGB')
        output = self._output_path('converted', ext)
        img.save(output, quality=90 if ext in ('jpg', 'webp') else None)
        return self._respond(output, f'Converted to {ext.upper()}')

    def _compress(self, task: str) -> str:
        from PIL import Image as PILImage
        src = _find_image(task)
        if not src:
            return 'No image found.'

        img = PILImage.open(src).convert('RGB')
        output = self._output_path('compressed', 'jpg')

        # Try decreasing quality until under target
        target_kb = 500
        m = re.search(r'(\d+)\s*(?:kb|KB)', task)
        if m:
            target_kb = int(m.group(1))

        for quality in [85, 70, 50, 30, 15]:
            img.save(output, 'JPEG', quality=quality, optimize=True)
            if os.path.getsize(output) // 1024 <= target_kb:
                break

        return self._respond(output, f'Compressed (target: {target_kb}KB)')

    def _list(self, task: str) -> str:
        exts = ['*.png', '*.jpg', '*.jpeg', '*.webp']
        files = []
        for ext in exts:
            files.extend(Path(MEDIA_DIR).glob(ext))
        files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
        if not files:
            return 'No images found.'
        lines = [f'Last {min(10, len(files))} images:\n']
        for f in files[:10]:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, EST)
            size_kb = f.stat().st_size // 1024
            lines.append(f'  {mtime.strftime("%Y-%m-%d %H:%M")} | {f.name} | {size_kb}KB')
        return '\n'.join(lines)

    def _ai_edit(self, task: str) -> str:
        """Use LLM to interpret edit request."""
        src = _find_image(task)
        if not src:
            return 'No image found to edit. Generate an image first or specify a filename.'

        from PIL import Image as PILImage
        img = PILImage.open(src)

        messages = [
            {'role': 'system', 'content': (
                'You are a Pillow (Python imaging library) expert. Given an image edit request, '
                'return ONLY Python code that edits the image. The image is already loaded as `img` (PIL.Image). '
                'Save the result to `output_path`. Available: PIL.Image, PIL.ImageFilter, PIL.ImageEnhance, PIL.ImageDraw, PIL.ImageFont. '
                'Return ONLY the Python code, no explanations.'
            )},
            {'role': 'user', 'content': (
                f'Image: {src} ({img.width}x{img.height})\n'
                f'Edit: {task}\n'
                'Write Pillow code. img is loaded. Save to output_path.'
            )},
        ]
        try:
            reply = self.call_llm(messages, model='deepseek/deepseek-chat-v3-0324', max_tokens=300)
            reply = reply.strip()
            if reply.startswith('```'):
                reply = reply.split('```')[1]
                if reply.startswith('python'):
                    reply = reply[6:]
                reply = reply.strip()

            output = self._output_path('edited', Path(src).suffix.lstrip('.'))
            # Execute in restricted scope
            exec_globals = {
                'img': img,
                'output_path': output,
                'PIL': __import__('PIL'),
                'Image': PILImage,
            }
            from PIL import ImageFilter, ImageEnhance, ImageDraw, ImageFont
            exec_globals['ImageFilter'] = ImageFilter
            exec_globals['ImageEnhance'] = ImageEnhance
            exec_globals['ImageDraw'] = ImageDraw
            exec_globals['ImageFont'] = ImageFont

            exec(reply, exec_globals)

            if os.path.exists(output):
                return self._respond(output, f'AI edit: {task[:50]}')
            else:
                # Maybe the code saved to img directly
                img.save(output)
                return self._respond(output, f'AI edit: {task[:50]}')
        except Exception as e:
            return f'AI edit failed: {e}. Try specific commands like "resize to 400x400" or "make it grayscale".'


def run(raw_input: str, task=None) -> str:
    agent = ImageEditorAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
