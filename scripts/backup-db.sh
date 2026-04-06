#!/bin/bash
# Workstream database backup
# Dumps the local Supabase Postgres DB and keeps 7 days of backups.

BACKUP_DIR="$HOME/backups/workstream"
CONTAINER="supabase_db_codesync"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/workstream_$TIMESTAMP.sql.gz"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

# Dump and compress
if docker exec "$CONTAINER" pg_dump -U postgres --no-owner --no-acl postgres | gzip > "$BACKUP_FILE"; then
  echo "[backup] Saved $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "[backup] FAILED" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Prune old backups
find "$BACKUP_DIR" -name "workstream_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[backup] Pruned backups older than ${RETENTION_DAYS} days"
