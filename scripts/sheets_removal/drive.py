"""
drive.py — Google Drive agent for Harv.

Pure Drive I/O — no LLM, zero API cost.
Called by Router via run(raw_input, task=None).
Ledger is updated after every run.

Actions
-------
drive.read    — read a Google Doc or plain file by file_id
drive.write   — create or fully overwrite a Google Doc
drive.append  — append text to an existing Google Doc
drive.list    — list files in a folder by folder_id
drive.delete  — delete a file by file_id
drive.mkdir   — create a folder in Drive
drive.move    — move a file to a different folder

Input: JSON string with "action" plus action-specific fields.
Output: plain-text result string.
Errors: raises ValueError — Router catches it.
"""

import importlib.util
import json
import sys

sys.path.insert(0, '/root/harv')

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaInMemoryUpload

from lib.harv_lib import load_core, load_creds, setup_file_logger, log_api_cost

AGENT_NAME  = 'Drive'
LEDGER_PATH = '/root/harv/agents/ledger.py'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse(raw_input):
    if not raw_input or not raw_input.strip():
        raise ValueError('Input is empty — expected a JSON action object')
    try:
        return json.loads(raw_input)
    except json.JSONDecodeError as e:
        raise ValueError(f'Input is not valid JSON: {e}')


def _require(params, *keys):
    for k in keys:
        if not params.get(k):
            raise ValueError(f'Missing required field: "{k}"')


def _drive():
    return build('drive', 'v3', credentials=load_creds())


def _docs():
    return build('docs', 'v1', credentials=load_creds())


def _call_ledger(status, last_task, log):
    """Log Drive status to events.db via event_bus. Never raises."""
    try:
        from lib.event_bus import event_bus
        event_bus.emit(
            agent=AGENT_NAME,
            action='status_update',
            status=status.lower().replace(' ', '_'),
            summary=last_task[:200] if last_task else status,
        )
    except Exception as e:
        if log:
            log.warning(f'Ledger call failed: {e}')


# ---------------------------------------------------------------------------
# drive.read
# ---------------------------------------------------------------------------
def _drive_read(params):
    """Read a Google Doc or plain file. Returns text preview (<=4000 chars)."""
    _require(params, 'file_id')
    file_id = params['file_id']
    drive   = _drive()

    meta = drive.files().get(fileId=file_id, fields='mimeType,name').execute()
    mime = meta.get('mimeType', '')
    name = meta.get('name', file_id)

    if mime == 'application/vnd.google-apps.document':
        raw  = drive.files().export(fileId=file_id, mimeType='text/plain').execute()
        text = raw.decode('utf-8') if isinstance(raw, bytes) else raw
    elif mime == 'application/vnd.google-apps.spreadsheet':
        return f'"{name}" is a Spreadsheet — Google Sheets operations have been removed. Data is now in SQLite.'
    else:
        try:
            raw  = drive.files().get_media(fileId=file_id).execute()
            text = raw.decode('utf-8') if isinstance(raw, bytes) else str(raw)
        except HttpError as e:
            raise ValueError(f'Cannot read "{name}" (type: {mime}): {e}')

    preview = text[:4000] + (' ...[truncated]' if len(text) > 4000 else '')
    return f'File "{name}" ({file_id}):\n{preview}'


# ---------------------------------------------------------------------------
# drive.write
# ---------------------------------------------------------------------------
def _drive_write(params):
    """Create a new Google Doc, or fully overwrite an existing one."""
    _require(params, 'content')
    content = params['content']
    file_id = params.get('file_id')
    title   = params.get('title', 'Harv Document')

    if file_id:
        # Overwrite existing Doc via Docs API
        docs = _docs()
        doc  = docs.documents().get(documentId=file_id).execute()
        body_content = doc.get('body', {}).get('content', [])
        end_index = 1
        for elem in body_content:
            if 'endIndex' in elem:
                end_index = elem['endIndex']

        requests = []
        if end_index > 2:
            requests.append({
                'deleteContentRange': {
                    'range': {'startIndex': 1, 'endIndex': end_index - 1}
                }
            })
        requests.append({'insertText': {'location': {'index': 1}, 'text': content}})
        docs.documents().batchUpdate(
            documentId=file_id, body={'requests': requests}
        ).execute()

        drive = _drive()
        meta  = drive.files().get(fileId=file_id, fields='name,webViewLink').execute()
        return f'Overwrote Google Doc "{meta.get("name", file_id)}" — {meta.get("webViewLink", "")}'

    else:
        # Create new Google Doc
        drive     = _drive()
        meta_body = {'name': title, 'mimeType': 'application/vnd.google-apps.document'}
        if params.get('folder_id'):
            meta_body['parents'] = [params['folder_id']]
        media = MediaInMemoryUpload(
            content.encode('utf-8'), mimetype='text/plain', resumable=False
        )
        f = drive.files().create(
            body=meta_body, media_body=media, fields='id,name,webViewLink'
        ).execute()
        return f'Created Google Doc "{f["name"]}" — id: {f["id"]} — {f.get("webViewLink", "")}'


