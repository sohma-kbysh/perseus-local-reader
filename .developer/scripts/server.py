#!/usr/bin/env python3
import json
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, unquote, urlparse

from fetch_morph import fetch_one, load_forms, load_morphs


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
IDLE_TIMEOUT_SECONDS = 8 * 60 * 60


last_access = time.time()
MORPH_FETCH_LOCK = threading.Lock()
BATCH_STATUS_LOCK = threading.Lock()
BATCH_CANCEL_EVENT = threading.Event()
BATCH_STATUS = {
    "state": "idle",
    "total": 0,
    "completed": 0,
    "cached": 0,
    "fetched": 0,
    "current": "",
    "error": "",
}


def batch_status_snapshot():
    with BATCH_STATUS_LOCK:
        return dict(BATCH_STATUS)


def update_batch_status(**changes):
    with BATCH_STATUS_LOCK:
        BATCH_STATUS.update(changes)


def run_batch_fetch():
    try:
        forms = load_forms()
        morphs = load_morphs()
        total = len(forms)
        cached = sum(
            1
            for form in forms
            if morphs.get(form, {}).get("fetched")
        )
        update_batch_status(
            state="running",
            total=total,
            completed=cached,
            cached=cached,
            fetched=0,
            current="",
            error="",
        )

        newly_cached = 0
        for form, meta in forms.items():
            if morphs.get(form, {}).get("fetched"):
                continue
            if BATCH_CANCEL_EVENT.is_set():
                update_batch_status(
                    state="stopped",
                    current="",
                    completed=cached + newly_cached,
                )
                return

            update_batch_status(current=form)
            # Serialize writes to morph.json. Individual word lookups can run
            # between batch items, but two writers never update the file at once.
            with MORPH_FETCH_LOCK:
                entry = fetch_one(form, bare=meta["bare"], delay=1.0)

            morphs[form] = entry
            newly_cached += 1
            update_batch_status(
                completed=cached + newly_cached,
                fetched=newly_cached,
            )

        update_batch_status(
            state="done",
            completed=total,
            current="",
        )
    except Exception as error:
        update_batch_status(
            state="error",
            current="",
            error=str(error),
        )


def start_batch_fetch():
    with BATCH_STATUS_LOCK:
        if BATCH_STATUS["state"] in {"starting", "running", "stopping"}:
            return False
        BATCH_CANCEL_EVENT.clear()
        BATCH_STATUS.update(
            state="starting",
            total=0,
            completed=0,
            cached=0,
            fetched=0,
            current="",
            error="",
        )

    thread = threading.Thread(target=run_batch_fetch, daemon=True)
    thread.start()
    return True


def stop_batch_fetch():
    with BATCH_STATUS_LOCK:
        if BATCH_STATUS["state"] not in {"starting", "running", "stopping"}:
            return False
        BATCH_CANCEL_EVENT.set()
        BATCH_STATUS["state"] = "stopping"
    return True


class ReaderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP), **kwargs)

    def do_GET(self):
        global last_access
        last_access = time.time()
        parsed = urlparse(self.path)
        if parsed.path == "/api/morph/fetch-all/status":
            self.send_json(batch_status_snapshot())
            return
        if parsed.path == "/api/morph":
            self.handle_morph(parsed.query)
            return
        super().do_GET()

    def do_POST(self):
        global last_access
        last_access = time.time()
        parsed = urlparse(self.path)
        if parsed.path == "/api/morph/fetch-all":
            started = start_batch_fetch()
            self.send_json(
                {"started": started, "status": batch_status_snapshot()},
                status=202 if started else 200,
            )
            return
        if parsed.path == "/api/morph/fetch-all/stop":
            stopping = stop_batch_fetch()
            self.send_json(
                {"stopping": stopping, "status": batch_status_snapshot()},
                status=202 if stopping else 200,
            )
            return
        self.send_error(404)

    def handle_morph(self, query):
        params = parse_qs(query)
        form = unquote(params.get("form", [""])[0])
        bare = unquote(params.get("bare", [""])[0])
        if not form:
            self.send_json({"error": "missing form"}, status=400)
            return
        try:
            with MORPH_FETCH_LOCK:
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
        self.send_header("Cache-Control", "no-store")
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
