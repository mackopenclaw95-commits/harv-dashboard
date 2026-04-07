"""Patch harv_api.py — adds /api/config/personality GET/POST endpoint."""
import os

API_PATH = "/root/harv/scripts/harv_api.py"
with open(API_PATH) as f:
    code = f.read()

endpoint_code = '''

@app.route('/api/config/personality', methods=['GET', 'POST'])
def config_personality():
    """Get or set Harv personality mode (cars1 / default)."""
    import json
    CORE_PATH = '/root/harv/core.json'

    if request.method == 'GET':
        try:
            with open(CORE_PATH) as f:
                cfg = json.load(f)
            personality = cfg.get('agents', {}).get('harv', {}).get('personality', 'cars1')
            return jsonify({'personality': personality})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    # POST — set personality
    data = request.json or {}
    new_personality = data.get('personality', '').strip().lower()
    if new_personality not in ('cars1', 'default'):
        return jsonify({'error': 'personality must be "cars1" or "default"'}), 400

    try:
        with open(CORE_PATH) as f:
            cfg = json.load(f)
        cfg.setdefault('agents', {}).setdefault('harv', {})['personality'] = new_personality
        with open(CORE_PATH, 'w') as f:
            json.dump(cfg, f, indent=2)
        log.info(f'Personality changed to: {new_personality}')
        return jsonify({'personality': new_personality, 'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

'''

# Insert before the health endpoint
marker = "@app.route('/health', methods=['GET'])"
if "/api/config/personality" not in code:
    code = code.replace(marker, endpoint_code + "\n" + marker)
    print("Added /api/config/personality endpoint")
else:
    print("Personality endpoint already exists")

with open(API_PATH, "w") as f:
    f.write(code)
print(f"harv_api.py saved ({len(code)} bytes)")
