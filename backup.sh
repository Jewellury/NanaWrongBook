#!/bin/bash
BACKUP_DIR="/opt/nana/backups"
DB_PATH="/opt/nana/data/dev.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if ! command -v sqlite3 &>/dev/null; then
  echo "ERROR: sqlite3 not installed. Install it: apt install -y sqlite3"
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "INFO: database not found at $DB_PATH, first deployment, backup skipped."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/dev.db.$TIMESTAMP'"
echo "[$(date)] backup: dev.db.$TIMESTAMP"

# Keep only last 14 days
find "$BACKUP_DIR" -name "dev.db.*" -mtime +14 -delete
