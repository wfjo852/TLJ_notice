import html
import io
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote
from urllib.request import Request, urlopen

import pymysql
from flask import Blueprint, jsonify, request, send_from_directory
from PIL import Image

from db import get_db
from identity import current_member
from media_store import upload_dir
from permissions import is_admin

pos_bp = Blueprint('pos', __name__)

TLJ = 'https://www.tlj.co.kr'
SECTIONS = ('bread', 'sandwich')
SLOTS, MAX_PAGES = 20, 20
IMAGE_WIDTH = 100


def _now():
    return datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)


def _error(message, status=400):
    return jsonify({'error': message}), status


@pos_bp.before_request
def _admin_only():
    if request.method != 'GET' and not is_admin(current_member()):
        return _error('관리자만 수정할 수 있습니다.', 403)


def _image_dir():
    path = upload_dir() / 'pos'
    path.mkdir(exist_ok=True)
    return path


def _fetch(url, limit):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=10) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise OSError('response too large')
    return data


def _text(value):
    return html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'<br\s*/?>', '\n', value, flags=re.I))).strip()


def _scrape(prod_num):
    """Return (name, description, image bytes or None) from the TLJ product page."""
    page = _fetch(f'{TLJ}/product/detail.asp?prod_num={prod_num}', 2_000_000).decode('cp949', 'replace')
    name = re.search(r'<span class="name">(.*?)</span>', page, re.S)
    if not name or not _text(name.group(1)):
        raise LookupError(prod_num)
    description = re.search(r'<li class="tit">제품설명</li>\s*<li>(.*?)</li>', page, re.S)
    image = re.search(r'<img src="(/data/product/[^"]+)"', page)
    image_data = _fetch(TLJ + quote(html.unescape(image.group(1)), safe='/()_-.~%'), 5_000_000) if image else None
    return _text(name.group(1))[:100], _text(description.group(1)) if description else '', image_data


def _save_image(data):
    with Image.open(io.BytesIO(data)) as source:
        image = source.convert('RGBA' if 'A' in source.getbands() or 'transparency' in source.info else 'RGB')
    image.thumbnail((IMAGE_WIDTH, IMAGE_WIDTH * 10))
    filename = f'{uuid.uuid4().hex}.webp'
    image.save(_image_dir() / filename, 'WEBP', quality=80)
    return filename


def _replace_image(cursor, product_id, filename):
    cursor.execute('SELECT image FROM pos_products WHERE id=%s', (product_id,))
    old = cursor.fetchone()['image']
    cursor.execute('UPDATE pos_products SET image=%s, updated=%s WHERE id=%s', (filename, _now(), product_id))
    if old:
        (_image_dir() / old).unlink(missing_ok=True)


def _product(cursor, product_id):
    cursor.execute('SELECT * FROM pos_products WHERE id=%s', (product_id,))
    return cursor.fetchone()


def _serialize_product(row):
    return {
        'id': row['id'], 'prodNum': row['prod_num'], 'name': row['name'], 'description': row['description'],
        'content': row['content'], 'price': row['price'],
        'image': f"/api/pos/images/{row['image']}" if row['image'] else None,
    }


@pos_bp.get('/pos')
def get_pos():
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM pos_categories ORDER BY section, position, id')
        categories = cursor.fetchall()
        cursor.execute('SELECT * FROM pos_products ORDER BY name')
        products = cursor.fetchall()
        cursor.execute('SELECT * FROM pos_cells')
        cells = cursor.fetchall()
    return jsonify({
        'categories': [{
            'id': c['id'], 'section': c['section'], 'name': c['name'], 'pages': c['pages'],
            'cells': [[x['page'], x['slot'], x['product_id']] for x in cells if x['category_id'] == c['id']],
        } for c in categories],
        'products': [_serialize_product(row) for row in products],
        'canEdit': is_admin(current_member()),
    })


