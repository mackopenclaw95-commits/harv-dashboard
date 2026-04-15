#!/usr/bin/env python3
"""
marketing_queue_drainer.py — Drain scheduled posts from marketing_queue.

Looks for rows with status='scheduled' and scheduled_for <= now, publishes
them via twitter_client / reddit_client, and updates the row to
'posted' or 'failed'.

Run every 5 minutes via cron:
    */5 * * * * /usr/bin/python3 /root/harv/scripts/marketing_queue_drainer.py >> /root/harv/logs/marketing_queue.log 2>&1

Drafts (status='draft') are NOT touched — those require manual approval
via the dashboard.
"""

import logging
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from dotenv import load_dotenv
load_dotenv('/root/harv/.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
log = logging.getLogger('marketing_queue_drainer')

EST = ZoneInfo('America/New_York')


def _get_sb():
    from supabase import create_client
    return create_client(
        os.environ['SUPABASE_URL'],
        os.environ['SUPABASE_SERVICE_ROLE_KEY'],
    )


def _publish(item: dict) -> dict:
    """Publish a single queue item. Returns {'ok': bool, 'url': str, 'error': str}."""
    platform = item.get('platform')
    if platform == 'twitter':
        from lib.twitter_client import post_tweet
        return post_tweet(item.get('content', ''))
    if platform == 'reddit':
        from lib.reddit_client import post_to_subreddit
        return post_to_subreddit(
            item.get('subreddit', ''),
            item.get('title', ''),
            item.get('content', ''),
        )
    return {'ok': False, 'error': f'unknown platform: {platform}'}


def main() -> int:
    sb = _get_sb()
    now_iso = datetime.now(EST).isoformat()

    # Scheduled items whose time has arrived
    try:
        res = sb.table('marketing_queue') \
            .select('*') \
            .eq('status', 'scheduled') \
            .lte('scheduled_for', now_iso) \
            .limit(20) \
            .execute()
    except Exception as e:
        log.error(f'Query failed: {e}')
        return 1

    items = res.data or []
    if not items:
        log.info('no scheduled items due')
        return 0

    log.info(f'Draining {len(items)} scheduled item(s)')
    for item in items:
        try:
            result = _publish(item)
        except Exception as e:
            result = {'ok': False, 'error': str(e)}

        ok = bool(result.get('ok'))
        update = {
            'status': 'posted' if ok else 'failed',
            'posted_at': now_iso if ok else None,
            'post_url': result.get('url', ''),
            'error': None if ok else str(result.get('error', ''))[:500],
        }
        try:
            sb.table('marketing_queue').update(update).eq('id', item['id']).execute()
            log.info(f'{item["platform"]} {item["id"][:8]} -> {update["status"]}')
        except Exception as e:
            log.error(f'Update failed for {item["id"]}: {e}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
