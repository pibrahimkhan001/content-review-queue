const { createClient } = require('redis');

let redisClient;

async function getRedisClient() {
  if (redisClient && redisClient.isOpen) return redisClient;

  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
    },
  });

  redisClient.on('error', (err) => console.error('[Redis] Error:', err));
  await redisClient.connect();
  console.log('[Redis] Connected');
  return redisClient;
}

module.exports = { getRedisClient };
