# Content Review Queue

A locale-based content review platform. Reviewers authenticate into a locale, browse unassigned tickets, reserve one for up to 20 minutes, and confirm they have begun processing it. Unconfirmed reservations are automatically released back into the queue.

---

## Quick Start

```bash
git clone <repo-url>
cd content-review-queue
docker-compose up --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000      |
| Backend  | http://localhost:4000      |
| Metrics  | http://localhost:4000/metrics |


---

## Ticket Ingestion Strategy

**Approach chosen: Seed script on startup**

On first boot, `src/utils/seed.js` inserts a fixed set of reviewers and tickets into PostgreSQL. The script is idempotent — it checks for existing records before inserting, so re-starts do not duplicate data.

**Why this approach over alternatives:**

| Option | Pros | Cons |
|---|---|---|
| Seed script (chosen) | Zero external dependencies, fully self-contained, immediately testable | Static data only |
| File system (JSON files) | Easy to edit fixtures | Requires volume mapping, still manual |
| External ingestion API | Realistic | Significant extra scope; distracts from the queue mechanics |
| Message queue (Kafka/SQS) | Production-realistic | Over-engineered for a prototype; adds infra complexity |

The seed script approach keeps the entire system runnable with a single `docker-compose up` command and zero manual data entry.

**Seeded data:**

- 6 reviewers across 4 locales (alice/West Coast, bob/East Coast, carol/Midwest, dave/South, + 2 extras)
- 5 tickets per locale (20 total), drawn from a rotating set of realistic content moderation scenarios with mixed priorities (high / normal / low)

**Potential improvements for production:**
- Webhook endpoint to ingest tickets from upstream content platforms
- Kafka consumer reading from a `tickets.raw` topic
- Admin UI for manual ticket creation

---

## API Reference

### Authentication

#### `POST /auth/login`

Authenticate a reviewer by ID and locale.

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"reviewer_id": "alice", "locale": "West Coast"}'
```

**Response:**
```json
{
  "token": "eyJhbGci...",
  "reviewer_id": "alice",
  "locale": "West Coast"
}
```

---

### Ticket Endpoints

All ticket endpoints require `Authorization: Bearer <token>`.

#### `GET /tickets/available`

Returns all unassigned tickets in the authenticated reviewer's locale, ordered by priority then creation time.

```bash
curl http://localhost:4000/tickets/available \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "locale": "West Coast",
  "tickets": [
    {
      "id": "uuid",
      "locale": "West Coast",
      "title": "User report: spam account",
      "content": "...",
      "priority": "high",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### `POST /tickets/:id/reserve`

Reserve a ticket. The ticket must be `available` and in the reviewer's locale.

```bash
curl -X POST http://localhost:4000/tickets/<ticket-id>/reserve \
  -H "Authorization: Bearer <token>"
```

**Response (200):**
```json
{
  "message": "Ticket reserved successfully",
  "ticket": { "id": "...", "locale": "...", "status": "reserved" },
  "reservation": {
    "id": "...",
    "ticket_id": "...",
    "reviewer_id": "alice",
    "reserved_at": "2025-01-01T00:00:00Z",
    "expires_at": "2025-01-01T00:20:00Z",
    "status": "active"
  }
}
```

**Error (409):** Ticket is already reserved or in wrong locale.

#### `POST /tickets/:id/confirm`

Confirm processing has begun. Must be called within 20 minutes of reservation.

```bash
curl -X POST http://localhost:4000/tickets/<ticket-id>/confirm \
  -H "Authorization: Bearer <token>"