@pos_bp.get('/pos/images/<name>')
def get_image(name):
    return send_from_directory(_image_dir(), name, mimetype='image/webp', max_age=31536000)


def _category_name(payload):
    name = str(payload.get('name', '')).strip()
    return name if 0 < len(name) <= 30 else None


@pos_bp.post('/pos/categories')
def create_category():
    payload = request.get_json(silent=True) or {}
    name = _category_name(payload)
    if payload.get('section') not in SECTIONS or not name:
        return _error('분류 이름을 1~30자로 입력해 주세요.')
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute(
            'INSERT INTO pos_categories (section, name, position) '
            'SELECT %s, %s, COALESCE(MAX(position), -1) + 1 FROM pos_categories WHERE section=%s',
            (payload['section'], name, payload['section']),
        )
        return jsonify({'id': cursor.lastrowid}), 201


@pos_bp.patch('/pos/categories/<int:category_id>')
def rename_category(category_id):
    name = _category_name(request.get_json(silent=True) or {})
    if not name:
        return _error('분류 이름을 1~30자로 입력해 주세요.')
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('UPDATE pos_categories SET name=%s WHERE id=%s', (name, category_id))
    return '', 204


@pos_bp.delete('/pos/categories/<int:category_id>')
def delete_category(category_id):
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('DELETE FROM pos_categories WHERE id=%s', (category_id,))
    return '', 204


@pos_bp.put('/pos/categories/order')
def order_categories():
    ids = (request.get_json(silent=True) or {}).get('ids')
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        return _error('분류 순서를 확인해 주세요.')
    db = get_db()
    with db.cursor() as cursor:
        cursor.executemany('UPDATE pos_categories SET position=%s WHERE id=%s', list(enumerate(ids)))
    return '', 204


@pos_bp.put('/pos/categories/<int:category_id>/layout')
def save_layout(category_id):
    payload = request.get_json(silent=True) or {}
    pages, cells = payload.get('pages'), payload.get('cells')
    if not isinstance(pages, int) or not 1 <= pages <= MAX_PAGES or not isinstance(cells, list):
        return _error(f'페이지는 1~{MAX_PAGES}개까지 만들 수 있습니다.')
    rows = set()
    for cell in cells:
        if (not isinstance(cell, list) or len(cell) != 3 or not all(isinstance(v, int) for v in cell)
                or not 0 <= cell[0] < pages or not 0 <= cell[1] < SLOTS):
            return _error('그리드 배치를 확인해 주세요.')
        rows.add((category_id, *cell))
    if len({(r[1], r[2]) for r in rows}) != len(rows):
        return _error('한 칸에는 제품 하나만 놓을 수 있습니다.')
    db = get_db()
    db.begin()
    try:
        with db.cursor() as cursor:
            cursor.execute('UPDATE pos_categories SET pages=%s WHERE id=%s', (pages, category_id))
            if not cursor.rowcount:
                cursor.execute('SELECT id FROM pos_categories WHERE id=%s', (category_id,))
                if not cursor.fetchone():
                    db.rollback()
                    return _error('삭제되었거나 존재하지 않는 분류입니다.', 404)
            cursor.execute('DELETE FROM pos_cells WHERE category_id=%s', (category_id,))
            cursor.executemany('INSERT INTO pos_cells (category_id, page, slot, product_id) VALUES (%s, %s, %s, %s)',
                               list(rows))
        db.commit()
    except pymysql.err.IntegrityError:
        db.rollback()
        return _error('삭제된 제품이 있습니다. 새로고침해 주세요.', 409)
    return '', 204


