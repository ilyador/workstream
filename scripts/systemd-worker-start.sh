#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# Add ~/.local/bin for claude, gh, and other user-installed tools.
export PATH="$HOME/.local/bin:$PATH"

# Load nvm so pnpm/node resolve in systemd's non-interactive shell.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

exec pnpm dev:worker
