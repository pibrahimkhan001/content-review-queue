const { pool } = require('../models/db');
const { getRedisClient } = require('../models/redis');

const RESERVATION_TTL = parseInt(process.env.RESERVATION_TTL_SECONDS) || 1200; // 20 minutes

/**
 * Cache key for the available-ticket list per locale.
 * TTL is kept short (15 s) so cache never diverges from DB state long.
 */
const availableCacheKey = (locale) => `available:${locale.toLowerCase().replace(/\s+/g, '_')}`;

/**
 * Returns all tickets with status='available' scoped to the given locale.
 * Results are cached in Redis for 15 seconds to reduce DB load on hot paths.
 */
async function getAvailableTickets(locale) {
  const redis = await getRedisClient();
  const cacheKey = availableCacheKey(locale);

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query(
    `SELECT id, locale, title, content, priority, created_at
     FROM tickets
     WHERE locale = $1 AND status = 'available'
     ORDER BY
       CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       created_at ASC`,
    [locale]
  );

  await redis.setEx(cacheKey, 15, JSON.stringify(rows));
  return rows;
}

/**
 * Attempts to reserve a ticket for a reviewer.
 * Uses a SELECT … FOR UPDATE to prevent double-reservation under concurrency.
 *
 * Returns: { success, ticket, reservation } on success
 *          { success: false, reason } on failure
 */
async function reserveTicket(ticketId, reviewerId, locale) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the row so no concurrent request can sneak in
    const { rows: ticketRows } = await client.query(
      `SELECT id, locale, status FROM tickets WHERE id = $1 FOR UPDATE`,
      [ticketId]
    );

    if (ticketRows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'Ticket not found' };
    }

    const ticket = ticketRows[0];

    if (ticket.locale !== locale) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'Ticket does not belong to your locale' };
    }

    if (ticket.status !== 'available') {
      await client.query('ROLLBACK');
      return { success: false, reason: `Ticket is currently ${ticket.status}` };
    }

    // Update ticket status
    await client.query(
      `UPDATE tickets SET status = 'reserved' WHERE id = $1`,
      [ticketId]
    );

    const expiresAt = new Date(Date.now() + RESERVATION_TTL * 1000);

    // Create reservation record
    const { rows: resRows } = await client.query(
      `INSERT INTO reservations (ticket_id, reviewer_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, ticket_id, reviewer_id, reserved_at, expires_at, status`,
      [ticketId, reviewerId, expiresAt]
    );

    await client.query('COMMIT');

    // Invalidate cache for this locale
    const redis = await getRedisClient();
    await redis.del(availableCacheKey(locale));

    // Schedule auto-release via Redis key expiry signal (belt-and-suspenders with cron)
    await redis.setEx(
      `reservation:expiry:${resRows[0].id}`,
      RESERVATION_TTL + 5, // slight buffer
      JSON.stringify({ reservation_id: resRows[0].id, ticket_id: ticketId, locale })
    );

    return { success: true, ticket, reservation: resRows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Confirms an active reservation, transitioning the ticket to 'confirmed'.
 * Must be called by the reviewer who holds the reservation, within the TTL.
 */
async function confirmTicket(ticketId, reviewerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT r.id AS res_id, r.expires_at, r.status AS res_status,
              t.status AS ticket_status, t.locale
       FROM reservations r
       JOIN tickets t ON t.id = r.ticket_id
       WHERE r.ticket_id = $1
         AND r.reviewer_id = $2
         AND r.status = 'active'
       FOR UPDATE OF r`,
      [ticketId, reviewerId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'No active reservation found for this reviewer and ticket' };
    }

    const res = rows[0];

    if (new Date() > new Date(res.expires_at)) {
      // Expired — release it
      await client.query(`UPDATE reservations SET status = 'expired' WHERE id = $1`, [res.res_id]);
      await client.query(`UPDATE tickets SET status = 'available' WHERE id = $1`, [ticketId]);
      await client.query('COMMIT');
      const redis = await getRedisClient();
      await redis.del(availableCacheKey(res.locale));
      return { success: false, reason: 'Reservation expired before confirmation' };
    }

    await client.query(
      `UPDATE reservations SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
      [res.res_id]
    );
    await client.query(`UPDATE tickets SET status = 'confirmed' WHERE id = $1`, [ticketId]);

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Scans for expired active reservations and releases them back into the queue.
 * Called by the background cron job every 30 seconds.
 */
async function releaseExpiredReservations() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE reservations
       SET status = 'expired'
       WHERE status = 'active' AND expires_at < NOW()
       RETURNING ticket_id, (SELECT locale FROM tickets WHERE id = ticket_id) AS locale`
    );

    if (rows.length === 0) return 0;

    const ticketIds = rows.map((r) => r.ticket_id);

    await client.query(
      `UPDATE tickets SET status = 'available' WHERE id = ANY($1::uuid[])`,
      [ticketIds]
    );

    // Bust cache for affected locales
    const redis = await getRedisClient();
    const locales = [...new Set(rows.map((r) => r.locale))];
    for (const locale of locales) {
      await redis.del(availableCacheKey(locale));
    }

    console.log(`[Expiry] Released ${rows.length} expired reservation(s)`);
    return rows.length;
  } finally {
    client.release();
  }
}

/**
 * Aggregated queue health metrics for the /metrics endpoint.
 */
async function getMetrics() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'available')  AS available,
      COUNT(*) FILTER (WHERE status = 'reserved')   AS reserved,
      COUNT(*) FILTER (WHERE status = 'confirmed')  AS confirmed,
      COUNT(*) FILTER (WHERE status = 'completed')  AS completed
    FROM tickets
  `);

  const ticketCounts = rows[0];

  const { rows: resRows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')    AS active_reservations,
      COUNT(*) FILTER (WHERE status = 'expired')   AS expired_reservations,
      COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_reservations
    FROM reservations
  `);

  const { rows: byLocale } = await pool.query(`
    SELECT locale,
           COUNT(*) FILTER (WHERE status = 'available') AS available,
           COUNT(*) FILTER (WHERE status = 'reserved')  AS reserved
    FROM tickets
    GROUP BY locale
    ORDER BY locale
  `);

  return {
    tickets: {
      available:  parseInt(ticketCounts.available),
      reserved:   parseInt(ticketCounts.reserved),
      confirmed:  parseInt(ticketCounts.confirmed),
      completed:  parseInt(ticketCounts.completed),
    },
    reservations: {
      active:    parseInt(resRows[0].active_reservations),
      expired:   parseInt(resRows[0].expired_reservations),
      confirmed: parseInt(resRows[0].confirmed_reservations),
    },
    by_locale: byLocale.map((r) => ({
      locale:    r.locale,
      available: parseInt(r.available),
      reserved:  parseInt(r.reserved),
    })),
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  getAvailableTickets,
  reserveTicket,
  confirmTicket,
  releaseExpiredReservations,
  getMetrics,
};
