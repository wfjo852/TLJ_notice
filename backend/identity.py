import json
import uuid

from flask import g, request, session

from db import get_db

GUEST_COOKIE = 'tlj_guest'
GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5


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
    if member_id and not member:
        session.pop('member', None)
    g.member_cache = member
    return member


def guest_owner_id():
    """Return this browser's guest-owner id, issuing a new one via a pending
    cookie (applied by the after_request hook in app.py) if none exists yet."""
    owner = request.cookies.get(GUEST_COOKIE)
    if owner:
        return owner
    owner = uuid.uuid4().hex
    g.new_guest_cookie = owner
    return owner


def peek_guest_owner_id():
    return request.cookies.get(GUEST_COOKIE)


def apply_pending_guest_cookie(response):
    owner = g.pop('new_guest_cookie', None)
    if owner:
        response.set_cookie(
            GUEST_COOKIE, owner,
            max_age=GUEST_COOKIE_MAX_AGE, httponly=True, samesite='Lax',
        )
    return response
