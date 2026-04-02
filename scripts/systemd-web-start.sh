#!/usr/bin/env bash
set -euo pipefail

cd /home/sixbox/Dev/codesync

# Load nvm so pnpm/node resolve in systemd's non-interactive shell.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

# Wait for the API server to be reachable before starting Vite.
API_URL="${API_URL:-http://localhost:3001/api/health}"
TIMEOUT="${STARTUP_TIMEOUT:-60}"
elapsed=0
while ! curl -sf "$API_URL" >/dev/null 2>&1; do
  if (( elapsed >= TIMEOUT )); then
    echo "API server not reachable after ${TIMEOUT}s — starting Vite anyway."
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

exec pnpm dev:web
