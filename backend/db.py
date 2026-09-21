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
            finally:
                connection.close()
            return
        except pymysql.err.OperationalError as error:
            last_error = error
            time.sleep(delay)
    raise RuntimeError('MySQL 서버에 연결하지 못했습니다.') from last_error
