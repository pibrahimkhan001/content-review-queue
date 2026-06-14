
require('dotenv').config();
const { pool } = require('../models/db');
const { v4: uuidv4 } = require('uuid');

const LOCALES = ['West Coast', 'East Coast', 'Midwest', 'South'];

const REVIEWERS = [
  { reviewer_id: 'alice',   locale: 'West Coast' },
  { reviewer_id: 'bob',     locale: 'East Coast' },
  { reviewer_id: 'carol',   locale: 'Midwest' },
  { reviewer_id: 'dave',    locale: 'South' },
  { reviewer_id: 'eve',     locale: 'West Coast' },
  { reviewer_id: 'frank',   locale: 'East Coast' },
];

const TICKET_TEMPLATES = [
  { title: 'User report: spam account',       content: 'A user flagged this account for sending unsolicited promotional messages.',   priority: 'high'   },
  { title: 'Misleading product listing',      content: 'Listing appears to use fake reviews and inflated ratings.',                    priority: 'normal' },
  { title: 'Hate speech in comment thread',   content: 'Multiple comments in this thread contain targeted slurs.',                    priority: 'high'   },
  { title: 'Copyright violation claim',       content: 'Uploader is distributing copyrighted material without attribution.',          priority: 'normal' },
  { title: 'Suspected bot activity',          content: 'Account shows automated posting patterns inconsistent with human behavior.',   priority: 'low'    },
  { title: 'Phishing link in bio',            content: 'Profile bio contains a URL that redirects to a credential harvesting page.',  priority: 'high'   },
  { title: 'Adult content in public feed',    content: 'User posted explicit images outside designated age-gated spaces.',            priority: 'normal' },
  { title: 'Doxxing attempt',                 content: 'Post includes personal address and phone number of a private individual.',    priority: 'high'   },
  { title: 'Review bombing campaign',         content: 'Coordinated negative reviews detected on a local business listing.',         priority: 'normal' },
  { title: 'Impersonation of public figure',  content: 'Account is using the name and photo of a known public figure without marks.', priority: 'low'   },
];

async function seed() {
  const client = await pool.connect();
  try {
    // Idempotent — skip if already seeded
    const { rows: existing } = await client.query('SELECT COUNT(*) FROM tickets');
    if (parseInt(existing[0].count) > 0) {
      console.log('[Seed] Tickets already present — skipping seed');
      return;
    }

    // Insert reviewers
    for (const r of REVIEWERS) {
      await client.query(
        `INSERT INTO reviewers (reviewer_id, locale)
         VALUES ($1, $2)
         ON CONFLICT (reviewer_id) DO NOTHING`,
        [r.reviewer_id, r.locale]
      );
    }
    console.log(`[Seed] Inserted ${REVIEWERS.length} reviewers`);

    // Insert tickets — 5 per locale
    let ticketCount = 0;
    for (const locale of LOCALES) {
      for (let i = 0; i < 5; i++) {
        const template = TICKET_TEMPLATES[ticketCount % TICKET_TEMPLATES.length];
        await client.query(
          `INSERT INTO tickets (id, locale, title, content, priority)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), locale, template.title, template.content, template.priority]
        );
        ticketCount++;
      }
    }
    console.log(`[Seed] Inserted ${ticketCount} tickets across ${LOCALES.length} locales`);
  } finally {
    client.release();
  }
}

// Allow running directly: node src/utils/seed.js
if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { seed };
