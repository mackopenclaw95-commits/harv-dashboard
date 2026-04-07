"""Add Media Manager to Router routing fallback."""

ROUTER = "/root/harv/agents/router.py"
with open(ROUTER) as f:
    code = f.read()

# Add Media Manager entry to _ROUTING_FALLBACK, before Image Gen
old_entry = "    ('Image Gen',  'Generate image, draw, illustrate, create picture, AI art, profile picture, logo, visual design — NOT social media posts'),"
new_entry = """    ('Media Manager', 'Any media creation: generate image, create video, edit video, draw, illustrate, AI art, profile picture, banner, storyboard — routes to Image Gen, Video Gen, or Video Editor'),
    ('Image Gen',  'Generate image, draw, illustrate, create picture, AI art, profile picture, logo, visual design — NOT social media posts'),"""

if "'Media Manager'" not in code:
    code = code.replace(old_entry, new_entry)
    print("Added Media Manager to _ROUTING_FALLBACK")
else:
    print("Media Manager already in routing fallback")

with open(ROUTER, "w") as f:
    f.write(code)
print(f"router.py saved ({len(code)} bytes)")