@pos_bp.post('/pos/products')
def create_product():
    payload = request.get_json(silent=True) or {}
    prod_num = str(payload.get('prodNum') or '').strip()
    description, image = '', None
    db = get_db()
    with db.cursor() as cursor:
        if prod_num:
            if not prod_num.isdigit() or len(prod_num) > 9:
                return _error('제품번호는 숫자로 입력해 주세요.')
            cursor.execute('SELECT id FROM pos_products WHERE prod_num=%s', (prod_num,))
            if cursor.fetchone():
                return _error('이미 등록된 제품번호입니다.', 409)
            try:
                name, description, image_data = _scrape(prod_num)
                image = _save_image(image_data) if image_data else None
            except LookupError:
                return _error('홈페이지에서 제품을 찾을 수 없습니다. 수동으로 추가해 주세요.', 404)
            except OSError:
                return _error('뚜레쥬르 홈페이지에서 가져오지 못했습니다.', 502)
        else:
            name = str(payload.get('name', '')).strip()
            if not 0 < len(name) <= 100:
                return _error('제품번호 또는 제품명을 입력해 주세요.')
        cursor.execute(
            'INSERT INTO pos_products (prod_num, name, description, content, price, image, updated) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s)',
            (int(prod_num) if prod_num else None, name, description, '', None, image, _now()),
        )
        return jsonify(_serialize_product(_product(cursor, cursor.lastrowid))), 201


@pos_bp.put('/pos/products/<int:product_id>')
def edit_product(product_id):
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name', '')).strip()
    description = str(payload.get('description', '')).strip()
    content = str(payload.get('content', '')).strip()
    price = payload.get('price')
    if not 0 < len(name) <= 100:
        return _error('제품명을 1~100자로 입력해 주세요.')
    if len(description) > 5000 or len(content) > 5000:
        return _error('입력 내용이 너무 깁니다.')
    if price is not None and (not isinstance(price, int) or not 0 <= price <= 10_000_000):
        return _error('가격을 확인해 주세요.')
    db = get_db()
    with db.cursor() as cursor:
        cursor.execute('UPDATE pos_products SET name=%s, description=%s, content=%s, price=%s, updated=%s WHERE id=%s',
                       (name, description, content, price, _now(), product_id))
    return '', 204


@pos_bp.post('/pos/products/<int:product_id>/image')
def upload_image(product_id):
    file = request.files.get('file')
    if not file:
        return _error('이미지를 선택해 주세요.')
    db = get_db()
    with db.cursor() as cursor:
        if not _product(cursor, product_id):
            return _error('삭제되었거나 존재하지 않는 제품입니다.', 404)
        try:
            filename = _save_image(file.read(10 * 1024 * 1024))
        except OSError:
            return _error('이미지 파일을 읽을 수 없습니다.')
        _replace_image(cursor, product_id, filename)
        return jsonify(_serialize_product(_product(cursor, product_id)))


@pos_bp.post('/pos/products/<int:product_id>/refresh')
def refresh_product(product_id):
    db = get_db()
    with db.cursor() as cursor:
        product = _product(cursor, product_id)
        if not product or not product['prod_num']:
            return _error('제품번호가 있는 제품만 갱신할 수 있습니다.', 404)
        try:
            _, description, image_data = _scrape(product['prod_num'])
            filename = _save_image(image_data) if image_data else None
        except LookupError:
            return _error('홈페이지에서 제품을 찾을 수 없습니다.', 404)
        except OSError:
            return _error('뚜레쥬르 홈페이지에서 가져오지 못했습니다.', 502)
        cursor.execute('UPDATE pos_products SET description=%s, updated=%s WHERE id=%s',
                       (description, _now(), product_id))
        if filename:
            _replace_image(cursor, product_id, filename)
        return jsonify(_serialize_product(_product(cursor, product_id)))


@pos_bp.delete('/pos/products/<int:product_id>')
def delete_product(product_id):
    db = get_db()
    with db.cursor() as cursor:
        product = _product(cursor, product_id)
        if product:
            cursor.execute('DELETE FROM pos_products WHERE id=%s', (product_id,))
            if product['image']:
                (_image_dir() / product['image']).unlink(missing_ok=True)
    return '', 204
