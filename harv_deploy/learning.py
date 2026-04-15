"""
learning.py — Topic mastery assistant for Harv.

Agent type : agent
Model      : deepseek/deepseek-chat-v3-0324 via OpenRouter
Provider   : openrouter

Core concept:
  User picks a TOPIC → Learning agent spins up a "track" with a curated
  outline, generates study materials (guides, flashcards, quizzes, resource
  lists) on demand, and tracks progress via logged sessions.

Storage: Supabase (learning_tracks, learning_materials, learning_sessions)

Replaces the legacy Google Sheets backend. No sheets dependency.
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

LEARNING_SYSTEM_PROMPT = """You are Harv's Learning agent — an expert tutor that helps users master any topic.

Your job: turn a topic into clear, high-quality study material. You deliver:
- Concise outlines (what to learn, in order)
- Focused study guides (concepts explained well, with examples)
- Flashcards (Q/A pairs for active recall)
- Quizzes (to test understanding)
- Curated resources (books, courses, videos, docs)

Style:
- Direct, encouraging, specific. No fluff.
- Prefer depth over breadth when the user asks about one concept.
- Always include concrete examples.
- When recommending resources, name real, high-quality ones (e.g., "MDN Web Docs for JavaScript", "3Blue1Brown for linear algebra", "FINRA official SIE content outline")."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _strip_context_tags(text: str) -> str:
    text = re.sub(r'\[CONTEXT\][\s\S]*?\[/CONTEXT\]\s*', '', text)
    text = re.sub(r'\[PROJECT CONTEXT\][\s\S]*?\[END PROJECT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[RECENT CONTEXT\][\s\S]*?\[/RECENT CONTEXT\]\s*', '', text)
    text = re.sub(r'\[USER\][\s\S]*?\[/USER\]\s*', '', text)
    text = re.sub(r'\[DIRECT:[^\]]*\]\s*', '', text)
    return text.strip()


def _now_iso() -> str:
    return datetime.now(EST).isoformat()


def _extract_hours(text: str) -> float:
    """Extract hours from phrases like '2 hours', '45 minutes', '1.5 hrs', '90 min'."""
    t = text.lower()
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)', t)
    if m:
        return float(m.group(1))
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m\b)', t)
    if m:
        return round(float(m.group(1)) / 60.0, 2)
    return 0.0


def _extract_topic(text: str) -> str:
    """Extract the topic the user wants to learn."""
    t = text.strip()
    # Patterns like "I want to learn X", "help me learn X", "start learning X"
    for pat in [
        r'(?:i\s+want\s+to\s+learn|start\s+learning|help\s+me\s+learn|learn\s+about|teach\s+me|master)\s+(.+?)(?:\.|,|$)',
        r'(?:track|topic|subject)[:\s]+(.+?)(?:\.|,|$)',
        r'(?:study(?:ing)?|practice|review)\s+(.+?)(?:\s+for|\s+on|\.|,|$)',
    ]:
        m = re.search(pat, t, re.I)
        if m:
            candidate = m.group(1).strip().rstrip('.,!?')
            # Strip leading "about", "the", etc.
            candidate = re.sub(r'^(about|the|how to)\s+', '', candidate, flags=re.I)
            if candidate and len(candidate) < 100:
                return candidate
    return ''


