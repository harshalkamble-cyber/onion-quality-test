import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? '../.env' });
if (!process.env.DATABASE_URL && process.env.HOST_DATABASE_URL) process.env.DATABASE_URL = process.env.HOST_DATABASE_URL;
if (!process.env.REDIS_URL && process.env.HOST_REDIS_URL) process.env.REDIS_URL = process.env.HOST_REDIS_URL;
if (!process.env.AI_SERVICE_URL && process.env.HOST_AI_SERVICE_URL) process.env.AI_SERVICE_URL = process.env.HOST_AI_SERVICE_URL;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  COOKIE_SECURE: z.enum(['true','false']).default('false').transform((v) => v === 'true'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AI_SERVICE_TOKEN: z.string().min(24),
  UPLOAD_DIR: z.string().default('/data/uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  MAX_SCAN_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
  MAX_FILES_PER_SCAN: z.coerce.number().int().min(1).max(100).default(30),
  LOG_LEVEL: z.string().default('info')
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. Check .env.example.');
}
export const config = parsed.data;
