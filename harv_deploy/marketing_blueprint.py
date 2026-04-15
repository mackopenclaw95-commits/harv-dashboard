"""
blueprints/marketing.py — Marketing dashboard API blueprint.

Routes (all under /api/marketing/):

Twitter:
  GET  /stats              → Twitter stats (followers, tweet count, recent posts)
  POST /draft              → AI-generate a tweet draft
  POST /post               → Post a tweet to Twitter
  GET  /recent-posts       → Recent tweet history
  POST /ideas              → Generate content ideas

Reddit:
  GET  /reddit/verify      → Check Reddit credentials are valid
  GET  /reddit/subreddit   → Get subreddit info (rules, subscribers)
  POST /reddit/draft       → AI-generate a Reddit post for a subreddit
  POST /reddit/post        → Publish a Reddit post
  POST /reddit/monitor     → Search Reddit for mentions
  GET  /reddit/recent      → Recent Reddit posts (from local log)

Queue (shared):
  GET  /queue              → List scheduled drafts
  POST /queue/add          → Enqueue a draft
  POST /queue/approve      → Approve + send now (or schedule)
  POST /queue/reject       → Discard a queued draft
"""

import json
import logging
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, request

sys.path.insert(0, '/root/harv')

log = logging.getLogger('Marketing')
marketing_bp = Blueprint('marketing', __name__)
EST = ZoneInfo('America/New_York')


def _get_social_db():
    from lib.twitter_client import SocialMetricsDB
    return SocialMetricsDB()


def _get_supabase():
    from supabase import create_client
    from dotenv import load_dotenv
    load_dotenv('/root/harv/.env')
    return create_client(
        os.environ['SUPABASE_URL'],
        os.environ['SUPABASE_SERVICE_ROLE_KEY'],
    )


# ===========================================================================
# Twitter routes
# ===========================================================================

@marketing_bp.route('/stats', methods=['GET'])
def get_stats():
    try:
        db = _get_social_db()
        snap = db.get_latest_snapshot()
        recent = db.get_recent_posts(days=7)
        metrics = db.get_account_metrics()

        from lib.twitter_client import get_daily_tweet_count
        today_count = get_daily_tweet_count()

        return jsonify({
            'followers': snap.get('follower_count', 0) if snap else 0,
            'tweets_today': today_count,
            'tweets_this_week': len(recent),
            'total_tweets': metrics.get('total_tweets', 0) if metrics else 0,
        })
    except Exception as e:
        log.error(f'Stats error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/recent-posts', methods=['GET'])
def get_recent_posts():
    try:
        days = request.args.get('days', 14, type=int)
        limit = request.args.get('limit', 20, type=int)
        db = _get_social_db()
        posts = db.get_recent_posts(days=days)

        result = []
        for p in posts[:limit]:
            result.append({
                'content': p.get('content', ''),
                'posted_at': p.get('posted_at', ''),
                'char_count': len(p.get('content', '')),
            })

        return jsonify({'posts': result})
    except Exception as e:
        log.error(f'Recent posts error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/draft', methods=['POST'])
def draft_tweet():
    try:
        data = request.get_json() or {}
        topic = data.get('topic', '')
        if not topic:
            return jsonify({'error': 'topic is required'}), 400

        from agents.auto_marketing import MarketingAgent
        agent = MarketingAgent()
        result = agent._handle_draft(f'draft a tweet about {topic}')
        draft = agent._last_draft or ''

        return jsonify({
            'draft': draft,
            'char_count': len(draft),
            'full_response': result,
        })
    except Exception as e:
        log.error(f'Draft error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/post', methods=['POST'])
def post_tweet():
    try:
        data = request.get_json() or {}
        text = data.get('text', '')
        if not text:
            return jsonify({'error': 'text is required'}), 400
        if len(text) > 280:
            return jsonify({'error': f'Tweet too long ({len(text)} chars, max 280)'}), 400

        from lib.twitter_client import post_tweet as tw_post
        result = tw_post(text)

        if result.get('ok'):
            return jsonify({
                'ok': True,
                'url': result.get('url', ''),
                'tweet_id': result.get('tweet_id', ''),
            })
        return jsonify({'ok': False, 'error': result.get('error', 'unknown')}), 500
    except Exception as e:
        log.error(f'Post error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/ideas', methods=['POST'])
