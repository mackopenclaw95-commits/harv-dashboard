"""Move personality endpoint from /api/config/ to /api/settings/ to avoid Basic auth."""

API_PATH = "/root/harv/scripts/harv_api.py"
with open(API_PATH) as f:
    code = f.read()

old_route = "@app.route('/api/config/personality', methods=['GET', 'POST'])"
new_route = "@app.route('/api/settings/personality', methods=['GET', 'POST'])"

if "/api/config/personality" in code:
    code = code.replace(old_route, new_route)
    print("Moved personality endpoint to /api/settings/personality")
else:
    print("Already moved or not found")

with open(API_PATH, "w") as f:
    f.write(code)
print(f"harv_api.py saved ({len(code)} bytes)")
