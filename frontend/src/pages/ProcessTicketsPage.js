import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMyReservations, confirmTicket } from '../api/client';
import './ProcessTicketsPage.css';

const PRIORITY_LABELS  = { high: '● High', normal: '● Normal', low: '● Low' };
const PRIORITY_CLASSES = { high: 'priority-high', normal: 'priority-normal', low: 'priority-low' };

const formatTime = (secs) => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

/**
 * "Process Tickets" tab.
 *
 * Once a reviewer reserves a ticket it disappears from the "Available
 * Tickets" queue (its status is no longer `available`), so this page is
 * where the reviewer actually lands to act on what they picked up.
 *
 * It lists every ticket the reviewer currently holds an *active*
 * reservation for, along with a live countdown to its 20-minute expiry,
 * and a "Start Processing" action that calls the existing
 * `POST /tickets/:id/confirm` endpoint — moving the ticket to `confirmed`
 * and stopping its auto-release clock.
 */
export default function ProcessTicketsPage({ session }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading]            = useState(true);
  const [error, setError]                = useState('');
  const [actionStates, setActionStates]  = useState({}); // reservationId → { loading, message, type }
  const [now, setNow]                    = useState(Date.now());

  const pollRef  = useRef(null);
  const tickRef  = useRef(null);

  // ── Fetch the reviewer's active reservations ───────────────────────────────
  const loadReservations = useCallback(async () => {
    try {
      const data = await fetchMyReservations(session.token);
      setReservations(data);
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

  useEffect(() => {
    loadReservations();
    // Poll periodically so reservations made/confirmed/expired elsewhere
    // (or via another tab) stay in sync.
    pollRef.current = setInterval(loadReservations, 5_000);
    return () => clearInterval(pollRef.current);
  }, [loadReservations]);

  // ── Live countdown ticker ───────────────────────────────────────────────────
  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tickRef.current);
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleStartProcessing(reservation) {
    const ticketId = reservation.ticket.id;
    setActionStates((s) => ({ ...s, [reservation.reservation_id]: { loading: true } }));
    try {
      await confirmTicket(session.token, ticketId);
      setActionStates((s) => ({
        ...s,
        [reservation.reservation_id]: { message: 'Processing started!', type: 'success' },
      }));
      // Refresh so the confirmed ticket drops off this list shortly after.
      setTimeout(loadReservations, 400);
    } catch (err) {
      setActionStates((s) => ({
        ...s,
        [reservation.reservation_id]: { message: err.message, type: 'error' },
      }));
      // The ticket may have expired between renders — refresh either way.
      loadReservations();
    }
  }

  return (
    <div className="process-page">
      <div className="process-header">
        <div>
          <h2>Process Tickets</h2>
          <p className="process-sub">
            Tickets you've reserved, awaiting confirmation in <strong>{session.locale}</strong>
          </p>
        </div>
        <button className="refresh-btn" onClick={loadReservations} disabled={loading}>
          {loading ? '⟳ Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {error && <div className="process-error">{error}</div>}

      {!loading && reservations.length === 0 && !error && (
        <div className="empty-state">
          <span className="empty-icon">✓</span>
          <p>You have no reserved tickets right now.</p>
          <p className="empty-sub">
            Head to the Queue tab to reserve a ticket — it'll show up here so you can start processing it.
          </p>
        </div>
      )}

      <div className="process-grid">
        {reservations.map((reservation) => {
          const { ticket, expires_at, reservation_id } = reservation;
          const secsLeft = Math.max(0, Math.floor((new Date(expires_at) - now) / 1000));
          const isUrgent = secsLeft < 120;
          const isExpired = secsLeft === 0;
          const actionState = actionStates[reservation_id];
          const isLoading = actionState?.loading;

          return (
            <div
              key={reservation_id}
              className={`process-card ${isUrgent ? 'process-card--urgent' : ''}`}
            >
              <div className="process-card__header">
                <span className={`priority-badge ${PRIORITY_CLASSES[ticket.priority] || ''}`}>
                  {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                </span>
                <span className="ticket-id" title={ticket.id}>#{ticket.id.slice(0, 8)}</span>
              </div>

              <h3 className="ticket-title">{ticket.title}</h3>
              <p className="ticket-content">{ticket.content}</p>

              <div className="ticket-meta">
                <span className="locale-tag">{ticket.locale}</span>
                <span className="reserved-at">
                  Reserved {new Date(reservation.reserved_at).toLocaleTimeString()}
                </span>
              </div>

              <div className={`countdown-row ${isUrgent ? 'countdown-row--urgent' : ''}`}>
                <span>{isExpired ? '⚠️ Expired — releasing back to queue' : (isUrgent ? '⚠️ Time running out' : '⏱ Time remaining')}</span>
                <span className="countdown-value">
                  {isExpired ? '00:00' : formatTime(secsLeft)}
                </span>
              </div>

              {actionState?.message && (
                <div className={`action-msg action-msg--${actionState.type}`}>
                  {actionState.message}
                </div>
              )}

              <div className="ticket-actions">
                <button
                  className="btn btn--confirm"
                  onClick={() => handleStartProcessing(reservation)}
                  disabled={isLoading || isExpired}
                >
                  {isLoading ? 'Starting…' : 'Start Processing'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
