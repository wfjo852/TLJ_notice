BOARDS = {
    'cake': ('케이크 생산', '내일의 생산 목록을 확인하고 준비해 주세요.'),
    'notice': ('공지사항', '매장에 필요한 소식과 안내를 함께 나눠요.'),
    'request': ('필요 물품 요청', '필요한 물품을 누구나 편하게 요청하세요.'),
}
ACTIONS = ('read', 'write', 'edit', 'delete')
ADMIN_ID = '0026'


def default_permissions():
    return {key: {'read': True, 'write': key == 'request', 'edit': key == 'request', 'delete': key == 'request'} for key in BOARDS}


def permissions_for(member):
    result = default_permissions()
    stored = (member or {}).get('permissions') or {}
    for key in result:
        overrides = stored.get(key) or {}
        for action in ACTIONS:
            value = overrides.get(action)
            if isinstance(value, bool):
                result[key][action] = value
    return result


def has_permission(member, board, action):
    return bool(member) and permissions_for(member)[board][action] is True


def is_admin(member):
    return bool(member) and member['id'] == ADMIN_ID


def can_read(member, board, guest):
    return guest or has_permission(member, board, 'read')


def can_write(member, board, guest):
    return (board == 'request') if guest else has_permission(member, board, 'write')


def can_edit(member, post, guest, guest_owner_id):
    if guest:
        return post['board'] == 'request' and not post['member'] and post['owner'] == guest_owner_id
    return has_permission(member, post['board'], 'edit')


def can_delete(member, post, guest, guest_owner_id):
    if guest:
        return post['board'] == 'request' and not post['member'] and post['owner'] == guest_owner_id
    return has_permission(member, post['board'], 'delete')
