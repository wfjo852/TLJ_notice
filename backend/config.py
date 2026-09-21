import os
from pathlib import Path

DEFAULT_UPLOAD_DIR = str(Path(__file__).resolve().parent / 'uploads')


class Config:
    DB_HOST = os.environ.get('DB_HOST', 'db')
    DB_PORT = int(os.environ.get('DB_PORT', '3306'))
    DB_USER = os.environ.get('DB_USER', 'tlj')
    DB_PASSWORD = os.environ.get('DB_PASSWORD', 'tlj_password')
    DB_NAME = os.environ.get('DB_NAME', 'tlj_notice')
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
    ADMIN_IDS = frozenset(v.strip() for v in os.environ.get('ADMIN_ID', '0026').split(',') if v.strip())
    UPLOAD_DIR = os.environ.get('UPLOAD_DIR', DEFAULT_UPLOAD_DIR)
    PORT = int(os.environ.get('PORT', '8000'))
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_HTTPONLY = True
    MAX_CONTENT_LENGTH = 60 * 1024 * 1024
