import path from 'node:path';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import crypto from 'node:crypto';
import { config } from '../config.js';

export async function saveImage(buffer: Buffer, ext: string) {
  await mkdir(config.UPLOAD_DIR, { recursive: true, mode: 0o750 });
  const key = `${crypto.randomUUID()}${ext}`;
  await writeFile(path.join(config.UPLOAD_DIR, key), buffer, { flag: 'wx', mode: 0o640 });
  return key;
}
export async function readImage(key: string) {
  if (path.basename(key) !== key) throw new Error('Invalid storage key');
  return readFile(path.join(config.UPLOAD_DIR, key));
}
export async function deleteImage(key: string) {
  if (path.basename(key) !== key) return;
  await unlink(path.join(config.UPLOAD_DIR, key)).catch(() => undefined);
}
