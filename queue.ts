import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from './config.js';
export const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
export const scanQueue = new Queue('scan-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1500 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }
  }
});
