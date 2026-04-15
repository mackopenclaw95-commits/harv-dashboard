"""
blueprints/google.py — Google Workspace dashboard API.

Routes (all under /api/google/):
  GET  /gmail/inbox?max=20                 → recent inbox messages
  GET  /gmail/unread                        → unread count + preview
  GET  /gmail/search?q=...&max=20           → search messages
  GET  /gmail/message/<id>                  → read full message

  GET  /drive/list?q=...&max=30             → list files (any type)
  GET  /drive/list?mime=...&max=30          → list by mimeType filter

  GET  /docs/list?q=...&max=30              → list Google Docs
  GET  /docs/content/<doc_id>               → read doc plain text

  GET  /sheets/list?q=...&max=30            → list Google Sheets
  GET  /sheets/preview/<sheet_id>           → read first tab preview
"""

import logging
import sys

from flask import Blueprint, jsonify, request

sys.path.insert(0, '/root/harv')

log = logging.getLogger('google')
google_bp = Blueprint('google', __name__)

MIME_DOC = 'application/vnd.google-apps.document'
MIME_SHEET = 'application/vnd.google-apps.spreadsheet'
MIME_SLIDES = 'application/vnd.google-apps.presentation'
MIME_FOLDER = 'application/vnd.google-apps.folder'


def _get_gs():
    from lib.google_services import GoogleServices
    return GoogleServices()


def _list_drive(mime: str = '', query: str = '', max_results: int = 30) -> list:
    """List files via Drive API v3, optionally filtered by mimeType and text query.

    Returns [{id, name, mimeType, modifiedTime, webViewLink, iconLink, owner}]
    """
    gs = _get_gs()
    q_parts = ['trashed = false']
    if mime:
        q_parts.append(f"mimeType = '{mime}'")
    if query:
        # Escape single quotes
        q = query.replace("'", "\\'")
        q_parts.append(f"name contains '{q}'")

    try:
        resp = gs._safe(
            lambda: gs._drv().files().list(
                q=' and '.join(q_parts),
                pageSize=max_results,
                orderBy='modifiedTime desc',
                fields='files(id,name,mimeType,modifiedTime,webViewLink,iconLink,owners,size)',
            ).execute()
        )
    except Exception as e:
        log.error(f'drive list failed: {e}')
        return []

    files = (resp or {}).get('files', [])
    result = []
    for f in files:
        owners = f.get('owners', [])
        owner = owners[0].get('displayName', '') if owners else ''
        result.append({
            'id': f.get('id', ''),
            'name': f.get('name', ''),
            'mime_type': f.get('mimeType', ''),
            'modified_time': f.get('modifiedTime', ''),
            'url': f.get('webViewLink', ''),
            'icon': f.get('iconLink', ''),
            'owner': owner,
            'size': int(f.get('size', 0)) if f.get('size') else 0,
        })
    return result


# ---------------------------------------------------------------------------
# Gmail
# ---------------------------------------------------------------------------
@google_bp.route('/gmail/inbox', methods=['GET'])
def gmail_inbox():
    try:
        gs = _get_gs()
        max_r = int(request.args.get('max', 20))
        messages = gs.read_inbox(max_results=max_r)
        return jsonify({'messages': messages or []})
    except Exception as e:
        log.error(f'gmail inbox: {e}')
        return jsonify({'error': str(e)}), 500


@google_bp.route('/gmail/unread', methods=['GET'])
def gmail_unread():
    try:
        gs = _get_gs()
        count = gs.get_unread_count()
        preview = gs.read_inbox(max_results=10, query='is:unread')
        return jsonify({'count': count, 'preview': preview or []})
    except Exception as e:
        log.error(f'gmail unread: {e}')
        return jsonify({'error': str(e)}), 500


@google_bp.route('/gmail/search', methods=['GET'])
def gmail_search():
    try:
        q = request.args.get('q', '').strip()
        max_r = int(request.args.get('max', 20))
        if not q:
            return jsonify({'error': 'q parameter required'}), 400
        gs = _get_gs()
        messages = gs.search_emails(q, max_results=max_r)
        return jsonify({'messages': messages or []})
    except Exception as e:
        log.error(f'gmail search: {e}')
        return jsonify({'error': str(e)}), 500


