#!/bin/zsh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP="${ROOT}/data/build/morph-before-update.json"
MORPH="${ROOT}/app/data/morph.json"

mkdir -p "${ROOT}/data/build"

if [[ -f "$MORPH" ]]; then
  cp "$MORPH" "$BACKUP"
fi

/bin/zsh "${ROOT}/scripts/stop_reader.sh" || true

cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "This folder is not a Git checkout. Download the latest version from GitHub instead:"
  echo "https://github.com/sohma-kbysh/persus"
  exit 1
fi

if ! git diff --quiet -- app/data/morph.json; then
  git checkout -- app/data/morph.json
fi

git pull --ff-only origin main

if [[ -f "$BACKUP" ]]; then
  /usr/bin/python3 scripts/merge_morph_cache.py "$MORPH" "$BACKUP"
fi

/bin/zsh "${ROOT}/scripts/start_reader.sh"

