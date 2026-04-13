"""
sports.py -- Sports agent for Harv with live data.

Agent type : agent
Model      : deepseek/deepseek-chat-v3-0324 via OpenRouter
Provider   : openrouter

Capabilities:
  - SCORES      — live scores and game results via web search
  - STANDINGS   — league standings and rankings
  - RECAP       — game recaps and highlights
  - STATS       — player stats and comparisons
  - SCHEDULE    — upcoming games and schedules
  - PREDICTIONS — analysis and predictions
  - FANTASY     — fantasy sports advice
  - FAVORITES   — set/view favorite teams
  - NEWS        — latest sports news

Uses DuckDuckGo for real-time data + DeepSeek for analysis.
Favorite teams stored in Supabase user preferences.
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

SYSTEM_PROMPT = """You are Harv's Sports agent — a passionate, knowledgeable sports analyst who covers all major sports. You pull real-time data from the web to give users live scores, standings, stats, and analysis.

When reporting scores/standings:
- Be specific with exact scores, records, and stats
- Include game time/status (final, in progress, upcoming)
- Mention key performers and highlights
- Note any streaks, milestones, or notable storylines

When giving analysis/predictions:
- Use stats and trends to back up opinions
- Consider matchups, injuries, home/away, rest days
- Acknowledge uncertainty — give percentages when possible
- Be opinionated but fair

When discussing fantasy:
- Give actionable start/sit advice with reasoning
- Consider matchups, weather, usage trends
- Mention waiver wire targets and trade values

Sports covered: NFL, NBA, MLB, NHL, MLS, EPL, La Liga, Champions League, UFC/MMA, F1, Golf, Tennis, College Football, College Basketball, and more.

Tone: Like a smart sports buddy — knowledgeable, passionate, fun. Uses sports vernacular naturally. Gets hyped about big plays but stays analytical.

IMPORTANT: Always cite where you got the data from (ESPN, CBS Sports, etc.) so users know it's real."""


def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


def _web_search(query: str, max_results: int = 8) -> list:
    try:
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    'title': r.get('title', ''),
                    'url': r.get('href', ''),
                    'snippet': r.get('body', ''),
                })
        return results
    except Exception:
        return []


def _fetch_page(url: str, max_chars: int = 3000) -> str:
    try:
        import requests
        from bs4 import BeautifulSoup
        resp = requests.get(url, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; HarvBot/1.0)'
        })
        if resp.status_code != 200:
            return ''
        soup = BeautifulSoup(resp.text, 'html.parser')
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()
        text = soup.get_text(separator=' ', strip=True)
        return text[:max_chars]
    except Exception:
        return ''


def _multi_search(queries: list, max_per: int = 5) -> list:
    all_results = []
    seen_urls = set()
    for q in queries:
        for r in _web_search(q, max_results=max_per):
            if r['url'] not in seen_urls:
                seen_urls.add(r['url'])
                all_results.append(r)
    return all_results


def _detect_intent(task: str) -> str:
    t = task.lower()
    if re.search(r'score|scores|result|results|who won|final score|game.*today|tonight', t):
        return 'scores'
    if re.search(r'standing|rankings|rank|record|conference|division|table|league table', t):
        return 'standings'
    if re.search(r'recap|highlights|summary|what happened|how.*game go', t):
        return 'recap'
    if re.search(r'stats|stat|average|per game|season.*numbers|batting|passing|rushing', t):
        return 'stats'
    if re.search(r'schedule|upcoming|next game|when.*play|fixture|this week', t):
        return 'schedule'
    if re.search(r'predict|prediction|pick|who.*win|odds|over.under|spread|bet', t):
        return 'predictions'
    if re.search(r'fantasy|start.*sit|waiver|roster|lineup|draft', t):
        return 'fantasy'
    if re.search(r'favorite|my team|follow|set.*team|track|unfollow|remove.*team|add.*sport|add.*player|show.*favorite', t):
        return 'favorites'
    if re.search(r'news|latest|trade|signing|injury|update|rumor|breaking', t):
        return 'news'
    return 'general'