```

**Response (200):**
```json
{ "message": "Ticket confirmed — processing has begun" }
```

**Error (409):** Reservation not found, wrong reviewer, or already expired.

#### `GET /tickets/my-reservations`

Returns the authenticated reviewer's currently **active** reservations (tickets they've picked up but not yet confirmed), ordered soonest-expiring first. This powers the **Process Tickets** tab — once a ticket is reserved it disappears from `/tickets/available`, so this endpoint is how a reviewer finds their way back to it.

```bash
curl http://localhost:4000/tickets/my-reservations \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "reviewer_id": "alice",
  "reservations": [
    {
      "reservation_id": "uuid",
      "reserved_at": "2025-01-01T00:00:00Z",
      "expires_at": "2025-01-01T00:20:00Z",
      "ticket": {
        "id": "uuid",
        "locale": "West Coast",
        "title": "User report: spam account",
        "content": "...",
        "priority": "high",
        "status": "reserved"
      }
    }
  ]
}
```

---

### Metrics

#### `GET /metrics`

Returns queue health statistics. No authentication required.

`reservations.expiring_soon` counts active reservations with less than 2 minutes remaining before auto-release — a quick signal for how many reviewers are about to lose their pickup and need to hit **Start Processing** on the Process Tickets tab.

```bash
curl http://localhost:4000/metrics
```

**Response:**
```json
{
  "tickets": {
    "available": 18,
    "reserved": 1,
    "confirmed": 1,
    "completed": 0
  },
  "reservations": {
    "active": 1,
    "expired": 0,
    "confirmed": 1,
    "expiring_soon": 0
  },
  "by_locale": [
    { "locale": "East Coast", "available": 5, "reserved": 0 },
    { "locale": "Midwest",    "available": 5, "reserved": 0 },
    { "locale": "South",      "available": 4, "reserved": 1 },
    { "locale": "West Coast", "available": 4, "reserved": 0 }
  ],
  "generated_at": "2025-01-01T00:00:00Z"
}
```

#### `GET /tickets/stream?token=<jwt>`

Server-Sent Events endpoint. Pushes updated ticket lists every 10 seconds. The token is passed as a query parameter because browser `EventSource` does not support custom headers.

---

### Health Check

#### `GET /health`

```bash
curl http://localhost:4000/health
# {"status":"ok","ts":"2025-01-01T00:00:00.000Z"}
```

---

## Frontend Tabs

The UI has three tabs once a reviewer signs in:

| Tab | Purpose |
|---|---|
| **Queue** | Browse unassigned tickets in your locale (`GET /tickets/available`) and reserve one (`POST /tickets/:id/reserve`). Once reserved, a ticket leaves this list — it's no longer "available". |
| **Process Tickets** | Shows every ticket you currently hold an active reservation for (`GET /tickets/my-reservations`), each with a live 20-minute countdown. Click **Start Processing** to confirm (`POST /tickets/:id/confirm`), which stops the countdown and moves the ticket to `confirmed`. |
| **Metrics** | Queue-wide health stats (`GET /metrics`), refreshed every 15 seconds. |

**Why a dedicated "Process Tickets" tab?** Reserving a ticket removes it from the available queue, so the reviewer needed a place to come back to in order to act on what they just picked up. The Queue tab shows a banner with a live countdown after reserving, pointing the reviewer to this tab to confirm before the 20-minute window lapses.

---

## Design Decisions & Trade-offs

### Database: PostgreSQL

PostgreSQL was chosen over a simpler in-memory store for two reasons:
1. The reservation logic requires `SELECT ... FOR UPDATE` row-level locking to prevent double-reservation under concurrent access — this is a first-class PostgreSQL feature.
2. The schema needs proper relations (tickets → reservations) with referential integrity.

The alternative (in-memory Map + async mutex) would work for a single process but breaks under horizontal scaling.

### Cache: Redis

Two uses:
1. **Available ticket list cache** (15-second TTL per locale) — prevents repeated full-table scans on hot `GET /tickets/available` calls. Cache is invalidated immediately on any state change for that locale.
2. **Reservation expiry signal** — a Redis key is set with the TTL of each reservation as a belt-and-suspenders mechanism alongside the cron job.

### Concurrency Safety

The `reserveTicket` function wraps its reads and writes in a single PostgreSQL transaction with `SELECT ... FOR UPDATE`. This ensures that even if two reviewers attempt to reserve the same ticket simultaneously, only one succeeds — the other receives a 409 with a clear error message.

### Auto-Release Mechanism

Two layers:

1. **Cron job (node-cron)** — runs every 30 seconds, queries `reservations WHERE status = 'active' AND expires_at < NOW()`, bulk-updates expired ones, and releases the corresponding tickets back to `available`. This is the primary mechanism and is correct under any failure scenario.

2. **On-demand check in `confirmTicket`** — if a reviewer somehow confirms after expiry (race condition between cron cycles), the confirm handler detects the expired window and rejects the request, releasing the ticket immediately.

### Token Strategy

JWTs are signed with HS256 and carry `reviewer_id` and `locale` as claims. The locale claim in the token is the authoritative source for scoping — the server never trusts a locale sent in request body for protected operations. This means a reviewer cannot escalate their access by modifying a request payload.

### SSE vs WebSocket

SSE was chosen for real-time delivery because:
- The data flow is one-directional (server → client)
- SSE is simpler to implement and debug than WebSockets
- No additional library required; native browser `EventSource` works
- Automatic reconnection is built into the SSE protocol

### Assumptions

1. Reviewer authentication is credential-based (reviewer_id + locale), not password-based. For production, passwords or SSO would be added.
2. A reviewer can only hold one active reservation at a time (enforced in the UI; not yet enforced at DB level — this would be a next step).
3. Tickets are not deleted after confirmation in this prototype — they transition to `confirmed` status. A `completed` status and downstream processing hook would be the production path.
4. The seed script provides the only way to ingest new tickets. Production would add an ingestion API.

---

## Project Structure

```
content-review-queue/
├── backend/
│   ├── src/
│   │   ├── controllers/   # HTTP handlers (thin layer, no business logic)
│   │   ├── middleware/    # JWT authentication
│   │   ├── models/        # DB pool + Redis client
│   │   ├── routes/        # Express router definitions
│   │   ├── services/      # Core business logic (ticketService, expiryJob)
│   │   ├── utils/         # Seed script
│   │   ├── app.js         # Express app (separated for testability)
│   │   └── server.js      # Entry point: DB init, seed, start
│   ├── tests/
│   │   └── tickets.test.js
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/           # All backend calls (single source of truth)
│   │   ├── components/    # TicketCard
│   │   ├── pages/         # LoginPage, DashboardPage, ProcessTicketsPage, MetricsPage
│   │   ├── App.js         # Top-level routing
│   │   └── index.js
│   ├── public/
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
└── docker-compose.yml
```

---

## Roadmap (Future Enhancements)

- [ ] Rate limiting per reviewer (Redis-backed sliding window)
- [ ] One-active-reservation-per-reviewer enforcement at the DB level (partial unique index)
- [ ] Ticket ingestion API or Kafka consumer
- [ ] Admin panel for locale management and manual ticket injection
- [ ] WebSocket-based bi-directional updates (reviewer presence, live reservation counts)
- [ ] Soft-delete / archive for completed tickets
- [ ] Password/SSO authentication

---

## LLM Usage Disclosure

Claude (Anthropic) was used to accelerate the implementation of this project. Specifically:
- Boilerplate for Docker and nginx configuration
- Initial scaffolding for the Express route structure
- Styling the frontend
- Sample seed data

All business logic (reservation locking, expiry mechanism, locale scoping, JWT strategy, schema design) was designed and reasoned through independently. I can walk through every technical decision during a review session.
