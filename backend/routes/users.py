import json

from flask import Blueprint, jsonify, request

from db import get_db
from identity import current_member
from permissions import ACTIONS, BOARDS, is_admin

users_bp = Blueprint('users', __name__)


def serialize_member(row):
    permissions = row['permissions']
    if isinstance(permissions, str):
        permissions = json.loads(permissions)
    return {'id': row['id'], 'name': row['name'], 'permissions': permissions}


@users_bp.get('/users')
def list_users():
    member = current_member()
    if not is_admin(member):
        return jsonify({'error': '0026 사용자만 조회할 수 있습니다.'}), 403
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM members ORDER BY id')
        rows = cursor.fetchall()
    return jsonify([serialize_member(row) for row in rows])


@users_bp.put('/users/<user_id>')
def update_user(user_id):
    member = current_member()
    if not is_admin(member):
        return jsonify({'error': '0026 사용자만 변경할 수 있습니다.'}), 403
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
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT id FROM members WHERE id=%s', (user_id,))
        if not cursor.fetchone():
            return jsonify({'error': '사용자를 찾을 수 없습니다.'}), 404
        cursor.execute('UPDATE members SET name=%s, permissions=%s WHERE id=%s',
                        (name, json.dumps(normalized), user_id))
    return jsonify({'id': user_id, 'name': name, 'permissions': normalized})
