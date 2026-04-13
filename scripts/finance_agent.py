"""
finance.py -- Personal Finance agent for Harv.

Agent type : agent
Model      : deepseek/deepseek-chat-v3-0324 via OpenRouter
Provider   : openrouter

Capabilities:
  - LOG transactions (income/expense with auto-categorization)
  - VIEW transaction history (filtered by date, category, type)
  - SET/CHECK budgets by category
  - SPENDING ANALYSIS (AI-powered insights)
  - FINANCIAL ADVICE (budgeting tips, savings strategies)
  - SUMMARY (monthly/weekly spending overview)

Storage: Supabase (finance_transactions, finance_budgets tables)
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, '/root/harv')

from agents.base_agent import BaseAgent
from lib.harv_lib import now_est

EST = ZoneInfo('America/New_York')
MODEL = 'deepseek/deepseek-chat-v3-0324'

# Category mapping for auto-categorization
CATEGORIES = {
    'food': ['grocery', 'restaurant', 'food', 'dining', 'lunch', 'dinner', 'breakfast', 'coffee', 'uber eats', 'doordash', 'grubhub', 'chipotle', 'mcdonalds', 'starbucks', 'pizza'],
    'transport': ['gas', 'uber', 'lyft', 'parking', 'toll', 'car', 'insurance', 'maintenance', 'oil change', 'tire', 'fuel'],
    'housing': ['rent', 'mortgage', 'electric', 'water', 'internet', 'cable', 'utility', 'hoa', 'property tax'],
    'entertainment': ['netflix', 'spotify', 'hulu', 'movie', 'concert', 'game', 'subscription', 'disney', 'hbo', 'youtube premium'],
    'shopping': ['amazon', 'walmart', 'target', 'clothes', 'shoes', 'electronics', 'online', 'ebay'],
    'health': ['doctor', 'pharmacy', 'medicine', 'gym', 'dental', 'vision', 'insurance', 'hospital', 'copay'],
    'education': ['tuition', 'book', 'course', 'udemy', 'class', 'training', 'student loan'],
    'savings': ['savings', 'investment', '401k', 'ira', 'roth', 'deposit', 'transfer to savings'],
    'income': ['salary', 'paycheck', 'freelance', 'bonus', 'dividend', 'refund', 'reimbursement', 'side hustle', 'interest'],
    'personal': ['haircut', 'barber', 'laundry', 'dry clean', 'pet', 'gift', 'donation'],
}

FINANCE_SYSTEM_PROMPT = """You are Harv's Finance agent — a personal financial advisor, accountant, and money manager. You help users track spending, create budgets, analyze financial habits, and give practical money advice.

Personality: Direct, practical, encouraging. Use specific numbers and percentages. Don't sugarcoat but don't be harsh either. Think Ramit Sethi meets a friendly accountant.

When analyzing spending:
- Calculate percentages of income
- Compare to recommended budgets (50/30/20 rule: 50% needs, 30% wants, 20% savings)
- Flag concerning patterns
- Suggest specific actionable changes

