import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAvailableTickets, reserveTicket, confirmTicket, openSSEStream } from '../api/client';
import TicketCard from '../components/TicketCard';
import './DashboardPage.css';

export default function DashboardPage({ session }) {
  const [tickets, setTickets]                 = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');
  const [actionStates, setActionStates]       = useState({}); // ticketId → { loading, message, type }
  const [activeReservation, setActiveReservation] = useState(null); // { ticketId, expiresAt }
  const [timeLeft, setTimeLeft]               = useState(null);
  const [liveConnected, setLiveConnected]     = useState(false);

  const timerRef  = useRef(null);
  const pollRef   = useRef(null);
  const sseRef    = useRef(null);

  // ── Fetch tickets (used as fallback when SSE is not connected) ─────────────
  const loadTickets = useCallback(async () => {
    try {
      const data = await fetchAvailableTickets(session.token);
      setTickets(data);
      setError('');
    } catch (err) {
      if (err.message.includes('401')) {
        setError('Session expired — please sign in again');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  // ── SSE stream — primary delivery mechanism ────────────────────────────────
  useEffect(() => {
    const es = openSSEStream(session.token, (payload) => {
      setTickets(payload.tickets);
      setError('');
      setLoading(false);
      setLiveConnected(true);
    });

    es.onerror = () => setLiveConnected(false);
    sseRef.current = es;

    // Fallback: also poll every 15 s in case SSE drops
    loadTickets();
    pollRef.current = setInterval(loadTickets, 15_000);

    return () => {
      es.close();
      clearInterval(pollRef.current);
    };
  }, [session.token, loadTickets]);

  // ── Countdown timer for active reservation ─────────────────────────────────
  useEffect(() => {
    if (!activeReservation) { setTimeLeft(null); return; }

    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(activeReservation.expiresAt) - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff === 0) {
        setActiveReservation(null);
        loadTickets();
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1_000);
    return () => clearInterval(timerRef.current);
  }, [activeReservation, loadTickets]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleReserve(ticketId) {
    setActionStates((s) => ({ ...s, [ticketId]: { loading: true } }));
    try {
      const data = await reserveTicket(session.token, ticketId);
      setActiveReservation({ ticketId, expiresAt: data.reservation.expires_at });
      setActionStates((s) => ({
        ...s,
        [ticketId]: { message: 'Reserved! Confirm within 20 minutes.', type: 'success' },
      }));
      loadTickets();
    } catch (err) {
      setActionStates((s) => ({ ...s, [ticketId]: { message: err.message, type: 'error' } }));
    }
  }

  async function handleConfirm(ticketId) {
    setActionStates((s) => ({ ...s, [ticketId]: { loading: true } }));
    try {
      await confirmTicket(session.token, ticketId);
      setActiveReservation(null);
      setActionStates((s) => ({
        ...s,
        [ticketId]: { message: "Confirmed — you're now processing this ticket.", type: 'success' },
      }));
      loadTickets();
    } catch (err) {
      setActionStates((s) => ({ ...s, [ticketId]: { message: err.message, type: 'error' } }));
    }
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isUrgent = timeLeft !== null && timeLeft < 120;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Available Tickets</h2>
          <p className="dashboard-sub">
            Showing tickets for <strong>{session.locale}</strong>
            <span className={`live-badge ${liveConnected ? 'live-badge--on' : ''}`}>
              {liveConnected ? '● Live' : '○ Polling'}
            </span>
          </p>
        </div>
        <button className="refresh-btn" onClick={loadTickets} disabled={loading}>
          {loading ? '⟳ Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {activeReservation && timeLeft !== null && (
        <div className={`reservation-banner ${isUrgent ? 'urgent' : ''}`}>
          <span>
            {isUrgent ? '⚠️' : '⏱'}&nbsp;
            You have a reserved ticket — confirm before time runs out.
          </span>
          <span className="countdown">
            {timeLeft > 0 ? formatTime(timeLeft) : 'Expired'}
          </span>
        </div>
      )}

      {error && <div className="dash-error">{error}</div>}

      {!loading && tickets.length === 0 && !error && (
        <div className="empty-state">
          <span className="empty-icon">✓</span>
          <p>No available tickets in your locale right now.</p>
          <p className="empty-sub">
            Tickets auto-release after 20 minutes if not confirmed.
          </p>
        </div>
      )}

      <div className="ticket-grid">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            isReservedByMe={activeReservation?.ticketId === ticket.id}
            actionState={actionStates[ticket.id]}
            onReserve={() => handleReserve(ticket.id)}
            onConfirm={() => handleConfirm(ticket.id)}
            reservedTicketId={activeReservation?.ticketId}
          />
        ))}
      </div>
    </div>
  );
}
