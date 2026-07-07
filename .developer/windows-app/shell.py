#!/usr/bin/env python3
"""Cross-platform pywebview shell for Perseus Local Reader.

Replaces the macOS AppKit shell on Windows. Starts the local Python server
as a child process and shows the reader UI in a pywebview window (Edge
WebView2 on Windows, WKWebView on macOS) or in the default browser.

Usage:
    shell.py [--check] [--target embedded|browser]

--check runs headless: locate the reader root, start the server, wait for
HTTP 200, fetch /api/works, shut down, and exit non-zero on failure.
"""

import atexit
import json
import os
import subprocess
import sys
import socket
import time
import urllib.request
import webbrowser
from pathlib import Path

SHELL_DIR = Path(__file__).resolve().parent
ROOT = SHELL_DIR.parents[1]
DEV = ROOT / ".developer"
SERVER_SCRIPT = DEV / "scripts" / "server.py"
CATALOG_PATH = DEV / "app" / "data" / "catalog.json"
SETTINGS_PATH = DEV / "data" / "user" / "shell_settings.json"
LOG_DIR = DEV / "data" / "build"
PORT_RANGE = range(8000, 8011)
STARTUP_TIMEOUT_SECONDS = 30
GITHUB_URL = "https://github.com/sohma-kbysh/perseus-local-reader"
APP_TITLE = "Perseus Local Reader"

DEFAULT_SETTINGS = {"version": 1, "openTarget": "embedded", "uiLanguage": ""}


def fail(message):
    if os.name == "nt":
        try:
            import ctypes

            MB_ICONERROR = 0x10
            ctypes.windll.user32.MessageBoxW(None, message, APP_TITLE, MB_ICONERROR)
        except Exception:
            pass
    print(message, file=sys.stderr)
    raise SystemExit(1)


def validate_root():
    missing = [str(p) for p in (SERVER_SCRIPT, CATALOG_PATH) if not p.is_file()]
    if missing:
        fail(
            "Reader runtime files are missing. Keep the extracted folder together.\n"
            "読書環境ファイルが見つかりません。解凍したフォルダを丸ごと保ってください。\n\n"
            + "\n".join(missing)
        )


def load_settings():
    settings = dict(DEFAULT_SETTINGS)
    try:
        raw = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return settings
    if isinstance(raw, dict):
        if raw.get("openTarget") in ("embedded", "browser"):
            settings["openTarget"] = raw["openTarget"]
        if raw.get("uiLanguage") in ("", "en", "ja"):
            settings["uiLanguage"] = raw["uiLanguage"]
    return settings


def save_settings(settings):
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS_PATH.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(tmp, SETTINGS_PATH)