@google_bp.route('/gmail/message/<msg_id>', methods=['GET'])
def gmail_message(msg_id: str):
    try:
        gs = _get_gs()
        msg = gs.read_email(msg_id)
        return jsonify(msg or {})
    except Exception as e:
        log.error(f'gmail message: {e}')
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Drive (all files)
# ---------------------------------------------------------------------------
@google_bp.route('/drive/list', methods=['GET'])
def drive_list():
    try:
        mime = request.args.get('mime', '').strip()
        q = request.args.get('q', '').strip()
        max_r = int(request.args.get('max', 30))
        files = _list_drive(mime=mime, query=q, max_results=max_r)
        return jsonify({'files': files})
    except Exception as e:
        log.error(f'drive list: {e}')
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Docs (filtered Drive list)
# ---------------------------------------------------------------------------
@google_bp.route('/docs/list', methods=['GET'])
def docs_list():
    try:
        q = request.args.get('q', '').strip()
        max_r = int(request.args.get('max', 30))
        files = _list_drive(mime=MIME_DOC, query=q, max_results=max_r)
        return jsonify({'files': files})
    except Exception as e:
        log.error(f'docs list: {e}')
        return jsonify({'error': str(e)}), 500


@google_bp.route('/docs/content/<doc_id>', methods=['GET'])
def docs_content(doc_id: str):
    """Read a Google Doc as plain text via Drive export."""
    try:
        gs = _get_gs()
        # Use Drive API export endpoint — returns text/plain
        resp = gs._safe(
            lambda: gs._drv().files().export(
                fileId=doc_id, mimeType='text/plain',
            ).execute()
        )
        if isinstance(resp, bytes):
            text = resp.decode('utf-8', errors='replace')
        else:
            text = str(resp or '')
        # Also fetch metadata for title
        meta = gs._safe(
            lambda: gs._drv().files().get(
                fileId=doc_id, fields='id,name,modifiedTime,webViewLink',
            ).execute()
        ) or {}
        return jsonify({
            'id': doc_id,
            'name': meta.get('name', ''),
            'modified_time': meta.get('modifiedTime', ''),
            'url': meta.get('webViewLink', ''),
            'content': text[:100000],  # cap at 100k chars
        })
    except Exception as e:
        log.error(f'docs content: {e}')
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Sheets (filtered Drive list + preview)
# ---------------------------------------------------------------------------
@google_bp.route('/sheets/list', methods=['GET'])
def sheets_list():
    try:
        q = request.args.get('q', '').strip()
        max_r = int(request.args.get('max', 30))
        files = _list_drive(mime=MIME_SHEET, query=q, max_results=max_r)
        return jsonify({'files': files})
    except Exception as e:
        log.error(f'sheets list: {e}')
        return jsonify({'error': str(e)}), 500


@google_bp.route('/sheets/preview/<sheet_id>', methods=['GET'])
def sheets_preview(sheet_id: str):
    """Read the first tab's first 20 rows as a preview."""
    try:
        gs = _get_gs()
        # Get spreadsheet metadata (sheet names)
        meta = gs._safe(
            lambda: gs._sht().spreadsheets().get(spreadsheetId=sheet_id).execute()
        ) or {}
        sheets = meta.get('sheets', [])
        if not sheets:
            return jsonify({'error': 'no sheets found'}), 404

        first_sheet_name = sheets[0].get('properties', {}).get('title', 'Sheet1')
        range_name = f"'{first_sheet_name}'!A1:Z20"

        values_resp = gs.gws_sheets_read(sheet_id, range_name) or {}
        values = values_resp.get('values', [])

        return jsonify({
            'id': sheet_id,
            'title': meta.get('properties', {}).get('title', ''),
            'first_sheet': first_sheet_name,
            'sheet_tabs': [s.get('properties', {}).get('title', '') for s in sheets],
            'preview': values,
            'url': f'https://docs.google.com/spreadsheets/d/{sheet_id}/edit',
        })
    except Exception as e:
        log.error(f'sheets preview: {e}')
        return jsonify({'error': str(e)}), 500
