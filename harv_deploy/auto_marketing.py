"""
auto_marketing.py — Marketing agent for Harv.

Agent type : agent
Model      : deepseek/deepseek-chat-v3-0324 via OpenRouter
Provider   : openrouter

Capabilities:
  - DRAFT    — generate platform-tailored posts (Twitter, Reddit)
  - IDEAS    — brainstorm content ideas
  - POST     — publish to Twitter/X or Reddit (manual approval via dashboard)
  - QUEUE    — add drafts to publish queue (Supabase marketing_queue)
  - MONITOR  — search Reddit/Twitter for brand mentions
  - CAMPAIGN — organize related drafts

Blueprint contract (api/blueprints/marketing.py expects these):
  - agent._handle_draft(task: str) -> str
  - agent._last_draft attribute (latest generated draft text)
  - agent._handle_content_ideas(task: str) -> str
"""

import json
import os
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent

EST = ZoneInfo('America/New_York')
MODEL = 'deepseek/deepseek-chat-v3-0324'

BRAND_VOICE = """Harv is an AI personal command center — your "one AI that runs your life."
Voice: casual, confident, tech-forward. First person. No corporate speak.
Mentions @HarvAIbot on Twitter. Targets indie devs, AI enthusiasts, productivity nerds.
Never uses emojis unless the topic is clearly playful. Never uses hashtags as stuffing — max 1-2 relevant tags."""

TWITTER_SYSTEM_PROMPT = f"""You are Harv's marketing agent drafting tweets for @HarvAIbot.

{BRAND_VOICE}

Rules for Twitter drafts:
- Hard cap: 280 characters. Aim for 220-270.
- Punchy first line — hook in the first 10 words.
- Concrete over abstract. Use specific details, numbers, or scenarios.
- Never include "AI-generated" disclaimers. Write as a human founder would.
- No generic openers like "Excited to share" or "We're thrilled". Skip them.
- Output ONLY the tweet text. No quotes, no commentary, no preamble."""

REDDIT_SYSTEM_PROMPT = f"""You are Harv's marketing agent drafting Reddit posts.

{BRAND_VOICE}

Rules for Reddit drafts:
- Reddit rewards genuine, non-promotional content. Lead with value.
- DO NOT write ad copy. Write like a developer sharing what they built.
- Title: concrete and curiosity-driving (under 100 chars, ideally 40-80).
- Body: 150-400 words. Personal, specific, humble. Include real details.
- If the subreddit is technical, include code/workflow/implementation specifics.
- Output strict JSON: {{"title": "...", "body": "..."}} — no markdown fences, no commentary."""

