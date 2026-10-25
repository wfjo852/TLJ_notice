import re
import uuid
from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, request

from db import get_db
from identity import current_member
from permissions import is_admin

claims_bp = Blueprint('claims', __name__)


def _now():
    return datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)


def _utc(value):
    return value.replace(tzinfo=timezone.utc).isoformat()


def _author(member, payload):
    if member:
        return member['name']
    return str(payload.get('guestName', '')).strip()[:30] or '비회원'


def _serialize_claim(row):
    return {
        'id': row['id'], 'phone': row['phone'], 'purchaseDate': row['purchase_date'].isoformat(),
        'item': row['item'], 'content': row['content'], 'resolved': bool(row['resolved']),
        'author': row['author'], 'created': _utc(row['created']), 'updated': _utc(row['updated']),
    }


def _serialize_comment(row):
    return {'id': row['id'], 'body': row['body'], 'author': row['author'], 'created': _utc(row['created'])}


def _insert_comment(cursor, claim_id, body, author, member):
    cursor.execute(
        'INSERT INTO claim_comments (id, claim_id, body, author, member, created) VALUES (%s, %s, %s, %s, %s, %s)',
        (str(uuid.uuid4()), claim_id, body, author, member['id'] if member else None, _now()),
    )


@claims_bp.get('/claims')
def list_claims():
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute(
            'SELECT * FROM (SELECT c.*, '
            'COUNT(*) OVER (PARTITION BY phone) AS claim_count, '
            'SUM(1 - resolved) OVER (PARTITION BY phone) AS open_count, '
            'ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created DESC, id DESC) AS rn '
            'FROM claims c) latest WHERE rn = 1 ORDER BY created DESC'
        )
        rows = cursor.fetchall()
    return jsonify([dict(_serialize_claim(row), count=int(row['claim_count']), openCount=int(row['open_count']))
                    for row in rows])


def _claim_fields(payload):
    phone = re.sub(r'\D', '', str(payload.get('phone', '')))
    item = str(payload.get('item', '')).strip()
    content = str(payload.get('content', '')).strip()
    if not 8 <= len(phone) <= 11:
        return None, '연락처를 정확히 입력해 주세요.'
    try:
        purchase_date = date.fromisoformat(str(payload.get('purchaseDate', '')))
    except ValueError:
        return None, '구매 날짜를 입력해 주세요.'
    if not item or not content:
        return None, '구매 물품과 클레임 내용을 입력해 주세요.'
    if len(item) > 100 or len(content) > 5000:
        return None, '입력 내용이 너무 깁니다.'
    return (phone, purchase_date, item, content), None


def _claim_exists(cursor, claim_id):
    cursor.execute('SELECT id FROM claims WHERE id=%s', (claim_id,))
    return cursor.fetchone() is not None


@claims_bp.post('/claims')
def create_claim():
    member = current_member()
    payload = request.get_json(silent=True) or {}
    fields, error = _claim_fields(payload)
    if error:
        return jsonify({'error': error}), 400
    phone, purchase_date, item, content = fields
    comment = str(payload.get('comment', '')).strip()
    if len(comment) > 5000:
        return jsonify({'error': '입력 내용이 너무 깁니다.'}), 400
    claim_id = str(uuid.uuid4())
    now = _now()
    author = _author(member, payload)
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute(
            'INSERT INTO claims (id, phone, purchase_date, item, content, resolved, author, member, created, updated) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
            (claim_id, phone, purchase_date, item, content, bool(payload.get('resolved')), author,
             member['id'] if member else None, now, now),
        )
        if comment:
            _insert_comment(cursor, claim_id, comment, author, member)
    return jsonify({'id': claim_id}), 201


@claims_bp.get('/claims/<claim_id>')
def get_claim(claim_id):
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM claims WHERE id=%s', (claim_id,))
        claim = cursor.fetchone()
        if not claim:
            return jsonify({'error': '삭제되었거나 존재하지 않는 클레임입니다.'}), 404
        cursor.execute('SELECT * FROM claim_comments WHERE claim_id=%s ORDER BY created, id', (claim_id,))
        comments = cursor.fetchall()
        cursor.execute('SELECT * FROM claims WHERE phone=%s AND id<>%s ORDER BY created DESC, id DESC',
                       (claim['phone'], claim_id))
        history = cursor.fetchall()
    result = _serialize_claim(claim)
    result['comments'] = [_serialize_comment(row) for row in comments]
    result['history'] = [_serialize_claim(row) for row in history]
    result['canDelete'] = is_admin(current_member())
    return jsonify(result)