def _detect_intent(task: str) -> str:
    t = task.lower().strip()

    # Start a new track
    if re.search(r'\b(i want to learn|start learning|help me learn|learn about|teach me|master)\b', t):
        return 'start_track'
    if re.search(r'\b(new track|create (a )?track|start a (new )?topic)\b', t):
        return 'start_track'

    # Material generation
    if re.search(r'\b(flash ?cards?|make cards|review cards)\b', t):
        return 'flashcards'
    if re.search(r'\b(quiz|test me|practice questions|questions on)\b', t):
        return 'quiz'
    if re.search(r'\b(study guide|cheat ?sheet|notes on|explain)\b', t):
        return 'guide'
    if re.search(r'\b(resources?|books?|courses?|videos? for|recommend|where to learn)\b', t):
        return 'resources'
    if re.search(r'\b(outline|roadmap|curriculum|syllabus)\b', t):
        return 'outline'
    if re.search(r'\b(summariz|tl;?dr|recap)\b', t):
        return 'summary'

    # Progress tracking
    if re.search(r'\b(studied|log|logged)\b.*\b(hours?|mins?|minutes?|hrs?)', t):
        return 'log_session'
    if re.search(r'\b(hours?|mins?)\b.*\b(studying|studied|on)\b', t):
        return 'log_session'
    if re.search(r'\bmark\b.*\b(done|complete|finished)\b', t):
        return 'mark_complete'
    if re.search(r'\bprogress\b.*\b(\d+%|\d+ ?percent)', t):
        return 'update_progress'

    # Views
    if re.search(r'\b(what am i (studying|learning)|my (tracks|topics|progress)|list.*(tracks|topics))\b', t):
        return 'view_tracks'
    if re.search(r'\b(show|view).*\b(flashcards|quiz|guide|materials|notes)\b', t):
        return 'view_materials'

    # Fallback — LLM research / general question
    return 'research'


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
def _get_supabase():
    from supabase import create_client
    from dotenv import load_dotenv
    load_dotenv('/root/harv/.env')
    return create_client(
        os.environ['SUPABASE_URL'],
        os.environ['SUPABASE_SERVICE_ROLE_KEY']
    )


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
class LearningAgent(BaseAgent):
    """Topic mastery assistant — Supabase-backed, no sheets."""

    def __init__(self):
        super().__init__('Learning', provider='openrouter')
        self._sb = None

    @property
    def sb(self):
        if self._sb is None:
            self._sb = _get_supabase()
        return self._sb

    # ------------------------------------------------------------------
    # Track lookup
    # ------------------------------------------------------------------
    def _find_active_track(self, topic_hint: str = '') -> dict | None:
        """Find a track matching topic_hint, or the most recent active track."""
        try:
            if topic_hint:
                res = self.sb.table('learning_tracks') \
                    .select('*') \
                    .ilike('topic', f'%{topic_hint}%') \
                    .eq('status', 'active') \
                    .order('last_studied_at', desc=True) \
                    .limit(1).execute()
                if res.data:
                    return res.data[0]
            res = self.sb.table('learning_tracks') \
                .select('*') \
                .eq('status', 'active') \
                .order('last_studied_at', desc=True, nullsfirst=False) \
                .limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            self.log(f'_find_active_track: {e}', level='ERROR')
            return None

    def _save_material(self, track_id: str | None, mtype: str, title: str, content: str, metadata: dict | None = None) -> None:
        try:
            self.sb.table('learning_materials').insert({
                'track_id': track_id,
                'type': mtype,
                'title': title[:200],
                'content': content,
                'metadata': metadata or {},
            }).execute()
        except Exception as e:
            self.log(f'_save_material: {e}', level='ERROR')

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    def run(self, task: str) -> str:
        task = _strip_context_tags(task)
        if not task:
            return 'What would you like to learn? Try: "I want to learn options pricing" or "quiz me on Python decorators".'

        intent = _detect_intent(task)
        handlers = {
            'start_track':     self._handle_start_track,
            'outline':         self._handle_outline,
            'guide':           self._handle_guide,
            'flashcards':      self._handle_flashcards,
            'quiz':            self._handle_quiz,
            'resources':       self._handle_resources,
            'summary':         self._handle_summary,
            'log_session':     self._handle_log_session,
            'update_progress': self._handle_update_progress,
            'mark_complete':   self._handle_mark_complete,
            'view_tracks':     self._handle_view_tracks,
            'view_materials':  self._handle_view_materials,
            'research':        self._handle_research,
        }
        return handlers.get(intent, self._handle_research)(task)

    # ------------------------------------------------------------------
    # Handlers — track management
    # ------------------------------------------------------------------
    def _handle_start_track(self, task: str) -> str:
        topic = _extract_topic(task)
        if not topic:
            return 'What topic do you want to learn? Try: "I want to learn options pricing".'

        # Check if track already exists
        try:
            existing = self.sb.table('learning_tracks') \
                .select('id, topic, status') \
                .ilike('topic', topic) \
                .limit(1).execute()
            if existing.data:
                return f'You already have a track for "{existing.data[0]["topic"]}". Try "show my tracks" or "outline {topic}".'
        except Exception:
            pass

        # Generate outline via LLM
        messages = [
            {'role': 'system', 'content': LEARNING_SYSTEM_PROMPT},
            {'role': 'user', 'content': f'Create a focused study outline for: {topic}\n\nReturn ONLY valid JSON with this shape:\n{{\n  "summary": "1-2 sentence overview",\n  "level": "beginner|intermediate|advanced",\n  "sections": [\n    {{"title": "Section name", "topics": ["subtopic 1", "subtopic 2"]}},\n    ...\n  ]\n}}\n\nAim for 5-8 sections covering the topic end-to-end. No extra prose — only JSON.'}
        ]
        try:
            raw = self.call_llm(messages, model=MODEL, max_tokens=1200, temperature=0.4)
            # Extract JSON
            jm = re.search(r'\{[\s\S]*\}', raw)
            outline_data = json.loads(jm.group(0)) if jm else {}
        except Exception as e:
            return f'Could not generate outline: {e}'

        sections = outline_data.get('sections', [])
        level = outline_data.get('level', 'beginner')
        summary = outline_data.get('summary', '')

        try:
            insert = self.sb.table('learning_tracks').insert({
                'topic': topic,
                'description': summary,
                'level': level,
                'outline': {'sections': [{'title': s.get('title', ''), 'topics': s.get('topics', []), 'done': False} for s in sections]},
                'status': 'active',
                'last_studied_at': _now_iso(),
            }).execute()
            track_id = insert.data[0]['id'] if insert.data else None
        except Exception as e:
            return f'Could not save track: {e}'

        # Render outline to user
        lines = [f'**New learning track: {topic}**', f'_{summary}_' if summary else '', f'Level: {level}', '', '## Outline']
        for i, s in enumerate(sections, 1):
            lines.append(f'{i}. **{s.get("title", "")}**')
            for sub in s.get('topics', []):
                lines.append(f'   - {sub}')
        lines.append('')
        lines.append(f'_Track saved. Try "study guide on {topic}" or "flashcards for {topic}" to generate materials._')

        outline_md = '\n'.join(lines)
        self._save_material(track_id, 'outline', f'{topic} outline', outline_md, outline_data)
        return outline_md

    def _handle_outline(self, task: str) -> str:
        topic_hint = _extract_topic(task) or task
        track = self._find_active_track(topic_hint)
        if not track:
            return 'No track found. Start one with "I want to learn [topic]".'
        outline = track.get('outline') or {}
        sections = outline.get('sections', [])
        if not sections:
            return f'Track "{track["topic"]}" has no outline yet.'
        lines = [f'**{track["topic"]}** ({track.get("level", "beginner")})', '']
        for i, s in enumerate(sections, 1):
            check = 'x' if s.get('done') else ' '
            lines.append(f'{i}. [{check}] **{s.get("title", "")}**')
            for sub in s.get('topics', []):
                lines.append(f'   - {sub}')
        return '\n'.join(lines)

    # ------------------------------------------------------------------
    # Handlers — material generation
    # ------------------------------------------------------------------
    def _gen_material(self, task: str, mtype: str, prompt_tail: str, max_tokens: int = 1500) -> str:
        topic_hint = _extract_topic(task) or task
        track = self._find_active_track(topic_hint)
        topic = track['topic'] if track else topic_hint or task

        messages = [
            {'role': 'system', 'content': LEARNING_SYSTEM_PROMPT},
            {'role': 'user', 'content': f'Topic: {topic}\n\n{prompt_tail}'}
        ]
        try:
            content = self.call_llm(messages, model=MODEL, max_tokens=max_tokens, temperature=0.5)
        except Exception as e:
            return f'Generation failed: {e}'

        self._save_material(track['id'] if track else None, mtype, f'{topic} — {mtype}', content)

        # Bump track activity
        if track:
            try:
                self.sb.table('learning_tracks').update({
                    'updated_at': _now_iso(),
                    'last_studied_at': _now_iso(),
                }).eq('id', track['id']).execute()
            except Exception:
                pass

        return content

    def _handle_guide(self, task: str) -> str:
        return self._gen_material(
            task, 'guide',
            'Write a focused study guide. Use markdown with clear headers, short paragraphs, code blocks or formulas where relevant, and at least 3 concrete examples. Keep it under 800 words.',
            max_tokens=1600,
        )

    def _handle_flashcards(self, task: str) -> str:
        return self._gen_material(
            task, 'flashcards',
            'Generate 12 flashcards as a markdown Q&A list:\n\n**Q1:** question\n**A1:** answer\n\n**Q2:** ...\n\nCover core concepts. Keep answers 1-3 sentences.',
            max_tokens=1400,
        )

    def _handle_quiz(self, task: str) -> str:
        return self._gen_material(
            task, 'quiz',
            'Generate a 10-question quiz. Mix multiple-choice and short-answer. Format:\n\n**1.** Question\n   a) option\n   b) option\n   c) option\n   d) option\n\nAfter all 10 questions, list correct answers under "## Answers".',
            max_tokens=1600,
        )

    def _handle_resources(self, task: str) -> str:
        return self._gen_material(
            task, 'resources',
            'Recommend the 6-10 best resources for this topic. For each: name, format (book/course/video/docs), why it is good, and where to find it. Prefer canonical, well-reviewed resources. Include at least one free option.',
            max_tokens=1000,
        )

    def _handle_summary(self, task: str) -> str:
        return self._gen_material(
            task, 'summary',
            'Write a concise summary (TL;DR) of this topic: 3-5 bullet points covering the core ideas someone must know.',
            max_tokens=600,
        )

    # ------------------------------------------------------------------
    # Handlers — sessions & progress
    # ------------------------------------------------------------------
    def _handle_log_session(self, task: str) -> str:
        hours = _extract_hours(task)
        if hours <= 0:
            return 'How much time? Try "studied 2 hours on options" or "logged 45 minutes of Python".'

        topic_hint = _extract_topic(task)
        track = self._find_active_track(topic_hint)
        if not track:
            return 'No active track found. Start one with "I want to learn [topic]".'

        try:
            self.sb.table('learning_sessions').insert({
                'track_id': track['id'],
                'hours': hours,
                'notes': task[:500],
            }).execute()
            new_hours = float(track.get('hours_logged') or 0) + hours
            self.sb.table('learning_tracks').update({
                'hours_logged': round(new_hours, 2),
                'last_studied_at': _now_iso(),
                'updated_at': _now_iso(),
            }).eq('id', track['id']).execute()
        except Exception as e:
            return f'Could not log session: {e}'

        hours_display = f'{hours:.1f}' if hours != int(hours) else str(int(hours))
        return f'Logged **{hours_display} hour(s)** on _{track["topic"]}_. Total: {round(new_hours, 1)} hours.'

    def _handle_update_progress(self, task: str) -> str:
        m = re.search(r'(\d+)\s*%|(\d+)\s*percent', task.lower())
        if not m:
            return 'Specify a percentage, e.g. "progress on options: 60%".'
        pct = int(m.group(1) or m.group(2))
        pct = max(0, min(100, pct))

        topic_hint = _extract_topic(task)
        track = self._find_active_track(topic_hint)
        if not track:
            return 'No active track found.'

        try:
            self.sb.table('learning_tracks').update({
                'progress_pct': pct,
                'updated_at': _now_iso(),
                'status': 'completed' if pct >= 100 else 'active',
            }).eq('id', track['id']).execute()
        except Exception as e:
            return f'Could not update progress: {e}'
        return f'{track["topic"]}: **{pct}%** complete.'

    def _handle_mark_complete(self, task: str) -> str:
        topic_hint = _extract_topic(task)
        track = self._find_active_track(topic_hint)
        if not track:
            return 'No track found to mark complete.'
        try:
            self.sb.table('learning_tracks').update({
                'status': 'completed',
                'progress_pct': 100,
                'updated_at': _now_iso(),
            }).eq('id', track['id']).execute()
        except Exception as e:
            return f'Could not mark complete: {e}'
        return f'Marked _{track["topic"]}_ as complete. Nice work.'

    # ------------------------------------------------------------------
    # Handlers — views
    # ------------------------------------------------------------------
    def _handle_view_tracks(self, task: str) -> str:
        try:
            res = self.sb.table('learning_tracks') \
                .select('topic, level, progress_pct, hours_logged, status, last_studied_at') \
                .order('updated_at', desc=True) \
                .limit(20).execute()
        except Exception as e:
            return f'Could not read tracks: {e}'

        if not res.data:
            return 'No learning tracks yet. Start one with "I want to learn [topic]".'

        lines = ['**Your learning tracks:**', '']
        for t in res.data:
            status_icon = {'active': '●', 'paused': '◐', 'completed': '✓'}.get(t['status'], '○')
            hours = t.get('hours_logged') or 0
            pct = t.get('progress_pct') or 0
            lines.append(f'{status_icon} **{t["topic"]}** — {pct}% | {hours}h | {t.get("level", "beginner")}')
        return '\n'.join(lines)

    def _handle_view_materials(self, task: str) -> str:
        topic_hint = _extract_topic(task) or task
        track = self._find_active_track(topic_hint)
        if not track:
            return 'No track found. Pick one: "show my tracks".'

        # Detect type filter
        mtype = None
        for t in ['flashcards', 'quiz', 'guide', 'outline', 'resources', 'summary']:
            if t in task.lower():
                mtype = t
                break

        try:
            q = self.sb.table('learning_materials').select('type, title, content, created_at').eq('track_id', track['id'])
            if mtype:
                q = q.eq('type', mtype)
            res = q.order('created_at', desc=True).limit(1).execute()
        except Exception as e:
            return f'Could not read materials: {e}'

        if not res.data:
            suggest = f'Try "{mtype} for {track["topic"]}"' if mtype else f'Try "study guide on {track["topic"]}"'
            return f'No materials saved yet for _{track["topic"]}_. {suggest}.'

        m = res.data[0]
        return f'**{m["title"]}**\n\n{m["content"]}'

    # ------------------------------------------------------------------
    # Fallback — general research
    # ------------------------------------------------------------------
    def _handle_research(self, task: str) -> str:
        messages = [
            {'role': 'system', 'content': LEARNING_SYSTEM_PROMPT},
            {'role': 'user', 'content': task}
        ]
        try:
            return self.call_llm(messages, model=MODEL, max_tokens=1200, temperature=0.5)
        except Exception as e:
            return f'Research failed: {e}'


# ---------------------------------------------------------------------------
# Router entry point
# ---------------------------------------------------------------------------
def run(raw_input: str, task=None) -> str:
    agent = LearningAgent()
    message = raw_input or (task if isinstance(task, str) else '')
    message = _strip_context_tags(message)
    return str(agent.execute(message))
