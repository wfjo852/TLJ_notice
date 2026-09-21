import json

from flask import Blueprint, current_app, jsonify, request

from db import get_db
from identity import current_member
from media_store import delete_file
from permissions import ACTIONS, BOARDS, is_admin, permissions_for

users_bp = Blueprint('users', __name__)


def serialize_member(row):
    permissions = row['permissions']
    if isinstance(permissions, str):
        permissions = json.loads(permissions)
    return {'id': row['id'], 'name': row['name'],
            'permissions': permissions_for({'permissions': permissions}), 'isAdmin': is_admin(row)}


@users_bp.get('/users')
def list_users():
    member = current_member()
    if not is_admin(member):
        return jsonify({'error': '관리자만 조회할 수 있습니다.'}), 403
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM members ORDER BY id')
        rows = cursor.fetchall()
    return jsonify([serialize_member(row) for row in rows])


@users_bp.put('/users/<user_id>')
def update_user(user_id):
    member = current_member()
    if not is_admin(member):
        return jsonify({'error': '관리자만 변경할 수 있습니다.'}), 403
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name', '')).strip()
    permissions = payload.get('permissions') or {}
    if not name or len(name) > 30:
        return jsonify({'error': '이름을 1~30자로 입력해 주세요.'}), 400
    normalized = {}
    for key in BOARDS:
        normalized[key] = {}
        for action in ACTIONS:
            value = (permissions.get(key) or {}).get(action)
            if not isinstance(value, bool):
                return jsonify({'error': '권한 설정을 확인해 주세요.'}), 400
            normalized[key][action] = value
    normalized = permissions_for({'permissions': normalized})
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT id FROM members WHERE id=%s', (user_id,))
        if not cursor.fetchone():
            return jsonify({'error': '사용자를 찾을 수 없습니다.'}), 404
        cursor.execute('UPDATE members SET name=%s, permissions=%s WHERE id=%s',
                        (name, json.dumps(normalized), user_id))
    return jsonify({'id': user_id, 'name': name, 'permissions': normalized, 'isAdmin': is_admin({'id': user_id})})


@users_bp.delete('/users/<user_id>')
def delete_user(user_id):
    member = current_member()
    if not is_admin(member):
        return jsonify({'error': '관리자만 삭제할 수 있습니다.'}), 403
    if user_id == member['id']:
        return jsonify({'error': '현재 로그인한 관리자 본인은 삭제할 수 없습니다.'}), 400
    db = get_db()
    files = []
    db.begin()
    try:
        with db.cursor() as cursor:
            cursor.execute('SELECT id FROM members WHERE id=%s FOR UPDATE', (user_id,))
            if not cursor.fetchone():
                db.rollback()
                return jsonify({'error': '사용자를 찾을 수 없습니다.'}), 404
            # Keep published posts and attachments, detach their former identity.
            cursor.execute("UPDATE posts SET author=%s, member=NULL, owner=NULL WHERE member=%s",
                           ('삭제됨', user_id))
            cursor.execute('SELECT media.path FROM media JOIN drafts ON media.draft_id=drafts.id '
                           "WHERE SUBSTRING_INDEX(drafts.id, ':', -1)=%s", (user_id,))
            files = [row['path'] for row in cursor.fetchall()]
            cursor.execute("DELETE FROM drafts WHERE SUBSTRING_INDEX(id, ':', -1)=%s", (user_id,))
            cursor.execute('DELETE FROM members WHERE id=%s', (user_id,))
        db.commit()
    except Exception:
        db.rollback()
        raise
    for path in files:
        try:
            delete_file(path)
        except OSError:
            current_app.logger.warning('Deleted member draft file cleanup failed', exc_info=True)
    return '', 204
