const cron = require('node-cron');
const { releaseExpiredReservations } = require('../services/ticketService');


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
