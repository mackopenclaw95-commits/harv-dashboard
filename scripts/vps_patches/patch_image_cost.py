"""Patch image clients to emit api_cost events on successful generation.

1. Add log_image_cost() helper to lib/harv_lib.py (uses contextvars + per-image rates)
2. Patch gemini_image_client, kie_image_client, openrouter_image_client to call it

Safe to re-run (sentinels prevent double-apply).
"""
import os
import sys
import py_compile

HARV_LIB = '/root/harv/lib/harv_lib.py'
GEMINI = '/root/harv/lib/gemini_image_client.py'
KIE = '/root/harv/lib/kie_image_client.py'
OPENROUTER = '/root/harv/lib/openrouter_image_client.py'

SENTINEL_LIB = '# --- IMAGE_COST_HELPER_V1 ---'
SENTINEL_CLIENT = '# --- IMAGE_COST_CALL_V1 ---'

# Per-image USD rates
IMAGE_RATES = {
    'google/imagen-4':                  0.030,
    'google/gemini-2.5-flash':          0.039,
    'google/gemini-2.5-flash-image-preview': 0.039,
    'google/gemini-2.0-flash-image-preview': 0.039,
    'kie/nano-banana':                  0.020,
    'openai/dall-e-3':                  0.040,
    # Catch-all for any Gemini or OpenRouter image model not listed above
    '__default_google__':               0.030,
    '__default_openrouter__':           0.040,
    '__default_kie__':                  0.020,
}


def patch_harv_lib():
    with open(HARV_LIB, 'r') as f:
        content = f.read()
    if SENTINEL_LIB in content:
        print('[harv_lib] image helper already present — skipping')
        return

    # Embed the rate table and helper function right after COST_TRACKING_PATCH_V1 block
    import json as _json
    rates_literal = _json.dumps(IMAGE_RATES, indent=4)

    helper = f'''

{SENTINEL_LIB}
_IMAGE_RATES = {rates_literal}


def log_image_cost(agent: str, model: str, num_images: int = 1, provider_hint: str = '') -> None:
    """Emit an api_cost event for image generation.

    `model` should be the full "<provider>/<name>" string (e.g. 'google/imagen-4').
    `provider_hint` is a fallback when model key isn't in the rate table
    ('google', 'openrouter', 'kie' → uses that provider's default rate).

    Reads user_id/parent_agent from the request contextvar.
    Silent-fail.
    """
    try:
        from lib.event_bus import event_bus
        rate = _IMAGE_RATES.get(model)
        if rate is None:
            fallback_key = f'__default_{{provider_hint or "google"}}__'
            rate = _IMAGE_RATES.get(fallback_key, 0.03)
        cost = float(num_images) * float(rate)

        ctx = get_request_context()
        meta = {{
            'model': model,
            'modality': 'image',
            'units': float(num_images),
            'provider': provider_hint or (model.split('/')[0] if '/' in model else 'unknown'),
        }}
        if ctx.get('user_id'):
            meta['user_id'] = ctx['user_id']
        if ctx.get('parent_agent'):
            meta['parent_agent'] = ctx['parent_agent']
        if ctx.get('session_id'):
            meta['session_id'] = ctx['session_id']

        event_bus.emit(
            agent=agent,
            action='api_cost',
            status='success',
            summary=f'{{model}} | {{int(num_images)}} image{{"s" if num_images != 1 else ""}} | ${{cost:.6f}}',
            cost=cost,
            tokens=0,
            metadata=meta,
        )
    except Exception:
        pass  # cost logging must never break image generation
# --- END IMAGE_COST_HELPER_V1 ---

'''
    # Anchor after the context helpers
    anchor = "# --- END COST_TRACKING_PATCH_V1 ---"
    if anchor not in content:
        print('[harv_lib] FATAL: base cost tracking patch not applied — run cost_tracking_vps.py first')
        sys.exit(2)
    content = content.replace(anchor, anchor + helper, 1)

    with open(HARV_LIB, 'w') as f:
        f.write(content)
    py_compile.compile(HARV_LIB, doraise=True)
    print('[harv_lib] image helper added + compiled OK')


