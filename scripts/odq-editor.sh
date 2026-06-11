#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}/odq-editor"

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  open "$URL"
  echo "ODQ editor opened (server already on port ${PORT})"
  exit 0
fi

export AUTO_OPEN_ODQ_EDITOR=1
exec node server.js
