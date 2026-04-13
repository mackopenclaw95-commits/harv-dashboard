"""
travel.py -- Travel agent for Harv.

Agent type : agent
Model      : deepseek/deepseek-chat-v3-0324 via OpenRouter
Provider   : openrouter

Capabilities:
  - PLAN TRIP     — full itinerary with budget, flights, hotels, activities
  - FIND FLIGHTS  — search for flight options and prices
  - FIND HOTELS   — search for hotel options with reviews
  - EXPLORE       — research a destination (things to do, best time, tips)
  - BUDGET        — plan a trip around a specific budget
  - PACKING LIST  — generate a packing list for the trip

Uses DuckDuckGo for real-time search + BeautifulSoup for page scraping.
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

SYSTEM_PROMPT = """You are Harv's Travel agent — a real travel agent who pulls actual data to plan trips. You don't just give generic advice — you search for real flights, hotels, and activities with prices.

When planning a trip:
1. Search for real flight prices and options
2. Search for real hotel prices and reviews
3. Find actual activities and attractions with costs
4. Build a day-by-day itinerary with timing and logistics
5. Calculate total estimated cost

When presenting results:
- Always include specific prices (even if approximate)
- Name actual airlines, hotels, restaurants
- Include ratings/reviews when available
- Consider travel logistics (airport transfers, transit times)
- Mention booking tips (best time to book, flexible dates savings)

Budget planning:
- Break down: flights (X%), hotels (X%), food (X%), activities (X%), misc (X%)
- Suggest money-saving alternatives
- Flag if budget is unrealistic for the destination

Format itineraries clearly:
Day 1: [Date]
- Morning: [Activity] — [Cost]
- Afternoon: [Activity] — [Cost]
- Evening: [Dinner spot] — [Cost estimate]
- Hotel: [Name] — $XX/night

