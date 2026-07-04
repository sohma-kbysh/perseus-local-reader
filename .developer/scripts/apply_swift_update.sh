#!/bin/zsh
set -euo pipefail

APP_PID="$1"
REPO_ROOT="$2"
APP_PATH="$3"

OWNER="sohma-kbysh"
REPO="perseus-local-reader"
DEV_ROOT="$REPO_ROOT/.developer"
BUILD_ROOT="$DEV_ROOT/data/build"
MORPH="$DEV_ROOT/app/data/morph.json"
TEXTS="$DEV_ROOT/app/data/texts"
MERGE_SCRIPT="$DEV_ROOT/scripts/merge_morph_cache.py"
LOG="$BUILD_ROOT/swift-update.log"

mkdir -p "$BUILD_ROOT"
exec >>"$LOG" 2>&1

fail() {
  local message="$1"
  /usr/bin/osascript -e \
    "display dialog \"${message}\" buttons {\"OK\"} default button \"OK\" with icon stop" \
    >/dev/null 2>&1 || true
  exit 1
}

echo "Waiting for app process $APP_PID to exit..."
while /bin/kill -0 "$APP_PID" 2>/dev/null; do
  /bin/sleep 0.2
done

TMP="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/perseus-local-reader-update.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

BACKUP="$TMP/user-data"
mkdir -p "$BACKUP"

if [[ -f "$MORPH" ]]; then
  cp "$MORPH" "$BACKUP/morph.json"
fi

if [[ -d "$TEXTS" ]]; then
  mkdir -p "$BACKUP/texts"
  /usr/bin/rsync -a "$TEXTS/" "$BACKUP/texts/"
fi

if [[ -d "$REPO_ROOT/.git" ]]; then
  echo "Updating Git checkout..."
  cd "$REPO_ROOT"

  DIRTY="$(
    git status --porcelain \
      | /usr/bin/grep -vE '^[ MARC?]{2} \.developer/app/data/(morph\.json|texts/)' \
      || true
  )"

  if [[ -n "$DIRTY" ]]; then
    fail "ローカルに未コミットの変更があるため、自動更新を中止しました。"
  fi

  if ! git diff --quiet -- .developer/app/data/morph.json; then
    git checkout -- .developer/app/data/morph.json
  fi

  git fetch origin main
  git pull --ff-only origin main
else
  echo "Updating ZIP installation..."

  ARCHIVE="$TMP/main.zip"
  EXTRACTED="$TMP/extracted"
  mkdir -p "$EXTRACTED"

  /usr/bin/curl \
    --fail \
    --location \
    --silent \
    --show-error \
    "https://github.com/${OWNER}/${REPO}/archive/refs/heads/main.zip" \
    --output "$ARCHIVE" \
    || fail "最新版のダウンロードに失敗しました。"

  /usr/bin/ditto -x -k "$ARCHIVE" "$EXTRACTED"

  SOURCE="$(
    /usr/bin/find "$EXTRACTED" \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -name "${REPO}-*" \
      | /usr/bin/head -n 1
  )"

  [[ -n "$SOURCE" ]] || fail "ダウンロードした更新ファイルを展開できませんでした。"

  /usr/bin/rsync -a \
    --exclude='.git/' \
    --exclude='.developer/app/data/morph.json' \
    --exclude='.developer/app/data/texts/' \
    --exclude='.developer/data/build/' \
    --exclude='.developer/data/vendor/' \
    "$SOURCE/" "$REPO_ROOT/"
fi

if [[ -f "$BACKUP/morph.json" ]]; then
  if [[ -f "$MORPH" && -f "$MERGE_SCRIPT" ]]; then
    /usr/bin/python3 "$MERGE_SCRIPT" "$MORPH" "$BACKUP/morph.json"
  else
    mkdir -p "$(dirname "$MORPH")"
    cp "$BACKUP/morph.json" "$MORPH"
  fi
fi

if [[ -d "$BACKUP/texts" ]]; then
  mkdir -p "$TEXTS"
  /usr/bin/rsync -a "$BACKUP/texts/" "$TEXTS/"
fi

NEW_APP="$REPO_ROOT/Perseus Local Reader.app"
[[ -d "$NEW_APP" ]] || fail "更新後のアプリが見つかりませんでした。"

echo "Update completed. Reopening app..."
/usr/bin/open "$NEW_APP"
