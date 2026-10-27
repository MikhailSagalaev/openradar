#!/usr/bin/env bash
# ==============================================================================
# Radar Automated PostgreSQL Backup Script
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/radar_${TIMESTAMP}.dump"
ENCRYPTED_FILE="${BACKUP_FILE}.age"

# 1. Загрузка переменных окружения если есть .env
if [ -f .env ]; then
  # shellcheck disable=SC1091
  source .env
fi

POSTGRES_USER="${POSTGRES_USER:-radar}"
POSTGRES_DB="${POSTGRES_DB:-radar}"
CONTAINER_NAME="${PG_CONTAINER:-radar_postgres}"

echo "[Radar Backup] Starting backup of database ${POSTGRES_DB}..."

# 2. Dump via pg_dump -Fc
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  # No -t: a TTY rewrites LF to CRLF and corrupts the binary custom-format dump.
  docker exec "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$BACKUP_FILE"
elif command -v pg_dump >/dev/null 2>&1; then
  pg_dump -Fc "$DATABASE_URL" > "$BACKUP_FILE"
else
  echo "[Radar Backup] Error: Neither container ${CONTAINER_NAME} nor pg_dump found"
  exit 1
fi

echo "[Radar Backup] Dump saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Verify the archive is readable before trusting it (and before encrypting/uploading it).
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker exec -i "$CONTAINER_NAME" pg_restore --list < "$BACKUP_FILE" > /dev/null
elif command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$BACKUP_FILE" > /dev/null
fi
echo "[Radar Backup] Archive verified with pg_restore --list"

# 3. Optional age encryption
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ] && command -v age >/dev/null 2>&1; then
  echo "[Radar Backup] Encrypting with age..."
  age -r "$BACKUP_AGE_RECIPIENT" -o "$ENCRYPTED_FILE" "$BACKUP_FILE"
  rm -f "$BACKUP_FILE"
  UPLOAD_TARGET="$ENCRYPTED_FILE"
  echo "[Radar Backup] Encrypted: $ENCRYPTED_FILE"
else
  UPLOAD_TARGET="$BACKUP_FILE"
fi

# 4. Optional upload to S3
if [ -n "${S3_BUCKET:-}" ] && command -v aws >/dev/null 2>&1; then
  echo "[Radar Backup] Uploading to S3 (${S3_BUCKET})..."
  ENDPOINT_FLAG=""
  if [ -n "${S3_ENDPOINT:-}" ]; then
    ENDPOINT_FLAG="--endpoint-url ${S3_ENDPOINT}"
  fi
  aws s3 cp "$UPLOAD_TARGET" "s3://${S3_BUCKET}/radar/$(basename "$UPLOAD_TARGET")" ${ENDPOINT_FLAG}
  echo "[Radar Backup] Uploaded to S3"
fi

# 5. Rotation: keep 14 days
echo "[Radar Backup] Cleaning backups older than 14 days..."
find "$BACKUP_DIR" -type f \( -name "radar_*.dump" -o -name "radar_*.dump.age" \) -mtime +14 -delete

echo "[Radar Backup] Backup completed successfully"
