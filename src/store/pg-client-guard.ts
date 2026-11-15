import type pg from 'pg';

/**
 * Crash guard for a checked-out pool client.
 *
 * pg-pool attaches its idle-error listener only while a client sits in the pool:
 * `connect()` removes it (pg-pool index.js, the `client.removeListener('error',
 * idleListener)` on checkout) and `release()` re-adds it. So for the whole time a
 * client is checked out — e.g. inside a BEGIN…COMMIT transaction — a server-side
 * connection termination (idle_in_transaction_session_timeout, statement_timeout
 * on a idle-in-transaction backend, an admin pg_terminate_backend, a failover)
 * emits a FATAL 'error' on the client with NO listener. Node treats an unhandled
 * 'error' event as fatal and crashes the whole process. The pool's own
 * `pool.on('error')` handler only covers *idle* clients, not checked-out ones.
 *
 * This was observed in production: `terminating connection due to idle-in-transaction
 * timeout` (SQLSTATE 25P03) crashed radar_app mid-transaction (docs/OPS_BOT_AND_MEMORY.md).
 *
 * Attach this listener for the duration of the checkout and remove it before
 * `release()` (which restores the pool's own idle listener). It only logs: the
 * in-flight query rejects on its own and the caller's catch/finally handles
 * rollback and release. Removing it before release avoids a double report, since
 * the pool's idle listener would otherwise log the same error again.
 */
export function guardCheckedOutClient(client: pg.PoolClient): () => void {
  const onCheckoutError = (err: Error): void => {
    console.error('[radar:postgres] checked-out client error (connection terminated mid-request)', err.message);
  };
  client.on('error', onCheckoutError);
  return () => {
    client.removeListener('error', onCheckoutError);
  };
}
