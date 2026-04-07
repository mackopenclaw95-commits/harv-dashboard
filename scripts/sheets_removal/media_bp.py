"""
blueprints/media.py — Serve generated media files (images, etc.)

Routes:
  GET /media/<path:relative_path>  -> binary file response

Files are served from /root/harv/media/.
Security: only files under MEDIA_ROOT can be served (no path traversal).
Auth: X-API-Key header required.
"""

import mimetypes
import os

from flask import Blueprint, abort, request, send_file

media_bp = Blueprint('media', __name__)

MEDIA_ROOT = '/root/harv/media'


def _check_api_key() -> bool:
    expected = os.environ.get('HARV_API_KEY', '').strip()
    if not expected:
        return False
    provided = request.headers.get('X-API-Key', '').strip()
    return provided == expected


@media_bp.route('/<path:relative_path>', methods=['GET'])
def serve_media(relative_path):
    """Serve a file from the media directory."""
    if not _check_api_key():
        abort(401, description='Unauthorized')

    # Resolve and validate the path (prevent traversal)
    full_path = os.path.realpath(os.path.join(MEDIA_ROOT, relative_path))
    if not full_path.startswith(os.path.realpath(MEDIA_ROOT)):
        abort(403, description='Path traversal not allowed')

    if not os.path.isfile(full_path):
        abort(404, description=f'File not found: {relative_path}')

    # Detect MIME type
    mime_type, _ = mimetypes.guess_type(full_path)
    if not mime_type:
        mime_type = 'application/octet-stream'

    return send_file(
        full_path,
        mimetype=mime_type,
        as_attachment=False,
        max_age=86400,  # 24h cache
    )
