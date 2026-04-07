"""Add missing by_date and daily_counts methods to EventBus."""

EVENTBUS_PATH = '/root/harv/lib/event_bus.py'

with open(EVENTBUS_PATH, 'r') as f:
    content = f.read()

# Check if methods already exist
if 'def by_date' in content:
    print('by_date already exists')
elif 'def daily_counts' in content:
    print('daily_counts already exists')
else:
    # Add both methods before the singleton instantiation
    new_methods = '''
    def by_date(self, date_str: str, agent: str = None, status: str = None) -> list:
        """Get events for a specific date (format: YYYY-MM-DD)."""
        conn = self._connect()
        try:
            # Events store timestamps like "2026-03-30 11:00:15 AM EST"
            # Match by the date prefix
            query = "SELECT * FROM events WHERE timestamp LIKE ? "
            params = [f"{date_str}%"]

            if agent:
                query += "AND agent = ? "
                params.append(agent)
            if status:
                query += "AND status = ? "
                params.append(status)

            query += "ORDER BY id DESC"
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_dict(r) for r in rows]
        finally:
            conn.close()

    def daily_counts(self, days: int = 30) -> dict:
        """Get event counts per day for the last N days."""
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT timestamp FROM events ORDER BY id DESC LIMIT 10000"
            ).fetchall()

            from collections import defaultdict
            counts = defaultdict(int)
            for row in rows:
                ts = row[0] if isinstance(row, tuple) else row['timestamp']
                # Extract date part: "2026-03-30 11:00:15 AM EST" -> "2026-03-30"
                date_part = ts[:10] if ts else None
                if date_part:
                    counts[date_part] += 1

            # Sort by date and limit to last N days
            sorted_counts = dict(sorted(counts.items(), reverse=True)[:days])
            return sorted_counts
        finally:
            conn.close()

'''

    # Insert before 'event_bus = EventBus()'
    content = content.replace(
        'event_bus = EventBus()',
        new_methods + 'event_bus = EventBus()'
    )

    with open(EVENTBUS_PATH, 'w') as f:
        f.write(content)

    print('Added by_date and daily_counts methods')

# Verify syntax
try:
    compile(open(EVENTBUS_PATH).read(), 'event_bus.py', 'exec')
    print('Syntax OK')
except SyntaxError as e:
    print(f'Syntax error: {e}')