class ServerManager:
    def __init__(self):
        self.process = None
        self.port = None
        self.log_handle = None

    @property
    def base_url(self):
        return f"http://127.0.0.1:{self.port}/" if self.port else None

    def start(self):
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        for port in PORT_RANGE:
            if not self._port_available(port):
                continue
            process = self._spawn(port)
            if self._wait_ready(process, port):
                self.process = process
                self.port = port
                atexit.register(self.stop)
                return self.base_url
            self._terminate(process)
            self._close_log()
        fail(
            "Could not start the local reader server on ports 8000-8010.\n"
            "ローカルサーバーを 8000-8010 番ポートで起動できませんでした。\n"
            f"Log: {LOG_DIR / 'pyshell-server-*.log'}"
        )

    def _port_available(self, port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                return False
        return True

    def _spawn(self, port):
        self.log_handle = open(
            LOG_DIR / f"pyshell-server-{port}.log", "a", encoding="utf-8"
        )
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        return subprocess.Popen(
            [
                sys.executable,
                str(SERVER_SCRIPT),
                str(port),
                "--parent-pid",
                str(os.getpid()),
            ],
            cwd=str(SERVER_SCRIPT.parent),
            stdout=self.log_handle,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
        )

    def _wait_ready(self, process, port):
        deadline = time.time() + STARTUP_TIMEOUT_SECONDS
        url = f"http://127.0.0.1:{port}/"
        while time.time() < deadline:
            if process.poll() is not None:
                return False
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    if response.status == 200:
                        return True
            except OSError:
                pass
            time.sleep(0.2)
        return False

    def _terminate(self, process):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

    def _close_log(self):
        if self.log_handle:
            self.log_handle.close()
            self.log_handle = None

    def stop(self):
        if self.process:
            self._terminate(self.process)
            self.process = None
        self._close_log()


class JsApi:
    def __init__(self, settings):
        self.settings = settings
        self.base_url = None

    def open_external(self, url):
        if isinstance(url, str) and url.startswith(("http://", "https://")):
            webbrowser.open(url)
        return True

    def open_reader(self):
        if self.base_url:
            webbrowser.open(self.base_url)
        return True

    def set_open_target(self, target):
        if target in ("embedded", "browser"):
            self.settings["openTarget"] = target
            save_settings(self.settings)
        return True


EXTERNAL_LINK_HOOK = """
(function () {
  if (window.__perseusShellHooked) { return; }
  window.__perseusShellHooked = true;
  document.addEventListener("click", function (event) {
    var anchor = event.target && event.target.closest
      ? event.target.closest("a[href]") : null;
    if (!anchor) { return; }
    var href = anchor.href || "";
    if (href.indexOf("http://") !== 0 && href.indexOf("https://") !== 0) { return; }
    if (anchor.origin === window.location.origin) { return; }
    event.preventDefault();
    event.stopPropagation();
    if (window.pywebview && window.pywebview.api) {
      window.pywebview.api.open_external(href);
    }
  }, true);
})();
"""

LANGUAGE_SYNC_TEMPLATE = """
(function () {
  var wanted = %s;
  if (!wanted) { return; }
  try {
    if (window.localStorage.getItem("perseusUiLanguage") !== wanted) {
      window.localStorage.setItem("perseusUiLanguage", wanted);
      window.location.reload();
    }
  } catch (error) {}
})();
"""

BROWSER_MODE_HTML = """
<!doctype html>
<html><head><meta charset="utf-8"><title>Perseus Local Reader</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.7; }
  code { background: #eee; padding: 0 0.3em; }
  button { font-size: 1rem; padding: 0.4em 1em; margin-right: 0.6em; }
</style></head>
<body>
  <h1>Perseus Local Reader</h1>
  <p>The reader opened in your default browser at <code>__URL__</code>.<br>
     Reader を既定のブラウザで開きました。</p>
  <p>Closing this window stops the local server.<br>
     この窓を閉じるとローカルサーバーが停止します。</p>
  <p>
    <button onclick="pywebview.api.open_reader()">Open reader again / もう一度開く</button>
    <button onclick="pywebview.api.set_open_target('embedded').then(function () {
        alert('Next launch will use the embedded window. / 次回からアプリ内で開きます。');
      })">Use embedded window next time / 次回からアプリ内で開く</button>
  </p>
</body></html>
"""


def make_loaded_handler(window, settings):
    def on_loaded(*_args):
        language = settings.get("uiLanguage") or ""
        window.evaluate_js(LANGUAGE_SYNC_TEMPLATE % json.dumps(language))
        window.evaluate_js(EXTERNAL_LINK_HOOK)

    return on_loaded


def notify_in_page(window, message):
    window.evaluate_js(f"alert({json.dumps(message)});")


def build_menu(webview_menu, window, api, settings, base_url):
    Menu = webview_menu.Menu
    MenuAction = webview_menu.MenuAction
    MenuSeparator = webview_menu.MenuSeparator

    def set_language(language):
        settings["uiLanguage"] = language
        save_settings(settings)
        window.evaluate_js(
            "window.localStorage.setItem('perseusUiLanguage', %s);"
            "window.location.reload();" % json.dumps(language)
        )

    def set_target(target, label):
        api.set_open_target(target)
        notify_in_page(
            window,
            f"Takes effect on next launch: {label}\n次回起動時から有効になります。",
        )

    reader_menu = Menu(
        "Reader / リーダー",
        [
            MenuAction("Library / ライブラリ", lambda: window.load_url(base_url)),
            MenuSeparator(),
            MenuAction("Back / 戻る", lambda: window.evaluate_js("history.back();")),
            MenuAction(
                "Forward / 進む", lambda: window.evaluate_js("history.forward();")
            ),
            MenuAction(
                "Reload / 再読み込み",
                lambda: window.evaluate_js("location.reload();"),
            ),
            MenuSeparator(),
            MenuAction(
                "Open in browser / ブラウザで開く",
                lambda: webbrowser.open(window.get_current_url() or base_url),
            ),
        ],
    )
    settings_menu = Menu(
        "Settings / 設定",
        [
            MenuAction(
                "Open reader in this window / アプリ内で開く",
                lambda: set_target("embedded", "embedded window"),
            ),
            MenuAction(
                "Open reader in default browser / 既定のブラウザで開く",
                lambda: set_target("browser", "default browser"),
            ),
            MenuSeparator(),
            MenuAction("Language: English", lambda: set_language("en")),
            MenuAction("言語: 日本語", lambda: set_language("ja")),
            MenuSeparator(),
            MenuAction(
                "Check for updates (GitHub) / 更新を確認",
                lambda: webbrowser.open(GITHUB_URL),
            ),
        ],
    )
    return [reader_menu, settings_menu]


def import_webview():
    try:
        import webview
        import webview.menu as webview_menu
    except ImportError:
        fail(
            "pywebview is not installed. Run 'Perseus Local Reader.bat' to set up\n"
            "the bundled runtime, or install it manually: pip install pywebview\n"
            "pywebview が見つかりません。'Perseus Local Reader.bat' から起動して\n"
            "自動セットアップを実行してください。"
        )
    return webview, webview_menu


def run_embedded(base_url, settings):
    webview, webview_menu = import_webview()
    api = JsApi(settings)
    api.base_url = base_url
    window = webview.create_window(
        APP_TITLE,
        base_url,
        js_api=api,
        width=1280,
        height=860,
        min_size=(480, 360),
        text_select=True,
    )
    window.events.loaded += make_loaded_handler(window, settings)
    webview.start(menu=build_menu(webview_menu, window, api, settings, base_url))


def run_browser(base_url, settings):
    webview, _ = import_webview()
    api = JsApi(settings)
    api.base_url = base_url
    webbrowser.open(base_url)
    webview.create_window(
        APP_TITLE,
        html=BROWSER_MODE_HTML.replace("__URL__", base_url),
        js_api=api,
        width=560,
        height=360,
    )
    webview.start()


def run_check():
    manager = ServerManager()
    base_url = manager.start()
    try:
        with urllib.request.urlopen(base_url + "api/works", timeout=10) as response:
            works = json.load(response)
        count = len(works.get("works", works) if isinstance(works, dict) else works)
        print(f"OK: {base_url} is serving; /api/works returned {count} entries.")
    finally:
        manager.stop()


def parse_args(argv):
    check = False
    target = None
    args = iter(argv)
    for arg in args:
        if arg == "--check":
            check = True
        elif arg == "--target":
            value = next(args, "")
            if value not in ("embedded", "browser"):
                raise SystemExit("--target requires 'embedded' or 'browser'")
            target = value
        else:
            raise SystemExit(f"Unknown shell argument: {arg}")
    return check, target


def main():
    check, target_override = parse_args(sys.argv[1:])
    validate_root()
    if check:
        run_check()
        return
    settings = load_settings()
    target = target_override or settings["openTarget"]
    manager = ServerManager()
    base_url = manager.start()
    try:
        if target == "browser":
            run_browser(base_url, settings)
        else:
            run_embedded(base_url, settings)
    finally:
        manager.stop()


if __name__ == "__main__":
    main()
