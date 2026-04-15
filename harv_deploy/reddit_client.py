"""
reddit_client.py — Reddit integration for Harv marketing agent.

PUBLIC-ONLY MODE: uses Reddit's unauthenticated .json endpoints for
reading (subreddit info, rules, search) and generates submit URLs for
posting. No API key / OAuth needed — avoids Reddit's manual approval
gate.

Posts are not sent programmatically. The agent returns a pre-filled
Reddit submit URL (title + body encoded in query params) that the user
opens in a browser and clicks through Reddit's own submit form.

Exports:
  build_submit_url(subreddit, title, body) -> str
  get_subreddit_info(subreddit) -> dict
  get_subreddit_rules(subreddit) -> list[str]
  search_subreddit(subreddit, query, limit=10) -> list[dict]
  post_to_subreddit(subreddit, title, body, ...) -> dict
    (returns {'ok': True, 'submit_url': str} — does NOT post programmatically)
  verify_credentials() -> dict  (always returns ok in public mode)
  get_recent_posts(...) -> list[dict]  (from local log of drafts we've built)
"""

import json
import logging
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

log = logging.getLogger('reddit_client')

POSTS_DB_PATH = '/root/harv/data/reddit_posts.json'
EST = ZoneInfo('America/New_York')

USER_AGENT = 'HarvMarketing/1.0 (by /u/Old-Recording3853)'
REDDIT_BASE = 'https://www.reddit.com'


# ---------------------------------------------------------------------------
# HTTP helper — Reddit public JSON endpoints
# ---------------------------------------------------------------------------
def _reddit_get_json(path: str, params: dict = None) -> dict:
    """GET a Reddit .json endpoint. Raises on HTTP error."""
    if params:
        path = f'{path}?{urllib.parse.urlencode(params)}'
    url = f'{REDDIT_BASE}{path}'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))


# ---------------------------------------------------------------------------
# Submit URL builder — one-click Reddit posting from browser
# ---------------------------------------------------------------------------
def build_submit_url(subreddit: str, title: str, body: str) -> str:
    """Build a prefilled Reddit submit URL. User clicks through to post."""
    sub = subreddit.strip().lstrip('r/').lstrip('/')
    params = urllib.parse.urlencode({
        'title': title[:300],
        'text':  body[:40000],
        'type':  'text',
    })
    return f'{REDDIT_BASE}/r/{sub}/submit?{params}'


# ---------------------------------------------------------------------------
# Local post log — drafts we've built (we don't have API access to list
# past posts, so we log what we send the user to submit)
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
        json.dump(posts[-500:], f, indent=2)


def _log_draft(subreddit: str, title: str, body: str, submit_url: str) -> None:
    posts = _load_posts_db()
    posts.append({
        'subreddit': subreddit,
        'title': title,
        'body': body[:1000],
        'submit_url': submit_url,
        'created_at': datetime.now(EST).isoformat(),
        'mode': 'public-submit-url',
    })
    _save_posts_db(posts)


# ---------------------------------------------------------------------------
# Posting (public mode: builds URL, does not send)
# ---------------------------------------------------------------------------
def post_to_subreddit(subreddit: str, title: str, body: str, flair_id: str = None) -> dict:
    """
    PUBLIC MODE: does not actually post. Returns a submit URL the user
    opens in a browser to complete posting through Reddit's own UI.
    """
    try:
        sub = subreddit.strip().lstrip('r/').lstrip('/')
        if not sub or not title or not body:
            return {'ok': False, 'error': 'subreddit, title, and body are required'}
        submit_url = build_submit_url(sub, title, body)
        _log_draft(sub, title, body, submit_url)
        return {
            'ok': True,
            'mode': 'public-submit-url',
            'submit_url': submit_url,
            'url': submit_url,     # compat with blueprint expecting 'url'
            'subreddit': sub,
        }
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def comment_on_post(post_id: str, text: str) -> dict:
    """Commenting is not supported in public mode — requires auth."""
    return {
        'ok': False,
        'error': 'Comment posting requires authenticated Reddit access. Not supported in public mode.',
    }


# ---------------------------------------------------------------------------
# Reading / search — public JSON endpoints, no auth
# ---------------------------------------------------------------------------
def search_subreddit(subreddit: str, query: str, limit: int = 10, sort: str = 'new') -> list:
    """Search Reddit (public). Use 'all' for site-wide search."""
    sub = (subreddit or 'all').strip().lstrip('r/').lstrip('/')
    try:
        if sub == 'all':
            data = _reddit_get_json('/search.json', {
                'q': query, 'sort': sort, 't': 'month', 'limit': limit,
            })
        else:
            data = _reddit_get_json(f'/r/{sub}/search.json', {
                'q': query, 'restrict_sr': 'true', 'sort': sort, 't': 'month', 'limit': limit,
            })
    except Exception as e:
        log.error(f'search failed: {e}')
        return [{'error': str(e)}]

    results = []
    for child in data.get('data', {}).get('children', []):
        p = child.get('data', {})
        permalink = p.get('permalink', '')
        results.append({
            'title':        p.get('title', ''),
            'url':          f'{REDDIT_BASE}{permalink}' if permalink else p.get('url', ''),
            'subreddit':    p.get('subreddit', ''),
            'author':       p.get('author', '[deleted]'),
            'score':        p.get('score', 0),
            'num_comments': p.get('num_comments', 0),
            'created_utc':  p.get('created_utc', 0),
            'selftext':     (p.get('selftext') or '')[:500],
        })
    return results


def get_subreddit_rules(subreddit: str) -> list:
    """Get subreddit rules as a list of 'short: description' strings."""
    sub = subreddit.strip().lstrip('r/').lstrip('/')
    try:
        data = _reddit_get_json(f'/r/{sub}/about/rules.json')
    except Exception as e:
        log.error(f'rules failed: {e}')
        return []

    rules = []
    for r in data.get('rules', []):
        short = r.get('short_name', '') or ''
        desc = r.get('description', '') or ''
        line = f'{short}: {desc}'.strip(': ').strip()
        if line:
            rules.append(line)
    return rules


def get_subreddit_info(subreddit: str) -> dict:
    """Get subreddit info (subscribers, description, rules)."""
    sub = subreddit.strip().lstrip('r/').lstrip('/')
    try:
        about = _reddit_get_json(f'/r/{sub}/about.json').get('data', {})
    except Exception as e:
        return {'ok': False, 'error': str(e)}

    return {
        'ok': True,
        'name':            about.get('display_name', sub),
        'title':           about.get('title', ''),
        'subscribers':     about.get('subscribers', 0),
        'description':     (about.get('public_description') or about.get('description') or '')[:500],
        'rules':           get_subreddit_rules(sub),
        'over_18':         about.get('over18', False),
        'submission_type': about.get('submission_type', 'any'),
    }


def get_recent_posts(author: str = None, limit: int = 10) -> list:
    """Recent drafts we've built (local log)."""
    posts = _load_posts_db()
    return posts[-limit:][::-1]


def verify_credentials() -> dict:
    """Public mode — no credentials to verify. Always ok."""
    return {
        'ok': True,
        'mode': 'public',
        'note': 'Using Reddit public JSON API. Posts are completed via browser submit URLs — no API key required.',
    }
