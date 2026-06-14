const cron = require('node-cron');
const { releaseExpiredReservations } = require('../services/ticketService');

/**
 * Registers a cron job that sweeps for expired reservations every 30 seconds.
 *
 * This is the primary release mechanism. Redis key expiry used in
 * reserveTicket() is a belt-and-suspenders backup, but the cron job
 * guarantees correctness even if the Redis key is evicted early.
 */
function startExpiryJob() {
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await releaseExpiredReservations();
    } catch (err) {
      console.error('[Expiry Job] Error during sweep:', err.message);
    }
  });

  console.log('[Expiry Job] Reservation expiry sweep scheduled every 30 seconds');
}

module.exports = { startExpiryJob };