IDEAS_SYSTEM_PROMPT = f"""You are Harv's marketing strategist.

{BRAND_VOICE}

Generate 5 content ideas in a concise bullet list. Each idea: topic + angle + platform (Twitter/Reddit/both).
Focus on: new features, developer workflows, AI automation wins, candid build-in-public moments.
Skip generic "AI is changing the world" ideas. Be specific."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


def _extract_topic(task: str) -> str:
    """Pull the topic from 'draft a tweet about X' etc."""
    t = task.strip()
    for pat in [
        r'(?:draft|write|create|compose|make).*?(?:tweet|post|thread)\s+(?:about|on|for|re)\s+(.+?)(?:\.|$)',
        r'(?:tweet|post)\s+(?:about|on)\s+(.+?)(?:\.|$)',
        r'^(?:topic|subject)[:\s]+(.+?)(?:\.|$)',
    ]:
        m = re.search(pat, t, re.I)
        if m:
            return m.group(1).strip().rstrip('.,!?')
    return t  # Fallback — use whole task as topic


def _extract_subreddit(task: str) -> str:
    """Pull /r/foo or 'in subreddit foo' from task."""
    m = re.search(r'(?:/r/|\br/|subreddit[:\s]+|in\s+r/|to\s+r/)([a-zA-Z0-9_]+)', task, re.I)
    if m:
        return m.group(1)
    return ''


def _detect_intent(task: str) -> str:
    t = task.lower()
    if re.search(r'\breddit\b', t) or '/r/' in task or re.search(r'\br/[a-z]', task, re.I):
        if re.search(r'\b(monitor|search|find|mention|track)\b', t):
            return 'reddit_monitor'
        if re.search(r'\b(post|publish|send|submit)\b', t):
            return 'reddit_post'
        return 'reddit_draft'

    if re.search(r'\b(idea|brainstorm|suggest.*content|what should i post|content calendar)\b', t):
        return 'ideas'
    if re.search(r'\b(post|publish|send|tweet it|send it)\b', t) and re.search(r'\b(tweet|twitter|post)\b', t):
        return 'post'
    if re.search(r'\b(draft|write|compose|create|make).*?(?:tweet|post|thread)\b', t):
        return 'draft'
    return 'draft'


def _get_supabase():
    from supabase import create_client
    from dotenv import load_dotenv
    load_dotenv('/root/harv/.env')
    return create_client(
        os.environ['SUPABASE_URL'],
        os.environ['SUPABASE_SERVICE_ROLE_KEY']
    )


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
class MarketingAgent(BaseAgent):
    """Marketing agent — drafts and publishes to Twitter + Reddit."""

    def __init__(self):
        super().__init__('Marketing', provider='openrouter')
        self._sb = None
        self._last_draft = ''            # Twitter blueprint reads this
        self._last_reddit_draft = None   # dict: {'title', 'body', 'subreddit'}

    @property
    def sb(self):
        if self._sb is None:
            self._sb = _get_supabase()
        return self._sb

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    def run(self, task: str) -> str:
        task = _strip_context_tags(task)
        if not task:
            return 'What should Harv market? Try "draft a tweet about the new Learning agent" or "draft a reddit post for /r/SaaS".'

        intent = _detect_intent(task)
        handlers = {
            'draft':          self._handle_draft,
            'ideas':          self._handle_content_ideas,
            'post':           self._handle_post,
            'reddit_draft':   self._handle_reddit_draft,
            'reddit_post':    self._handle_reddit_post,
            'reddit_monitor': self._handle_reddit_monitor,
        }
        return handlers.get(intent, self._handle_draft)(task)

    # ------------------------------------------------------------------
    # Twitter handlers
    # ------------------------------------------------------------------
    def _handle_draft(self, task: str) -> str:
        """Generate a Twitter draft. Sets self._last_draft for blueprint access."""
        topic = _extract_topic(task)
        messages = [
            {'role': 'system', 'content': TWITTER_SYSTEM_PROMPT},
            {'role': 'user', 'content': f'Draft a tweet about: {topic}'},
        ]
        try:
            draft = self.call_llm(messages, model=MODEL, max_tokens=300, temperature=0.7)
        except Exception as e:
            self._last_draft = ''
            return f'Draft failed: {e}'

        # Clean up — strip surrounding quotes, trim whitespace
        draft = draft.strip().strip('"').strip("'").strip()
        # Hard cap — truncate to 280 if LLM overshoots
        if len(draft) > 280:
            draft = draft[:277].rsplit(' ', 1)[0] + '...'

        self._last_draft = draft
        return f'Draft ({len(draft)}/280):\n\n{draft}'

    def _handle_content_ideas(self, task: str) -> str:
        """Generate 5 content ideas."""
        messages = [
            {'role': 'system', 'content': IDEAS_SYSTEM_PROMPT},
            {'role': 'user', 'content': 'Generate 5 content ideas for this week.'},
        ]
        try:
            return self.call_llm(messages, model=MODEL, max_tokens=600, temperature=0.8)
        except Exception as e:
            return f'Ideas failed: {e}'

    def _handle_post(self, task: str) -> str:
        """Publish the last draft to Twitter."""
        if not self._last_draft:
            return 'No draft ready. Generate one first with "draft a tweet about [topic]".'

        try:
            from lib.twitter_client import post_tweet
            result = post_tweet(self._last_draft)
        except Exception as e:
            return f'Post failed: {e}'

        if result.get('ok'):
            url = result.get('url', '')
            return f'Posted to Twitter. {url}'
        return f'Post failed: {result.get("error", "unknown")}'

    # ------------------------------------------------------------------
    # Reddit handlers
    # ------------------------------------------------------------------
    def _handle_reddit_draft(self, task: str) -> str:
        """Generate a Reddit title+body for a specific subreddit."""
        subreddit = _extract_subreddit(task) or 'SaaS'
        topic = _extract_topic(task)

        # Try to fetch subreddit rules for context
        rules_context = ''
        try:
            from lib.reddit_client import get_subreddit_rules
            rules = get_subreddit_rules(subreddit)
            if rules:
                rules_context = '\n\nSubreddit rules to respect:\n' + '\n'.join(f'- {r}' for r in rules[:8])
        except Exception:
            pass  # Missing PRAW or creds — draft without rule context

        messages = [
            {'role': 'system', 'content': REDDIT_SYSTEM_PROMPT + rules_context},
            {'role': 'user', 'content': f'Subreddit: r/{subreddit}\nTopic: {topic}\n\nDraft a post.'},
        ]
        try:
            raw = self.call_llm(messages, model=MODEL, max_tokens=1200, temperature=0.7)
        except Exception as e:
            self._last_reddit_draft = None
            return f'Reddit draft failed: {e}'

        # Extract JSON
        jm = re.search(r'\{[\s\S]*\}', raw)
        if not jm:
            self._last_reddit_draft = None
            return f'Could not parse draft JSON. Raw output:\n{raw[:400]}'

        try:
            parsed = json.loads(jm.group(0))
        except json.JSONDecodeError as e:
            return f'Draft JSON invalid: {e}\nRaw: {raw[:300]}'

        title = parsed.get('title', '').strip()[:300]
        body = parsed.get('body', '').strip()[:10000]
        if not title or not body:
            return 'Draft missing title or body.'

        self._last_reddit_draft = {'title': title, 'body': body, 'subreddit': subreddit}

        return (
            f'**Reddit draft for r/{subreddit}**\n\n'
            f'**Title:** {title}\n\n'
            f'**Body:**\n{body}\n\n'
            f'_Say "post to reddit" to publish._'
        )

    def _handle_reddit_post(self, task: str) -> str:
        """Publish the last Reddit draft."""
        if not self._last_reddit_draft:
            return 'No Reddit draft ready. Generate one with "draft a reddit post for /r/[subreddit] about [topic]".'

        d = self._last_reddit_draft
        try:
            from lib.reddit_client import post_to_subreddit
            result = post_to_subreddit(d['subreddit'], d['title'], d['body'])
        except ImportError:
            return 'Reddit client not available. Run: pip install praw'
        except Exception as e:
            return f'Reddit post failed: {e}'

        if result.get('ok'):
            url = result.get('url', '')
            return f'Posted to r/{d["subreddit"]}. {url}'
        return f'Reddit post failed: {result.get("error", "unknown")}'

    def _handle_reddit_monitor(self, task: str) -> str:
        """Search Reddit for mentions of a query."""
        query = task
        m = re.search(r'(?:search|monitor|find|mention)(?:\s+for)?\s+(.+?)(?:\s+on\s+reddit|\s+in\s+r/|$)', task, re.I)
        if m:
            query = m.group(1).strip()
        if not query or len(query) < 3:
            query = 'Harv AI'

        subreddit = _extract_subreddit(task) or 'all'

        try:
            from lib.reddit_client import search_subreddit
            results = search_subreddit(subreddit, query, limit=10)
        except ImportError:
            return 'Reddit client not available. Run: pip install praw'
        except Exception as e:
            return f'Reddit search failed: {e}'

        if not results:
            return f'No mentions of "{query}" found in r/{subreddit}.'

        lines = [f'**Recent mentions of "{query}" in r/{subreddit}:**', '']
        for r in results[:10]:
            lines.append(f'- [{r["title"]}]({r["url"]}) — r/{r["subreddit"]} · {r["score"]} points')
        return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Legacy alias — marketing blueprint expects this class name for backward compat
# ---------------------------------------------------------------------------
AutoMarketingAgent = MarketingAgent


# ---------------------------------------------------------------------------
# Router entry point
# ---------------------------------------------------------------------------
def run(raw_input: str, task=None) -> str:
    agent = MarketingAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
