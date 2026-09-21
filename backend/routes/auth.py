import json
import re

from flask import Blueprint, jsonify, request, session

from db import get_db
from identity import current_member, is_guest_request
from permissions import default_permissions

auth_bp = Blueprint('auth', __name__)

MEMBER_ID_RE = re.compile(r'^[0-9]{4}$')


def serialize_member(member):
    if not member:
        return None
    return {'id': member['id'], 'name': member['name'], 'permissions': member['permissions']}


@auth_bp.get('/me')
def get_me():
    if is_guest_request():
        return jsonify({'member': None})
    return jsonify({'member': serialize_member(current_member())})


@auth_bp.put('/me')
def update_me():
    member = current_member()
    if not member:
        return jsonify({'error': '로그인이 필요합니다.'}), 401
    name = (request.get_json(silent=True) or {}).get('name', '').strip()
    if not name or len(name) > 30:
        return jsonify({'error': '이름을 1~30자로 입력해 주세요.'}), 400
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('UPDATE members SET name=%s WHERE id=%s', (name, member['id']))
    member['name'] = name
    return jsonify({'member': serialize_member(member)})


@auth_bp.post('/auth/register')
def register():
    payload = request.get_json(silent=True) or {}
    member_id = str(payload.get('id', ''))
    name = str(payload.get('name', '')).strip()
    if not MEMBER_ID_RE.match(member_id):
        return jsonify({'error': '4자리 회원번호를 입력해 주세요.'}), 400
    if not name or len(name) > 30:
        return jsonify({'error': '회원가입 시 이름을 입력해 주세요.'}), 400
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT id FROM members WHERE id=%s', (member_id,))
        if cursor.fetchone():
            return jsonify({'error': '이미 등록된 회원번호입니다.'}), 409
        cursor.execute(
            'INSERT INTO members (id, name, permissions) VALUES (%s, %s, %s)',
            (member_id, name, json.dumps(default_permissions())),
        )
    session['member'] = member_id
    return jsonify({'member': {'id': member_id, 'name': name}}), 201


@auth_bp.post('/auth/login')
def login():
    payload = request.get_json(silent=True) or {}
    member_id = str(payload.get('id', ''))
    if not MEMBER_ID_RE.match(member_id):
        return jsonify({'error': '4자리 회원번호를 입력해 주세요.'}), 400
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT id, name FROM members WHERE id=%s', (member_id,))
        row = cursor.fetchone()
    if not row:
        return jsonify({'error': '등록되지 않은 회원번호입니다. 회원가입 후 이용해 주세요.'}), 404
    session['member'] = member_id
    return jsonify({'member': row})


@auth_bp.post('/auth/logout')
def logout():
    session.pop('member', None)
    return '', 204
