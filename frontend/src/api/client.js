

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

export function openSSEStream(token, onMessage) {
  const es = new EventSource(`/tickets/stream?token=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (_) {}
  };
  es.onerror = () => {
    console.warn('[SSE] Connection error — will retry');
  };
  return es;
}
