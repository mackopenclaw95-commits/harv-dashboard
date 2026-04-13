"""
market_research.py -- Market Research agent for Harv.

Agent type : agent (Research sub-agent, admin/owner only)
Model      : deepseek/deepseek-chat-v3-0324 via OpenRouter
Provider   : openrouter

Capabilities:
  - COMPETITOR  — competitor analysis and comparisons
  - TRENDS      — industry trends and market direction
  - SIZING      — market size estimates and TAM/SAM/SOM
  - AUDIENCE    — target audience and demographics research
  - LANDSCAPE   — industry landscape and key players

Uses DuckDuckGo for real-time market data + DeepSeek for analysis.
"""

import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent

EST = ZoneInfo('America/New_York')
MODEL = 'deepseek/deepseek-chat-v3-0324'

SYSTEM_PROMPT = """You are Harv's Market Research agent — a sharp business analyst who researches markets, competitors, and industry trends.

When analyzing competitors:
- List key players with their strengths, weaknesses, pricing
- Identify gaps and opportunities
- Compare features, market share, and positioning
- Note recent moves (funding, launches, pivots)

When reporting trends:
- Use specific data points and growth rates
- Cite sources from search results
- Distinguish hype from real traction
- Identify what's driving the trend

When sizing markets:
- Use top-down and bottom-up approaches
- Provide TAM, SAM, SOM when possible
- Include growth projections with CAGR
- Note key assumptions

When analyzing audiences:
- Define demographic and psychographic profiles
- Identify pain points and buying behavior
- Suggest acquisition channels
- Reference real data from search results

Tone: Like a consultant delivering a boardroom briefing — data-driven, structured, actionable. No fluff."""


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


class MarketResearchAgent(BaseAgent):
    def __init__(self):
        super().__init__('Market Research', provider='openrouter')

    def run(self, task: str) -> str:
        t = task.lower()
        if re.search(r'competitor|competition|who.*competing|rival|alternative', t):
            queries = [f'{task} competitors analysis 2026', f'{task} competitive landscape market share']
            prompt = 'Analyze the competitive landscape from search data. List key competitors with strengths, weaknesses, pricing, and market positioning.'
        elif re.search(r'trend|trending|direction|future|growth|emerging', t):
            queries = [f'{task} trends 2026', f'{task} market growth forecast']
            prompt = 'Report on market trends from search data. Include growth rates, drivers, and projections with specific data points.'
        elif re.search(r'market size|tam|sam|som|how big|revenue|valuation', t):
            queries = [f'{task} market size 2026', f'{task} TAM revenue forecast CAGR']
            prompt = 'Estimate market size from search data. Provide TAM/SAM/SOM if possible, growth rates, and key assumptions.'
        elif re.search(r'audience|demographic|customer|user|who.*buy|target', t):
            queries = [f'{task} target audience demographics 2026', f'{task} customer profile buyer persona']
            prompt = 'Research the target audience from search data. Define demographics, psychographics, pain points, and acquisition channels.'
        else:
            queries = [f'{task} market research analysis 2026', f'{task} industry overview']
            prompt = 'Research this market/industry using search data. Provide a structured analysis with data points and actionable insights.'

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
    agent = MarketResearchAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
