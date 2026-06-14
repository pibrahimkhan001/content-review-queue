const jwt = require('jsonwebtoken');
const { pool } = require('../models/db');

/**
 * POST /auth/login
 * Body: { reviewer_id, locale }
 *
 * Looks up the reviewer by reviewer_id. If the record exists and the
 * locale matches, issues a signed JWT. The locale claim in the token is
 * the canonical source of truth used downstream for locale scoping.
 */
async function login(req, res) {
  const { reviewer_id, locale } = req.body;

  if (!reviewer_id || !locale) {
    return res.status(400).json({ error: 'reviewer_id and locale are required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT reviewer_id, locale FROM reviewers WHERE reviewer_id = $1',
      [reviewer_id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Reviewer not found' });
    }

    const reviewer = rows[0];

    if (reviewer.locale.toLowerCase() !== locale.toLowerCase()) {
      return res.status(403).json({ error: 'Locale mismatch for this reviewer' });
    }

    const token = jwt.sign(
      { reviewer_id: reviewer.reviewer_id, locale: reviewer.locale },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({
      token,
      reviewer_id: reviewer.reviewer_id,
      locale: reviewer.locale,
    });
  } catch (err) {
    console.error('[Auth] login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { login };
