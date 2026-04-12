#!/usr/bin/env bash
set -euo pipefail

# Restart workstream services.
# Usage: restart-systemd-services.sh [--no-reload] [server|worker|both]
#
# The worker is only restarted if idle (no child processes beyond its base
# process chain).  When the worker is busy, the caller should retry later.

RELOAD_UNITS=1
TARGET="both"

if [[ "${1:-}" == "--no-reload" ]]; then
  RELOAD_UNITS=0
  shift
fi

if (($#)); then
  case "$1" in
    server|worker|both)
      TARGET="$1"
      shift
      ;;
  esac
fi

if (($#)); then
  echo "Usage: $0 [--no-reload] [server|worker|both]"
  exit 1
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

if ((RELOAD_UNITS)); then
  /usr/bin/systemctl --user daemon-reload
fi

worker_is_busy() {
  local pid
  pid="$(/usr/bin/systemctl --user show workstream-worker.service --property=MainPID --value 2>/dev/null)"
  if [[ -z "$pid" || "$pid" == "0" ]]; then
    return 1  # not running, not busy
  fi
  # Count real processes in the worker's session (excludes threads).
  # Base: node -> sh -> node -> node + esbuild (tsx compiler) = 5 processes.
  # Any additional process means a job is running (e.g. claude CLI).
  local sid count
  sid="$(ps -o sid= -p "$pid" 2>/dev/null | tr -d ' ')"
  [[ -z "$sid" ]] && return 1
  count="$(ps -o pid --no-headers -s "$sid" 2>/dev/null | wc -l)"
  (( count > 5 ))
}

restart_server() {
  echo "Restarting workstream-server..."
  /usr/bin/systemctl --user restart workstream-server.service
  echo "Restarting workstream-web..."
  /usr/bin/systemctl --user restart workstream-web.service
}

restart_worker() {
  if worker_is_busy; then
    echo "Worker is busy (running job); deferring restart."
    return 1
  fi
  echo "Restarting workstream-worker..."
  /usr/bin/systemctl --user restart workstream-worker.service
}

case "$TARGET" in
  server)
    restart_server
    ;;
  worker)
    restart_worker
    ;;
  both)
    restart_server
    restart_worker
    ;;
esac
