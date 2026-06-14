import React, { useState } from 'react';
import { login } from '../api/client';
import './LoginPage.css';

const LOCALES = ['West Coast', 'East Coast', 'Midwest', 'South'];

// Hardcoded demo credentials matching the seed script
const DEMO_ACCOUNTS = [
  { reviewer_id: 'alice',  locale: 'West Coast' },
  { reviewer_id: 'bob',    locale: 'East Coast' },
  { reviewer_id: 'carol',  locale: 'Midwest' },
  { reviewer_id: 'dave',   locale: 'South' },
];

export default function LoginPage({ onLogin }) {
  const [reviewerId, setReviewerId] = useState('');
  const [locale, setLocale] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(reviewerId.trim(), locale);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(account) {
    setReviewerId(account.reviewer_id);
    setLocale(account.locale);
    setError('');
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-icon">◈</span>
          <h1>Content Review Queue</h1>
          <p>Sign in to start reviewing tickets in your locale</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="reviewer_id">Reviewer ID</label>
            <input
              id="reviewer_id"
              type="text"
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              placeholder="e.g. alice"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="locale">Locale</label>
            <select
              id="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              required
            >
              <option value="">Select your locale</option>
              {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="demo-section">
          <p className="demo-label">Demo accounts</p>
          <div className="demo-grid">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.reviewer_id} className="demo-btn" onClick={() => fillDemo(a)}>
                <strong>{a.reviewer_id}</strong>
                <span>{a.locale}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
