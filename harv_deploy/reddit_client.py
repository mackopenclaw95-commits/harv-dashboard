"""
reddit_client.py — Reddit API client for Harv marketing agent.

Uses PRAW (script app OAuth). Credentials at /root/harv/credentials/reddit_keys.json:
  {
    "client_id": "...",
    "client_secret": "...",
    "username": "...",
    "password": "...",
    "user_agent": "Harv Marketing by u/<username> v1.0"
  }

Exports:
  post_to_subreddit(subreddit, title, body, flair_id=None) -> dict
  comment_on_post(post_id, text) -> dict
  search_subreddit(subreddit, query, limit=10) -> list[dict]
  get_subreddit_rules(subreddit) -> list[str]
  get_subreddit_info(subreddit) -> dict
  get_recent_posts(author=None, limit=10) -> list[dict]
  verify_credentials() -> dict
"""

import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

try:
    import praw
    from prawcore.exceptions import PrawcoreException
    _PRAW_OK = True
except ImportError:
    praw = None
    PrawcoreException = Exception
    _PRAW_OK = False

KEYS_PATH = '/root/harv/credentials/reddit_keys.json'
POSTS_DB_PATH = '/root/harv/data/reddit_posts.json'
EST = ZoneInfo('America/New_York')


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------
_reddit_client = None


def _load_keys() -> dict:
    if not os.path.exists(KEYS_PATH):
        raise FileNotFoundError(
            f'Reddit credentials not found at {KEYS_PATH}. '
            'Create one with client_id, client_secret, username, password.'
        )
    with open(KEYS_PATH) as f:
        return json.load(f)


def _get_reddit() -> 'praw.Reddit':
    if not _PRAW_OK:
        raise ImportError('praw is not installed. Run: pip install praw')
    global _reddit_client
    if _reddit_client is None:
        keys = _load_keys()
        _reddit_client = praw.Reddit(
            client_id=keys['client_id'],
            client_secret=keys['client_secret'],
            username=keys['username'],
            password=keys['password'],
            user_agent=keys.get('user_agent', f'Harv Marketing by u/{keys["username"]} v1.0'),
        )
    return _reddit_client


def verify_credentials() -> dict:
    """Check that we can authenticate and return the logged-in username."""
    try:
        r = _get_reddit()
        me = r.user.me()
        return {
            'ok': True,
            'username': str(me),
            'karma': {
                'comment': getattr(me, 'comment_karma', 0),
                'link': getattr(me, 'link_karma', 0),
            },
        }
    except Exception as e:
        return {'ok': False, 'error': str(e)}


# ---------------------------------------------------------------------------
# Post history (local JSON log — we don't trust the Reddit API to stay fast)
# ---------------------------------------------------------------------------
def _load_posts_db() -> list:
    if not os.path.exists(POSTS_DB_PATH):
        return []
    try:
        with open(POSTS_DB_PATH) as f:
            return json.load(f)
    except Exception:
        return []


def _save_posts_db(posts: list) -> None:
    os.makedirs(os.path.dirname(POSTS_DB_PATH), exist_ok=True)
    with open(POSTS_DB_PATH, 'w') as f:
        json.dump(posts[-500:], f, indent=2)  # Keep last 500


def _log_post(subreddit: str, title: str, body: str, url: str, post_id: str) -> None:
    posts = _load_posts_db()
    posts.append({
        'subreddit': subreddit,
        'title': title,
        'body': body[:1000],
        'url': url,
        'post_id': post_id,
        'posted_at': datetime.now(EST).isoformat(),
    })
    _save_posts_db(posts)


# ---------------------------------------------------------------------------
# Posting
# ---------------------------------------------------------------------------
def post_to_subreddit(subreddit: str, title: str, body: str, flair_id: str = None) -> dict:
    """Submit a self-post (text) to the given subreddit."""
    try:
        r = _get_reddit()
        sub = r.subreddit(subreddit)
        submission = sub.submit(
            title=title[:300],
            selftext=body[:40000],
            flair_id=flair_id,
            send_replies=True,
        )
        url = f'https://reddit.com{submission.permalink}'
        _log_post(subreddit, title, body, url, submission.id)
        return {
            'ok': True,
            'post_id': submission.id,
            'url': url,
            'subreddit': subreddit,
        }
    except PrawcoreException as e:
        return {'ok': False, 'error': f'Reddit API error: {e}'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def comment_on_post(post_id: str, text: str) -> dict:
    """Reply to an existing Reddit post."""
    try:
        r = _get_reddit()
        submission = r.submission(id=post_id)
        comment = submission.reply(text[:10000])
        return {
            'ok': True,
            'comment_id': comment.id,
            'url': f'https://reddit.com{comment.permalink}',
        }
    except Exception as e:
        return {'ok': False, 'error': str(e)}


# ---------------------------------------------------------------------------
# Reading / search
# ---------------------------------------------------------------------------
def search_subreddit(subreddit: str, query: str, limit: int = 10, sort: str = 'new') -> list:
    """Search a subreddit for recent posts matching query. Use 'all' for site-wide."""
    try:
        r = _get_reddit()
        sub = r.subreddit(subreddit)
        results = []
        for post in sub.search(query, sort=sort, time_filter='month', limit=limit):
            results.append({
                'title': post.title,
                'url': f'https://reddit.com{post.permalink}',
                'subreddit': str(post.subreddit),
                'author': str(post.author) if post.author else '[deleted]',
                'score': post.score,
                'num_comments': post.num_comments,
                'created_utc': post.created_utc,
                'selftext': (post.selftext or '')[:500],
            })
        return results
    except Exception as e:
        return [{'error': str(e)}]


def get_subreddit_rules(subreddit: str) -> list:
    """Return a list of rule descriptions for the subreddit."""
    try:
        r = _get_reddit()
        sub = r.subreddit(subreddit)
        rules = []
        for rule in sub.rules:
            short = getattr(rule, 'short_name', '') or ''
            desc = getattr(rule, 'description', '') or ''
            rules.append(f'{short}: {desc}'.strip(': '))
        return rules
    except Exception:
        return []


def get_subreddit_info(subreddit: str) -> dict:
    """Return subscriber count, description, rules, posting reqs."""
    try:
        r = _get_reddit()
        sub = r.subreddit(subreddit)
        return {
            'ok': True,
            'name': sub.display_name,
            'title': sub.title,
            'subscribers': sub.subscribers,
            'description': (sub.public_description or '')[:500],
            'rules': get_subreddit_rules(subreddit),
            'over_18': sub.over18,
            'allow_text_posts': True,  # PRAW doesn't expose this directly
        }
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def get_recent_posts(author: str = None, limit: int = 10) -> list:
    """Return our recent posts (from local log, not Reddit API — faster)."""
    posts = _load_posts_db()
    if author:
        return [p for p in posts if p.get('author') == author][-limit:][::-1]
    return posts[-limit:][::-1]
