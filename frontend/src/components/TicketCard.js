import React from 'react';
import './TicketCard.css';

const PRIORITY_LABELS = { high: '● High', normal: '● Normal', low: '● Low' };
const PRIORITY_CLASSES = { high: 'priority-high', normal: 'priority-normal', low: 'priority-low' };

export default function TicketCard({
  ticket,
  isReservedByMe,
  actionState,
  onReserve,
  onConfirm,
  reservedTicketId,
}) {
  const isLoading = actionState?.loading;
  const hasOtherReservation = reservedTicketId && reservedTicketId !== ticket.id;
  const createdAt = new Date(ticket.created_at).toLocaleString();

  return (
    <div className={`ticket-card ${isReservedByMe ? 'ticket-card--reserved' : ''}`}>
      <div className="ticket-card__header">
        <span className={`priority-badge ${PRIORITY_CLASSES[ticket.priority] || ''}`}>
          {PRIORITY_LABELS[ticket.priority] || ticket.priority}
        </span>
        <span className="ticket-id" title={ticket.id}>#{ticket.id.slice(0, 8)}</span>
      </div>

      <h3 className="ticket-title">{ticket.title}</h3>
      <p className="ticket-content">{ticket.content}</p>

      <div className="ticket-meta">
        <span className="locale-tag">{ticket.locale}</span>
        <span className="created-at">{createdAt}</span>
      </div>

      {actionState?.message && (
        <div className={`action-msg action-msg--${actionState.type}`}>
          {actionState.message}
        </div>
      )}

      <div className="ticket-actions">
        {isReservedByMe ? (
          <button className="btn btn--confirm" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Confirming…' : 'Confirm Processing'}
          </button>
        ) : (
          <button
            className="btn btn--reserve"
            onClick={onReserve}
            disabled={isLoading || hasOtherReservation}
            title={hasOtherReservation ? 'Confirm your current reservation first' : ''}
          >
            {isLoading ? 'Reserving…' : 'Reserve Ticket'}
          </button>
        )}
      </div>
    </div>
  );
}
