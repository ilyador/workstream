#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/sixbox/Dev/workstream"
WATCH_INTERVAL_SECONDS="${WATCH_INTERVAL_SECONDS:-3}"
WATCH_DEBOUNCE_SECONDS="${WATCH_DEBOUNCE_SECONDS:-8}"
MIN_RESTART_GAP_SECONDS="${MIN_RESTART_GAP_SECONDS:-20}"

SHARED_TARGETS=(
  "package.json"
  "pnpm-lock.yaml"
)

SERVER_TARGETS=(
  "src/server"
)

MIGRATIONS_TARGETS=(
  "supabase/migrations"
)

snapshot() {
  local rel
  (
    cd "$ROOT_DIR"
    for rel in "$@"; do
      if [[ -d "$rel" ]]; then
        find "$rel" -type f -printf '%p\t%T@\n'
      elif [[ -f "$rel" ]]; then
        printf '%s\t%s\n' "$rel" "$(stat -c '%Y' "$rel")"
      fi
    done
  ) | LC_ALL=C sort | sha256sum | awk '{print $1}'
}

cd "$ROOT_DIR"
echo "Starting workstream code watcher in $ROOT_DIR"
echo "Polling every ${WATCH_INTERVAL_SECONDS}s with debounce ${WATCH_DEBOUNCE_SECONDS}s"
echo "Minimum gap between restarts: ${MIN_RESTART_GAP_SECONDS}s"

last_shared_snapshot="$(snapshot "${SHARED_TARGETS[@]}")"
last_server_snapshot="$(snapshot "${SERVER_TARGETS[@]}")"
last_migrations_snapshot="$(snapshot "${MIGRATIONS_TARGETS[@]}")"
last_restart_epoch=0
worker_restart_pending=0

while true; do
  sleep "$WATCH_INTERVAL_SECONDS"

  # If a worker restart is pending, try to flush it.
  if ((worker_restart_pending)); then
    if "$ROOT_DIR/scripts/restart-systemd-services.sh" --no-reload worker; then
      echo "Pending worker restart completed."
      worker_restart_pending=0
    fi
    # If still busy, we'll retry next iteration.
  fi

  current_shared_snapshot="$(snapshot "${SHARED_TARGETS[@]}")"
  current_server_snapshot="$(snapshot "${SERVER_TARGETS[@]}")"
  current_migrations_snapshot="$(snapshot "${MIGRATIONS_TARGETS[@]}")"

  shared_changed=0
  server_changed=0
  migrations_changed=0

  [[ "$current_shared_snapshot" != "$last_shared_snapshot" ]] && shared_changed=1
  [[ "$current_server_snapshot" != "$last_server_snapshot" ]] && server_changed=1
  [[ "$current_migrations_snapshot" != "$last_migrations_snapshot" ]] && migrations_changed=1

  if ((shared_changed == 0 && server_changed == 0 && migrations_changed == 0)); then
    continue
  fi

  changed_scopes=()
  ((shared_changed)) && changed_scopes+=("shared")
  ((server_changed)) && changed_scopes+=("server")
  ((migrations_changed)) && changed_scopes+=("migrations")

  echo "Code change detected ($(IFS=,; echo "${changed_scopes[*]}")) at $(date --iso-8601=seconds); waiting for debounce window..."
  sleep "$WATCH_DEBOUNCE_SECONDS"

  # Re-snapshot after debounce.
  current_shared_snapshot="$(snapshot "${SHARED_TARGETS[@]}")"
  current_server_snapshot="$(snapshot "${SERVER_TARGETS[@]}")"
  current_migrations_snapshot="$(snapshot "${MIGRATIONS_TARGETS[@]}")"

  shared_changed=0
  server_changed=0
  migrations_changed=0

  [[ "$current_shared_snapshot" != "$last_shared_snapshot" ]] && shared_changed=1
  [[ "$current_server_snapshot" != "$last_server_snapshot" ]] && server_changed=1
  [[ "$current_migrations_snapshot" != "$last_migrations_snapshot" ]] && migrations_changed=1

  if ((shared_changed == 0 && server_changed == 0 && migrations_changed == 0)); then
    continue
  fi

  # Apply pending migrations before restarting services so the new code
  # runs against the new schema. Migration failures are non-fatal to the
  # watcher — they'll be retried on the next detected change.
  if ((migrations_changed)); then
    echo "Applying pending migrations..."
    "$ROOT_DIR/scripts/db-push.sh" || echo "Migration apply failed; will retry on next change."
  fi

  # Throttle restarts.
  now_epoch="$(date +%s)"
  if ((last_restart_epoch > 0)); then
    elapsed=$((now_epoch - last_restart_epoch))
    if ((elapsed < MIN_RESTART_GAP_SECONDS)); then
      wait_seconds=$((MIN_RESTART_GAP_SECONDS - elapsed))
      echo "Throttling restart for ${wait_seconds}s..."
      sleep "$wait_seconds"
    fi
  fi

  # Server restarts immediately.
  echo "Restarting server after code change..."
  "$ROOT_DIR/scripts/restart-systemd-services.sh" --no-reload server || true
  last_restart_epoch="$(date +%s)"

  # Worker: restart if idle, otherwise defer.
  if "$ROOT_DIR/scripts/restart-systemd-services.sh" --no-reload worker; then
    worker_restart_pending=0
  else
    echo "Worker busy; restart deferred until idle."
    worker_restart_pending=1
  fi

  last_shared_snapshot="$current_shared_snapshot"
  last_server_snapshot="$current_server_snapshot"
  last_migrations_snapshot="$current_migrations_snapshot"
done
