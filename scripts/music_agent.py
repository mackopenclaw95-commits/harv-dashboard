"""
music.py -- Music agent for Harv with Spotify integration.

Agent type : agent
Model      : deepseek/deepseek-chat-v3-0324 via OpenRouter
Provider   : openrouter + spotify

Capabilities:
  - CREATE PLAYLIST  — create a playlist in user's Spotify
  - ADD TRACKS       — add songs to an existing playlist
  - RECOMMEND        — get personalized recommendations
  - TOP TRACKS       — show user's most played songs
  - RECENT           — show recently played tracks
  - SEARCH           — search Spotify for songs/artists/albums
  - CHAT             — general music discussion and advice

Requires: User must connect Spotify via Integrations page first.
Tokens stored in user_integrations table in Supabase.
"""

import json
import os
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent

EST = ZoneInfo('America/New_York')
MODEL = 'deepseek/deepseek-chat-v3-0324'
SPOTIFY_API = 'https://api.spotify.com/v1'

SYSTEM_PROMPT = """You are Harv's Music agent — a passionate music expert with direct access to the user's Spotify account. You can create playlists, add songs, and give personalized recommendations.

When creating playlists:
- Ask for mood, activity, or genre if not specified
- Suggest a creative playlist name
- Add 15-20 tracks that flow well together
- Mix popular and discovery tracks

When recommending music:
- Be specific with song and artist names
- Explain WHY you're recommending something
- Consider the user's listening history when available
- Mix familiar and new artists

Tone: Like a music-obsessed friend. Passionate, knowledgeable, never pretentious. Uses music vernacular naturally.

IMPORTANT: When you need to perform Spotify actions (create playlist, search, etc.), include a JSON action block in your response:
[SPOTIFY_ACTION]{"action":"create_playlist","name":"Chill Vibes","description":"Perfect for studying","tracks":["song name - artist","song name - artist"]}[/SPOTIFY_ACTION]

Available actions:
- create_playlist: name, description, tracks (list of "song - artist" strings)
- search: query (search term)
- top_tracks: (no params needed)
- recent: (no params needed)"""


def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


def _get_supabase():
    from supabase import create_client
    from dotenv import load_dotenv
    load_dotenv('/root/harv/.env')
    return create_client(
        os.environ['SUPABASE_URL'],
        os.environ['SUPABASE_SERVICE_ROLE_KEY']
    )


def _detect_intent(task: str) -> str:
    t = task.lower()
    if re.search(r'create.*playlist|make.*playlist|new playlist|build.*playlist|playlist.*for', t):
        return 'create_playlist'
    if re.search(r'add.*to.*playlist|put.*on.*playlist', t):
        return 'add_tracks'
    if re.search(r'recommend|suggest|similar to|like.*artist|discovery|discover', t):
        return 'recommend'
    if re.search(r'top.*track|most.*played|most.*listened|my top', t):
        return 'top_tracks'
    if re.search(r'recent|lately|last.*played|just.*listened|history', t):
        return 'recent'
    if re.search(r'search|find.*song|find.*artist|look.*up', t):
        return 'search'
    return 'chat'


