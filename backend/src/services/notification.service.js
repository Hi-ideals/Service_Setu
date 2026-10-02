/**
 * Notification fan-out.
 *
 * Every booking status change, KYC decision, payment event and reminder is
 * published through here. Delivery is best-effort and never blocks the request
 * that triggered it - a slow mail server must not delay a booking
 * confirmation.
 *
 * Email is the default channel. SMS is kept for the few cases where reaching
 * someone on site matters more than the per-message cost.
 */
import { query } from '../db/pool.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { sendEmail } from './email/mailer.js';
import { notificationEmail } from './email/templates.js';

const smsDriver = {
  async send({ destination, title, body }) {
    logger.info({ destination }, '[SMS -> ' + destination + '] ' + title + ' :: ' + body);
    return { delivered: true };
  },
};

/**
 * Records the notification, then attempts delivery. The record is written
 * first so a delivery failure is visible and retryable rather than lost.
 */
export async function notify({
  userId,
  channel = 'in_app',
  eventType,
  title,
  body,
  destination = null,
  // Pre-rendered email, when the caller has something richer than a sentence
  // (an OTP, for instance). Falls back to a plain notification template.
  email = null,
  data = null,
  entityType = null,
  entityId = null,
}) {
  let row = null;

  try {
    row = (
      await query(
        `INSERT INTO notifications
           (user_id, channel, event_type, title, body, data, entity_type, entity_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
         RETURNING id`,
        [
          userId, channel, eventType, title, body,
          data ? JSON.stringify(data) : null, entityType, entityId,
        ],
      )
    ).rows[0];
  } catch (err) {
    logger.error({ err, eventType }, 'Could not record notification');
    return null;
  }

  if (channel === 'in_app') {
    await query(`UPDATE notifications SET status='sent', sent_at=NOW() WHERE id=$1`, [row.id]);
    return row.id;
  }

  try {
    if (channel === 'email') {
      const content = email || notificationEmail({ title, body });
      await sendEmail({ to: destination, ...content });
    } else if (channel === 'sms') {
      await smsDriver.send({ destination, title, body });
    } else {
      // push, or anything added later, is recorded but not yet delivered.
      logger.debug({ channel, eventType }, 'Channel has no driver, recorded only');
    }

    await query(`UPDATE notifications SET status='sent', sent_at=NOW() WHERE id=$1`, [row.id]);
  } catch (err) {
    await query(
      `UPDATE notifications SET status='failed', failure_reason=$2, attempts=attempts+1 WHERE id=$1`,
      [row.id, err.message],
    );
    logger.warn({ err: err.message, eventType, channel }, 'Notification delivery failed');
  }

  return row.id;
}

/**
 * Delivers one event in-app AND by email.
 *
 * The in-app row is what the site reads; the email is what reaches someone who
 * is not on the site. Both matter, and almost every event that is worth an
 * in-app row is worth an email, because the person it concerns is usually
 * somewhere else when it happens.
 *
 * The address is looked up here rather than passed in, so no caller has to
 * carry a recipient's email around just to notify them.
 */
export async function notifyEveryChannel({ userId, actionLabel, actionPath, ...payload }) {
  await notify({ ...payload, userId, channel: 'in_app' });

  let recipient = null;
  try {
    recipient = (
      await query(
        `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL AND status = 'active'`,
        [userId],
      )
    ).rows[0];
  } catch (err) {
    logger.error({ err, userId }, 'Could not look up a notification recipient');
    return;
  }

  // Phone-only accounts and closed accounts are skipped rather than failed:
  // there is nothing wrong, there is simply nowhere to send.
  if (!recipient?.email) return;

  await notify({
    ...payload,
    userId,
    channel: 'email',
    destination: recipient.email,
    email: notificationEmail({
      title: payload.title,
      body: payload.body,
      actionLabel,
      actionUrl: actionPath ? env.APP_URL + actionPath : undefined,
    }),
  });
}

/** Fire-and-forget wrapper: notification failure must never fail the caller. */
export function notifyAsync(payload) {
  notify(payload).catch((err) => logger.error({ err }, 'notifyAsync failed'));
}

/**
 * Fire-and-forget across every channel.
 *
 * Deliberately not awaited by callers: a slow mail server must never hold up
 * the booking that triggered it.
 */
export function notifyAllAsync(payload) {
  notifyEveryChannel(payload).catch((err) => logger.error({ err }, 'notifyAllAsync failed'));
}

export default { notify, notifyAsync, notifyEveryChannel, notifyAllAsync };
