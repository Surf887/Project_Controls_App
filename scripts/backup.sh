#!/usr/bin/env bash
#
# Backup script for the Project Controls Intelligence Platform.
# Dumps the PostgreSQL database and archives filesystem-resident audit/baseline
# data, with simple retention. Intended to be run on a schedule (cron/systemd).
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./scripts/backup.sh [DEST_DIR]
#
# Env:
#   DATABASE_URL   PostgreSQL connection string (required for the DB dump).
#   DATA_DIR       Path to server/data (default: ./server/data).
#   RETENTION_DAYS Days of backups to keep (default: 30).
#
set -euo pipefail

DEST_DIR="${1:-./backups}"
DATA_DIR="${DATA_DIR:-./server/data}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$DEST_DIR"

# 1) Database dump (compressed custom format for fast, selective restore).
if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "[backup] dumping database -> db-${TIMESTAMP}.dump"
  pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner \
    --file="${DEST_DIR}/db-${TIMESTAMP}.dump"
else
  echo "[backup] DATABASE_URL not set — skipping DB dump (JSON-store deployments back up DATA_DIR below)"
fi

# 2) Filesystem data (audit log, baselines, and JSON store if used).
if [[ -d "$DATA_DIR" ]]; then
  echo "[backup] archiving data dir -> data-${TIMESTAMP}.tar.gz"
  tar -czf "${DEST_DIR}/data-${TIMESTAMP}.tar.gz" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
fi

# 3) Retention: prune backups older than RETENTION_DAYS.
echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
find "$DEST_DIR" -type f \( -name 'db-*.dump' -o -name 'data-*.tar.gz' \) \
  -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "[backup] done -> ${DEST_DIR}"

# Restore reference (manual):
#   pg_restore --clean --no-owner --dbname="$DATABASE_URL" db-<ts>.dump
#   tar -xzf data-<ts>.tar.gz -C <target-parent>
