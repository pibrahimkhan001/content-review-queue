import React, { useState, useEffect } from 'react';
import { fetchMetrics } from '../api/client';
import './MetricsPage.css';

export default function MetricsPage() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await fetchMetrics();
      setMetrics(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="metrics-loading">Loading metrics…</div>;
  if (error) return <div className="metrics-error">{error}</div>;
  if (!metrics) return null;

  const { tickets, reservations, by_locale, generated_at } = metrics;
  const totalTickets = tickets.available + tickets.reserved + tickets.confirmed + tickets.completed;

  return (
    <div className="metrics-page">
      <div className="metrics-header">
        <h2>Queue Metrics</h2>
        <span className="metrics-ts">Updated {new Date(generated_at).toLocaleTimeString()}</span>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Available"  value={tickets.available}  color="accent"   />
        <KpiCard label="Reserved"   value={tickets.reserved}   color="warning"  />
        <KpiCard label="Confirmed"  value={tickets.confirmed}  color="success"  />
        <KpiCard label="Total"      value={totalTickets}       color="neutral"  />
      </div>

      <div className="section-title">Reservations</div>
      <div className="kpi-grid kpi-grid--small">
        <KpiCard label="Active"    value={reservations.active}    color="accent"  />
        <KpiCard label="Confirmed" value={reservations.confirmed} color="success" />
        <KpiCard label="Expired"   value={reservations.expired}   color="danger"  />
      </div>

      <div className="section-title">By Locale</div>
      <div className="locale-table-wrap">
        <table className="locale-table">
          <thead>
            <tr>
              <th>Locale</th>
              <th>Available</th>
              <th>Reserved</th>
              <th>Queue Bar</th>
            </tr>
          </thead>
          <tbody>
            {by_locale.map((row) => {
              const total = row.available + row.reserved;
              const pct = total > 0 ? Math.round((row.reserved / total) * 100) : 0;
              return (
                <tr key={row.locale}>
                  <td><span className="locale-name">{row.locale}</span></td>
                  <td className="num">{row.available}</td>
                  <td className="num">{row.reserved}</td>
                  <td>
                    <div className="bar-wrap">
                      <div className="bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="bar-label">{pct}% reserved</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div className={`kpi-card kpi-card--${color}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
