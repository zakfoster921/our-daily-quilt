#!/usr/bin/env bash
# One-step Android bundle: web → Capacitor → android/. Then build AAB with Gradle.
# Usage:
#   npm run android:prep   # <-- single command before Play Store upload
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "android/app/build.gradle" ]]; then
  echo "==> check Android marketing version (vs last Play Store release)"
  node scripts/android-version.cjs check
  echo "==> bump Android build number"
  node scripts/bump-android-build.cjs
else
  echo "WARN: android/app/build.gradle not found — skipping build bump"
fi

echo "==> remove iCloud duplicate Android resources (spaces in names break AAPT)"
python3 - <<'PY'
from pathlib import Path
import re
import shutil

roots = [
    Path("android/app/src/main/res"),
    Path("android/app/src/main/assets"),
]
pat = re.compile(r" \d+(\.\w+)?$")
removed = []
for root in roots:
    if not root.exists():
        continue
    for path in sorted(root.rglob("*"), key=lambda p: len(str(p)), reverse=True):
        in_res = "src/main/res" in str(path)
        if pat.search(path.name) or (in_res and " " in path.name):
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            elif path.is_file():
                path.unlink(missing_ok=True)
            removed.append(str(path))
print("\n".join(removed) if removed else "none found")
PY

echo "==> npm run build:www"
npm run build:www

echo "==> npx cap sync android"
npx cap sync android

echo ""
echo "Android release prep finished."
echo "Next: cd android && ./gradlew bundleRelease"
echo "AAB will be at: android/app/build/outputs/bundle/release/app-release.aab"
echo "Upload the AAB to the Play Store."
echo "After a version goes live on the Play Store: npm run android:shipped"
echo ""
