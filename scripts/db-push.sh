#!/usr/bin/env bash
# Apply pending Supabase migrations to the local Docker Postgres.
# Matches the tracking convention used by supabase_migrations.schema_migrations:
#   version = first 5 chars of filename (e.g. "00036")
#   name    = full filename (e.g. "00036_rag_documents_realtime.sql")
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_codesync}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "[db-push] Supabase DB container '$CONTAINER' not found. Is Supabase running?" >&2
  exit 1
fi

applied=$(docker exec "$CONTAINER" psql -U postgres postgres -At -c \
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;")

pending_count=0
applied_count=0
for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue
  filename=$(basename "$migration")
  version="${filename:0:5}"

  if grep -qx "$version" <<< "$applied"; then
    continue
  fi

  pending_count=$((pending_count + 1))
  echo "[db-push] Applying $filename (version $version)..."
  if docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 postgres < "$migration" >/dev/null; then
    docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 postgres -c \
      "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$version', '$filename');" >/dev/null
    applied_count=$((applied_count + 1))
    echo "[db-push]   applied"
  else
    echo "[db-push]   FAILED" >&2
    exit 1
  fi
done

if ((pending_count == 0)); then
  echo "[db-push] No pending migrations."
else
  echo "[db-push] Applied $applied_count migration(s)."
fi
