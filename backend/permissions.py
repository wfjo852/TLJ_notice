from flask import current_app

BOARDS = {
    'cake': ('케이크 생산', '내일의 생산 목록을 확인하고 준비해 주세요.'),
    'notice': ('공지사항', '매장에 필요한 소식과 안내를 함께 나눠요.'),
    'request': ('필요 물품 요청', '필요한 물품을 누구나 편하게 요청하세요.'),
}
ACTIONS = ('read', 'write', 'editOwn', 'editOthers', 'deleteOwn', 'deleteOthers')


def default_permissions():
    return {key: {'read': True, 'write': key == 'request',
                  'editOwn': key == 'request', 'editOthers': key == 'request',
                  'deleteOwn': key == 'request', 'deleteOthers': key == 'request'} for key in BOARDS}


def permissions_for(member):
    result = default_permissions()
    stored = (member or {}).get('permissions') or {}
    for key in result:
        overrides = stored.get(key) or {}
        for action in ACTIONS:
            value = overrides.get(action)
            # Existing broad edit/delete grants retain their original scope.
            if action not in overrides and action.startswith(('edit', 'delete')):
                value = overrides.get('edit' if action.startswith('edit') else 'delete')
            if isinstance(value, bool):
                result[key][action] = value
        for action in ('edit', 'delete'):
            if result[key][action + 'Others']:
                result[key][action + 'Own'] = True
    return result


def has_permission(member, board, action):
    return bool(member) and permissions_for(member)[board][action] is True


def is_admin(member):
    return bool(member) and member['id'] in current_app.config['ADMIN_IDS']


def can_read(member, board, guest):
    return guest or has_permission(member, board, 'read')


def can_write(member, board, guest):
    return (board == 'request') if guest else has_permission(member, board, 'write')


def can_edit(member, post, guest, guest_owner_id):
    if guest:
        return bool(guest_owner_id) and post['board'] == 'request' and not post['member'] and post['owner'] == guest_owner_id
    return can_change(member, post, 'edit')


def can_delete(member, post, guest, guest_owner_id):
    if guest:
        return bool(guest_owner_id) and post['board'] == 'request' and not post['member'] and post['owner'] == guest_owner_id
    return can_change(member, post, 'delete')


def can_change(member, post, action):
    if not member:
        return False
    own_post = post.get('member') == member['id']
    return (has_permission(member, post['board'], action + 'Others') or
            (own_post and has_permission(member, post['board'], action + 'Own')))
