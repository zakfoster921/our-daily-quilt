#!/usr/bin/env bash
# One-step iOS bundle: web → Pods → Capacitor → ios/App/App/public. Then rebuild in Xcode.
# Usage:
#   npm run ios                 # <-- single command before Xcode Archive / Run
#   npm run ios:open           # same, then opens App.xcworkspace (macOS)
#   npm run release:ios        # alias → npm run ios
#   npm run release:ios:open   # alias → npm run ios:open
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OPEN=0
for arg in "$@"; do
  if [[ "$arg" == "--open" ]]; then
    OPEN=1
  fi
done

echo "==> npm run build:www"
npm run build:www

if [[ -f "ios/App/Podfile" ]]; then
  echo "==> pod install (ios/App)"
  (cd ios/App && pod install)
else
  echo "WARN: ios/App/Podfile not found — skipping pod install"
fi

echo "==> npx cap sync ios"
npx cap sync ios

echo ""
echo "iOS release prep finished."
echo "Next in Xcode: open App.xcworkspace → pick a device / Any iOS Device → Product → Archive."
echo "After exporting for App Store Connect: npm run ios:verify-push"
echo ""

if [[ "$OPEN" -eq 1 ]] && command -v open >/dev/null 2>&1; then
  WS="$ROOT/ios/App/App.xcworkspace"
  if [[ -d "$WS" ]]; then
    echo "==> opening $WS"
    open "$WS"
  else
    echo "WARN: workspace not found at $WS"
  fi
fi
