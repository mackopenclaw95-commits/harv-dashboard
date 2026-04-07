"""Move personality endpoint to /api/harv/personality to avoid Basic auth."""

API_PATH = "/root/harv/scripts/harv_api.py"
with open(API_PATH) as f:
    code = f.read()

old_route = "@app.route('/api/settings/personality', methods=['GET', 'POST'])"
new_route = "@app.route('/api/harv/personality', methods=['GET', 'POST'])"

if "/api/settings/personality" in code:
    code = code.replace(old_route, new_route)
    print("Moved personality endpoint to /api/harv/personality")
elif "/api/harv/personality" in code:
    print("Already at /api/harv/personality")
else:
    print("Route not found")

with open(API_PATH, "w") as f:
    f.write(code)
print(f"saved ({len(code)} bytes)")
