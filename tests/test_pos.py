import io
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, '/app/backend')
from PIL import Image

from app import create_app
from db import wait_for_schema
from routes import pos


def png(width, height):
    buffer = io.BytesIO()
    Image.new('RGBA', (width, height), (200, 80, 40, 128)).save(buffer, 'PNG')
    return buffer.getvalue()


class PosApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['DB_NAME'].startswith('tlj_delete_test_')
        cls.files = tempfile.TemporaryDirectory()
        cls.app = create_app()
        cls.app.config.update(TESTING=True, ADMIN_IDS={'0026'}, UPLOAD_DIR=cls.files.name)
        wait_for_schema(cls.app, attempts=1)

    @classmethod
    def tearDownClass(cls): cls.files.cleanup()

    def test_pos_flow(self):
        admin = self.app.test_client()
        admin.post('/api/auth/register', json={'id': '0026', 'name': '관리자'})
        self.assertEqual(admin.post('/api/auth/login', json={'id': '0026'}).status_code, 200)
        guest = self.app.test_client()
        self.assertFalse(guest.get('/api/pos', headers={'X-TLJ-Guest': '1'}).json['canEdit'])
        self.assertEqual(guest.post('/api/pos/categories', json={'section': 'bread', 'name': 'x'}).status_code, 403)

        with mock.patch.object(pos, '_scrape', return_value=('오지치즈 포카치아', '설명\n둘째 줄', png(720, 720))):
            created = admin.post('/api/pos/products', json={'prodNum': '5571'})
        self.assertEqual(created.status_code, 201)
        product = created.json
        self.assertEqual((product['prodNum'], product['name']), (5571, '오지치즈 포카치아'))
        image = admin.get(product['image'])
        with Image.open(io.BytesIO(image.data)) as saved:
            self.assertEqual((saved.format, saved.size, saved.mode), ('WEBP', (200, 200), 'RGBA'))
        image.close()
        self.assertEqual(admin.post('/api/pos/products', json={'prodNum': '5571'}).status_code, 409)
        with mock.patch.object(pos, '_scrape', side_effect=LookupError):
            self.assertEqual(admin.post('/api/pos/products', json={'prodNum': '1'}).status_code, 404)
        manual = admin.post('/api/pos/products', json={'name': '수동 제품'}).json
        self.assertIsNone(manual['prodNum'])
        self.assertEqual(admin.put(f"/api/pos/products/{manual['id']}", json={
            'name': '수동', 'description': '설명', 'content': '메모', 'price': 3500}).status_code, 204)
        self.assertEqual(admin.put(f"/api/pos/products/{manual['id']}", json={'name': '수동', 'price': -1}).status_code, 400)
        uploaded = admin.post(f"/api/pos/products/{manual['id']}/image",
                              data={'file': (io.BytesIO(png(400, 100)), 'a.png', 'image/png')})
        self.assertEqual(uploaded.status_code, 200)

        first = admin.post('/api/pos/categories', json={'section': 'bread', 'name': '간식빵'}).json['id']
        second = admin.post('/api/pos/categories', json={'section': 'bread', 'name': '식빵'}).json['id']
        self.assertEqual(admin.put('/api/pos/categories/order', json={'ids': [second, first]}).status_code, 204)
        cells = [[0, 0, product['id']], [1, 19, manual['id']]]
        self.assertEqual(admin.put(f'/api/pos/categories/{first}/layout', json={'pages': 2, 'cells': cells}).status_code, 204)
        self.assertEqual(admin.put(f'/api/pos/categories/{second}/layout', json={'pages': 1, 'cells': [[0, 3, product['id']]]}).status_code, 204)
        for bad in [{'pages': 1, 'cells': cells}, {'pages': 2, 'cells': [[0, 0, 1], [0, 0, 2]]}, {'pages': 2, 'cells': [[0, 20, 1]]}]:
            self.assertEqual(admin.put(f'/api/pos/categories/{first}/layout', json=bad).status_code, 400)
        self.assertEqual(admin.put(f'/api/pos/categories/{first}/layout', json={'pages': 1, 'cells': [[0, 0, 999999]]}).status_code, 409)

        state = admin.get('/api/pos').json
        self.assertTrue(state['canEdit'])
        bread = [c for c in state['categories'] if c['section'] == 'bread']
        self.assertEqual([c['name'] for c in bread], ['식빵', '간식빵'])
        self.assertEqual(sorted(bread[1]['cells']), cells)
        self.assertEqual(bread[1]['pages'], 2)

        filename = product['image'].rsplit('/', 1)[1]
        self.assertEqual(admin.delete(f"/api/pos/products/{product['id']}").status_code, 204)
        self.assertFalse(os.path.exists(os.path.join(self.files.name, 'pos', filename)))
        state = admin.get('/api/pos').json
        self.assertEqual([c['cells'] for c in state['categories'] if c['id'] in (first, second)], [[], [[1, 19, manual['id']]]])
        self.assertEqual(admin.delete(f'/api/pos/categories/{first}').status_code, 204)
        self.assertEqual(len(admin.get('/api/pos').json['products']), 1)


if __name__ == '__main__':
    unittest.main()
