#!/usr/bin/env bash
# ==============================================================================
# One-time (idempotent) memory budgets for the production PostgreSQL + ParadeDB.
# Run on the server from the checkout:  bash scripts/pg-memory-budgets.sh
# Rationale, measured numbers and sources: docs/OPS_BOT_AND_MEMORY.md.
#
# Everything is ALTER DATABASE / ALTER ROLE: persistent, no restart, new sessions
# pick the values up (the app's connection recycling retires old sessions within
# RADAR_PG_CONN_MAX_AGE_SEC). Re-running is safe.
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PG_USER=$(grep -E "^POSTGRES_USER=" .env | cut -d '=' -f2- | tr -d ' "' || true)
PG_DB=$(grep -E "^POSTGRES_DB=" .env | cut -d '=' -f2- | tr -d ' "' || true)
PG_USER=${PG_USER:-radar}
PG_DB=${PG_DB:-radar}

psql() { docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" "$@" </dev/null; }

echo "== applying memory budgets to database '$PG_DB' =="
psql -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE \"$PG_DB\" SET paradedb.max_topk_chunk_size = 10000" \
  -c "ALTER DATABASE \"$PG_DB\" SET work_mem = '16MB'" \
  -c "ALTER DATABASE \"$PG_DB\" SET paradedb.spill_to_disk = on" \
  -c "ALTER DATABASE \"$PG_DB\" SET temp_file_limit = '2GB'" \
  -c "ALTER DATABASE \"$PG_DB\" SET max_parallel_workers_per_gather = 1" \
  -c "ALTER DATABASE \"$PG_DB\" SET log_temp_files = 0" \
  -c "ALTER ROLE \"$PG_USER\" SET statement_timeout = '120s'" \
  -c "ALTER ROLE \"$PG_USER\" SET idle_in_transaction_session_timeout = '60s'" \
  -c "ALTER ROLE \"$PG_USER\" SET idle_session_timeout = '10min'"
# Why each value: see docs/OPS_BOT_AND_MEMORY.md (TopK chunks, spill, timeouts).

echo "== resulting per-database / per-role overrides =="
psql -tAc "SELECT d.datname, s.setconfig FROM pg_db_role_setting s JOIN pg_database d ON d.oid=s.setdatabase;"
psql -tAc "SELECT r.rolname, s.setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole;"
echo "Done. New connections pick the budgets up; the app retires old ones within its recycling window."
