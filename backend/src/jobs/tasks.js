/**
 * The scheduled tasks themselves.
 *
 * Each one is idempotent and bounded: running it twice does no extra damage,
 * and a single run cannot process an unbounded number of rows and hold a
 * connection open for minutes.
 */
import { query, queryMany, withTransaction } from '../db/pool.js';
import logger from '../config/logger.js';
import * as storage from '../storage/storage.service.js';
import { notify } from '../services/notification.service.js';
import { expireStaleRequests } from '../modules/bookings/booking.service.js';
import { nudgeStalledJobs } from '../modules/bookings/job.service.js';
import { runBatch as runPayoutBatch } from '../modules/admin/payout.service.js';

/** Auto-cancels booking requests the provider never answered. */
export async function expireRequests() {
  const result = await expireStaleRequests();
  return { expired: result.expired };
}

/** Nudges jobs that were accepted but never started, or started but never finished. */
export async function nudgeStalled() {
  return nudgeStalledJobs();
}

/**
 * Retries notifications that failed to send.
 *
 * Capped attempts, so a permanently bad phone number stops costing money
 * rather than being retried forever.
 */
export async function retryNotifications() {
  const pending = await queryMany(
    `SELECT n.id, n.user_id, n.channel, n.event_type, n.title, n.body,
            -- Per channel, not COALESCE: an email retry sent to a phone
            -- number fails forever, and looks like a mail server problem.
            CASE n.channel
              WHEN 'email' THEN u.email
              WHEN 'sms'   THEN u.phone
              ELSE COALESCE(u.email, u.phone)
            END AS destination
       FROM notifications n
       JOIN users u ON u.id = n.user_id
      WHERE n.status = 'failed' AND n.attempts < 3
        AND n.created_at > NOW() - INTERVAL '24 hours'
        -- Nothing to retry if the account has no address on that channel.
        AND (n.channel <> 'email' OR u.email IS NOT NULL)
        AND (n.channel <> 'sms' OR u.phone IS NOT NULL)
      ORDER BY n.created_at
      LIMIT 50`,
  );

  let sent = 0;

  for (const row of pending) {
    try {
      await query(`UPDATE notifications SET status = 'pending' WHERE id = $1`, [row.id]);
      await notify({
        userId: row.user_id,
        channel: row.channel,
        destination: row.destination,
        eventType: row.event_type,
        title: row.title,
        body: row.body,
      });
      // The original row is left as evidence of the failure; the retry is a
      // new row, so the history of what was attempted stays intact.
      await query(`UPDATE notifications SET status = 'skipped' WHERE id = $1`, [row.id]);
      sent += 1;
    } catch (err) {
      logger.warn({ err, notificationId: row.id }, 'Notification retry failed again');
    }
  }

  return { retried: pending.length, sent };
}

/**
 * Reconciles payments against the gateway.
 *
 * A webhook that never arrived leaves a payment stuck as pending while the
 * customer's money has in fact left their account. This sweep finds those and
 * flags them; with a real gateway it would query the provider's API for the
 * authoritative status.
 */
export async function reconcilePayments() {
  const stuck = await queryMany(
    `SELECT id, reference, booking_id, gateway_order_id, created_at
       FROM payments
      WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '2 hours'
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at
      LIMIT 100`,
  );

  if (stuck.length) {
    logger.warn(
      { count: stuck.length, references: stuck.slice(0, 10).map((p) => p.reference) },
      'Payments pending for over two hours - reconcile against the gateway',
    );
  }

  return { flagged: stuck.length };
}

/**
 * Removes KYC files whose database rows have gone.
 *
 * Deleting a provider cascades their kyc_documents rows away but leaves the
 * files on disk - the orphan problem noted when KYC was built. This is the
 * sweep that clears them.
 */
export async function cleanOrphanedFiles() {
  const known = await queryMany('SELECT storage_key FROM kyc_documents');
  const keep = new Set(known.map((r) => r.storage_key));

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = path.resolve(process.env.UPLOAD_DIR || 'uploads', 'private', 'kyc');

  let removed = 0;
  let scanned = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Directory does not exist yet.
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }

      scanned += 1;
      const key = path.relative(path.resolve(process.env.UPLOAD_DIR || 'uploads', 'private'), full)
        .split(path.sep).join('/');

      if (keep.has(key)) continue;

      // Only files older than a day, so an upload mid-flight is never deleted.
      const stat = await fs.stat(full);
      if (Date.now() - stat.mtimeMs < 86400000) continue;

      await fs.rm(full, { force: true });
      removed += 1;
    }
  }

  await walk(root);
  return { scanned, removed };
}

/** Releases provider payouts on the configured schedule. */
export async function releasePayouts() {
  const result = await runPayoutBatch();
  return { attempted: result.attempted, paid: result.paid, failed: result.failed };
}

/** Closes the dispute window on completed jobs, making earnings payable. */
export async function closeDisputeWindows() {
  const { rowCount } = await query(
    `UPDATE provider_earnings
        SET available_at = NOW()
      WHERE payout_id IS NULL
        AND available_at > NOW()
        AND booking_id IN (
          SELECT id FROM bookings
           WHERE status = 'completed'
             AND dispute_window_ends_at IS NOT NULL
             AND dispute_window_ends_at <= NOW()
        )`,
  );

  return { released: rowCount };
}

export default {
  expireRequests, nudgeStalled, retryNotifications, reconcilePayments,
  cleanOrphanedFiles, releasePayouts, closeDisputeWindows,
};
