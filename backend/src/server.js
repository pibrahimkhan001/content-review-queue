require('dotenv').config();
const app = require('./app');
const { initializeDatabase } = require('./models/db');
const { getRedisClient } = require('./models/redis');
const { seed } = require('./utils/seed');
const { startExpiryJob } = require('./services/expiryJob');

const PORT = parseInt(process.env.PORT) || 4000;

async function start() {
  try {
    // 1. Init DB schema
    await initializeDatabase();

    // 2. Warm up Redis connection
    await getRedisClient();

    // 3. Seed initial data (idempotent)
    await seed();

    // 4. Start background expiry sweep
    startExpiryJob();

    // 5. Start HTTP server
    app.listen(PORT, () => {
      console.log(`[Server] Content Review Queue API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();
