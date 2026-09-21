import io
import json
import os
import sys
import tempfile
import unittest
import uuid

sys.path.insert(0, '/app/backend')
from app import create_app
from db import get_db, wait_for_schema
from permissions import BOARDS, can_edit, can_delete, default_permissions, permissions_for


class ScopeRulesTest(unittest.TestCase):
    def test_ownership_matrix(self):
        for board in BOARDS:
            for action, check in [('edit',can_edit),('delete',can_delete)]:
                for own in [False,True]:
                    for others in [False,True]:
                        permissions=default_permissions()
                        permissions[board][action+'Own']=own
                        permissions[board][action+'Others']=others
                        user={'id':'1111','permissions':permissions}
                        for author in ['1111','2222',None]:
                            with self.subTest(board=board, action=action, own=own, others=others, author=author):
                                post={'board':board,'member':author,'owner':None}
                                self.assertEqual(check(user,post,False,None),others or (own and author=='1111'))
                                self.assertFalse(check(None,post,False,None))

    def test_legacy_permissions_and_guest(self):
        values=permissions_for({'permissions':{'cake':{'edit':True,'delete':False},'request':{'edit':False,'delete':True}}})
        self.assertTrue(values['cake']['editOwn']);self.assertTrue(values['cake']['editOthers'])
        self.assertFalse(values['cake']['deleteOwn']);self.assertFalse(values['request']['editOthers'])
        values=permissions_for({'permissions':{'request':{'edit':True,'editOwn':True,'editOthers':False}}})
        self.assertFalse(values['request']['editOthers'])
        for check in [can_edit,can_delete]:
            post={'board':'request','member':None,'owner':'guest-token'}
            self.assertTrue(check(None,post,True,'guest-token'))
            self.assertFalse(check(None,post,True,'other-token'))
            self.assertFalse(check(None,{**post,'owner':None},True,None))


class ScopeApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['DB_NAME'].startswith('tlj_delete_test_')
        cls.files=tempfile.TemporaryDirectory()
        cls.app=create_app()
        cls.app.config.update(TESTING=True,ADMIN_IDS={'0026','8802'},UPLOAD_DIR=cls.files.name)
        wait_for_schema(cls.app,attempts=1)

    @classmethod
    def tearDownClass(cls): cls.files.cleanup()

    def test_api_scopes(self):
        admin=self.app.test_client()
        admin.post('/api/auth/register',json={'id':'0026','name':'관리자'})
        self.assertEqual(admin.post('/api/auth/login',json={'id':'0026'}).status_code,200)
        user=self.app.test_client()
        self.assertEqual(user.post('/api/auth/register',json={'id':'1111','name':'내 글 테스트'}).status_code,201)
        permissions=default_permissions()
        for key in BOARDS:
            permissions[key].update(write=True,editOwn=True,editOthers=False,deleteOwn=True,deleteOthers=False)
        self.assertEqual(admin.put('/api/users/1111',json={'name':'내 글 테스트','permissions':permissions}).status_code,200)
        self.assertEqual(user.get('/api/me').json['member']['permissions'],permissions)
        for board in BOARDS:
            created=user.post('/api/posts',json={'board':board,'title':'내 글','body':'내용'})
            self.assertEqual(created.status_code,201)
            own=created.json['id']
            other=str(uuid.uuid4())
            with self.app.app_context():
                with get_db().cursor() as cursor:
                    cursor.execute("INSERT INTO posts (id,board,title,body,author,member,created,updated) VALUES (%s,%s,'남의 글','내용','다른 회원','5678',NOW(),NOW())",(other,board))
            self.assertTrue(user.get('/api/posts/'+own).json['canEdit'])
            self.assertFalse(user.get('/api/posts/'+other).json['canEdit'])
            self.assertEqual(user.put('/api/posts/'+own,json={'title':'수정','body':'내 글'}).status_code,200)
            self.assertEqual(user.put('/api/posts/'+other,json={'title':'수정','body':'남의 글'}).status_code,403)
            self.assertEqual(user.post('/api/posts/'+other+'/media',data={'kind':'image','file':(io.BytesIO(b'image'),'a.png','image/png')}).status_code,403)
            self.assertEqual(user.delete('/api/posts/'+other).status_code,404)
            self.assertEqual(user.delete('/api/posts/'+own).status_code,204)
            permissions[board].update(editOwn=False,editOthers=True,deleteOwn=False,deleteOthers=True)
            response=admin.put('/api/users/1111',json={'name':'내 글 테스트','permissions':permissions})
            self.assertEqual(response.status_code,200)
            permissions=response.json['permissions']
            self.assertTrue(permissions[board]['editOwn'])
            self.assertEqual(user.put('/api/posts/'+other,json={'title':'전체 수정','body':'허용'}).status_code,200)
            self.assertEqual(user.delete('/api/posts/'+other).status_code,204)
        # Write permission does not imply permission to edit/delete the new post.
        permissions['request'].update(editOwn=False,editOthers=False,deleteOwn=False,deleteOthers=False)
        admin.put('/api/users/1111',json={'name':'내 글 테스트','permissions':permissions})
        created=user.post('/api/posts',json={'board':'request','title':'작성 전용','body':'내용'})
        self.assertFalse(created.json['canEdit']);self.assertFalse(created.json['canDelete'])
        bad={**permissions,'cake':{'read':True}}
        self.assertEqual(admin.put('/api/users/1111',json={'name':'테스트','permissions':bad}).status_code,400)
        self.assertEqual(user.put('/api/users/1111',json={'name':'테스트','permissions':permissions}).status_code,403)
        with self.app.app_context():
            with get_db().cursor() as cursor:
                cursor.execute('UPDATE members SET permissions=%s WHERE id=%s',(json.dumps({'request':{'edit':True,'delete':False}}),'1111'))
        record=next(row for row in admin.get('/api/users').json if row['id']=='1111')
        self.assertTrue(record['permissions']['request']['editOthers'])
        self.assertFalse(record['permissions']['request']['deleteOwn'])


if __name__=='__main__': unittest.main(verbosity=2)
