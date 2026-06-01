#!/usr/bin/env bash
# Archive + export App Store IPA (run after npm run release:ios).
# Usage: bash scripts/archive-ios-appstore.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WS="$ROOT/ios/App/App.xcworkspace"
SCHEME="App"
ARCHIVE_PATH="$ROOT/build/OurDailyQuilt.xcarchive"
EXPORT_PATH="$ROOT/build/AppStoreExport"
EXPORT_OPTIONS="$EXPORT_PATH/ExportOptions.plist"

if [[ ! -d "$WS" ]]; then
  echo "Missing workspace: $WS"
  echo "Run: npm run release:ios"
  exit 1
fi

mkdir -p "$(dirname "$ARCHIVE_PATH")" "$EXPORT_PATH"

echo "==> xcodebuild archive (Release, generic iOS)"
xcodebuild \
  -workspace "$WS" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  archive

echo "==> xcodebuild export (App Store Connect)"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

echo ""
echo "Archive: $ARCHIVE_PATH"
echo "Export:  $EXPORT_PATH/App.ipa"
echo "Next:    npm run ios:verify-push"
echo "Upload:  Transporter app, or Organizer → Distribute App"
