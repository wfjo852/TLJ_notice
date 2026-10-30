import time
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor
from flask import current_app, g


def _connect(app):
    return pymysql.connect(
        host=app.config['DB_HOST'],
        port=app.config['DB_PORT'],
        user=app.config['DB_USER'],
        password=app.config['DB_PASSWORD'],
        database=app.config['DB_NAME'],
        charset='utf8mb4',
        cursorclass=DictCursor,
        autocommit=True,
    )


def get_db():
    if 'db' not in g:
        g.db = _connect(current_app)
    return g.db


def close_db(exception=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_app(app):
    app.teardown_appcontext(close_db)


def _remove_request_board(cursor, upload_dir):
    """One-time cleanup of the retired request board and guest-written data."""
    cursor.execute("SHOW COLUMNS FROM drafts LIKE 'guest'")
    if cursor.fetchone():
        cursor.execute("SELECT m.path FROM media m LEFT JOIN posts p ON p.id=m.post_id LEFT JOIN drafts d ON d.id=m.draft_id "
                       "WHERE p.board='request' OR d.board='request' OR d.id LIKE %s", ('%:guest-%',))
        paths = [row['path'] for row in cursor.fetchall()]
        cursor.execute("DELETE FROM posts WHERE board='request'")
        cursor.execute("DELETE FROM drafts WHERE board='request' OR id LIKE %s", ('%:guest-%',))
        for path in paths:
            (Path(upload_dir) / path).unlink(missing_ok=True)
        cursor.execute("ALTER TABLE drafts MODIFY board ENUM('cake','notice') NOT NULL, DROP COLUMN guest")
    cursor.execute("SHOW COLUMNS FROM posts LIKE 'owner'")
    if cursor.fetchone():
        cursor.execute("ALTER TABLE posts MODIFY board ENUM('cake','notice') NOT NULL, DROP COLUMN owner")


def wait_for_schema(app, attempts=30, delay=2):
    schema = Path(__file__).with_name('schema.sql').read_text(encoding='utf-8')
    statements = [s.strip() for s in schema.split(';') if s.strip()]
    last_error = None
    for _ in range(attempts):
        try:
            connection = _connect(app)
            try:
                with connection.cursor() as cursor:
                    for statement in statements:
                        cursor.execute(statement)
                    cursor.execute("SHOW COLUMNS FROM members LIKE 'session_token'")
                    if not cursor.fetchone():
                        cursor.execute('ALTER TABLE members ADD COLUMN session_token CHAR(36) NULL')
                    cursor.execute('UPDATE members SET session_token=UUID() WHERE session_token IS NULL')
                    _remove_request_board(cursor, app.config['UPLOAD_DIR'])
            finally:
                connection.close()
            return
        except pymysql.err.OperationalError as error:
            last_error = error
            time.sleep(delay)
    raise RuntimeError('MySQL 서버에 연결하지 못했습니다.') from last_error
