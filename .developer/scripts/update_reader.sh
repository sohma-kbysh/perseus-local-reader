#!/bin/zsh
set -eu

DEV_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$DEV_ROOT/.." && pwd)"
BACKUP="${DEV_ROOT}/data/build/morph-before-update.json"
MORPH="${DEV_ROOT}/app/data/morph.json"

mkdir -p "${DEV_ROOT}/data/build"

if [[ -f "$MORPH" ]]; then
  cp "$MORPH" "$BACKUP"
fi

/bin/zsh "${DEV_ROOT}/scripts/stop_reader.sh" || true

cd "$REPO_ROOT"

if [[ ! -d .git ]]; then
  echo "This folder is not a Git checkout. Download the latest version from GitHub instead:"
  echo "https://github.com/sohma-kbysh/persus"
  exit 1
fi

if ! git diff --quiet -- .developer/app/data/morph.json; then
  git checkout -- .developer/app/data/morph.json
fi

git pull --ff-only origin main

if [[ -f "$BACKUP" ]]; then
  /usr/bin/python3 .developer/scripts/merge_morph_cache.py "$MORPH" "$BACKUP"
fi

/bin/zsh "${DEV_ROOT}/scripts/start_reader.sh"
