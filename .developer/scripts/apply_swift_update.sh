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
USER_DATA="$DEV_ROOT/data/user"
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

if [[ -d "$USER_DATA" ]]; then
  mkdir -p "$BACKUP/user"
  /usr/bin/rsync -a "$USER_DATA/" "$BACKUP/user/"
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
    --exclude='.developer/data/user/' \
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

if [[ -d "$BACKUP/user" ]]; then
  mkdir -p "$USER_DATA"
  /usr/bin/rsync -a "$BACKUP/user/" "$USER_DATA/"
fi

SOURCE_APP="$REPO_ROOT/Perseus Local Reader.app"
[[ -d "$SOURCE_APP" ]] || fail "更新後のアプリが見つかりませんでした。"

# Reopen and, when necessary, update the exact stable app bundle from which
# the user launched the reader. This keeps a Dock item attached to the same
# application path across updates.
TARGET_APP="$APP_PATH"

# A quarantined app may be executed from a temporary App Translocation path.
# That path is read-only and disappears after the process exits, so install a
# stable copy under the user's Applications directory instead.
if [[ "$TARGET_APP" == *"/AppTranslocation/"* ]]; then
  TARGET_APP="$HOME/Applications/Perseus Local Reader.app"
fi

if [[ "$TARGET_APP" != "$SOURCE_APP" ]]; then
  TARGET_PARENT="$(/usr/bin/dirname "$TARGET_APP")"
  /bin/mkdir -p "$TARGET_PARENT"

  echo "Updating launched app bundle:"
  echo "  source: $SOURCE_APP"
  echo "  target: $TARGET_APP"

  # The distributed source bundle is already signed during the release build.
  # Verify that signature before touching the user's installed copy.
  /usr/bin/codesign --verify --deep --strict --verbose=2 "$SOURCE_APP" \
    || fail "配布された更新用アプリの署名を検証できませんでした。"

  TEMP_APP="$TARGET_PARENT/.Perseus Local Reader.update.$$.app"
  OLD_APP="$TARGET_PARENT/.Perseus Local Reader.old.$$.app"

  /bin/rm -rf "$TEMP_APP" "$OLD_APP"

  # Copy the complete, already-signed bundle. Do not merge bundle contents and
  # do not re-sign on the user's Mac.
  /usr/bin/ditto --noqtn "$SOURCE_APP" "$TEMP_APP" \
    || fail "更新用アプリを一時配置できませんでした。"

  /usr/bin/xattr -dr com.apple.quarantine "$TEMP_APP" 2>/dev/null || true

  /usr/bin/codesign --verify --deep --strict --verbose=2 "$TEMP_APP" \
    || fail "一時配置した更新用アプリの署名を検証できませんでした。"

  if [[ -d "$TARGET_APP" ]]; then
    /bin/mv "$TARGET_APP" "$OLD_APP" \
      || fail "現在のアプリを更新準備用の場所へ移動できませんでした。"
  fi

  if ! /bin/mv "$TEMP_APP" "$TARGET_APP"; then
    if [[ -d "$OLD_APP" && ! -d "$TARGET_APP" ]]; then
      /bin/mv "$OLD_APP" "$TARGET_APP" 2>/dev/null || true
    fi
    fail "更新後のアプリを所定の場所へ配置できませんでした。"
  fi

  /bin/rm -rf "$OLD_APP"

  /usr/bin/codesign --verify --deep --strict --verbose=2 "$TARGET_APP" \
    || fail "配置後のアプリ署名を検証できませんでした。"
fi

echo "Update completed. Reopening app:"
echo "  $TARGET_APP"
/usr/bin/open "$TARGET_APP"
