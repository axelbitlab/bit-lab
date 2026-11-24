import http.server
import socketserver
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

class TCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    with TCPServer(("", PORT), Handler) as httpd:
        print(f"Servidor Bitlab activo en http://localhost:{PORT}")
        httpd.serve_forever()
