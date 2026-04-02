#!/usr/bin/env bash
set -euo pipefail

cd /home/sixbox/Dev/codesync

# Add ~/.local/bin for claude, gh, and other user-installed tools.
export PATH="$HOME/.local/bin:$PATH"

# Load nvm so pnpm/node resolve in systemd's non-interactive shell.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

# Install deps if needed (e.g. after git sync pulled new packages)
pnpm install --frozen-lockfile 2>/dev/null || true

# Start Express API server and worker concurrently.
# The worker is a separate process that polls for jobs and spawns claude -p.
exec pnpm concurrently --names server,worker \
  "pnpm dev:server" \
  "pnpm dev:worker"
