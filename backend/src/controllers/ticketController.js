const {
  getAvailableTickets,
  reserveTicket,
  confirmTicket,
  getMetrics,
} = require('../services/ticketService');

/**
 * GET /tickets/available
 * Returns all available tickets for the authenticated reviewer's locale.
 */
async function listAvailable(req, res) {
  try {
    const tickets = await getAvailableTickets(req.reviewer.locale);
    return res.json({ locale: req.reviewer.locale, tickets });
  } catch (err) {
    console.error('[Tickets] listAvailable error:', err);
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
}

/**
 * POST /tickets/:id/reserve
 * Reserves a ticket for the authenticated reviewer if it is available and in their locale.
 */
async function reserve(req, res) {
  const { id } = req.params;
  try {
    const result = await reserveTicket(id, req.reviewer.reviewer_id, req.reviewer.locale);
    if (!result.success) {
      return res.status(409).json({ error: result.reason });
    }
    return res.status(200).json({
      message: 'Ticket reserved successfully',
      ticket: result.ticket,
      reservation: result.reservation,
    });
  } catch (err) {
    console.error('[Tickets] reserve error:', err);
    return res.status(500).json({ error: 'Failed to reserve ticket' });
  }
}

/**
 * POST /tickets/:id/confirm
 * Confirms that the reviewer has begun processing the reserved ticket.
 * Must be called within the 20-minute window.
 */
async function confirm(req, res) {
  const { id } = req.params;
  try {
    const result = await confirmTicket(id, req.reviewer.reviewer_id);
    if (!result.success) {
      return res.status(409).json({ error: result.reason });
    }
    return res.status(200).json({ message: 'Ticket confirmed — processing has begun' });
  } catch (err) {
    console.error('[Tickets] confirm error:', err);
    return res.status(500).json({ error: 'Failed to confirm ticket' });
  }
}

/**
 * GET /metrics
 * Returns queue health statistics. No auth required so dashboards can poll freely.
 */
async function metrics(req, res) {
  try {
    const data = await getMetrics();
    return res.json(data);
  } catch (err) {
    console.error('[Metrics] error:', err);
    return res.status(500).json({ error: 'Failed to fetch metrics' });
  }
}

module.exports = { listAvailable, reserve, confirm, metrics };
