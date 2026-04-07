"""
media_manager.py — Media orchestrator for Harv.

Routes media requests to the correct sub-agent:
  - Image Gen (LIVE) — image creation, art, profile pics, banners
  - Video Gen (PLANNED) — video generation from prompts
  - Video Editor (PLANNED) — video editing, trimming, post-production

Uses keyword matching only — no LLM call, zero cost, ~5ms overhead.
Any agent in the system can call Media Manager for media needs.
"""

import importlib.util
import re
import sys

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent

AGENT_NAME = 'Media Manager'

# Keyword patterns for routing
_IMAGE_PATTERNS = re.compile(
    r'(?:generat|creat|mak|draw|illustrat|design|render)\w*\s+'
    r'(?:an?\s+)?(?:image|picture|photo|graphic|visual|art|logo|icon|avatar|banner|header|cover|thumbnail)'
    r'|(?:image|picture|photo|graphic|visual|art|logo|icon|avatar|banner|header|cover|thumbnail)\s+'
    r'(?:of|for|about|showing|with)'
    r'|(?:profile\s+pic|tweet\s+image|tweet\s+graphic|new\s+avatar)'
    r'|(?:dall-?e|midjourney|flux|imagen|stable\s+diffusion)',
    re.IGNORECASE,
)

_VIDEO_GEN_PATTERNS = re.compile(
    r'(?:generat|creat|mak|render)\w*\s+(?:a\s+)?(?:video|clip|animation|storyboard)'
    r'|(?:video|clip|animation)\s+(?:of|for|about|from|prompt)',
    re.IGNORECASE,
)

_VIDEO_EDIT_PATTERNS = re.compile(
    r'(?:edit|trim|cut|crop|merge|splice|add\s+music|add\s+text|subtitle|post-?produc)'
    r'.*(?:video|clip|footage)'
    r'|(?:video|clip|footage)\s+(?:edit|trim|cut|crop)',
    re.IGNORECASE,
)


class MediaManagerAgent(BaseAgent):
    """Keyword-based router to media sub-agents. No LLM, zero cost."""

    def __init__(self):
        super().__init__(AGENT_NAME, provider=None)

    def run(self, task: str) -> str:
        task = (task or '').strip()
        if not task:
            return 'No media request provided. Try: "generate an image of..." or "create a video..."'

        # Route by keyword priority: video edit > video gen > image (default)
        if _VIDEO_EDIT_PATTERNS.search(task):
            return (
                'Video Editor is coming soon! Right now I can generate images for you. '
                'Video editing capabilities are on the roadmap.'
            )

        if _VIDEO_GEN_PATTERNS.search(task):
            return (
                'Video Gen is coming soon! Right now I can generate images for you. '
                'AI video generation is on the roadmap.'
            )

        # Default: route to Image Gen
        return self._delegate_to_image_gen(task)

    def _delegate_to_image_gen(self, task: str) -> str:
        """Load and call Image Gen agent dynamically."""
        try:
            spec = importlib.util.spec_from_file_location(
                'image_gen', '/root/harv/agents/image_gen.py'
            )
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod.run(task)
        except Exception as e:
            return f'Image Gen failed: {type(e).__name__}: {e}'


def run(raw_input: str, task=None) -> str:
    """Entry point called by the Router."""
    agent = MediaManagerAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    return str(agent.execute(message))


if __name__ == '__main__':
    import sys as _sys
    if len(_sys.argv) > 1:
        print(run(' '.join(_sys.argv[1:])))
    else:
        print('Usage: python3 media_manager.py "generate an image of a sunset"')
