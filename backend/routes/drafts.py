from flask import Blueprint, jsonify, request

from db import get_db
from identity import current_member, guest_owner_id
from media_store import delete_file, save_upload
from permissions import BOARDS

drafts_bp = Blueprint('drafts', __name__)


def draft_key(board, post_part):
    member = current_member()
    identity = member['id'] if member else f'guest-{guest_owner_id()}'
    return f'{board}:{post_part}:{identity}'


def serialize_media(row):
    return {'id': row['id'], 'kind': row['kind'], 'name': row['name'], 'url': f"/api/media/{row['id']}"}


def ensure_draft_row(cursor, key, board):
    cursor.execute(
        'INSERT INTO drafts (id, board, title, body, guest) VALUES (%s, %s, %s, %s, %s) '
        'ON DUPLICATE KEY UPDATE id=id',
        (key, board, '', '', ''),
    )


@drafts_bp.get('/drafts/<board>/<post_part>')
def get_draft(board, post_part):
    if board not in BOARDS:
        return jsonify({'error': '존재하지 않는 게시판입니다.'}), 404
    key = draft_key(board, post_part)
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM drafts WHERE id=%s', (key,))
        draft = cursor.fetchone()
        if not draft:
            return jsonify({'error': '임시저장된 내용이 없습니다.'}), 404
        cursor.execute('SELECT * FROM media WHERE draft_id=%s ORDER BY position, created_at', (key,))
        media = [serialize_media(row) for row in cursor.fetchall()]
    return jsonify({'title': draft['title'], 'body': draft['body'], 'guest': draft['guest'], 'media': media})


@drafts_bp.put('/drafts/<board>/<post_part>')
def put_draft(board, post_part):
    if board not in BOARDS:
        return jsonify({'error': '존재하지 않는 게시판입니다.'}), 404
    key = draft_key(board, post_part)
    payload = request.get_json(silent=True) or {}
    title = str(payload.get('title', ''))
    body = payload.get('body', '')
    guest = str(payload.get('guest', ''))
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute(
            'INSERT INTO drafts (id, board, title, body, guest) VALUES (%s, %s, %s, %s, %s) '
            'ON DUPLICATE KEY UPDATE title=VALUES(title), body=VALUES(body), guest=VALUES(guest)',
            (key, board, title, body, guest),
        )
    return '', 204


@drafts_bp.delete('/drafts/<board>/<post_part>')
def delete_draft(board, post_part):
    if board not in BOARDS:
        return jsonify({'error': '존재하지 않는 게시판입니다.'}), 404
    key = draft_key(board, post_part)
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT path FROM media WHERE draft_id=%s', (key,))
        files = [row['path'] for row in cursor.fetchall()]
        cursor.execute('DELETE FROM drafts WHERE id=%s', (key,))
    for path in files:
        delete_file(path)
    return '', 204


@drafts_bp.post('/drafts/<board>/<post_part>/media')
def add_draft_media(board, post_part):
    if board not in BOARDS:
        return jsonify({'error': '존재하지 않는 게시판입니다.'}), 404
    kind = request.form.get('kind')
    file_storage = request.files.get('file')
    if kind not in ('image', 'video') or not file_storage:
        return jsonify({'error': '첨부파일을 확인해 주세요.'}), 400
    key = draft_key(board, post_part)
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT COUNT(*) AS n FROM media WHERE draft_id=%s', (key,))
        if cursor.fetchone()['n'] >= 10:
            return jsonify({'error': '첨부파일은 최대 10개까지 가능합니다.'}), 400
    try:
        media_id, filename, size = save_upload(kind, file_storage)
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    with db.cursor() as cursor:
        ensure_draft_row(cursor, key, board)
        cursor.execute(
            'INSERT INTO media (id, draft_id, kind, name, mime, path, size) VALUES (%s, %s, %s, %s, %s, %s, %s)',
            (media_id, key, kind, file_storage.filename or filename, file_storage.mimetype, filename, size),
        )
    return jsonify({'id': media_id, 'kind': kind, 'name': file_storage.filename or filename,
                     'url': f'/api/media/{media_id}'}), 201


@drafts_bp.put('/drafts/<board>/<post_part>/media/<media_id>')
def replace_draft_media(board, post_part, media_id):
    key = draft_key(board, post_part)
    kind = request.form.get('kind')
    file_storage = request.files.get('file')
    if kind not in ('image', 'video') or not file_storage:
        return jsonify({'error': '첨부파일을 확인해 주세요.'}), 400
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM media WHERE id=%s AND draft_id=%s', (media_id, key))
        existing = cursor.fetchone()
        if not existing:
            return jsonify({'error': '첨부파일을 찾을 수 없습니다.'}), 404
        try:
            _, filename, size = save_upload(kind, file_storage)
        except ValueError as error:
            return jsonify({'error': str(error)}), 400
        delete_file(existing['path'])
        cursor.execute('UPDATE media SET name=%s, mime=%s, path=%s, size=%s WHERE id=%s',
                        (file_storage.filename or existing['name'], file_storage.mimetype, filename, size, media_id))
    return jsonify({'id': media_id, 'kind': kind, 'name': file_storage.filename or existing['name'],
                     'url': f'/api/media/{media_id}'})


@drafts_bp.delete('/drafts/<board>/<post_part>/media/<media_id>')
def delete_draft_media(board, post_part, media_id):
    key = draft_key(board, post_part)
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT path FROM media WHERE id=%s AND draft_id=%s', (media_id, key))
        existing = cursor.fetchone()
        if existing:
            cursor.execute('DELETE FROM media WHERE id=%s', (media_id,))
    if existing:
        delete_file(existing['path'])
    return '', 204
