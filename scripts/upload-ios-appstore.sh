#!/usr/bin/env bash
# Upload build/AppStoreExport/App.ipa to App Store Connect.
#
# Option A — Transporter (easiest): open Transporter.app, drag App.ipa in.
#
# Option B — API key (CI-friendly). Set:
#   export APP_STORE_CONNECT_API_KEY_ID="..."
#   export APP_STORE_CONNECT_API_ISSUER_ID="..."
#   export APP_STORE_CONNECT_API_KEY_PATH="$HOME/.appstoreconnect/AuthKey_XXX.p8"
#
# Option C — Apple ID (interactive). Set:
#   export APPLE_ID="your@email.com"
#   export APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IPA="$ROOT/build/AppStoreExport/App.ipa"

if [[ ! -f "$IPA" ]]; then
  echo "Missing IPA. Run: npm run ios:archive"
  exit 1
fi

if [[ -n "${APP_STORE_CONNECT_API_KEY_ID:-}" && -n "${APP_STORE_CONNECT_API_ISSUER_ID:-}" && -n "${APP_STORE_CONNECT_API_KEY_PATH:-}" ]]; then
  echo "==> Uploading with App Store Connect API key"
  xcrun altool --upload-app -f "$IPA" -t ios \
    --apiKey "$APP_STORE_CONNECT_API_KEY_ID" \
    --apiIssuer "$APP_STORE_CONNECT_API_ISSUER_ID" \
    --apiKeyPath "$APP_STORE_CONNECT_API_KEY_PATH"
elif [[ -n "${APPLE_ID:-}" && -n "${APP_SPECIFIC_PASSWORD:-}" ]]; then
  echo "==> Uploading with Apple ID"
  xcrun altool --upload-app -f "$IPA" -t ios -u "$APPLE_ID" -p "$APP_SPECIFIC_PASSWORD"
else
  echo "No upload credentials in environment."
  echo ""
  echo "Upload manually:"
  echo "  1. Open Transporter (Mac App Store)"
  echo "  2. Drag: $IPA"
  echo ""
  echo "Or set API key / Apple ID env vars (see script header) and re-run."
  exit 1
fi

echo "Upload submitted. Check App Store Connect → TestFlight for processing."
