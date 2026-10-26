import { Worker } from 'bullmq';
import { redis } from './queue.js';
import { query } from './db.js';
import { processScan } from './services/processing.js';

const concurrency = Math.max(1, Math.min(Number(process.env.SCAN_WORKER_CONCURRENCY ?? 2), 8));
const worker = new Worker('scan-processing', async (job) => {
  const { scanId } = job.data as { scanId: string };
  console.info(JSON.stringify({ level:'info', event:'scan_job_started', scanId, jobId: job.id }));
  const report = await processScan(scanId);
  console.info(JSON.stringify({ level:'info', event:'scan_job_completed', scanId, totalOnions: report.totalOnions, processingMs: report.processingMs }));
  return report;
}, { connection: redis, concurrency, limiter: { max: 20, duration: 1000 } });

worker.on('failed', async (job, error) => {
  console.error(JSON.stringify({ level:'error', event:'scan_job_failed', scanId: job?.data?.scanId, attemptsMade: job?.attemptsMade, message: error.message }));
  if (job && job.attemptsMade >= Number(job.opts.attempts ?? 1)) {
    await query("UPDATE scans SET status='failed',error_code='ANALYSIS_FAILED',error_message='Analysis could not be completed. Please retry with clearer images.',completed_at=NOW() WHERE id=$1", [job.data.scanId]).catch((dbError) => console.error('failed to mark scan as failed', dbError));
    await query(`INSERT INTO notifications(user_id,title,body,kind) SELECT user_id,'Scan could not be completed','Please retake the images in clear, even light and try again.','scan_failed' FROM scans WHERE id=$1`, [job.data.scanId]).catch(() => undefined);
  }
});
worker.on('error', (error) => console.error(JSON.stringify({ level:'error', event:'worker_error', message:error.message })));

async function shutdown(signal: string) {
  console.info(`Received ${signal}; stopping scan worker.`);
  await worker.close();
  await redis.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
console.info(JSON.stringify({ level:'info', event:'worker_started', concurrency }));