def _get_supabase():
    from supabase import create_client
    from dotenv import load_dotenv
    load_dotenv('/root/harv/.env')
    return create_client(
        os.environ['SUPABASE_URL'],
        os.environ['SUPABASE_SERVICE_ROLE_KEY']
    )


class SportsAgent(BaseAgent):
    def __init__(self):
        super().__init__('Sports', provider='openrouter')

    def run(self, task: str) -> str:
        intent = _detect_intent(task)
        handlers = {
            'scores': self._scores,
            'standings': self._standings,
            'recap': self._recap,
            'stats': self._stats,
            'schedule': self._schedule,
            'predictions': self._predictions,
            'fantasy': self._fantasy,
            'favorites': self._favorites,
            'news': self._news,
            'general': self._general,
        }
        return handlers.get(intent, self._general)(task)

    def _search_and_synthesize(self, queries: list, prompt: str, task: str) -> str:
        self.log(f'Searching: {queries}')
        results = _multi_search(queries, max_per=5)

        # Add user's favorite context
        prefs = self._get_preferences()
        pref_context = ''
        if prefs['teams'] or prefs['sports'] or prefs['players']:
            parts = []
            if prefs['teams']:
                parts.append(f"Favorite teams: {', '.join(prefs['teams'])}")
            if prefs['sports']:
                parts.append(f"Favorite sports: {', '.join(prefs['sports'])}")
            if prefs['players']:
                parts.append(f"Favorite players: {', '.join(prefs['players'])}")
            pref_context = '\n\nUser preferences: ' + ' | '.join(parts)

        if not results:
            messages = [
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': task + pref_context},
            ]
            return self.call_llm(messages, model=MODEL, max_tokens=800)

        # Fetch top pages for detailed data
        sources_text = []
        for r in results[:3]:
            page = _fetch_page(r['url'], max_chars=2000)
            if page:
                sources_text.append(f"Source: {r['title']} ({r['url']})\n{page[:1500]}")
            else:
                sources_text.append(f"Source: {r['title']}\n{r['snippet']}")

        for r in results[3:]:
            sources_text.append(f"Result: {r['title']} — {r['snippet']}")

        context = '\n\n---\n\n'.join(sources_text)
        if len(context) > 8000:
            context = context[:8000] + '\n[truncated]'

        messages = [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': f'{prompt}\n\nUser request: {task}{pref_context}\n\nSearch results:\n{context}'},
        ]
        return self.call_llm(messages, model=MODEL, max_tokens=1000)

    def _scores(self, task: str) -> str:
        today = datetime.now(EST).strftime('%B %d %Y')
        queries = [
            f'{task} score today {today}',
            f'{task} final score results {today}',
        ]
        return self._search_and_synthesize(queries,
            'Report the scores/results from the search data. Include exact scores, key performers, and game status (final/in progress/upcoming). Be specific.',
            task)

    def _standings(self, task: str) -> str:
        queries = [
            f'{task} standings 2026',
            f'{task} league table rankings record',
        ]
        return self._search_and_synthesize(queries,
            'Show the current standings/rankings from the search data. Include win-loss records, percentages, and division/conference info. Format as a clean table.',
            task)

    def _recap(self, task: str) -> str:
        queries = [
            f'{task} game recap highlights',
            f'{task} box score summary',
        ]
        return self._search_and_synthesize(queries,
            'Give a detailed game recap from the search data. Include final score, key plays, top performers with stats, and turning points.',
            task)

    def _stats(self, task: str) -> str:
        queries = [
            f'{task} stats 2026 season',
            f'{task} statistics per game averages',
        ]
        return self._search_and_synthesize(queries,
            'Provide detailed stats from the search data. Include specific numbers, rankings, and comparisons where relevant.',
            task)

    def _schedule(self, task: str) -> str:
        today = datetime.now(EST).strftime('%B %d %Y')
        queries = [
            f'{task} schedule upcoming games {today}',
            f'{task} next game time date',
        ]
        return self._search_and_synthesize(queries,
            'Show the upcoming schedule from the search data. Include dates, times (EST), opponents, and any TV broadcast info.',
            task)

    def _predictions(self, task: str) -> str:
        queries = [
            f'{task} prediction odds preview',
            f'{task} expert picks analysis',
        ]
        return self._search_and_synthesize(queries,
            'Give a prediction with analysis from the search data. Include odds, key matchups, injury impacts, and your pick with reasoning. Be opinionated but back it up with data.',
            task)

    def _fantasy(self, task: str) -> str:
        queries = [
            f'{task} fantasy advice start sit 2026',
            f'{task} fantasy rankings projections',
        ]
        return self._search_and_synthesize(queries,
            'Give fantasy sports advice from the search data. Include specific start/sit recommendations with reasoning, matchup analysis, and waiver wire suggestions.',
            task)

    def _get_preferences(self) -> dict:
        """Load sports preferences from Supabase memory_entries."""
        try:
            sb = _get_supabase()
            r = sb.table('memory_entries').select('metadata') \
                .eq('agent_name', 'Sports') \
                .execute()
            prefs = {'teams': [], 'sports': [], 'players': []}
            for entry in (r.data or []):
                meta = entry.get('metadata', {}) or {}
                if meta.get('type') == 'favorite_team':
                    prefs['teams'].append(meta.get('team', ''))
                elif meta.get('type') == 'favorite_sport':
                    prefs['sports'].append(meta.get('sport', ''))
                elif meta.get('type') == 'favorite_player':
                    prefs['players'].append(meta.get('player', ''))
            # Deduplicate
            prefs['teams'] = list(dict.fromkeys(t for t in prefs['teams'] if t))
            prefs['sports'] = list(dict.fromkeys(s for s in prefs['sports'] if s))
            prefs['players'] = list(dict.fromkeys(p for p in prefs['players'] if p))
            return prefs
        except Exception:
            return {'teams': [], 'sports': [], 'players': []}

    def _save_preference(self, pref_type: str, value: str) -> bool:
        """Save a sports preference to Supabase."""
        try:
            sb = _get_supabase()
            # Check if already exists
            existing = sb.table('memory_entries').select('id, metadata') \
                .eq('agent_name', 'Sports').execute()
            for entry in (existing.data or []):
                meta = entry.get('metadata', {}) or {}
                if meta.get('type') == pref_type and meta.get(pref_type.replace('favorite_', '')) == value:
                    return False  # Already saved

            key = pref_type.replace('favorite_', '')
            sb.table('memory_entries').insert({
                'content': f'[Sports Preference] Favorite {key}: {value}',
                'agent_name': 'Sports',
                'metadata': {
                    'type': pref_type,
                    key: value,
                    'set_at': datetime.now(EST).isoformat(),
                },
            }).execute()
            return True
        except Exception:
            return False

    def _remove_preference(self, pref_type: str, value: str) -> bool:
        """Remove a sports preference from Supabase."""
        try:
            sb = _get_supabase()
            key = pref_type.replace('favorite_', '')
            entries = sb.table('memory_entries').select('id, metadata') \
                .eq('agent_name', 'Sports').execute()
            for entry in (entries.data or []):
                meta = entry.get('metadata', {}) or {}
                if meta.get('type') == pref_type and meta.get(key, '').lower() == value.lower():
                    sb.table('memory_entries').delete().eq('id', entry['id']).execute()
                    return True
            return False
        except Exception:
            return False

    def _favorites(self, task: str) -> str:
        t = task.lower()

        # Show current favorites
        if re.search(r'show.*favorite|my favorite|my team|what.*follow|list.*favorite', t):
            prefs = self._get_preferences()
            lines = ['Your Sports Preferences:\n']
            if prefs['teams']:
                lines.append(f"Teams: {', '.join(prefs['teams'])}")
            else:
                lines.append('Teams: None set')
            if prefs['sports']:
                lines.append(f"Sports: {', '.join(prefs['sports'])}")
            else:
                lines.append('Sports: None set')
            if prefs['players']:
                lines.append(f"Players: {', '.join(prefs['players'])}")
            else:
                lines.append('Players: None set')
            lines.append('\nTo add: "follow the Lakers", "add NBA to my sports", "track LeBron James"')
            lines.append('To remove: "unfollow the Lakers", "remove NBA from my sports"')
            return '\n'.join(lines)

        # Remove favorites
        if re.search(r'unfollow|remove|stop.*follow|drop', t):
            # Try to extract what to remove
            name = re.sub(r'(?:unfollow|remove|stop\s+following|drop)\s+(?:the\s+)?', '', t).strip().title()
            removed = False
            for pref_type in ['favorite_team', 'favorite_sport', 'favorite_player']:
                if self._remove_preference(pref_type, name):
                    removed = True
                    break
            if removed:
                return f'Removed **{name}** from your favorites.'
            return f'Could not find "{name}" in your favorites.'

        # Add favorite player
        if re.search(r'track.*player|follow.*player|favorite.*player|add.*player', t):
            player = re.sub(r'(?:track|follow|add|favorite)\s+(?:player\s+)?(?:the\s+)?', '', t).strip().title()
            if self._save_preference('favorite_player', player):
                return f"Now tracking **{player}**! Ask me for their stats, news, or game performance anytime."
            return f'{player} is already in your favorites!'

        # Add favorite sport
        if re.search(r'add.*sport|favorite.*sport|follow.*sport|track.*(?:nfl|nba|mlb|nhl|mls|epl|f1|ufc|mma|golf|tennis|college)', t):
            sport = re.sub(r'(?:add|follow|track|favorite)\s+(?:sport\s+)?(?:the\s+)?', '', t).strip()
            sport = re.sub(r'\s+(?:to\s+)?(?:my\s+)?(?:sport|favorite)s?', '', sport).strip().upper()
            if len(sport) < 2:
                return 'Which sport? Say "add NFL to my sports" or "follow NBA"'
            if self._save_preference('favorite_sport', sport):
                return f"Added **{sport}** to your sports! I'll keep you updated on {sport} news, scores, and standings."
            return f'{sport} is already in your favorites!'

        # Add favorite team (default)
        team_match = re.search(r'(?:favorite|follow|track|set.*team|add.*team)\s+(?:to\s+)?(?:the\s+)?(.+?)(?:\s*$)', t)
        if team_match:
            team = team_match.group(1).strip().title()
            # Clean up common suffixes
            team = re.sub(r'\s+(?:as\s+)?(?:my\s+)?(?:team|favorite)$', '', team).strip()
            if len(team) < 2:
                return 'Which team? Say "follow the Lakers" or "add Panthers to favorites"'
            if self._save_preference('favorite_team', team):
                return (f"Now following the **{team}**!\n\n"
                        f"Try:\n"
                        f"- \"{team} score today\"\n"
                        f"- \"{team} schedule this week\"\n"
                        f"- \"{team} standings\"\n"
                        f"- \"{team} latest news\"")
            return f'The {team} are already in your favorites!'

        return ('Tell me what to follow!\n\n'
                '**Teams:** "follow the Lakers"\n'
                '**Sports:** "add NFL to my sports"\n'
                '**Players:** "track LeBron James"\n'
                '**View:** "show my favorites"')

    def _news(self, task: str) -> str:
        today = datetime.now(EST).strftime('%B %d %Y')
        queries = [
            f'{task} news today {today}',
            f'{task} latest trade signing injury update',
        ]
        return self._search_and_synthesize(queries,
            'Report the latest sports news from the search data. Include specific details, quotes if available, and what it means for the team/league.',
            task)

    def _general(self, task: str) -> str:
        queries = [f'{task} sports 2026']
        return self._search_and_synthesize(queries,
            'Answer this sports question using the search data. Be specific with real data.',
            task)


def run(raw_input: str, task=None) -> str:
    agent = SportsAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
