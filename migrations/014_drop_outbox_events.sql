-- 014_drop_outbox_events.sql
-- outbox_events was written on every lead change but never read: delivery state lives in
-- lead_deliveries. Drop it instead of keeping an ever-PENDING log.
DROP TABLE IF EXISTS outbox_events;
