#!/bin/zsh
set -euo pipefail

DEV_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$DEV_ROOT/.." && pwd)"
PACKAGE_ROOT="$DEV_ROOT/swift-app"
APP_NAME="Perseus Local Reader.app"
APP_PATH="$REPO_ROOT/$APP_NAME"
VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/VERSION")"

if [[ -z "$VERSION" ]]; then
  echo "VERSION is empty."
  exit 1
fi

BIN_PATH="$(/usr/bin/xcrun swift build \
  --package-path "$PACKAGE_ROOT" \
  -c release \
  --show-bin-path)"

/usr/bin/xcrun swift build \
  --package-path "$PACKAGE_ROOT" \
  -c release

EXECUTABLE="$BIN_PATH/PerseusLocalReader"
if [[ ! -x "$EXECUTABLE" ]]; then
  echo "Built executable not found: $EXECUTABLE"
  exit 1
fi

rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"
cp "$EXECUTABLE" "$APP_PATH/Contents/MacOS/PerseusLocalReader"

ICON_SOURCE=""
for candidate in \
  "$REPO_ROOT/Open Perseus Local Reader.app/Contents/Resources/applet.icns" \
  "$REPO_ROOT/.developer/assets/apology-icon.icns"
do
  if [[ -f "$candidate" ]]; then
    ICON_SOURCE="$candidate"
    break
  fi
done

ICON_PLIST=""
if [[ -n "$ICON_SOURCE" ]]; then
  cp "$ICON_SOURCE" "$APP_PATH/Contents/Resources/AppIcon.icns"
  ICON_PLIST="<key>CFBundleIconFile</key><string>AppIcon</string>"
fi

cat > "$APP_PATH/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>ja</string>
  <key>CFBundleDisplayName</key>
  <string>Perseus Local Reader</string>
  <key>CFBundleExecutable</key>
  <string>PerseusLocalReader</string>
  <key>CFBundleIdentifier</key>
  <string>jp.keio.sohma.perseus-local-reader</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Perseus Local Reader</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  ${ICON_PLIST}
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
EOF

/usr/bin/codesign \
  --force \
  --deep \
  --sign - \
  "$APP_PATH"

echo "Built:"
echo "  $APP_PATH"
echo ""
echo "Open it with:"
echo "  open \"$APP_PATH\""