class SpotifyClient:
    """Handles Spotify API calls with token refresh."""

    def __init__(self, user_id: str = None):
        self.user_id = user_id
        self._token = None
        self._spotify_user_id = None

    def _get_tokens(self) -> dict | None:
        """Get Spotify tokens from user_integrations table.
        Schema: id, user_id, provider, external_id, status, metadata
        Tokens stored in metadata JSON: access_token, refresh_token, token_expires_at
        """
        try:
            sb = _get_supabase()
            query = sb.table('user_integrations').select('*').eq('provider', 'spotify').eq('status', 'active')
            if self.user_id:
                query = query.eq('user_id', self.user_id)
            result = query.limit(1).execute()
            if result.data:
                return result.data[0]
            return None
        except Exception:
            return None

    def _refresh_token(self, integration: dict) -> str | None:
        """Refresh an expired Spotify token."""
        from dotenv import load_dotenv
        load_dotenv('/root/harv/.env')

        meta = integration.get('metadata', {}) or {}
        refresh_token = meta.get('refresh_token', '')
        if not refresh_token:
            return None

        client_id = os.environ.get('SPOTIFY_CLIENT_ID', '')
        client_secret = os.environ.get('SPOTIFY_CLIENT_SECRET', '')

        try:
            import base64
            auth = base64.b64encode(f'{client_id}:{client_secret}'.encode()).decode()
            resp = requests.post('https://accounts.spotify.com/api/token', data={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
            }, headers={
                'Authorization': f'Basic {auth}',
                'Content-Type': 'application/x-www-form-urlencoded',
            }, timeout=10)

            if resp.status_code == 200:
                data = resp.json()
                new_token = data['access_token']
                # Update tokens in metadata
                meta['access_token'] = new_token
                meta['token_expires_at'] = datetime.utcnow().isoformat()
                sb = _get_supabase()
                sb.table('user_integrations').update({
                    'metadata': meta,
                }).eq('id', integration['id']).execute()
                return new_token
        except Exception:
            pass
        return None

    def get_token(self) -> str | None:
        """Get a valid access token, refreshing if needed."""
        if self._token:
            return self._token

        integration = self._get_tokens()
        if not integration:
            return None

        meta = integration.get('metadata', {}) or {}
        self._spotify_user_id = integration.get('external_id', '')

        # Check if expired
        expires = meta.get('token_expires_at', '')
        if expires:
            try:
                exp_dt = datetime.fromisoformat(expires.replace('Z', '+00:00'))
                if exp_dt.timestamp() < datetime.utcnow().timestamp():
                    token = self._refresh_token(integration)
                    if token:
                        self._token = token
                        return token
            except Exception:
                pass

        self._token = meta.get('access_token', '')
        return self._token

    def _headers(self) -> dict:
        return {'Authorization': f'Bearer {self.get_token()}'}

    def search_tracks(self, query: str, limit: int = 10) -> list:
        """Search Spotify for tracks."""
        resp = requests.get(f'{SPOTIFY_API}/search', params={
            'q': query, 'type': 'track', 'limit': limit,
        }, headers=self._headers(), timeout=10)
        if resp.status_code != 200:
            return []
        tracks = resp.json().get('tracks', {}).get('items', [])
        return [{'name': t['name'], 'artist': t['artists'][0]['name'],
                 'uri': t['uri'], 'album': t['album']['name']}
                for t in tracks]

    def create_playlist(self, name: str, description: str = '',
                        track_queries: list = None) -> dict:
        """Create a playlist and optionally add tracks."""
        # Create playlist — use /me/playlists (dev mode compatible)
        resp = requests.post(f'{SPOTIFY_API}/me/playlists',
            json={'name': name, 'description': description, 'public': False},
            headers={**self._headers(), 'Content-Type': 'application/json'},
            timeout=10)

        if resp.status_code not in (200, 201):
            return {'ok': False, 'error': f'Failed to create playlist: {resp.text[:200]}'}

        playlist = resp.json()
        playlist_id = playlist['id']
        playlist_url = playlist['external_urls'].get('spotify', '')

        # Add tracks if provided
        added = 0
        if track_queries:
            uris = []
            for q in track_queries:
                results = self.search_tracks(q, limit=1)
                if results:
                    uris.append(results[0]['uri'])

            if uris:
                # Add in batches of 100
                for i in range(0, len(uris), 100):
                    batch = uris[i:i+100]
                    requests.post(f'{SPOTIFY_API}/playlists/{playlist_id}/items',
                        json={'uris': batch},
                        headers={**self._headers(), 'Content-Type': 'application/json'},
                        timeout=10)
                added = len(uris)

        return {
            'ok': True,
            'playlist_id': playlist_id,
            'url': playlist_url,
            'name': name,
            'tracks_added': added,
        }

    def get_top_tracks(self, limit: int = 20, time_range: str = 'medium_term') -> list:
        """Get user's top tracks."""
        resp = requests.get(f'{SPOTIFY_API}/me/top/tracks', params={
            'limit': limit, 'time_range': time_range,
        }, headers=self._headers(), timeout=10)
        if resp.status_code != 200:
            return []
        return [{'name': t['name'], 'artist': t['artists'][0]['name'],
                 'album': t['album']['name']}
                for t in resp.json().get('items', [])]

    def get_recent_tracks(self, limit: int = 20) -> list:
        """Get recently played tracks."""
        resp = requests.get(f'{SPOTIFY_API}/me/player/recently-played',
            params={'limit': limit},
            headers=self._headers(), timeout=10)
        if resp.status_code != 200:
            return []
        return [{'name': t['track']['name'],
                 'artist': t['track']['artists'][0]['name'],
                 'played_at': t['played_at'][:16]}
                for t in resp.json().get('items', [])]

    def get_recommendations(self, seed_tracks: list = None,
                            seed_artists: list = None, limit: int = 20) -> list:
        """Get Spotify recommendations."""
        params = {'limit': limit}
        if seed_tracks:
            params['seed_tracks'] = ','.join(seed_tracks[:5])
        if seed_artists:
            params['seed_artists'] = ','.join(seed_artists[:5])

        resp = requests.get(f'{SPOTIFY_API}/recommendations',
            params=params, headers=self._headers(), timeout=10)
        if resp.status_code != 200:
            return []
        return [{'name': t['name'], 'artist': t['artists'][0]['name'],
                 'uri': t['uri']}
                for t in resp.json().get('tracks', [])]


