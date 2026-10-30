import json

from flask import g, request, session

from db import get_db


def is_guest_request():
    return request.headers.get('X-TLJ-Guest') == '1'


def _load_member(member_id):
    if not member_id:
        return None
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM members WHERE id=%s', (member_id,))
        row = cursor.fetchone()
    if row and isinstance(row['permissions'], str):
        row['permissions'] = json.loads(row['permissions'])
    return row


def current_member():
    """Resolve (and cache for the lifetime of this request) the logged-in
    member row, since several permission checks call this per request."""
    if is_guest_request():
        return None
    if 'member_cache' in g:
        return g.member_cache
    member_id = session.get('member')
    member = _load_member(member_id)
    if member and session.get('member_token') != member['session_token']:
        member = None
    if member_id and not member:
        session.pop('member', None)
        session.pop('member_token', None)
    g.member_cache = member
    return member
