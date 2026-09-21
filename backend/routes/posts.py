import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from db import get_db
from identity import current_member, guest_owner_id, is_guest_request, peek_guest_owner_id
from media_store import delete_file, save_upload
from permissions import BOARDS, can_delete, can_edit, can_read, can_write
from routes.drafts import draft_key

posts_bp = Blueprint('posts', __name__)


def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat()


def serialize_media(row):
    return {'id': row['id'], 'kind': row['kind'], 'name': row['name'], 'url': f"/api/media/{row['id']}"}


def media_for_post(cursor, post_id):
    cursor.execute('SELECT * FROM media WHERE post_id=%s ORDER BY position, created_at', (post_id,))
    return [serialize_media(row) for row in cursor.fetchall()]


def serialize_post_summary(row):
    return {
        'id': row['id'], 'board': row['board'], 'title': row['title'], 'body': row['body'],
        'author': row['author'], 'created': row['created'].isoformat(), 'updated': row['updated'].isoformat(),
    }


@posts_bp.get('/posts')
def list_posts():
    board = request.args.get('board')
    if board not in BOARDS:
        return jsonify({'error': '존재하지 않는 게시판입니다.'}), 404
    guest = is_guest_request()
    member = current_member()
    if not can_read(member, board, guest):
        return jsonify({'error': '이 게시판의 읽기 권한이 없습니다.'}), 403
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM posts WHERE board=%s ORDER BY created DESC', (board,))
        rows = cursor.fetchall()
    return jsonify([serialize_post_summary(row) for row in rows])


@posts_bp.get('/posts/<post_id>')
def get_post(post_id):
    guest = is_guest_request()
    member = current_member()
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM posts WHERE id=%s', (post_id,))
        post = cursor.fetchone()
        if not post or not can_read(member, post['board'], guest):
            return jsonify({'error': '읽기 권한이 없거나 삭제된 글입니다.'}), 404
        media = media_for_post(cursor, post_id)
    owner_id = peek_guest_owner_id()
    result = serialize_post_summary(post)
    result['media'] = media
    result['canEdit'] = can_edit(member, post, guest, owner_id)
    result['canDelete'] = can_delete(member, post, guest, owner_id)
    return jsonify(result)


def _move_draft_media(cursor, draft_id, post_id):
    cursor.execute('UPDATE media SET draft_id=NULL, post_id=%s WHERE draft_id=%s', (post_id, draft_id))
    cursor.execute('DELETE FROM drafts WHERE id=%s', (draft_id,))


@posts_bp.post('/posts')
def create_post():
    guest = is_guest_request()
    member = current_member()
    payload = request.get_json(silent=True) or {}
    board = payload.get('board')
    if board not in BOARDS:
        return jsonify({'error': '존재하지 않는 게시판입니다.'}), 404
    if not can_write(member, board, guest):
        return jsonify({'error': '작성 또는 수정 권한이 없습니다.'}), 403
    title = str(payload.get('title', '')).strip()
    body = payload.get('body', '')
    guest_name = str(payload.get('guestName', '')).strip()
    key = draft_key(board, 'new')
    if not title:
        return jsonify({'error': '제목과 내용을 입력해 주세요.'}), 400
    post_id = str(uuid.uuid4())
    now = now_iso()
    author = (member['name'] if member else '') or guest_name or '비회원'
    owner = guest_owner_id() if guest else None
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute(
            'INSERT INTO posts (id, board, title, body, author, member, owner, created, updated) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)',
            (post_id, board, title, body, author, member['id'] if member else None, owner, now, now),
        )
        _move_draft_media(cursor, key, post_id)
        media = media_for_post(cursor, post_id)
    result = {'id': post_id, 'board': board, 'title': title, 'body': body, 'author': author,
              'created': now, 'updated': now, 'media': media, 'canEdit': True, 'canDelete': True}
    return jsonify(result), 201


