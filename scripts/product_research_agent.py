"""
product_research.py -- Product Research agent for Harv.

Agent type : agent (Research sub-agent, admin/owner only)
Model      : deepseek/deepseek-chat-v3-0324 via OpenRouter
Provider   : openrouter

Capabilities:
  - COMPARE    — side-by-side product comparisons
  - REVIEW     — aggregate reviews and ratings
  - FIND       — find best products in a category
  - PRICE      — price tracking and best deals
  - RECOMMEND  — purchase recommendations based on needs/budget

Uses DuckDuckGo for real-time product data + DeepSeek for analysis.
"""

import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent

EST = ZoneInfo('America/New_York')
MODEL = 'deepseek/deepseek-chat-v3-0324'

SYSTEM_PROMPT = """You are Harv's Product Research agent — an expert consumer researcher who finds the best products, compares options, and gives honest purchase recommendations.

When comparing products:
- Create clear side-by-side comparisons with specs, pros, cons
- Include real prices from search results
- Give a clear verdict with reasoning
- Consider value for money, not just features

When recommending:
- Ask about budget and use case if not clear
- Give 3 tiers: budget, mid-range, premium
- Include specific model names and current prices
- Mention where to buy for best price
- Flag any common issues or complaints from reviews

When reviewing:
- Aggregate ratings from multiple sources
- Highlight what reviewers love and hate
- Mention durability and long-term reliability
- Compare to alternatives at similar price points

Tone: Like a trusted friend who does insane research before buying anything. Data-driven, practical, no brand loyalty."""


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
        return soup.get_text(separator=' ', strip=True)[:max_chars]
    except Exception:
        return ''


def _multi_search(queries: list, max_per: int = 5) -> list:
    all_results = []
    seen = set()
    for q in queries:
        for r in _web_search(q, max_results=max_per):
            if r['url'] not in seen:
                seen.add(r['url'])
                all_results.append(r)
    return all_results


class ProductResearchAgent(BaseAgent):
    def __init__(self):
        super().__init__('Product Research', provider='openrouter')

    def run(self, task: str) -> str:
        t = task.lower()
        if re.search(r'compare|vs|versus|difference between', t):
            queries = [f'{task} comparison review 2026', f'{task} vs specs price']
            prompt = 'Compare these products from the search data. Include specs, pros/cons, prices, and a clear verdict.'
        elif re.search(r'review|rating|worth it|any good', t):
            queries = [f'{task} review 2026', f'{task} ratings pros cons']
            prompt = 'Aggregate reviews from the search data. Include ratings, what people love/hate, and whether it is worth buying.'
        elif re.search(r'best|top|recommend|which.*should|what.*buy', t):
            queries = [f'{task} best 2026 review', f'{task} top rated recommendation']
            prompt = 'Recommend the best options from the search data. Give budget, mid-range, and premium picks with prices and reasoning.'
        elif re.search(r'price|deal|cheap|discount|where.*buy|cost', t):
            queries = [f'{task} price deal 2026', f'{task} best price where to buy']
            prompt = 'Find the best prices and deals from the search data. Include specific retailers and current prices.'
        else:
            queries = [f'{task} product research 2026']
            prompt = 'Research this product using the search data. Be specific with prices, specs, and recommendations.'

        return self._search_and_synthesize(queries, prompt, task)

    def _search_and_synthesize(self, queries, prompt, task):
        results = _multi_search(queries, max_per=5)
        if not results:
            return self.call_llm([
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': task},
            ], model=MODEL, max_tokens=800)

        sources = []
        for r in results[:3]:
            page = _fetch_page(r['url'], max_chars=2000)
            sources.append(f"Source: {r['title']}\n{page[:1500]}" if page else f"Source: {r['title']}\n{r['snippet']}")
        for r in results[3:]:
            sources.append(f"Result: {r['title']} — {r['snippet']}")

        context = '\n\n---\n\n'.join(sources)
        if len(context) > 8000:
            context = context[:8000]

        return self.call_llm([
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': f'{prompt}\n\nUser request: {task}\n\nSearch results:\n{context}'},
        ], model=MODEL, max_tokens=1000)


def run(raw_input: str, task=None) -> str:
    agent = ProductResearchAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
