"""
auto_marketing.py -- Marketing agent for Harv.

Manages Harv's brand social media presence. Admin/owner only.
Capabilities:
  - Draft tweets in Harv's voice (Cars 1 personality)
  - Post tweets via Twitter API
  - Get social media stats and recent posts
  - Content ideas based on recent activity

Model: deepseek/deepseek-chat-v3-0324 via OpenRouter
"""

import json
import os
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent
from lib.harv_lib import now_est

EST = ZoneInfo('America/New_York')

BRAND_VOICE = """You are Harv, an AI assistant with a Cars 1 Lightning McQueen personality — confident, witty, occasionally cocky, but genuinely helpful. You're building yourself into a profitable AI business.

When drafting social media posts:
- First person, casual tone
- No hashtags unless specifically requested
- No emoji overload (1-2 max if any)
- Keep tweets under 280 characters
- Be specific about what you did or learned
- Show personality — you're not a generic AI
- Never mention trading, stocks, or crypto (private)
- Focus on: AI capabilities, features built, user value, tech insights
- End with something memorable or witty when appropriate

You are @HarvAIbot on Twitter. Your goal is to attract users to try Harv as their personal AI assistant."""


def _detect_intent(task: str) -> str:
    t = task.lower()
    if any(kw in t for kw in ['post it', 'send it', 'tweet it', 'publish']):
        return 'post'
    if any(kw in t for kw in ['stats', 'metrics', 'analytics', 'followers', 'how am i doing']):
        return 'stats'
    if any(kw in t for kw in ['recent', 'history', 'last tweet', 'posted']):
        return 'recent_posts'
    if any(kw in t for kw in ['idea', 'suggest', 'what should i post', 'content']):
        return 'content_ideas'
    return 'draft'


def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


class MarketingAgent(BaseAgent):
    """Marketing agent for Harv's brand social media."""

    def __init__(self):
        super().__init__('Marketing', provider='openrouter')
        self._model = 'deepseek/deepseek-chat-v3-0324'
        self._last_draft = None

    def run(self, task: str) -> str:
        intent = _detect_intent(task)
        handlers = {
            'draft': self._handle_draft,
            'post': self._handle_post,
            'stats': self._handle_stats,
            'recent_posts': self._handle_recent_posts,
            'content_ideas': self._handle_content_ideas,
        }
        return handlers.get(intent, self._handle_draft)(task)

    def _handle_draft(self, task: str) -> str:
        """Generate a tweet draft in Harv's voice."""
        topic = _strip_context_tags(task)
        # Remove common prefixes
        for prefix in ['draft a tweet', 'draft tweet', 'write a tweet', 'tweet about', 'draft about', 'post about']:
            if topic.lower().startswith(prefix):
                topic = topic[len(prefix):].strip()

        messages = [
            {'role': 'system', 'content': BRAND_VOICE},
            {'role': 'user', 'content': f'Draft a single tweet about: {topic}\n\nReturn ONLY the tweet text, nothing else. Must be under 280 characters.'},
        ]
        reply = self.call_llm(messages, model=self._model, max_tokens=150)

        # Clean up — strip quotes if wrapped
        reply = reply.strip()
        if reply.startswith('"') and reply.endswith('"'):
            reply = reply[1:-1]
        if reply.startswith("'") and reply.endswith("'"):
            reply = reply[1:-1]

        # Truncate if over 280
        if len(reply) > 280:
            reply = reply[:277] + '...'

        self._last_draft = reply
        return f'Draft ({len(reply)} chars):\n\n{reply}\n\nSay "post it" to publish, or describe changes.'

    def _handle_post(self, task: str) -> str:
        """Post the last draft or provided text to Twitter."""
        text = self._last_draft
        if not text:
            # Try to extract tweet text from the task
            cleaned = _strip_context_tags(task)
            for prefix in ['post it', 'send it', 'tweet it', 'publish']:
                cleaned = cleaned.replace(prefix, '').strip()
            if len(cleaned) > 10:
                text = cleaned
            else:
                return 'No draft to post. Draft a tweet first, then say "post it".'

        try:
            from lib.twitter_client import post_tweet
            result = post_tweet(text)
            if result.get('ok'):
                url = result.get('url', '')
                self._last_draft = None
                return f'Posted to Twitter!\n\nTweet: {text}\nURL: {url}'
            else:
                return f'Failed to post: {result.get("error", "unknown error")}'
        except Exception as e:
            return f'Twitter post failed: {e}'

    def _handle_stats(self, task: str) -> str:
        """Get current social media stats."""
        try:
            from lib.twitter_client import SocialMetricsDB
            db = SocialMetricsDB()
            metrics = db.get_account_metrics()
            snap = db.get_latest_snapshot()
            recent = db.get_recent_posts(days=7)

            lines = ['Twitter Stats:']
            if snap:
                lines.append(f'  Followers: {snap.get("follower_count", "?")}')
            lines.append(f'  Tweets this week: {len(recent)}')
            if metrics:
                lines.append(f'  Total tweets logged: {metrics.get("total_tweets", "?")}')
            return '\n'.join(lines)
        except Exception as e:
            return f'Could not fetch stats: {e}'

    def _handle_recent_posts(self, task: str) -> str:
        """Show recent tweets."""
        try:
            from lib.twitter_client import SocialMetricsDB
            db = SocialMetricsDB()
            posts = db.get_recent_posts(days=14)
            if not posts:
                return 'No recent posts found.'

            lines = [f'Last {min(10, len(posts))} posts:\n']
            for p in posts[:10]:
                ts = p.get('posted_at', '?')[:16]
                content = p.get('content', '')[:80]
                lines.append(f'  {ts} — {content}')
            return '\n'.join(lines)
        except Exception as e:
            return f'Could not fetch posts: {e}'

    def _handle_content_ideas(self, task: str) -> str:
        """Generate content ideas based on what Harv has been doing."""
        # Pull recent journal for context
        context = 'Harv is an AI assistant that helps users with research, scheduling, email, and more.'
        try:
            from supabase import create_client
            from dotenv import load_dotenv
            load_dotenv('/root/harv/.env')
            sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
            entries = sb.table('journal_entries').select('summary, accomplishments').order('date', desc=True).limit(3).execute()
            if entries.data:
                context_parts = []
                for e in entries.data:
                    if e.get('summary'):
                        context_parts.append(e['summary'])
                    for a in (e.get('accomplishments') or []):
                        context_parts.append(a)
                if context_parts:
                    context = 'Recent Harv activity:\n' + '\n'.join(context_parts[:10])
        except Exception:
            pass

        messages = [
            {'role': 'system', 'content': BRAND_VOICE},
            {'role': 'user', 'content': f'Based on this context, suggest 5 tweet ideas that would attract new users to try Harv:\n\n{context}\n\nReturn a numbered list of 5 tweet ideas (just the topic/angle, not full tweets). Focus on showcasing value and capabilities.'},
        ]
        reply = self.call_llm(messages, model=self._model, max_tokens=300)
        return f'Content ideas:\n\n{reply}'


# ---------------------------------------------------------------------------
# Module-level entry point
# ---------------------------------------------------------------------------

def run(raw_input: str, task=None) -> str:
    agent = MarketingAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
