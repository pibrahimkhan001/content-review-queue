const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'content_review_queue',
  user: process.env.DB_USER || 'crq_user',
  password: process.env.DB_PASSWORD || 'crq_pass',
});


async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviewers (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reviewer_id VARCHAR(100) UNIQUE NOT NULL,
        locale      VARCHAR(50) NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        locale      VARCHAR(50) NOT NULL,
        title       TEXT NOT NULL,
        content     TEXT NOT NULL,
        priority    VARCHAR(20) NOT NULL DEFAULT 'normal',
        status      VARCHAR(20) NOT NULL DEFAULT 'available',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT tickets_status_check
          CHECK (status IN ('available', 'reserved', 'confirmed', 'completed'))
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id     UUID NOT NULL REFERENCES tickets(id),
        reviewer_id   VARCHAR(100) NOT NULL,
        reserved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at    TIMESTAMPTZ NOT NULL,
        confirmed_at  TIMESTAMPTZ,
        status        VARCHAR(20) NOT NULL DEFAULT 'active',

        CONSTRAINT reservations_status_check
          CHECK (status IN ('active', 'confirmed', 'expired'))
      );

      -- Indexes for hot query paths
      CREATE INDEX IF NOT EXISTS idx_tickets_locale_status   ON tickets (locale, status);
      CREATE INDEX IF NOT EXISTS idx_reservations_ticket_id  ON reservations (ticket_id);
      CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON reservations (expires_at) WHERE status = 'active';
    `);
    console.log('[DB] Schema initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initializeDatabase };
