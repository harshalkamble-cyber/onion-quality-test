import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { redis, scanQueue } from './queue.js';

const server = app.listen(config.PORT, '0.0.0.0', () => console.info(JSON.stringify({ level:'info', event:'api_started', port:config.PORT, environment:config.NODE_ENV })));
async function shutdown(signal: string) {
  console.info(`Received ${signal}; shutting down API.`);
  server.close(async () => {
    await Promise.allSettled([pool.end(), scanQueue.close(), redis.quit()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
