"""Run only against a disposable DB_NAME prefixed with tlj_delete_test_."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, '/app/backend')
from app import create_app
from db import get_db, wait_for_schema


class MemberDeleteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['DB_NAME'].startswith('tlj_delete_test_')
        cls.files = tempfile.TemporaryDirectory()
        cls.app = create_app()
        cls.app.config.update(TESTING=True, ADMIN_IDS={'0026', '8802'}, UPLOAD_DIR=cls.files.name)
        wait_for_schema(cls.app, attempts=1)

    @classmethod
    def tearDownClass(cls):
        cls.files.cleanup()

    def test_delete_preserves_posts_and_revokes_identity(self):
        admin, writer, other, guest = [self.app.test_client() for _ in range(4)]
        for client, member_id in [(admin, '0026'), (writer, '1234'), (other, '5678')]:
            self.assertEqual(client.post('/api/auth/register', json={'id': member_id, 'name': '동일 이름'}).status_code, 201)
        with writer.session_transaction() as session:
            old_session = dict(session)
        with self.app.app_context():
            with get_db().cursor() as cursor:
                for board in ['cake', 'notice', 'request']:
                    cursor.execute('INSERT INTO posts (id,board,title,body,author,member,created,updated) '
                                   "VALUES (%s,%s,'제목','본문','동일 이름','1234',NOW(),NOW())", (board, board))
                cursor.execute("INSERT INTO posts (id,board,title,body,author,member,created,updated) VALUES ('other','request','제목','본문','동일 이름','5678',NOW(),NOW())")
                cursor.execute("INSERT INTO drafts (id,board,body) VALUES ('request:new:1234','request','임시')")
                for media_id, post_id, draft_id in [('published','cake',None), ('draft-file',None,'request:new:1234')]:
                    Path(self.files.name, media_id).write_bytes(b'image')
                    cursor.execute("INSERT INTO media (id,post_id,draft_id,kind,name,mime,path,size) VALUES (%s,%s,%s,'image','사진','image/png',%s,5)", (media_id,post_id,draft_id,media_id))
        self.assertEqual(other.delete('/api/users/1234').status_code, 403)
        self.assertEqual(guest.delete('/api/users/1234', headers={'X-TLJ-Guest':'1'}).status_code, 403)
        self.assertEqual(admin.delete('/api/users/0026').status_code, 400)
        second_admin = self.app.test_client()
        self.assertEqual(second_admin.post('/api/auth/register', json={'id':'8802','name':'다른 관리자'}).status_code, 201)
        self.assertEqual(admin.delete('/api/users/8802').status_code, 400)
        self.assertEqual(second_admin.delete('/api/users/0026').status_code, 400)
        self.assertEqual(admin.delete('/api/users/9999').status_code, 404)

        # Fail the last operation to confirm all prior mutations roll back.
        import routes.users as users
        real_get_db = users.get_db
        class BrokenCursor:
            def __init__(self, cursor): self.cursor = cursor
            def __enter__(self): self.cursor.__enter__();return self
            def __exit__(self, *args): return self.cursor.__exit__(*args)
            def execute(self, query, args=None):
                if query.startswith('DELETE FROM members'): raise RuntimeError('injected failure')
                return self.cursor.execute(query,args)
            def __getattr__(self, name): return getattr(self.cursor,name)
        class BrokenDB:
            def __init__(self, db): self.db=db
            def cursor(self): return BrokenCursor(self.db.cursor())
            def __getattr__(self, name): return getattr(self.db,name)
        with patch.object(users, 'get_db', lambda: BrokenDB(real_get_db())):
            with self.assertRaises(RuntimeError): admin.delete('/api/users/1234')
        self.assertEqual(writer.get('/api/me').json['member']['id'], '1234')
        self.assertEqual(admin.get('/api/posts/cake').json['author'], '동일 이름')
        self.assertTrue(Path(self.files.name, 'draft-file').exists())

        self.assertEqual(admin.delete('/api/users/1234').status_code, 204)
        self.assertEqual(admin.delete('/api/users/1234').status_code, 404)
        self.assertNotIn('1234', [row['id'] for row in admin.get('/api/users').json])
        for board in ['cake','notice','request']:
            detail=guest.get('/api/posts/'+board,headers={'X-TLJ-Guest':'1'}).json
            self.assertEqual(detail['author'], '삭제됨')
            self.assertFalse(detail['canEdit']);self.assertFalse(detail['canDelete'])
            rows=guest.get('/api/posts?board='+board,headers={'X-TLJ-Guest':'1'}).json
            self.assertEqual(next(row for row in rows if row['id']==board)['author'], '삭제됨')
        self.assertEqual(admin.get('/api/posts/other').json['author'], '동일 이름')
        self.assertEqual(len(admin.get('/api/posts/cake').json['media']),1)
        self.assertTrue(Path(self.files.name,'published').exists())
        with guest.get('/api/media/published?guest=1') as response:
            self.assertEqual(response.status_code,200)
        self.assertEqual(guest.get('/api/media/published').status_code,404)
        self.assertEqual(guest.get('/api/media/draft-file?guest=1').status_code,404)
        self.assertFalse(Path(self.files.name,'draft-file').exists())
        self.assertIsNone(writer.get('/api/me').json['member'])
        self.assertEqual(writer.post('/api/auth/login',json={'id':'1234'}).status_code,404)
        replacement=self.app.test_client()
        self.assertEqual(replacement.post('/api/auth/register',json={'id':'1234','name':'새 회원'}).status_code,201)
        with writer.session_transaction() as session: session.update(old_session)
        self.assertIsNone(writer.get('/api/me').json['member'])
        self.assertEqual(replacement.get('/api/drafts/request/new').status_code,404)
        self.assertEqual(admin.get('/api/posts/cake').json['author'],'삭제됨')

    def test_legacy_schema_migration(self):
        with self.app.app_context():
            with get_db().cursor() as cursor:
                cursor.execute('ALTER TABLE members DROP COLUMN session_token')
        wait_for_schema(self.app, attempts=1)
        wait_for_schema(self.app, attempts=1)
        with self.app.app_context():
            with get_db().cursor() as cursor:
                cursor.execute('SELECT session_token FROM members')
                self.assertTrue(all(len(row['session_token']) == 36 for row in cursor.fetchall()))
        client = self.app.test_client()
        self.assertEqual(client.post('/api/auth/login', json={'id':'0026'}).status_code,200)
        self.assertEqual(client.get('/api/users').status_code,200)


if __name__ == '__main__':
    unittest.main(verbosity=2)
