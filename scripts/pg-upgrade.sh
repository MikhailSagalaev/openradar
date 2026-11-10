#!/usr/bin/env bash
# Moves the database of a running radar_postgres to the major version in docker-compose.yml.
#
# A new major release of PostgreSQL cannot open the data of an older one, so the data goes
# over by dump and restore: dump the old server, start the new one on a new volume, restore,
# and leave the old volume as it was, for a rollback. deploy-server.sh runs it on every
# deploy; when the versions already agree it does nothing.
#
# Rollback: put the old image and volume back in docker-compose.yml and recreate postgres.
set -euo pipefail
cd "${RADAR_DIR:-.}"

CONTAINER="${PG_CONTAINER:-radar_postgres}"
# The major of the image the compose file asks for: the tag ends in pg18 — pgvector/pgvector:pg18,
# paradedb/paradedb:latest-pg18, a ${RADAR_PG_IMAGE:-...} default — every shape carries pgN.
WANT=$(grep -E '^\s*image:.*pg[0-9]+' docker-compose.yml | head -1 | sed -E 's/.*pg([0-9]+).*/\1/')
[ -n "$WANT" ] || { echo "pg-upgrade: no postgres image with a pgN tag in docker-compose.yml" >&2; exit 1; }

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "pg-upgrade: $CONTAINER is not running, nothing to move"
  exit 0
fi
HAVE=$(docker exec "$CONTAINER" sh -c 'cat "$PGDATA/PG_VERSION"' </dev/null | tr -d '\r\n ')
if [ "$HAVE" = "$WANT" ]; then
  exit 0
fi
if [ "$HAVE" -gt "$WANT" ]; then
  echo "pg-upgrade: the running server is PostgreSQL $HAVE, newer than $WANT in docker-compose.yml" >&2
  exit 1
fi

PG_USER=$(grep -E "^POSTGRES_USER=" .env 2>/dev/null | cut -d '=' -f2- | tr -d ' "' || true)
PG_DB=$(grep -E "^POSTGRES_DB=" .env 2>/dev/null | cut -d '=' -f2- | tr -d ' "' || true)
PG_USER=${PG_USER:-radar}
PG_DB=${PG_DB:-radar}
BACKUP_DIR="${RADAR_BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
DUMP="$BACKUP_DIR/pg$HAVE-to-pg$WANT-$(date +%Y%m%d-%H%M%S).dump"

echo "pg-upgrade: PostgreSQL $HAVE → $WANT"
docker compose stop radar </dev/null || true
# No -t: a TTY turns LF into CRLF and corrupts the custom-format dump.
docker exec "$CONTAINER" pg_dump -U "$PG_USER" -Fc "$PG_DB" </dev/null > "$DUMP"
[ -s "$DUMP" ] || { echo "pg-upgrade: empty dump, stopped" >&2; docker compose start radar </dev/null || true; exit 1; }
echo "pg-upgrade: dump $DUMP ($(du -h "$DUMP" | cut -f1))"

docker compose up -d --force-recreate postgres </dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" -q </dev/null && break
  sleep 2
done
NEW=$(docker exec "$CONTAINER" sh -c 'cat "$PGDATA/PG_VERSION"' </dev/null | tr -d '\r\n ')
[ "$NEW" = "$WANT" ] || { echo "pg-upgrade: the new server reports $NEW, expected $WANT" >&2; exit 1; }
TABLES=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "select count(*) from pg_tables where schemaname='public'" </dev/null)
[ "$TABLES" = "0" ] || { echo "pg-upgrade: the new volume already has $TABLES tables, not restoring over them" >&2; exit 1; }

docker exec -i "$CONTAINER" pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --exit-on-error < "$DUMP"
LEADS=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "select count(*) from leads" </dev/null)
echo "pg-upgrade: restored into PostgreSQL $WANT, leads: $LEADS; the old volume is left as it was"