When giving advice:
- Be specific (not "save more" but "cut streaming from $45/mo to $15/mo by dropping Hulu and HBO")
- Reference their actual spending data when available
- Prioritize high-impact, easy wins first"""


def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


def _auto_categorize(description: str) -> str:
    """Auto-categorize a transaction based on description keywords."""
    desc_lower = description.lower()
    for category, keywords in CATEGORIES.items():
        for kw in keywords:
            if kw in desc_lower:
                return category
    return 'uncategorized'


def _parse_amount(text: str) -> float | None:
    """Extract dollar amount from text."""
    m = re.search(r'\$?([\d,]+\.?\d*)', text)
    if m:
        return float(m.group(1).replace(',', ''))
    return None


def _detect_intent(task: str) -> str:
    t = task.lower()
    if re.search(r'log|spent|paid|bought|earned|received|made.*\$|income.*\$|\$.*on\b', t):
        return 'log'
    if re.search(r'view|show|list|history|transactions|recent', t):
        return 'view'
    if re.search(r'set.*budget|budget.*set|create.*budget|new.*budget', t):
        return 'set_budget'
    if re.search(r'check.*budget|budget.*check|budget.*status|how.*budget|budget', t):
        return 'check_budget'
    if re.search(r'summary|overview|report|monthly|weekly|how much.*spent|total.*spent', t):
        return 'summary'
    if re.search(r'analy|insight|pattern|trend|where.*money|spending.*habit', t):
        return 'analysis'
    if re.search(r'advice|tip|suggest|recommend|save|how.*save|should i|help.*money', t):
        return 'advice'
    return 'chat'


def _get_supabase():
    from supabase import create_client
    from dotenv import load_dotenv
    load_dotenv('/root/harv/.env')
    return create_client(
        os.environ['SUPABASE_URL'],
        os.environ['SUPABASE_SERVICE_ROLE_KEY']
    )


class FinanceAgent(BaseAgent):
    """Personal finance agent with Supabase-backed tracking."""

    def __init__(self):
        super().__init__('Finance', provider='openrouter')
        self._sb = None

    @property
    def sb(self):
        if self._sb is None:
            self._sb = _get_supabase()
        return self._sb

    def run(self, task: str) -> str:
        intent = _detect_intent(task)
        handlers = {
            'log': self._handle_log,
            'view': self._handle_view,
            'set_budget': self._handle_set_budget,
            'check_budget': self._handle_check_budget,
            'summary': self._handle_summary,
            'analysis': self._handle_analysis,
            'advice': self._handle_advice,
            'chat': self._handle_chat,
        }
        return handlers.get(intent, self._handle_chat)(task)

    def _handle_log(self, task: str) -> str:
        """Log a transaction."""
        amount = _parse_amount(task)
        if not amount:
            return 'Could not find an amount. Try: "spent $45 on groceries" or "earned $2000 salary"'

        t = task.lower()
        # Determine type
        if any(kw in t for kw in ['earned', 'received', 'income', 'salary', 'paycheck', 'made', 'got paid', 'refund']):
            tx_type = 'income'
        else:
            tx_type = 'expense'

        # Extract description
        desc = _strip_context_tags(task)
        # Remove amount from description
        desc = re.sub(r'\$[\d,.]+', '', desc).strip()
        for prefix in ['spent', 'paid', 'bought', 'earned', 'received', 'log', 'logged', 'income', 'expense']:
            desc = re.sub(rf'^{prefix}\s+', '', desc, flags=re.I).strip()
        desc = re.sub(r'^(on|for|at)\s+', '', desc).strip()
        if not desc:
            desc = 'Transaction'

        category = _auto_categorize(desc)

        # Parse date if mentioned
        date = datetime.now(EST).strftime('%Y-%m-%d')
        if 'yesterday' in t:
            date = (datetime.now(EST) - timedelta(days=1)).strftime('%Y-%m-%d')

        try:
            self.sb.table('finance_transactions').insert({
                'date': date,
                'type': tx_type,
                'category': category,
                'description': desc,
                'amount': float(amount),
                'source': 'manual',
            }).execute()

            emoji = '+' if tx_type == 'income' else '-'
            return (f'Logged: {emoji}${amount:.2f} — {desc}\n'
                    f'Category: {category}\n'
                    f'Type: {tx_type}\n'
                    f'Date: {date}')
        except Exception as e:
            self.log(f'Log failed: {e}', level='ERROR')
            return f'Failed to log transaction: {e}'

    def _handle_view(self, task: str) -> str:
        """View transaction history."""
        t = task.lower()
        try:
            query = self.sb.table('finance_transactions').select('*').order('date', desc=True)

            # Filter by type
            if 'income' in t:
                query = query.eq('type', 'income')
            elif 'expense' in t:
                query = query.eq('type', 'expense')

            # Filter by category
            for cat in CATEGORIES:
                if cat in t:
                    query = query.eq('category', cat)
                    break

            # Limit
            query = query.limit(15)
            result = query.execute()

            if not result.data:
                return 'No transactions found. Log one with "spent $45 on groceries".'

            lines = ['Recent transactions:\n']
            total_income = 0
            total_expense = 0
            for tx in result.data:
                sign = '+' if tx['type'] == 'income' else '-'
                lines.append(f'  {tx["date"]} | {sign}${tx["amount"]:.2f} | {tx["category"]} | {tx["description"][:40]}')
                if tx['type'] == 'income':
                    total_income += float(tx['amount'])
                else:
                    total_expense += float(tx['amount'])

            lines.append(f'\nIncome: +${total_income:.2f} | Expenses: -${total_expense:.2f} | Net: ${total_income - total_expense:.2f}')
            return '\n'.join(lines)
        except Exception as e:
            return f'Failed to fetch transactions: {e}'

    def _handle_set_budget(self, task: str) -> str:
        """Set a budget for a category."""
        amount = _parse_amount(task)
        if not amount:
            return 'Specify an amount: "set food budget to $500/month"'

        # Find category
        category = 'uncategorized'
        for cat in CATEGORIES:
            if cat in task.lower():
                category = cat
                break

        if category == 'uncategorized':
            # Try to extract from text
            m = re.search(r'(?:budget|set)\s+(?:for\s+)?(\w+)', task, re.I)
            if m:
                category = m.group(1).lower()

        try:
            # Upsert
            existing = self.sb.table('finance_budgets').select('id').eq('category', category).execute()
            if existing.data:
                self.sb.table('finance_budgets').update({
                    'monthly_limit': float(amount),
                    'updated_at': datetime.now(EST).isoformat(),
                }).eq('category', category).execute()
            else:
                self.sb.table('finance_budgets').insert({
                    'category': category,
                    'monthly_limit': float(amount),
                }).execute()

            return f'Budget set: {category} — ${amount:.2f}/month'
        except Exception as e:
            return f'Failed to set budget: {e}'

    def _handle_check_budget(self, task: str) -> str:
        """Check budget status."""
        try:
            budgets = self.sb.table('finance_budgets').select('*').execute()
            if not budgets.data:
                return 'No budgets set yet. Try: "set food budget to $500/month"'

            # Get this month's spending by category
            month_start = datetime.now(EST).replace(day=1).strftime('%Y-%m-%d')
            txns = self.sb.table('finance_transactions').select('category, amount') \
                .eq('type', 'expense') \
                .gte('date', month_start).execute()

            spent_by_cat = {}
            for tx in (txns.data or []):
                cat = tx['category']
                spent_by_cat[cat] = spent_by_cat.get(cat, 0) + float(tx['amount'])

            lines = ['Budget Status (this month):\n']
            for b in budgets.data:
                cat = b['category']
                limit = float(b['monthly_limit'])
                spent = spent_by_cat.get(cat, 0)
                pct = (spent / limit * 100) if limit > 0 else 0
                bar = '|' + '#' * min(20, int(pct / 5)) + '-' * max(0, 20 - int(pct / 5)) + '|'
                status = 'OVER' if pct > 100 else 'OK'
                lines.append(f'  {cat}: ${spent:.2f} / ${limit:.2f} ({pct:.0f}%) {bar} {status}')

            return '\n'.join(lines)
        except Exception as e:
            return f'Failed to check budgets: {e}'

    def _handle_summary(self, task: str) -> str:
        """Monthly/weekly spending summary."""
        try:
            t = task.lower()
            if 'week' in t:
                start = (datetime.now(EST) - timedelta(days=7)).strftime('%Y-%m-%d')
                period = 'This Week'
            else:
                start = datetime.now(EST).replace(day=1).strftime('%Y-%m-%d')
                period = 'This Month'

            txns = self.sb.table('finance_transactions').select('*') \
                .gte('date', start).order('date', desc=True).execute()

            if not txns.data:
                return f'No transactions for {period.lower()}.'

            income = sum(float(t['amount']) for t in txns.data if t['type'] == 'income')
            expenses = sum(float(t['amount']) for t in txns.data if t['type'] == 'expense')

            # By category
            by_cat = {}
            for tx in txns.data:
                if tx['type'] == 'expense':
                    cat = tx['category']
                    by_cat[cat] = by_cat.get(cat, 0) + float(tx['amount'])

            lines = [f'{period} Summary:\n']
            lines.append(f'  Income:   +${income:.2f}')
            lines.append(f'  Expenses: -${expenses:.2f}')
            lines.append(f'  Net:       ${income - expenses:.2f}')

            if by_cat:
                lines.append(f'\nSpending by Category:')
                for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
                    pct = (amt / expenses * 100) if expenses > 0 else 0
                    lines.append(f'  {cat}: ${amt:.2f} ({pct:.0f}%)')

            lines.append(f'\n{len(txns.data)} transaction(s) recorded')
            return '\n'.join(lines)
        except Exception as e:
            return f'Failed to generate summary: {e}'

    def _handle_analysis(self, task: str) -> str:
        """AI-powered spending analysis."""
        try:
            # Get last 30 days of data
            start = (datetime.now(EST) - timedelta(days=30)).strftime('%Y-%m-%d')
            txns = self.sb.table('finance_transactions').select('*') \
                .gte('date', start).order('date').execute()

            if not txns.data or len(txns.data) < 3:
                return 'Need more transaction data for analysis. Log at least a few transactions first.'

            # Build context
            income = sum(float(t['amount']) for t in txns.data if t['type'] == 'income')
            expenses = sum(float(t['amount']) for t in txns.data if t['type'] == 'expense')
            by_cat = {}
            for tx in txns.data:
                if tx['type'] == 'expense':
                    cat = tx['category']
                    by_cat[cat] = by_cat.get(cat, 0) + float(tx['amount'])

            context = f'Last 30 days: Income ${income:.2f}, Expenses ${expenses:.2f}\n'
            context += 'By category:\n'
            for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1]):
                context += f'  {cat}: ${amt:.2f}\n'

            messages = [
                {'role': 'system', 'content': FINANCE_SYSTEM_PROMPT},
                {'role': 'user', 'content': f'Analyze my spending patterns and give me insights:\n\n{context}'},
            ]
            return self.call_llm(messages, model=MODEL, max_tokens=500)
        except Exception as e:
            return f'Analysis failed: {e}'

    def _handle_advice(self, task: str) -> str:
        """Financial advice based on user's question and data."""
        # Try to include spending context if available
        context = ''
        try:
            start = (datetime.now(EST) - timedelta(days=30)).strftime('%Y-%m-%d')
            txns = self.sb.table('finance_transactions').select('type, category, amount') \
                .gte('date', start).execute()
            if txns.data:
                income = sum(float(t['amount']) for t in txns.data if t['type'] == 'income')
                expenses = sum(float(t['amount']) for t in txns.data if t['type'] == 'expense')
                context = f'\n\nUser financial context: Income ${income:.2f}/mo, Expenses ${expenses:.2f}/mo'
        except Exception:
            pass

        messages = [
            {'role': 'system', 'content': FINANCE_SYSTEM_PROMPT},
            {'role': 'user', 'content': f'{task}{context}'},
        ]
        return self.call_llm(messages, model=MODEL, max_tokens=500)

    def _handle_chat(self, task: str) -> str:
        """General financial chat."""
        messages = [
            {'role': 'system', 'content': FINANCE_SYSTEM_PROMPT},
            {'role': 'user', 'content': task},
        ]
        return self.call_llm(messages, model=MODEL, max_tokens=400)


def run(raw_input: str, task=None) -> str:
    agent = FinanceAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
