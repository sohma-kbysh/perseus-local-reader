#!/usr/bin/env python3
import json
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, unquote, urlparse

from fetch_morph import fetch_one


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
IDLE_TIMEOUT_SECONDS = 8 * 60 * 60


last_access = time.time()


class ReaderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP), **kwargs)

    def do_GET(self):
        global last_access
        last_access = time.time()
        parsed = urlparse(self.path)
        if parsed.path == "/api/morph":
            self.handle_morph(parsed.query)
            return
        super().do_GET()

    def handle_morph(self, query):
        params = parse_qs(query)
        form = unquote(params.get("form", [""])[0])
        bare = unquote(params.get("bare", [""])[0])
        if not form:
            self.send_json({"error": "missing form"}, status=400)
            return
        try:
            entry = fetch_one(form, bare=bare, delay=0.0)
            self.send_json({"entry": entry})
        except HTTPError as error:
            if error.code == 429:
                self.send_json(
                    {
                        "error": "Perseus returned 429 Too Many Requests. Wait a little and click again.",
                        "status": 429,
                    },
                    status=429,
                )
                return
            self.send_json({"error": f"Perseus HTTP error: {error.code}"}, status=502)
        except Exception as error:
            self.send_json({"error": str(error)}, status=500)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), ReaderHandler)
    start_idle_shutdown_watch(server)
    print(f"Serving Plato Apology reader at http://127.0.0.1:{port}/")
    server.serve_forever()


def start_idle_shutdown_watch(server):
    def watch():
        while True:
            time.sleep(60)
            if time.time() - last_access > IDLE_TIMEOUT_SECONDS:
                server.shutdown()
                return

    thread = threading.Thread(target=watch, daemon=True)
    thread.start()


if __name__ == "__main__":
    main()