def content_ideas():
    try:
        from agents.auto_marketing import MarketingAgent
        agent = MarketingAgent()
        result = agent._handle_content_ideas('suggest content ideas')
        return jsonify({'ideas': result})
    except Exception as e:
        log.error(f'Ideas error: {e}')
        return jsonify({'error': str(e)}), 500


# ===========================================================================
# Reddit routes
# ===========================================================================

@marketing_bp.route('/reddit/verify', methods=['GET'])
def reddit_verify():
    """Check Reddit credentials."""
    try:
        from lib.reddit_client import verify_credentials
        result = verify_credentials()
        return jsonify(result)
    except ImportError as e:
        return jsonify({'ok': False, 'error': f'Reddit client not available: {e}'}), 500
    except Exception as e:
        log.error(f'Reddit verify error: {e}')
        return jsonify({'ok': False, 'error': str(e)}), 500


@marketing_bp.route('/reddit/subreddit', methods=['GET'])
def reddit_subreddit_info():
    """Get info about a subreddit (rules, subscribers, description)."""
    name = request.args.get('name', '').strip().lstrip('r/').lstrip('/')
    if not name:
        return jsonify({'ok': False, 'error': 'name is required'}), 400
    try:
        from lib.reddit_client import get_subreddit_info
        return jsonify(get_subreddit_info(name))
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@marketing_bp.route('/reddit/draft', methods=['POST'])
def reddit_draft():
    """Generate a Reddit post draft (title + body) for a subreddit.

    Clients may pass a `rules` array (fetched client-side from Reddit's
    public JSON) so the LLM can respect them. VPS cannot fetch rules
    directly because Reddit rate-limits datacenter IPs.
    """
    try:
        data = request.get_json() or {}
        topic = (data.get('topic') or '').strip()
        subreddit = (data.get('subreddit') or 'SaaS').strip().lstrip('r/').lstrip('/')
        rules = data.get('rules') or []
        if not topic:
            return jsonify({'error': 'topic is required'}), 400

        from agents.auto_marketing import MarketingAgent
        agent = MarketingAgent()
        result = agent._handle_reddit_draft(
            f'draft a reddit post for /r/{subreddit} about {topic}',
            rules=rules if isinstance(rules, list) else [],
        )

        d = agent._last_reddit_draft or {}
        return jsonify({
            'draft': d,
            'full_response': result,
        })
    except Exception as e:
        log.error(f'Reddit draft error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/reddit/post', methods=['POST'])
def reddit_post():
    """Build a Reddit submit URL (public mode — user clicks through to post)."""
    try:
        data = request.get_json() or {}
        subreddit = (data.get('subreddit') or '').strip().lstrip('r/').lstrip('/')
        title = (data.get('title') or '').strip()
        body = (data.get('body') or '').strip()

        if not subreddit or not title or not body:
            return jsonify({'error': 'subreddit, title, and body are required'}), 400

        from lib.reddit_client import post_to_subreddit
        result = post_to_subreddit(subreddit, title, body)
        # result contains {'ok': True, 'submit_url': '...', 'mode': 'public-submit-url'}
        return jsonify(result), 200 if result.get('ok') else 500
    except Exception as e:
        log.error(f'Reddit post error: {e}')
        return jsonify({'ok': False, 'error': str(e)}), 500


@marketing_bp.route('/reddit/monitor', methods=['POST'])
def reddit_monitor():
    """Search Reddit for mentions."""
    try:
        data = request.get_json() or {}
        query = (data.get('query') or 'Harv AI').strip()
        subreddit = (data.get('subreddit') or 'all').strip().lstrip('r/').lstrip('/')
        limit = int(data.get('limit', 10))

        from lib.reddit_client import search_subreddit
        results = search_subreddit(subreddit, query, limit=limit)
        return jsonify({'results': results, 'query': query, 'subreddit': subreddit})
    except ImportError as e:
        return jsonify({'error': f'Reddit client not available: {e}'}), 500
    except Exception as e:
        log.error(f'Reddit monitor error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/reddit/recent', methods=['GET'])
