import React, { useState } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MetricsPage from './pages/MetricsPage';
import './App.css';

export default function App() {
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('crq_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [view, setView] = useState('dashboard');

  function handleLogin(data) {
    localStorage.setItem('crq_session', JSON.stringify(data));
    setSession(data);
  }

  function handleLogout() {
    localStorage.removeItem('crq_session');
    setSession(null);
    setView('dashboard');
  }

  if (!session) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="logo-icon">◈</span>
          <span className="logo-text">Content Review Queue</span>
        </div>
        <nav className="header-nav">
          <button
            className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Queue
          </button>
          <button
            className={`nav-btn ${view === 'metrics' ? 'active' : ''}`}
            onClick={() => setView('metrics')}
          >
            Metrics
          </button>
        </nav>
        <div className="header-right">
          <span className="reviewer-badge">
            <span className="reviewer-dot" />
            {session.reviewer_id}
            <span className="locale-pill">{session.locale}</span>
          </span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className="app-main">
        {view === 'dashboard' && <DashboardPage session={session} />}
        {view === 'metrics'   && <MetricsPage />}
      </main>
    </div>
  );
}
