"""
video_editor.py -- Video Editor agent for Harv.

Agent type : agent
Model      : FFmpeg (local) + DeepSeek (AI-assisted edits via OpenRouter)
Provider   : local + openrouter

Capabilities:
  - TRIM       — cut video to time range
  - RESIZE     — change resolution/aspect ratio
  - CROP       — crop to region or aspect ratio
  - SPEED      — speed up / slow down
  - ROTATE     — rotate or flip
  - SUBTITLES  — burn in text at timestamps
  - EXTRACT    — extract audio as mp3
  - CONVERT    — change format (mp4, gif, webm)
  - AI EDIT    — describe changes, LLM generates FFmpeg command

Input: video file path + edit instructions.
Works on videos in /root/harv/media/generated/.
"""

import json
import os
import re
import subprocess
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


def _find_latest_video() -> str | None:
    """Find the most recently created video in MEDIA_DIR."""
    vids = sorted(Path(MEDIA_DIR).glob('*.mp4'), key=lambda f: f.stat().st_mtime, reverse=True)
    return str(vids[0]) if vids else None


def _find_video(text: str) -> str | None:
    """Extract a video path from the message, or use the latest."""
    # Check for explicit path
    path_match = re.search(r'(/root/harv/media/generated/\S+\.mp4)', text)
    if path_match and os.path.exists(path_match.group(1)):
        return path_match.group(1)
    # Check for filename reference
    name_match = re.search(r'(\S+\.mp4)', text)
    if name_match:
        candidate = os.path.join(MEDIA_DIR, name_match.group(1))
        if os.path.exists(candidate):
            return candidate
    # Fall back to latest
    return _find_latest_video()


def _get_video_info(path: str) -> dict:
    """Get video duration and resolution via ffprobe."""
    try:
        r = subprocess.run([
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', path
        ], capture_output=True, text=True, timeout=10)
        data = json.loads(r.stdout)
        stream = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), {})
        return {
            'duration': float(data.get('format', {}).get('duration', 0)),
            'width': int(stream.get('width', 0)),
            'height': int(stream.get('height', 0)),
            'size_kb': int(data.get('format', {}).get('size', 0)) // 1024,
        }
    except Exception:
        return {'duration': 0, 'width': 0, 'height': 0, 'size_kb': 0}


def _parse_time(t: str) -> float:
    """Parse time string like '0:05', '1:30', '5', '00:00:05' to seconds."""
    t = t.strip()
    parts = t.split(':')
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(t)


def _detect_intent(task: str) -> str:
    t = task.lower()
    if re.search(r'trim|cut|clip|first.*second|last.*second|from.*to', t):
        return 'trim'
    if re.search(r'resize|scale|resolution|1080p|720p|4k|portrait|landscape', t):
        return 'resize'
    if re.search(r'crop|square|center crop', t):
        return 'crop'
    if re.search(r'speed|slow|fast|2x|0\.5x|slow motion', t):
        return 'speed'
    if re.search(r'rotate|flip|mirror', t):
        return 'rotate'
    if re.search(r'subtitle|caption|text.*video|burn.*text', t):
        return 'subtitles'
    if re.search(r'extract audio|audio only|to mp3|get audio', t):
        return 'extract_audio'
    if re.search(r'convert|to gif|to webm|to avi|format', t):
        return 'convert'
    if re.search(r'list|recent|show.*video', t):
        return 'list'
    return 'ai_edit'