def reddit_recent():
    """Get recent Reddit posts we've made (from local log)."""
    try:
        from lib.reddit_client import get_recent_posts
        limit = request.args.get('limit', 20, type=int)
        posts = get_recent_posts(limit=limit)
        return jsonify({'posts': posts})
    except ImportError as e:
        return jsonify({'error': f'Reddit client not available: {e}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ===========================================================================
# Queue routes (shared Twitter + Reddit scheduling)
# ===========================================================================

@marketing_bp.route('/queue', methods=['GET'])
def queue_list():
    """List queued drafts."""
    try:
        sb = _get_supabase()
        status_filter = request.args.get('status', '')
        q = sb.table('marketing_queue').select('*').order('scheduled_for', desc=False).limit(100)
        if status_filter:
            q = q.eq('status', status_filter)
        res = q.execute()
        return jsonify({'items': res.data or []})
    except Exception as e:
        log.error(f'Queue list error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/queue/add', methods=['POST'])
def queue_add():
    """Add a draft to the queue."""
    try:
        data = request.get_json() or {}
        platform = (data.get('platform') or '').lower()  # 'twitter' | 'reddit'
        if platform not in ('twitter', 'reddit'):
            return jsonify({'error': 'platform must be twitter or reddit'}), 400

        row = {
            'platform': platform,
            'status': 'draft',
            'scheduled_for': data.get('scheduled_for'),  # nullable — null = manual approve
            'content': data.get('content', ''),
            'title': data.get('title', ''),
            'subreddit': data.get('subreddit', ''),
        }

        sb = _get_supabase()
        res = sb.table('marketing_queue').insert(row).execute()
        return jsonify({'ok': True, 'item': res.data[0] if res.data else None})
    except Exception as e:
        log.error(f'Queue add error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/queue/approve', methods=['POST'])
def queue_approve():
    """Approve a queued draft — publishes immediately."""
    try:
        data = request.get_json() or {}
        item_id = data.get('id')
        if not item_id:
            return jsonify({'error': 'id is required'}), 400

        sb = _get_supabase()
        row = sb.table('marketing_queue').select('*').eq('id', item_id).limit(1).execute()
        if not row.data:
            return jsonify({'error': 'not found'}), 404
        item = row.data[0]

        if item['platform'] == 'twitter':
            from lib.twitter_client import post_tweet as tw_post
            result = tw_post(item['content'])
            ok = result.get('ok', False)
            url = result.get('url', '')
            # Twitter posts programmatically — mark as 'posted' on success
            new_status = 'posted' if ok else 'failed'
            posted_at_val = datetime.now(EST).isoformat() if ok else None
        elif item['platform'] == 'reddit':
            # Public mode: we can only return a submit URL — the user
            # completes the post in their browser. Mark as 'pending_submit'
            # to signal the dashboard to open the URL in a new tab.
            from lib.reddit_client import build_submit_url
            url = build_submit_url(item['subreddit'], item['title'], item['content'])
            ok = True
            result = {'ok': True, 'submit_url': url, 'mode': 'public-submit-url'}
            new_status = 'submit_url_ready'
            posted_at_val = None
        else:
            return jsonify({'error': 'unknown platform'}), 400

        sb.table('marketing_queue').update({
            'status': new_status,
            'posted_at': posted_at_val,
            'post_url': url,
            'error': None if ok else result.get('error', ''),
        }).eq('id', item_id).execute()

        return jsonify({'ok': ok, 'result': result})
    except Exception as e:
        log.error(f'Queue approve error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/queue/reject', methods=['POST'])
def queue_reject():
    """Reject / discard a queued draft."""
    try:
        data = request.get_json() or {}
        item_id = data.get('id')
        if not item_id:
            return jsonify({'error': 'id is required'}), 400

        sb = _get_supabase()
        sb.table('marketing_queue').update({'status': 'rejected'}).eq('id', item_id).execute()
        return jsonify({'ok': True})
    except Exception as e:
        log.error(f'Queue reject error: {e}')
        return jsonify({'error': str(e)}), 500