Always give practical, actionable information. You're not a brochure — you're a travel agent who gets things done."""


def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


def _detect_intent(task: str) -> str:
    t = task.lower()
    if re.search(r'plan.*trip|trip.*to|itinerary|plan.*vacation|plan.*travel', t):
        return 'plan_trip'
    if re.search(r'flight|flights|fly|flying|airfare|airline', t):
        return 'find_flights'
    if re.search(r'hotel|hotels|stay|accommodation|airbnb|hostel|resort|where.*stay', t):
        return 'find_hotels'
    if re.search(r'pack|packing|what.*bring|luggage|suitcase', t):
        return 'packing'
    if re.search(r'budget|cheap|afford|cost.*trip|how much.*trip', t):
        return 'budget'
    if re.search(r'things.*do|explore|visit|attraction|restaurant|food.*in|eat.*in|nightlife|what.*do', t):
        return 'explore'
    return 'general'


def _web_search(query: str, max_results: int = 8) -> list:
    """Search the web using DuckDuckGo."""
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
    """Fetch a URL and return clean text content."""
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
    """Run multiple searches and combine results."""
    all_results = []
    seen_urls = set()
    for q in queries:
        for r in _web_search(q, max_results=max_per):
            if r['url'] not in seen_urls:
                seen_urls.add(r['url'])
                all_results.append(r)
    return all_results


class TravelAgent(BaseAgent):
    def __init__(self):
        super().__init__('Travel', provider='openrouter')

    def run(self, task: str) -> str:
        intent = _detect_intent(task)
        handlers = {
            'plan_trip': self._plan_trip,
            'find_flights': self._find_flights,
            'find_hotels': self._find_hotels,
            'explore': self._explore,
            'budget': self._budget_trip,
            'packing': self._packing,
            'general': self._general,
        }
        return handlers.get(intent, self._general)(task)

    def _search_and_synthesize(self, queries: list, prompt: str, task: str) -> str:
        """Search the web, fetch top pages, and synthesize with LLM."""
        self.log(f'Searching: {queries}')
        results = _multi_search(queries, max_per=5)

        if not results:
            # Fallback to LLM knowledge only
            messages = [
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': task},
            ]
            return self.call_llm(messages, model=MODEL, max_tokens=1000)

        # Fetch top 3-4 pages for detailed data
        sources_text = []
        for r in results[:4]:
            page = _fetch_page(r['url'], max_chars=2000)
            if page:
                sources_text.append(f"Source: {r['title']} ({r['url']})\n{page[:1500]}")
            else:
                sources_text.append(f"Source: {r['title']}\n{r['snippet']}")

        # Also include snippets from remaining results
        for r in results[4:]:
            sources_text.append(f"Result: {r['title']} — {r['snippet']}")

        context = '\n\n---\n\n'.join(sources_text)
        if len(context) > 8000:
            context = context[:8000] + '\n[truncated]'

        messages = [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': f'{prompt}\n\nUser request: {task}\n\nSearch results and page data:\n{context}'},
        ]
        return self.call_llm(messages, model=MODEL, max_tokens=1200)

    def _plan_trip(self, task: str) -> str:
        """Plan a full trip with itinerary."""
        # Extract destination
        dest = re.search(r'(?:trip|travel|vacation|go)\s+to\s+(.+?)(?:\s+for|\s+in|\s+on|\s+with|\s+budget|$)', task, re.I)
        destination = dest.group(1).strip() if dest else task

        queries = [
            f'{destination} travel guide best things to do 2026',
            f'{destination} hotels prices reviews',
            f'flights to {destination} prices airlines',
            f'{destination} restaurants food local cuisine',
            f'{destination} itinerary trip plan',
        ]

        prompt = (
            'Plan a complete trip based on the search results. Include:\n'
            '1. Best flights (airlines, approx prices)\n'
            '2. Hotel recommendations (names, prices, ratings)\n'
            '3. Day-by-day itinerary with activities and costs\n'
            '4. Restaurant recommendations\n'
            '5. Total estimated budget breakdown\n'
            '6. Travel tips specific to this destination\n'
            'Use REAL data from the search results. Include specific prices.'
        )
        return self._search_and_synthesize(queries, prompt, task)

    def _find_flights(self, task: str) -> str:
        """Search for flight options."""
        queries = [
            f'{task} flight prices 2026',
            f'{task} cheap flights airlines',
            f'{task} best time to book flights',
        ]
        prompt = (
            'Find flight options based on the search results. Include:\n'
            '- Airlines and approximate prices\n'
            '- Direct vs connecting options\n'
            '- Best booking tips\n'
            '- Alternative airports if cheaper\n'
            'Use REAL data from search results.'
        )
        return self._search_and_synthesize(queries, prompt, task)

    def _find_hotels(self, task: str) -> str:
        """Search for hotel options."""
        queries = [
            f'{task} best hotels reviews prices 2026',
            f'{task} airbnb budget accommodation',
            f'{task} best neighborhoods to stay',
        ]
        prompt = (
            'Find hotel/accommodation options based on search results. Include:\n'
            '- Specific hotel names with prices per night\n'
            '- Ratings and review highlights\n'
            '- Best neighborhoods and why\n'
            '- Budget, mid-range, and luxury options\n'
            'Use REAL data from search results.'
        )
        return self._search_and_synthesize(queries, prompt, task)

    def _explore(self, task: str) -> str:
        """Research a destination."""
        queries = [
            f'{task} best things to do attractions 2026',
            f'{task} best restaurants local food',
            f'{task} hidden gems off beaten path',
            f'{task} travel tips what to know',
        ]
        prompt = (
            'Research this destination based on search results. Include:\n'
            '- Top attractions with costs and tips\n'
            '- Best restaurants (budget and upscale)\n'
            '- Hidden gems most tourists miss\n'
            '- Practical tips (transport, safety, customs)\n'
            '- Best time to visit and weather\n'
            'Use REAL data from search results.'
        )
        return self._search_and_synthesize(queries, prompt, task)

    def _budget_trip(self, task: str) -> str:
        """Plan a trip around a budget."""
        # Extract budget amount
        budget = re.search(r'\$?([\d,]+)', task)
        budget_str = f'${budget.group(1)}' if budget else 'budget'

        queries = [
            f'{task} cheap travel budget tips',
            f'{task} affordable hotels flights',
            f'{task} free things to do budget activities',
        ]
        prompt = (
            f'Plan a trip within {budget_str} budget. Include:\n'
            '- Budget breakdown (flights, hotels, food, activities, transport)\n'
            '- Cheapest flight options\n'
            '- Budget-friendly hotels/hostels\n'
            '- Free and cheap activities\n'
            '- Money-saving tips specific to this destination\n'
            '- Whether this budget is realistic (be honest)\n'
            'Use REAL data from search results.'
        )
        return self._search_and_synthesize(queries, prompt, task)

    def _packing(self, task: str) -> str:
        """Generate a packing list."""
        messages = [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': f'Create a detailed packing list for: {task}\n\nOrganize by category (clothes, toiletries, electronics, documents, etc). Consider weather, activities, and trip length.'},
        ]
        return self.call_llm(messages, model=MODEL, max_tokens=600)

    def _general(self, task: str) -> str:
        """General travel question — search and answer."""
        queries = [f'{task} travel 2026']
        prompt = 'Answer this travel question using the search results. Be specific with real data and prices.'
        return self._search_and_synthesize(queries, prompt, task)


def run(raw_input: str, task=None) -> str:
    agent = TravelAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