@claims_bp.patch('/claims/<claim_id>')
def update_claim(claim_id):
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload.get('resolved'), bool):
        return jsonify({'error': '처리 여부를 확인해 주세요.'}), 400
    db = get_db()
    with db.cursor() as cursor:
        if not _claim_exists(cursor, claim_id):
            return jsonify({'error': '삭제되었거나 존재하지 않는 클레임입니다.'}), 404
        cursor.execute('UPDATE claims SET resolved=%s, updated=%s WHERE id=%s',
                       (payload['resolved'], _now(), claim_id))
    return jsonify({'resolved': payload['resolved']})


@claims_bp.put('/claims/<claim_id>')
def edit_claim(claim_id):
    fields, error = _claim_fields(request.get_json(silent=True) or {})
    if error:
        return jsonify({'error': error}), 400
    db = get_db()
    with db.cursor() as cursor:
        if not _claim_exists(cursor, claim_id):
            return jsonify({'error': '삭제되었거나 존재하지 않는 클레임입니다.'}), 404
        cursor.execute('UPDATE claims SET phone=%s, purchase_date=%s, item=%s, content=%s, updated=%s WHERE id=%s',
                       (*fields, _now(), claim_id))
    return '', 204


def _comment_body(payload):
    body = str(payload.get('body', '')).strip()
    if not body:
        return None, '처리 방법을 입력해 주세요.'
    if len(body) > 5000:
        return None, '입력 내용이 너무 깁니다.'
    return body, None


def _comments_response(cursor, claim_id, status=200):
    cursor.execute('UPDATE claims SET updated=%s WHERE id=%s', (_now(), claim_id))
    cursor.execute('SELECT * FROM claim_comments WHERE claim_id=%s ORDER BY created, id', (claim_id,))
    return jsonify([_serialize_comment(row) for row in cursor.fetchall()]), status


def _comment_exists(cursor, claim_id, comment_id):
    cursor.execute('SELECT id FROM claim_comments WHERE id=%s AND claim_id=%s', (comment_id, claim_id))
    return cursor.fetchone() is not None


@claims_bp.post('/claims/<claim_id>/comments')
def add_comment(claim_id):
    member = current_member()
    payload = request.get_json(silent=True) or {}
    body, error = _comment_body(payload)
    if error:
        return jsonify({'error': error}), 400
    db = get_db()
    with db.cursor() as cursor:
        if not _claim_exists(cursor, claim_id):
            return jsonify({'error': '삭제되었거나 존재하지 않는 클레임입니다.'}), 404
        _insert_comment(cursor, claim_id, body, _author(member, payload), member)
        return _comments_response(cursor, claim_id, 201)


@claims_bp.put('/claims/<claim_id>/comments/<comment_id>')
def edit_comment(claim_id, comment_id):
    body, error = _comment_body(request.get_json(silent=True) or {})
    if error:
        return jsonify({'error': error}), 400
    db = get_db()
    with db.cursor() as cursor:
        if not _comment_exists(cursor, claim_id, comment_id):
            return jsonify({'error': '삭제되었거나 존재하지 않는 댓글입니다.'}), 404
        cursor.execute('UPDATE claim_comments SET body=%s WHERE id=%s', (body, comment_id))
        return _comments_response(cursor, claim_id)


@claims_bp.delete('/claims/<claim_id>/comments/<comment_id>')
def delete_comment(claim_id, comment_id):
    db = get_db()
    with db.cursor() as cursor:
        if not _comment_exists(cursor, claim_id, comment_id):
            return jsonify({'error': '삭제되었거나 존재하지 않는 댓글입니다.'}), 404
        cursor.execute('DELETE FROM claim_comments WHERE id=%s', (comment_id,))
        return _comments_response(cursor, claim_id)


@claims_bp.delete('/claims/<claim_id>')
def delete_claim(claim_id):
    if not is_admin(current_member()):
        return jsonify({'error': '관리자만 삭제할 수 있습니다.'}), 403
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('DELETE FROM claims WHERE id=%s', (claim_id,))
    return '', 204