class VideoEditorAgent(BaseAgent):
    """Video editing agent using FFmpeg + AI assistance."""

    def __init__(self):
        super().__init__('Video Editor', provider='openrouter')

    def run(self, task: str) -> str:
        intent = _detect_intent(task)
        handlers = {
            'trim': self._trim,
            'resize': self._resize,
            'crop': self._crop,
            'speed': self._speed,
            'rotate': self._rotate,
            'subtitles': self._subtitles,
            'extract_audio': self._extract_audio,
            'convert': self._convert,
            'list': self._list,
            'ai_edit': self._ai_edit,
        }
        return handlers.get(intent, self._ai_edit)(task)

    def _output_path(self, prefix: str, ext: str = 'mp4') -> str:
        ts = datetime.now(EST).strftime('%Y%m%d_%H%M%S')
        return os.path.join(MEDIA_DIR, f'{prefix}_{ts}.{ext}')

    def _run_ffmpeg(self, args: list, output: str) -> tuple[bool, str]:
        """Run FFmpeg command. Returns (success, error_msg)."""
        cmd = ['ffmpeg', '-y'] + args + [output]
        self.log(f'FFmpeg: {" ".join(cmd)[:200]}')
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if r.returncode == 0 and os.path.exists(output):
                return True, ''
            return False, r.stderr[-300:] if r.stderr else 'Unknown error'
        except subprocess.TimeoutExpired:
            return False, 'FFmpeg timed out (120s)'
        except Exception as e:
            return False, str(e)

    def _respond(self, src: str, output: str, edit_type: str) -> str:
        info = _get_video_info(output)
        return (f'Video edited\n'
                f'Edit: {edit_type}\n'
                f'Path: {output}\n'
                f'Duration: {info["duration"]:.1f}s\n'
                f'Resolution: {info["width"]}x{info["height"]}\n'
                f'Size: {info["size_kb"]}KB\n'
                f'Model: FFmpeg')

    def _trim(self, task: str) -> str:
        src = _find_video(task)
        if not src:
            return 'No video found to edit. Generate a video first or specify a filename.'

        info = _get_video_info(src)
        t = task.lower()

        # Parse "first N seconds"
        first = re.search(r'first\s+(\d+)\s*(?:sec|s\b)', t)
        if first:
            ss, to = 0, int(first.group(1))
        # Parse "last N seconds"
        elif re.search(r'last\s+(\d+)\s*(?:sec|s\b)', t):
            n = int(re.search(r'last\s+(\d+)', t).group(1))
            ss = max(0, info['duration'] - n)
            to = info['duration']
        # Parse "from X to Y"
        elif re.search(r'from\s+([\d:]+)\s*to\s*([\d:]+)', t):
            m = re.search(r'from\s+([\d:]+)\s*to\s*([\d:]+)', t)
            ss, to = _parse_time(m.group(1)), _parse_time(m.group(2))
        else:
            return 'Specify trim range: "trim first 3 seconds", "trim from 0:05 to 0:10", or "trim last 2 seconds"'

        output = self._output_path('trimmed')
        ok, err = self._run_ffmpeg(['-i', src, '-ss', str(ss), '-to', str(to), '-c', 'copy'], output)
        if not ok:
            return f'Trim failed: {err}'
        return self._respond(src, output, f'Trimmed {ss:.1f}s to {to:.1f}s')

    def _resize(self, task: str) -> str:
        src = _find_video(task)
        if not src:
            return 'No video found to edit.'

        t = task.lower()
        if '1080p' in t:
            scale = '1920:1080'
        elif '720p' in t:
            scale = '1280:720'
        elif '4k' in t:
            scale = '3840:2160'
        elif '480p' in t:
            scale = '854:480'
        elif 'portrait' in t:
            scale = '1080:1920'
        elif 'square' in t:
            scale = '1080:1080'
        else:
            m = re.search(r'(\d+)\s*[x×]\s*(\d+)', t)
            if m:
                scale = f'{m.group(1)}:{m.group(2)}'
            else:
                return 'Specify resolution: "resize to 1080p", "resize to 800x600", "make it portrait"'

        output = self._output_path('resized')
        ok, err = self._run_ffmpeg(['-i', src, '-vf', f'scale={scale}:force_original_aspect_ratio=decrease,pad={scale}:(ow-iw)/2:(oh-ih)/2', '-c:a', 'copy'], output)
        if not ok:
            return f'Resize failed: {err}'
        return self._respond(src, output, f'Resized to {scale.replace(":", "x")}')

    def _crop(self, task: str) -> str:
        src = _find_video(task)
        if not src:
            return 'No video found to edit.'

        info = _get_video_info(src)
        t = task.lower()

        if 'square' in t:
            s = min(info['width'], info['height'])
            crop = f'crop={s}:{s}'
        elif 'center' in t:
            m = re.search(r'(\d+)\s*[x×]\s*(\d+)', t)
            if m:
                crop = f'crop={m.group(1)}:{m.group(2)}'
            else:
                s = min(info['width'], info['height'])
                crop = f'crop={s}:{s}'
        else:
            return 'Specify crop: "crop to square", "crop center 500x500"'

        output = self._output_path('cropped')
        ok, err = self._run_ffmpeg(['-i', src, '-vf', crop, '-c:a', 'copy'], output)
        if not ok:
            return f'Crop failed: {err}'
        return self._respond(src, output, f'Cropped ({crop})')

    def _speed(self, task: str) -> str:
        src = _find_video(task)
        if not src:
            return 'No video found to edit.'

        t = task.lower()
        m = re.search(r'([\d.]+)\s*x', t)
        if m:
            factor = float(m.group(1))
        elif 'slow motion' in t or 'slow' in t:
            factor = 0.5
        elif 'fast' in t or 'speed up' in t:
            factor = 2.0
        else:
            factor = 2.0

        factor = max(0.25, min(4.0, factor))
        pts = 1.0 / factor
        output = self._output_path('speed')
        ok, err = self._run_ffmpeg(['-i', src, '-vf', f'setpts={pts}*PTS', '-af', f'atempo={factor}', '-c:v', 'libx264'], output)
        if not ok:
            return f'Speed change failed: {err}'
        return self._respond(src, output, f'Speed {factor}x')

    def _rotate(self, task: str) -> str:
        src = _find_video(task)
        if not src:
            return 'No video found to edit.'

        t = task.lower()
        if 'flip' in t and 'horizontal' in t or 'mirror' in t:
            vf = 'hflip'
            desc = 'Flipped horizontal'
        elif 'flip' in t and 'vertical' in t:
            vf = 'vflip'
            desc = 'Flipped vertical'
        elif '180' in t:
            vf = 'transpose=2,transpose=2'
            desc = 'Rotated 180°'
        elif '270' in t or 'left' in t:
            vf = 'transpose=2'
            desc = 'Rotated 270°'
        else:
            vf = 'transpose=1'
            desc = 'Rotated 90°'

        output = self._output_path('rotated')
        ok, err = self._run_ffmpeg(['-i', src, '-vf', vf, '-c:a', 'copy'], output)
        if not ok:
            return f'Rotate failed: {err}'
        return self._respond(src, output, desc)

    def _subtitles(self, task: str) -> str:
        src = _find_video(task)
        if not src:
            return 'No video found to edit.'

        # Extract subtitle text
        text_match = re.search(r'(?:subtitle|caption|text)[s]?[:\s]+["\']?(.+?)(?:["\']?\s*$)', task, re.I)
        text = text_match.group(1).strip() if text_match else 'Sample subtitle'

        output = self._output_path('subtitled')
        # Burn text at bottom center
        escaped = text.replace("'", "\\'").replace(":", "\\:")
        vf = f"drawtext=text='{escaped}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-th-30"
        ok, err = self._run_ffmpeg(['-i', src, '-vf', vf, '-c:a', 'copy'], output)
        if not ok:
            return f'Subtitle failed: {err}'
        return self._respond(src, output, f'Added subtitle: "{text[:50]}"')

    def _extract_audio(self, task: str) -> str:
        src = _find_video(task)
        if not src:
            return 'No video found.'

        output = self._output_path('audio', 'mp3')
        ok, err = self._run_ffmpeg(['-i', src, '-vn', '-acodec', 'libmp3lame', '-q:a', '2'], output)
        if not ok:
            return f'Audio extraction failed: {err}'
        size_kb = os.path.getsize(output) // 1024
        return f'Audio extracted\nPath: {output}\nSize: {size_kb}KB\nFormat: MP3'

    def _convert(self, task: str) -> str:
        src = _find_video(task)
        if not src:
            return 'No video found.'

        t = task.lower()
        if 'gif' in t:
            ext, codec_args = 'gif', ['-vf', 'fps=10,scale=480:-1:flags=lanczos']
        elif 'webm' in t:
            ext, codec_args = 'webm', ['-c:v', 'libvpx-vp9', '-c:a', 'libopus']
        elif 'avi' in t:
            ext, codec_args = 'avi', ['-c:v', 'libxvid', '-c:a', 'libmp3lame']
        else:
            ext, codec_args = 'mp4', ['-c', 'copy']

        output = self._output_path('converted', ext)
        ok, err = self._run_ffmpeg(['-i', src] + codec_args, output)
        if not ok:
            return f'Conversion failed: {err}'

        size_kb = os.path.getsize(output) // 1024
        if ext in ('mp4', 'webm', 'avi'):
            return self._respond(src, output, f'Converted to {ext.upper()}')
        return f'Video converted\nPath: {output}\nSize: {size_kb}KB\nFormat: {ext.upper()}\nModel: FFmpeg'

    def _list(self, task: str) -> str:
        vids = sorted(Path(MEDIA_DIR).glob('*.mp4'), key=lambda f: f.stat().st_mtime, reverse=True)
        if not vids:
            return 'No videos found.'
        lines = [f'Last {min(10, len(vids))} videos:\n']
        for f in vids[:10]:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, EST)
            info = _get_video_info(str(f))
            lines.append(f'  {mtime.strftime("%Y-%m-%d %H:%M")} | {f.name} | {info["duration"]:.1f}s | {info["size_kb"]}KB')
        return '\n'.join(lines)

    def _ai_edit(self, task: str) -> str:
        """Use LLM to interpret edit request and generate FFmpeg command."""
        src = _find_video(task)
        if not src:
            return 'No video found to edit. Generate a video first or specify a filename.'

        info = _get_video_info(src)
        messages = [
            {'role': 'system', 'content': (
                'You are an FFmpeg expert. Given a video edit request, return ONLY a JSON object with '
                '"args" (array of FFmpeg arguments EXCLUDING -i input and output path) and "ext" (output extension). '
                'Example: {"args": ["-vf", "eq=brightness=0.1"], "ext": "mp4"}\n'
                'The input video will be provided as -i automatically. Return ONLY JSON.'
            )},
            {'role': 'user', 'content': (
                f'Video: {src}\n'
                f'Duration: {info["duration"]:.1f}s, Resolution: {info["width"]}x{info["height"]}\n'
                f'Edit request: {task}\n\n'
                'Return the FFmpeg args as JSON.'
            )},
        ]
        try:
            reply = self.call_llm(messages, model='deepseek/deepseek-chat-v3-0324', max_tokens=200)
            reply = reply.strip()
            if reply.startswith('```'):
                reply = reply.split('```')[1]
                if reply.startswith('json'):
                    reply = reply[4:]
                reply = reply.strip()
            cmd = json.loads(reply)
            args = cmd.get('args', [])
            ext = cmd.get('ext', 'mp4')
        except Exception as e:
            return f'Could not understand edit request: {e}. Try specific commands like "trim first 3 seconds" or "resize to 720p".'

        output = self._output_path('edited', ext)
        ok, err = self._run_ffmpeg(['-i', src] + args, output)
        if not ok:
            return f'Edit failed: {err}'
        return self._respond(src, output, f'AI edit: {task[:60]}')


def run(raw_input: str, task=None) -> str:
    agent = VideoEditorAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
