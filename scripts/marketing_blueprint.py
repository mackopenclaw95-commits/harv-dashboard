"""
blueprints/marketing.py — Marketing dashboard API blueprint.

Routes (all under /api/marketing/):
  GET  /stats         → Twitter stats (followers, tweet count, recent posts)
  POST /draft         → AI-generate a tweet draft
  POST /post          → Post a tweet to Twitter
  GET  /recent-posts  → Recent tweet history
  POST /ideas         → Generate content ideas
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


@marketing_bp.route('/stats', methods=['GET'])
def get_stats():
    """Get Twitter stats summary."""
    try:
        db = _get_social_db()
        snap = db.get_latest_snapshot()
        recent = db.get_recent_posts(days=7)
        metrics = db.get_account_metrics()

        # Daily tweet count
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
    """Get recent tweet history."""
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
    """Generate a tweet draft using the Marketing agent."""
    try:
        data = request.get_json() or {}
        topic = data.get('topic', '')
        if not topic:
            return jsonify({'error': 'topic is required'}), 400

        from agents.auto_marketing import MarketingAgent
        agent = MarketingAgent()
        result = agent._handle_draft(f'draft a tweet about {topic}')

        # Extract just the draft text
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
    """Post a tweet to Twitter."""
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
        else:
            return jsonify({'ok': False, 'error': result.get('error', 'unknown')}), 500
    except Exception as e:
        log.error(f'Post error: {e}')
        return jsonify({'error': str(e)}), 500


@marketing_bp.route('/ideas', methods=['POST'])
def content_ideas():
    """Generate content ideas."""
    try:
        from agents.auto_marketing import MarketingAgent
        agent = MarketingAgent()
        result = agent._handle_content_ideas('suggest content ideas')
        return jsonify({'ideas': result})
    except Exception as e:
        log.error(f'Ideas error: {e}')
        return jsonify({'error': str(e)}), 500
