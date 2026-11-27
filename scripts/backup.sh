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
#    Ключи читаются по одному, без `source .env`: в файле есть JSON-значения с пробелами
#    (OPENAI_EXTRA_BODY, RADAR_EXTRACT_PROVIDERS). Для bash это команда, а при `set -e`
#    ошибка «command not found» прекращала скрипт до дампа.
if [ -f .env ]; then
  while IFS= read -r line; do
    key=${line%%=*}
    value=${line#*=}
    case $value in
      \"*\" | \'*\') value=${value#?}; value=${value%?} ;;
    esac
    printf -v "$key" '%s' "$value"
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | tr -d '\r')
fi

POSTGRES_USER="${POSTGRES_USER:-radar}"
POSTGRES_DB="${POSTGRES_DB:-radar}"
CONTAINER_NAME="${PG_CONTAINER:-radar_postgres}"

echo "[Radar Backup] Starting backup of database ${POSTGRES_DB}..."

# Dump with the app running first. A concurrent BM25 search can push the postgres cgroup
# over its memory limit mid-COPY and the OOM killer terminates the backend (seen on a 3g
# box); when the dump fails, stop the app so the dump owns the memory, then always restart it.
dump_ok() {
  # PGOPTIONS: the role-level statement_timeout (120s backstop) must not kill a long
  # COPY of the leads table; the dump is a trusted operator command.
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    # No -t: a TTY rewrites LF to CRLF and corrupts the binary custom-format dump.
    docker exec -e PGOPTIONS='-c statement_timeout=0' "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$BACKUP_FILE"
  elif command -v pg_dump >/dev/null 2>&1; then
    PGOPTIONS='-c statement_timeout=0' pg_dump -Fc "$DATABASE_URL" > "$BACKUP_FILE"
  else
    echo "[Radar Backup] Error: Neither container ${CONTAINER_NAME} nor pg_dump found"
    return 1
  fi
}

APP_STOPPED=0
restart_app() {
  if [ "$APP_STOPPED" = "1" ]; then
    docker compose start radar >/dev/null 2>&1 || docker start radar_app >/dev/null 2>&1 || true
    APP_STOPPED=0
    echo "[Radar Backup] App restarted"
  fi
}
trap restart_app EXIT

if ! dump_ok; then
  echo "[Radar Backup] Dump failed (postgres OOM under load?). Stopping the app and retrying..."
  rm -f "$BACKUP_FILE"
  if docker compose stop radar >/dev/null 2>&1 || docker stop radar_app >/dev/null 2>&1; then
    APP_STOPPED=1
  fi
  if ! dump_ok; then
    restart_app
    echo "[Radar Backup] Error: dump failed even with the app stopped"
    exit 1
  fi
fi
restart_app

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

# 5. Rotation: keep the newest BACKUP_KEEP dumps (default 4 — two weeks at two runs a week)
# and drop anything older than BACKUP_KEEP_DAYS (default 30) regardless of count.
KEEP="${BACKUP_KEEP:-4}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
echo "[Radar Backup] Rotation: keep newest ${KEEP}, drop anything older than ${KEEP_DAYS} days..."
{ ls -1t "$BACKUP_DIR"/radar_*.dump "$BACKUP_DIR"/radar_*.dump.age 2>/dev/null || true; } \
  | tail -n +"$((KEEP + 1))" | while IFS= read -r stale; do rm -f "$stale"; done
find "$BACKUP_DIR" -type f \( -name "radar_*.dump" -o -name "radar_*.dump.age" \) -mtime +"$KEEP_DAYS" -delete

echo "[Radar Backup] Backup completed successfully"
