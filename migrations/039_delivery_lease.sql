-- 039_delivery_lease.sql: Outbox leases for exactly-once delivery claims.
-- A claimed row is invisible to other workers until the lease expires or the
-- row is updated. The old SELECT ... FOR UPDATE SKIP LOCKED through pool.query
-- released its lock immediately (implicit single-statement transaction); the
-- claim is now a single UPDATE whose subquery lock lives in its own transaction.
ALTER TABLE lead_deliveries ADD COLUMN IF NOT EXISTS leased_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_lead_deliveries_due
  ON lead_deliveries (next_attempt_at)
  WHERE status <> 'sent';
