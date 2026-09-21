from pathlib import Path

from flask import Flask, jsonify

import db as db_module
from config import Config
from identity import apply_pending_guest_cookie
from routes.auth import auth_bp
from routes.drafts import drafts_bp
from routes.media import media_bp
from routes.posts import posts_bp
from routes.users import users_bp

FRONTEND_DIR = Path(__file__).resolve().parent.parent / 'frontend'


def create_app():
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path='')
    app.config.from_object(Config)

    db_module.init_app(app)

    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(posts_bp, url_prefix='/api')
    app.register_blueprint(drafts_bp, url_prefix='/api')
    app.register_blueprint(users_bp, url_prefix='/api')
    app.register_blueprint(media_bp, url_prefix='/api')

    @app.after_request
    def _guest_cookie(response):
        return apply_pending_guest_cookie(response)

    @app.errorhandler(404)
    def _not_found(_error):
        return jsonify({'error': 'Not Found'}), 404

    @app.route('/')
    def index():
        return app.send_static_file('index.html')

    return app


app = create_app()

if __name__ == '__main__':
    from waitress import serve

    db_module.wait_for_schema(app)
    print(f"TLJ notice: http://localhost:{app.config['PORT']}", flush=True)
    serve(app, host='0.0.0.0', port=app.config['PORT'])