@posts_bp.put('/posts/<post_id>')
def update_post(post_id):
    guest = is_guest_request()
    member = current_member()
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM posts WHERE id=%s', (post_id,))
        post = cursor.fetchone()
        owner_id = peek_guest_owner_id()
        if not post or not can_edit(member, post, guest, owner_id):
            return jsonify({'error': '작성 또는 수정 권한이 없습니다.'}), 403
        payload = request.get_json(silent=True) or {}
        title = str(payload.get('title', '')).strip()
        body = payload.get('body', '')
        if not title:
            return jsonify({'error': '제목과 내용을 입력해 주세요.'}), 400
        now = now_iso()
        cursor.execute('UPDATE posts SET title=%s, body=%s, updated=%s WHERE id=%s', (title, body, now, post_id))
        media = media_for_post(cursor, post_id)
    return jsonify({'id': post_id, 'board': post['board'], 'title': title, 'body': body,
                     'author': post['author'], 'created': post['created'].isoformat(), 'updated': now,
                     'media': media, 'canEdit': True, 'canDelete': can_delete(member, post, guest, owner_id)})


@posts_bp.delete('/posts/<post_id>')
def delete_post(post_id):
    guest = is_guest_request()
    member = current_member()
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM posts WHERE id=%s', (post_id,))
        post = cursor.fetchone()
        if not post or not can_delete(member, post, guest, peek_guest_owner_id()):
            return jsonify({'error': '삭제 권한이 없거나 이미 삭제된 글입니다.'}), 404
        cursor.execute('SELECT path FROM media WHERE post_id=%s', (post_id,))
        files = [row['path'] for row in cursor.fetchall()]
        cursor.execute('DELETE FROM posts WHERE id=%s', (post_id,))
    for path in files:
        delete_file(path)
    return '', 204


def _require_editable_post(cursor, post_id):
    cursor.execute('SELECT * FROM posts WHERE id=%s', (post_id,))
    post = cursor.fetchone()
    guest = is_guest_request()
    member = current_member()
    if not post or not can_edit(member, post, guest, peek_guest_owner_id()):
        return None
    return post


@posts_bp.post('/posts/<post_id>/media')
def add_post_media(post_id):
    kind = request.form.get('kind')
    file_storage = request.files.get('file')
    if kind not in ('image', 'video') or not file_storage:
        return jsonify({'error': '첨부파일을 확인해 주세요.'}), 400
    db = get_db()
    with db.cursor() as cursor:
        if not _require_editable_post(cursor, post_id):
            return jsonify({'error': '수정 권한이 없습니다.'}), 403
        cursor.execute('SELECT COUNT(*) AS n FROM media WHERE post_id=%s', (post_id,))
        if cursor.fetchone()['n'] >= 10:
            return jsonify({'error': '첨부파일은 최대 10개까지 가능합니다.'}), 400
        try:
            media_id, filename, size = save_upload(kind, file_storage)
        except ValueError as error:
            return jsonify({'error': str(error)}), 400
        cursor.execute(
            'INSERT INTO media (id, post_id, kind, name, mime, path, size) VALUES (%s, %s, %s, %s, %s, %s, %s)',
            (media_id, post_id, kind, file_storage.filename or filename, file_storage.mimetype, filename, size),
        )
    return jsonify({'id': media_id, 'kind': kind, 'name': file_storage.filename or filename,
                     'url': f'/api/media/{media_id}'}), 201


@posts_bp.put('/posts/<post_id>/media/<media_id>')
def replace_post_media(post_id, media_id):
    kind = request.form.get('kind')
    file_storage = request.files.get('file')
    if kind not in ('image', 'video') or not file_storage:
        return jsonify({'error': '첨부파일을 확인해 주세요.'}), 400
    db = get_db()
    with db.cursor() as cursor:
        if not _require_editable_post(cursor, post_id):
            return jsonify({'error': '수정 권한이 없습니다.'}), 403
        cursor.execute('SELECT * FROM media WHERE id=%s AND post_id=%s', (media_id, post_id))
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


@posts_bp.delete('/posts/<post_id>/media/<media_id>')
def delete_post_media(post_id, media_id):
    db = get_db()
    with db.cursor() as cursor:
        if not _require_editable_post(cursor, post_id):
            return jsonify({'error': '수정 권한이 없습니다.'}), 403
        cursor.execute('SELECT path FROM media WHERE id=%s AND post_id=%s', (media_id, post_id))
        existing = cursor.fetchone()
        if existing:
            cursor.execute('DELETE FROM media WHERE id=%s', (media_id,))
    if existing:
        delete_file(existing['path'])
    return '', 204
