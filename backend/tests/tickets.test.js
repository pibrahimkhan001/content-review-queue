/**
 * Integration tests for the ticket reservation and expiry flow.
 *
 * These tests run against a real PostgreSQL + Redis instance (spun up by
 * docker-compose) so they verify actual concurrency semantics, not just mocks.
 *
 * Run with: npm test (inside the Docker network) or
 *           docker-compose exec backend npm test
 */
require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const { pool, initializeDatabase } = require('../src/models/db');
const { getRedisClient } = require('../src/models/redis');
const { releaseExpiredReservations } = require('../src/services/ticketService');
const { v4: uuidv4 } = require('uuid');

let token;
const TEST_REVIEWER = `test_reviewer_${Date.now()}`;
const TEST_LOCALE = 'West Coast';
let testTicketId;

beforeAll(async () => {
  await initializeDatabase();
  await getRedisClient();

  // Insert a deterministic reviewer for tests
  await pool.query(
    `INSERT INTO reviewers (reviewer_id, locale) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [TEST_REVIEWER, TEST_LOCALE]
  );

  // Insert a fresh ticket so we have something to work with
  const { rows } = await pool.query(
    `INSERT INTO tickets (id, locale, title, content, priority)
     VALUES ($1, $2, 'Test Ticket', 'Test content for integration tests', 'normal')
     RETURNING id`,
    [uuidv4(), TEST_LOCALE]
  );
  testTicketId = rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM reservations WHERE reviewer_id = $1`, [TEST_REVIEWER]);
  await pool.query(`DELETE FROM tickets WHERE id = $1`, [testTicketId]);
  await pool.query(`DELETE FROM reviewers WHERE reviewer_id = $1`, [TEST_REVIEWER]);
  await pool.end();
  const redis = await getRedisClient();
  await redis.quit();
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns a JWT for a valid reviewer + locale', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ reviewer_id: TEST_REVIEWER, locale: TEST_LOCALE });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.locale).toBe(TEST_LOCALE);
    token = res.body.token;
  });

  it('rejects a mismatched locale', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ reviewer_id: TEST_REVIEWER, locale: 'South' });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown reviewer', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ reviewer_id: 'nobody', locale: TEST_LOCALE });
    expect(res.status).toBe(401);
  });
});

// ── Browse ────────────────────────────────────────────────────────────────────

describe('GET /tickets/available', () => {
  it('returns tickets for the reviewer locale', async () => {
    const res = await request(app)
      .get('/tickets/available')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.locale).toBe(TEST_LOCALE);
    expect(Array.isArray(res.body.tickets)).toBe(true);

    // All returned tickets must match the locale
    for (const t of res.body.tickets) {
      expect(t.locale).toBe(TEST_LOCALE);
    }
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/tickets/available');
    expect(res.status).toBe(401);
  });
});

// ── Reserve ───────────────────────────────────────────────────────────────────

describe('POST /tickets/:id/reserve', () => {
  it('reserves an available ticket', async () => {
    // Reset to available in case a previous run left it reserved
    await pool.query(`UPDATE tickets SET status = 'available' WHERE id = $1`, [testTicketId]);

    const res = await request(app)
      .post(`/tickets/${testTicketId}/reserve`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.reservation).toHaveProperty('expires_at');
    expect(res.body.ticket.id).toBe(testTicketId);
  });

  it('rejects a second reservation on the same ticket', async () => {
    const res = await request(app)
      .post(`/tickets/${testTicketId}/reserve`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

// ── Confirm ───────────────────────────────────────────────────────────────────

describe('POST /tickets/:id/confirm', () => {
  it('confirms an active reservation', async () => {
    const res = await request(app)
      .post(`/tickets/${testTicketId}/confirm`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('rejects confirmation of an already-confirmed ticket', async () => {
    const res = await request(app)
      .post(`/tickets/${testTicketId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

// ── Auto-release ──────────────────────────────────────────────────────────────

describe('Auto-release / re-queuing', () => {
  let expiredTicketId;

  beforeEach(async () => {
    // Create a ticket and a reservation that has already expired
    const { rows } = await pool.query(
      `INSERT INTO tickets (id, locale, title, content, priority)
       VALUES ($1, $2, 'Expiry Test Ticket', 'Will expire', 'low')
       RETURNING id`,
      [uuidv4(), TEST_LOCALE]
    );
    expiredTicketId = rows[0].id;

    await pool.query(`UPDATE tickets SET status = 'reserved' WHERE id = $1`, [expiredTicketId]);

    // Deliberately backdate expires_at so it looks expired
    await pool.query(
      `INSERT INTO reservations (ticket_id, reviewer_id, expires_at)
       VALUES ($1, $2, NOW() - INTERVAL '1 minute')`,
      [expiredTicketId, TEST_REVIEWER]
    );
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM reservations WHERE ticket_id = $1`, [expiredTicketId]);
    await pool.query(`DELETE FROM tickets WHERE id = $1`, [expiredTicketId]);
  });

  it('releases expired reservations back to available', async () => {
    const released = await releaseExpiredReservations();
    expect(released).toBeGreaterThan(0);

    const { rows } = await pool.query(
      `SELECT status FROM tickets WHERE id = $1`,
      [expiredTicketId]
    );
    expect(rows[0].status).toBe('available');
  });
});

// ── Metrics ────────────────────────────────────────────────────────────────────

describe('GET /metrics', () => {
  it('returns queue statistics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveProperty('available');
    expect(res.body.tickets).toHaveProperty('reserved');
    expect(Array.isArray(res.body.by_locale)).toBe(true);
  });
});
