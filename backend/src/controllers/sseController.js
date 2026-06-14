const jwt = require('jsonwebtoken');
const { getAvailableTickets } = require('../services/ticketService');


async function streamTickets(req, res) {
  const rawToken = req.query.token;
  if (!rawToken) { res.status(401).end('Missing token'); return; }

  let reviewer;
  try {
    reviewer = jwt.verify(rawToken, process.env.JWT_SECRET);
  } catch {
    res.status(401).end('Invalid token');
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const push = async () => {
    try {
      const tickets = await getAvailableTickets(reviewer.locale);
      const payload = JSON.stringify({ locale: reviewer.locale, tickets, timestamp: new Date().toISOString() });
      res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error('[SSE] push error:', err.message);
    }
  };

  await push();
  const interval = setInterval(push, 10_000);

  req.on('close', () => {
    clearInterval(interval);
    console.log(`[SSE] Reviewer ${reviewer.reviewer_id} disconnected`);
  });
}

module.exports = { streamTickets };
