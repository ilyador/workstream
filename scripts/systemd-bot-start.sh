#!/usr/bin/env bash
set -euo pipefail

cd /home/sixbox/Dev/codesync

# Add ~/.local/bin for claude CLI
export PATH="$HOME/.local/bin:$PATH"

# Load nvm so pnpm/node resolve in systemd's non-interactive shell.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

exec pnpm dev:bot
