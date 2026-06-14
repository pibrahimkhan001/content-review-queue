const {
  getAvailableTickets,
  reserveTicket,
  confirmTicket,
  getMyReservations,
  getMetrics,
} = require('../services/ticketService');


async function listAvailable(req, res) {
  try {
    const tickets = await getAvailableTickets(req.reviewer.locale);
    return res.json({ locale: req.reviewer.locale, tickets });
  } catch (err) {
    console.error('[Tickets] listAvailable error:', err);
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
}


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


async function myReservations(req, res) {
  try {
    const reservations = await getMyReservations(req.reviewer.reviewer_id);
    return res.json({ reviewer_id: req.reviewer.reviewer_id, reservations });
  } catch (err) {
    console.error('[Tickets] myReservations error:', err);
    return res.status(500).json({ error: 'Failed to fetch your reservations' });
  }
}


async function metrics(req, res) {
  try {
    const data = await getMetrics();
    return res.json(data);
  } catch (err) {
    console.error('[Metrics] error:', err);
    return res.status(500).json({ error: 'Failed to fetch metrics' });
  }
}

module.exports = { listAvailable, reserve, confirm, myReservations, metrics };
