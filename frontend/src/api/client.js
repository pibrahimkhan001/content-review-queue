/**
 * All backend communication lives here.
 *
 * URL strategy:
 *  - In Docker:     nginx proxies /auth, /tickets, /metrics → backend:4000
 *  - In local dev:  CRA's "proxy" field in package.json proxies to http://localhost:4000
 *  Both cases use the same relative-path calls — no REACT_APP_API_URL needed.
 */

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function login(reviewer_id, locale) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ reviewer_id, locale }),
  });
}

export async function fetchAvailableTickets(token) {
  const data = await request('/tickets/available', { headers: authHeader(token) });
  return data.tickets;
}

/**
 * Returns the authenticated reviewer's currently-active reservations
 * (tickets they've picked up but not yet confirmed), soonest-expiring first.
 */
export async function fetchMyReservations(token) {
  const data = await request('/tickets/my-reservations', { headers: authHeader(token) });
  return data.reservations;
}

export async function reserveTicket(token, id) {
  return request(`/tickets/${id}/reserve`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function confirmTicket(token, id) {
  return request(`/tickets/${id}/confirm`, {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function fetchMetrics() {
  return request('/metrics');
}

/**
 * Opens an SSE stream for live ticket updates.
 * EventSource doesn't support custom headers, so the JWT is passed
 * as a query parameter. The backend's SSE controller reads it from
 * req.query.token instead of the Authorization header.
 */
export function openSSEStream(token, onMessage) {
  const es = new EventSource(`/tickets/stream?token=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (_) {}
  };
  es.onerror = () => {
    // EventSource will auto-reconnect; log silently
    console.warn('[SSE] Connection error — will retry');
  };
  return es;
}
