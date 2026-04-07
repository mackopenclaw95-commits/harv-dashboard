"""Patch router.py routing descriptions on VPS."""
import re

with open('/root/harv/agents/router.py', 'r') as f:
    content = f.read()

# Find the _ROUTING_FALLBACK block and replace it
old_pattern = r"_ROUTING_FALLBACK = \[.*?\]"
new_fallback = """_ROUTING_FALLBACK = [
    ('Harv',       'General conversation, greetings, small talk, unclear requests, multi-purpose questions that dont fit other agents'),
    ('Journal',    'Memory recall, what did we talk about, remember, session history, log a thought, save a note, reflect on past conversations'),
    ('Scheduler',  'Calendar, schedule, reminders, appointments, meetings, am I free, time management, cancel appointment'),
    ('Email',      'Gmail, email, inbox, unread, send email, draft reply, archive emails, newsletters, mail'),
    ('Fitness',    'Workouts, exercise, gym, running, lifting, health metrics, training plans, Garmin, reps, sets'),
    ('Finance',    'Bank account, transactions, spending, expenses, budget tracking, Plaid, financial reports, bills'),
    ('Learning',   'Teach me, explain, quiz me, flashcards, study, tutor, learn about, education, courses, exam prep, what is the difference between, how does X work'),
    ('Travel',     'Trips, flights, hotels, itineraries, vacation, getaway, travel planning, destinations, how much to visit, weekend trip, booking'),
    ('Shopping',   'Shopping list, buy, purchase, groceries, product deals, price compare for products to buy'),
    ('Research',   'Web search, latest news, headlines, fact-check, look up, current events, search the web, research report, find information online'),
    ('Sports',     'Scores, standings, game schedules, NFL, NBA, MLB, sports news, injury reports, game recaps'),
    ('Music',      'Spotify, play music, playlist, song recommendations, music search, listening history'),
    ('Trading',    'Prediction markets, Polymarket, Kalshi, crypto, BTC, paper trading, wallet tracking'),
    ('Video Digest', 'Video summary, transcript, digest a video, summarize video, TikTok video, act on video section, video URL'),
    ('Auto Marketing', 'Draft tweet, social media post, content strategy, Instagram post, Reddit post, marketing campaign, blog post, content creation'),
    ('Drive',      'Google Drive, upload file, download file, list files, read document, write document, file management, folder, Drive operations'),
    ('Image Gen',  'Generate image, draw, illustrate, create picture, AI art, profile picture, logo, visual design — NOT social media posts'),
    ('YouTube Digest', 'YouTube video URL, youtube.com link, youtu.be link, YouTube transcript, YouTube summary'),
]"""

result = re.sub(old_pattern, new_fallback, content, count=1, flags=re.DOTALL)

if result != content:
    with open('/root/harv/agents/router.py', 'w') as f:
        f.write(result)
    print('SUCCESS: Patched routing descriptions')
else:
    print('ERROR: Pattern not found')