class MusicAgent(BaseAgent):
    """Music agent with Spotify integration."""

    def __init__(self):
        super().__init__('Music', provider='openrouter')
        self._spotify = None

    def _get_spotify(self, user_id: str = None) -> SpotifyClient:
        if self._spotify is None:
            self._spotify = SpotifyClient(user_id)
        return self._spotify

    def run(self, task: str) -> str:
        # Extract user_id from context tags if present
        user_id = None
        uid_match = re.search(r'\[USER\].*?user_id[:\s]+([a-f0-9-]+)', task)
        if uid_match:
            user_id = uid_match.group(1)

        intent = _detect_intent(task)
        spotify = self._get_spotify(user_id)

        # Check if Spotify is connected for actions that need it
        needs_spotify = intent in ('create_playlist', 'add_tracks', 'top_tracks', 'recent', 'search')
        if needs_spotify and not spotify.get_token():
            return ('Spotify is not connected. Go to Integrations in the dashboard '
                    'and click "Connect Spotify" to link your account. '
                    'Then come back and I can create playlists, show your top tracks, and more.')

        handlers = {
            'create_playlist': self._create_playlist,
            'add_tracks': self._add_tracks,
            'recommend': self._recommend,
            'top_tracks': self._top_tracks,
            'recent': self._recent,
            'search': self._search,
            'chat': self._chat,
        }
        handler = handlers.get(intent, self._chat)
        return handler(task, spotify)

    def _create_playlist(self, task: str, spotify: SpotifyClient) -> str:
        """Use LLM to pick songs, then create playlist in Spotify."""
        # Get user's top tracks for context
        top = spotify.get_top_tracks(limit=10)
        context = ''
        if top:
            context = '\nUser\'s top tracks: ' + ', '.join(
                f'{t["name"]} by {t["artist"]}' for t in top[:10]
            )

        messages = [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': (
                f'{task}{context}\n\n'
                'Create a playlist. Return a JSON action block:\n'
                '[SPOTIFY_ACTION]{"action":"create_playlist","name":"Playlist Name",'
                '"description":"Short description",'
                '"tracks":["Song Name - Artist Name","Song Name - Artist Name"]}[/SPOTIFY_ACTION]\n'
                'Include 15-20 tracks. Use real song names and artists.'
            )},
        ]
        reply = self.call_llm(messages, model=MODEL, max_tokens=800)

        # Extract action from response
        action_match = re.search(r'\[SPOTIFY_ACTION\](.*?)\[/SPOTIFY_ACTION\]', reply, re.S)
        if not action_match:
            return reply  # LLM didn't include action, just return the text

        try:
            action = json.loads(action_match.group(1))
        except json.JSONDecodeError:
            return reply

        # Execute playlist creation
        result = spotify.create_playlist(
            name=action.get('name', 'Harv Playlist'),
            description=action.get('description', 'Created by Harv Music Agent'),
            track_queries=action.get('tracks', []),
        )

        if result.get('ok'):
            # Clean the LLM response by removing the action block
            clean_reply = re.sub(r'\[SPOTIFY_ACTION\].*?\[/SPOTIFY_ACTION\]', '', reply, flags=re.S).strip()
            return (f'{clean_reply}\n\n'
                    f'Playlist created: **{result["name"]}**\n'
                    f'{result["tracks_added"]} tracks added\n'
                    f'Open in Spotify: {result["url"]}')
        else:
            return f'Failed to create playlist: {result.get("error", "unknown")}'

    def _add_tracks(self, task: str, spotify: SpotifyClient) -> str:
        return self._chat(task, spotify)  # TODO: implement add to existing playlist

    def _recommend(self, task: str, spotify: SpotifyClient) -> str:
        """Get recommendations based on listening history + LLM."""
        # Try to get user context
        context = ''
        token = spotify.get_token()
        if token:
            top = spotify.get_top_tracks(limit=10)
            if top:
                context = '\nUser\'s top tracks: ' + ', '.join(
                    f'{t["name"]} by {t["artist"]}' for t in top
                )
            recent = spotify.get_recent_tracks(limit=5)
            if recent:
                context += '\nRecently played: ' + ', '.join(
                    f'{t["name"]} by {t["artist"]}' for t in recent
                )

        messages = [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': f'{task}{context}'},
        ]
        return self.call_llm(messages, model=MODEL, max_tokens=600)

    def _top_tracks(self, task: str, spotify: SpotifyClient) -> str:
        """Show user's top tracks."""
        tracks = spotify.get_top_tracks(limit=20)
        if not tracks:
            return 'Could not fetch your top tracks. Make sure Spotify is connected.'

        lines = ['Your Top 20 Tracks:\n']
        for i, t in enumerate(tracks, 1):
            lines.append(f'  {i}. {t["name"]} — {t["artist"]} ({t["album"]})')
        return '\n'.join(lines)

    def _recent(self, task: str, spotify: SpotifyClient) -> str:
        """Show recently played tracks."""
        tracks = spotify.get_recent_tracks(limit=20)
        if not tracks:
            return 'Could not fetch recent tracks. Make sure Spotify is connected.'

        lines = ['Recently Played:\n']
        for t in tracks:
            lines.append(f'  {t["played_at"]} — {t["name"]} by {t["artist"]}')
        return '\n'.join(lines)

    def _search(self, task: str, spotify: SpotifyClient) -> str:
        """Search Spotify."""
        query = re.sub(r'^(?:search|find|look up)\s+(?:for\s+)?', '', task, flags=re.I).strip()
        results = spotify.search_tracks(query, limit=10)
        if not results:
            return f'No results found for "{query}"'

        lines = [f'Search results for "{query}":\n']
        for i, t in enumerate(results, 1):
            lines.append(f'  {i}. {t["name"]} — {t["artist"]} ({t["album"]})')
        return '\n'.join(lines)

    def _chat(self, task: str, spotify: SpotifyClient) -> str:
        """General music chat."""
        # Include listening context if available
        context = ''
        if spotify.get_token():
            top = spotify.get_top_tracks(limit=5)
            if top:
                context = '\nUser listens to: ' + ', '.join(
                    f'{t["artist"]}' for t in top
                )

        messages = [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': f'{task}{context}'},
        ]
        return self.call_llm(messages, model=MODEL, max_tokens=500)


def run(raw_input: str, task=None) -> str:
    agent = MusicAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