def patch_gemini():
    with open(GEMINI, 'r') as f:
        content = f.read()
    if SENTINEL_CLIENT in content:
        print('[gemini] already patched — skipping')
        return

    old = "            return {'success': True, 'images': saved_paths, 'prompt': prompt, 'model': used_model}"
    new = (
        "            " + SENTINEL_CLIENT + "\n"
        "            try:\n"
        "                from lib.harv_lib import log_image_cost\n"
        "                log_image_cost('Image Gen', f'google/{used_model}', num_images=len(saved_paths), provider_hint='google')\n"
        "            except Exception as _ie:\n"
        "                print(f'[GeminiClient] cost emit failed: {_ie}')\n"
        "            return {'success': True, 'images': saved_paths, 'prompt': prompt, 'model': used_model}"
    )
    if old not in content:
        print('[gemini] FATAL: could not find success return')
        sys.exit(2)
    content = content.replace(old, new)

    with open(GEMINI, 'w') as f:
        f.write(content)
    py_compile.compile(GEMINI, doraise=True)
    print('[gemini] patched + compiled OK')


def patch_kie():
    with open(KIE, 'r') as f:
        content = f.read()
    if SENTINEL_CLIENT in content:
        print('[kie] already patched — skipping')
        return

    old = (
        "                    print(f'[KieClient] Saved: {file_path} ({len(image_bytes)} bytes, via {model})')\n"
        "                    return {\n"
        "                        'success': True,\n"
        "                        'images': [str(file_path)],\n"
        "                        'prompt': prompt,\n"
        "                        'model': model,\n"
        "                    }"
    )
    new = (
        "                    print(f'[KieClient] Saved: {file_path} ({len(image_bytes)} bytes, via {model})')\n"
        "                    " + SENTINEL_CLIENT + "\n"
        "                    try:\n"
        "                        from lib.harv_lib import log_image_cost\n"
        "                        log_image_cost('Image Gen', f'kie/{model}', num_images=1, provider_hint='kie')\n"
        "                    except Exception as _ie:\n"
        "                        print(f'[KieClient] cost emit failed: {_ie}')\n"
        "                    return {\n"
        "                        'success': True,\n"
        "                        'images': [str(file_path)],\n"
        "                        'prompt': prompt,\n"
        "                        'model': model,\n"
        "                    }"
    )
    if old not in content:
        print('[kie] FATAL: could not find success return')
        sys.exit(2)
    content = content.replace(old, new)

    with open(KIE, 'w') as f:
        f.write(content)
    py_compile.compile(KIE, doraise=True)
    print('[kie] patched + compiled OK')


def patch_openrouter():
    with open(OPENROUTER, 'r') as f:
        content = f.read()
    if SENTINEL_CLIENT in content:
        print('[openrouter] already patched — skipping')
        return

    old = (
        "            return {\n"
        "                'success': True,\n"
        "                'images': [save_path],\n"
        "                'model': MODEL,\n"
        "                'prompt': prompt,\n"
        "                'tokens_in': in_tok,\n"
        "                'tokens_out': out_tok,\n"
        "            }"
    )
    new = (
        "            " + SENTINEL_CLIENT + "\n"
        "            try:\n"
        "                from lib.harv_lib import log_image_cost\n"
        "                log_image_cost('Image Gen', f'openrouter/{MODEL}', num_images=1, provider_hint='openrouter')\n"
        "            except Exception as _ie:\n"
        "                print(f'[OpenRouterImage] cost emit failed: {_ie}')\n"
        "            return {\n"
        "                'success': True,\n"
        "                'images': [save_path],\n"
        "                'model': MODEL,\n"
        "                'prompt': prompt,\n"
        "                'tokens_in': in_tok,\n"
        "                'tokens_out': out_tok,\n"
        "            }"
    )
    if old not in content:
        print('[openrouter] FATAL: could not find success return')
        sys.exit(2)
    content = content.replace(old, new)

    with open(OPENROUTER, 'w') as f:
        f.write(content)
    py_compile.compile(OPENROUTER, doraise=True)
    print('[openrouter] patched + compiled OK')


def main():
    print('=== image cost logging patch ===')
    patch_harv_lib()
    patch_gemini()
    patch_kie()
    patch_openrouter()
    print('All image clients patched.')


if __name__ == '__main__':
    main()
