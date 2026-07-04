#!/bin/zsh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
START_PORT="${1:-8000}"
PID_FILE="${ROOT}/data/build/server.pid"

mkdir -p "${ROOT}/data/build"

is_running() {
  local url="$1"
  /usr/bin/python3 - "$url" <<'PY'
import sys
from urllib.request import urlopen

try:
    with urlopen(sys.argv[1], timeout=1) as response:
        raise SystemExit(0 if response.status == 200 else 1)
except Exception:
    raise SystemExit(1)
PY
}

is_port_free() {
  local port="$1"
  /usr/bin/python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    try:
        sock.bind(("127.0.0.1", port))
    except OSError:
        raise SystemExit(1)
PY
}

for PORT in $(seq "$START_PORT" "$((START_PORT + 10))"); do
  URL="http://127.0.0.1:${PORT}/"
  if is_running "$URL"; then
    /usr/bin/open "$URL"
    exit 0
  fi
  if ! is_port_free "$PORT"; then
    continue
  fi

  LOG_FILE="${ROOT}/data/build/server-${PORT}.log"
  cd "$ROOT"
  /usr/bin/nohup /usr/bin/python3 scripts/server.py "$PORT" > "$LOG_FILE" 2>&1 &!
  echo $! > "$PID_FILE"
  sleep 1

  if is_running "$URL"; then
    /usr/bin/open "$URL"
    exit 0
  fi
done

echo "Could not start Perseus Local Reader on ports ${START_PORT}-$((START_PORT + 10))."
exit 1
