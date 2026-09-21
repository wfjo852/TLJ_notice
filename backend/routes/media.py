from flask import Blueprint, abort, current_app, send_from_directory

from db import get_db
from identity import current_member, is_guest_request, peek_guest_owner_id
from permissions import can_read

media_bp = Blueprint('media', __name__)


def _own_draft(draft_id):
    member = current_member()
    identity = member['id'] if member else f'guest-{peek_guest_owner_id()}'
    return draft_id.endswith(f':{identity}')


@media_bp.get('/media/<media_id>')
def get_media(media_id):
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM media WHERE id=%s', (media_id,))
        row = cursor.fetchone()
        if not row:
            abort(404)
        if row['post_id']:
            cursor.execute('SELECT board FROM posts WHERE id=%s', (row['post_id'],))
            post = cursor.fetchone()
            guest = is_guest_request()
            member = current_member()
            if not post or not can_read(member, post['board'], guest):
                abort(404)
        elif not _own_draft(row['draft_id']):
            abort(404)
    response = send_from_directory(current_app.config['UPLOAD_DIR'], row['path'], mimetype=row['mime'])
    response.headers['Cache-Control'] = 'no-cache'
    return response