# ---------------------------------------------------------------------------
# drive.append
# ---------------------------------------------------------------------------
def _drive_append(params):
    """Append text to the end of an existing Google Doc."""
    _require(params, 'file_id', 'content')
    file_id = params['file_id']
    content = params['content']

    docs = _docs()
    doc  = docs.documents().get(documentId=file_id).execute()
    body_content = doc.get('body', {}).get('content', [])
    end_index = 1
    for elem in body_content:
        if 'endIndex' in elem:
            end_index = elem['endIndex']

    # Insert before the final newline Docs always keeps at the end
    insert_at = max(1, end_index - 1)
    docs.documents().batchUpdate(
        documentId=file_id,
        body={'requests': [
            {'insertText': {'location': {'index': insert_at}, 'text': content}}
        ]}
    ).execute()

    drive = _drive()
    meta  = drive.files().get(fileId=file_id, fields='name').execute()
    return f'Appended {len(content)} chars to "{meta.get("name", file_id)}"'


# ---------------------------------------------------------------------------
# drive.list
# ---------------------------------------------------------------------------
def _drive_list(params):
    """List files in a folder. Returns name, id, mimeType, modifiedTime."""
    _require(params, 'folder_id')
    folder_id = params['folder_id']
    max_files = int(params.get('max_files', 50))
    drive     = _drive()

    query = f"'{folder_id}' in parents and trashed=false"
    resp  = drive.files().list(
        q=query,
        pageSize=max_files,
        fields='files(id,name,mimeType,modifiedTime)',
        orderBy='modifiedTime desc',
    ).execute()
    files = resp.get('files', [])

    if not files:
        return f'Folder {folder_id} is empty.'

    lines = [f'Files in folder {folder_id} ({len(files)} items):']
    for f in files:
        mime  = f.get('mimeType', '')
        mtime = f.get('modifiedTime', '')[:10]
        ftype = 'Folder' if mime == 'application/vnd.google-apps.folder' else mime.split('.')[-1]
        lines.append(f'  [{ftype}] {f["name"]}  id={f["id"]}  modified={mtime}')
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# drive.delete
# ---------------------------------------------------------------------------
def _drive_delete(params):
    """Permanently delete a file or folder by file_id."""
    _require(params, 'file_id')
    file_id = params['file_id']
    drive   = _drive()

    meta = drive.files().get(fileId=file_id, fields='name').execute()
    name = meta.get('name', file_id)
    drive.files().delete(fileId=file_id).execute()
    return f'Deleted "{name}" (id: {file_id})'


# ---------------------------------------------------------------------------
# drive.mkdir
# ---------------------------------------------------------------------------
def _drive_mkdir(params):
    """Create a folder in Google Drive. Optionally nested inside parent_id."""
    _require(params, 'name')
    name      = params['name']
    parent_id = params.get('parent_id')
    drive     = _drive()

    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        meta['parents'] = [parent_id]

    f = drive.files().create(body=meta, fields='id,name,webViewLink').execute()
    return f'Created folder "{f["name"]}" — id: {f["id"]} — {f.get("webViewLink", "")}'


# ---------------------------------------------------------------------------
# drive.move
# ---------------------------------------------------------------------------
def _drive_move(params):
    """Move a file to a different folder (removes from all current parents)."""
    _require(params, 'file_id', 'target_folder_id')
    file_id       = params['file_id']
    target_folder = params['target_folder_id']
    drive         = _drive()

    meta            = drive.files().get(fileId=file_id, fields='parents,name').execute()
    name            = meta.get('name', file_id)
    current_parents = ','.join(meta.get('parents', []))

    drive.files().update(
        fileId=file_id,
        addParents=target_folder,
        removeParents=current_parents,
        fields='id,parents',
    ).execute()
    return f'Moved "{name}" (id: {file_id}) to folder {target_folder}'



# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
ACTIONS = {
    'drive.read':     _drive_read,
    'drive.write':   _drive_write,
    'drive.append':  _drive_append,
    'drive.list':    _drive_list,
    'drive.delete':  _drive_delete,
    'drive.mkdir':   _drive_mkdir,
    'drive.move':    _drive_move,
}


# ---------------------------------------------------------------------------
# Entry point called by Router
# ---------------------------------------------------------------------------
def run(raw_input, task=None):
    log    = setup_file_logger(AGENT_NAME)
    params = _parse(raw_input)

    action = params.get('action', '').strip().lower()
    if not action:
        raise ValueError('Input JSON missing "action" field')

    if action not in ACTIONS:
        valid = ', '.join(sorted(ACTIONS.keys()))
        raise ValueError(f'Unknown action "{action}". Valid: {valid}')

    log.info(f'action={action}')
    result = ACTIONS[action](params)
    log.info(f'action={action} completed')

    session_id = task.get('id', 'drive') if task else 'drive'
    log_api_cost(session_id, AGENT_NAME, 'none', 0, 0, task_type=action)
    _call_ledger('Active', f'{action}: {str(result)[:100]}', log)
    return result


# ---------------------------------------------------------------------------
# Standalone test
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run Drive directly with a JSON input')
    parser.add_argument('input', help='JSON action string')
    args = parser.parse_args()
    print(run(args.input))
