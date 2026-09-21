import uuid
from pathlib import Path

from flask import current_app

IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/webp'}
VIDEO_TYPES = {'video/mp4', 'video/webm'}
IMAGE_MAX_BYTES = 10 * 1024 * 1024
VIDEO_MAX_BYTES = 50 * 1024 * 1024


def upload_dir():
    path = Path(current_app.config['UPLOAD_DIR'])
    path.mkdir(parents=True, exist_ok=True)
    return path


def validate_upload(kind, file_storage):
    allowed = IMAGE_TYPES if kind == 'image' else VIDEO_TYPES if kind == 'video' else None
    if allowed is None:
        raise ValueError('알 수 없는 첨부파일 종류입니다.')
    if file_storage.mimetype not in allowed:
        raise ValueError('지원하지 않는 파일 형식입니다.')


def save_upload(kind, file_storage):
    validate_upload(kind, file_storage)
    file_id = uuid.uuid4().hex
    extension = Path(file_storage.filename or '').suffix or ('.png' if kind == 'image' else '.mp4')
    filename = f'{file_id}{extension}'
    destination = upload_dir() / filename
    file_storage.save(destination)
    size = destination.stat().st_size
    limit = IMAGE_MAX_BYTES if kind == 'image' else VIDEO_MAX_BYTES
    if size > limit:
        destination.unlink(missing_ok=True)
        raise ValueError('이미지는 10MB, 동영상은 50MB 이하로 첨부해 주세요.')
    return file_id, filename, size


def delete_file(filename):
    if not filename:
        return
    target = upload_dir() / filename
    target.unlink(missing_ok=True)
