from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path
import os

if __name__ == '__main__':
    root = Path(__file__).resolve().parent / 'frontend'
    server = ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8000'))), partial(SimpleHTTPRequestHandler, directory=str(root)))
    print('TLJ notice: http://localhost:8000', flush=True)
    server.serve_forever()
