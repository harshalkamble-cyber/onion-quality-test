import { randomUUID } from 'node:crypto';
import { mkdir, readFile as readTempFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { query, pool } from '../db.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { scanQueue } from '../queue.js';
import { saveImage, deleteImage } from '../services/storage.js';
import { audit } from '../services/audit.js';
import { QUALITY_LABELS } from '../services/quality.js';

export const scanRouter = Router();
const tempUploadDir = path.join(tmpdir(), 'oniongrade-upload-tmp');
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      mkdir(tempUploadDir, { recursive: true, mode: 0o700 }).then(
        () => callback(null, tempUploadDir),
        (error: unknown) => callback(error as Error)
      );
    },
    filename: (_req, _file, callback) => callback(null, `${randomUUID()}.upload`)
  }),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: config.MAX_FILES_PER_SCAN, fields: 8, fieldSize: 4096, parts: config.MAX_FILES_PER_SCAN + 8, fieldNameSize: 100 }
});

async function cleanupTempFiles(files: Express.Multer.File[]) {
  await Promise.all(files.map(file => unlink(file.path).catch(() => undefined)));
}

function parseUpload(req: Request, res: Response, next: NextFunction) {
  upload.array('images', config.MAX_FILES_PER_SCAN)(req, res, (error?: Error) => {
    if (error) {
      const partialFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
      void cleanupTempFiles(partialFiles).finally(() => next(error));
      return;
    }
    next();
  });
}

function limitScanBody(req: Request, res: Response, next: NextFunction) {
  const length = Number(req.header('content-length') ?? 0);
  if (length > config.MAX_SCAN_BYTES) return res.status(413).json({ error: { code:'SCAN_TOO_LARGE', message:'The whole batch exceeds the upload limit. Split it into smaller scans.' } });
  next();
}
const sourceSchema = z.enum(['upload','camera','bulk']).default('upload');

scanRouter.post('/', authenticate, limitScanBody, parseUpload, async (req, res, next) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const savedKeys: string[] = [];
    try {
      if (!files.length) return res.status(400).json({ error: { code:'IMAGES_REQUIRED', message:'Upload at least one onion image.' } });
      const source = sourceSchema.parse(req.body.source ?? (files.length > 1 ? 'bulk' : 'upload'));
      if (files.reduce((sum, file) => sum + file.size, 0) > config.MAX_SCAN_BYTES) return res.status(413).json({ error: { code:'SCAN_TOO_LARGE', message:'The whole batch exceeds the upload limit. Split it into smaller scans.' } });

      const detectedFiles: Array<{ file: Express.Multer.File; detected: NonNullable<Awaited<ReturnType<typeof fileTypeFromBuffer>>> }> = [];
      for (const file of files) {
        if (file.size < 1 || file.size > config.MAX_UPLOAD_BYTES) throw Object.assign(new Error('Each image must be smaller than the configured upload limit.'), { status: 413, code: 'IMAGE_TOO_LARGE' });
        const content = await readTempFile(file.path);
        let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
        try { detected = await fileTypeFromBuffer(content); }
        finally { content.fill(0); }
        if (!detected || !['image/jpeg','image/png','image/webp'].includes(detected.mime)) throw Object.assign(new Error('Only JPEG, PNG, and WebP images are supported.'), { status: 415, code: 'UNSUPPORTED_IMAGE' });
        detectedFiles.push({ file, detected });
      }

      const client = await pool.connect();
      let scanId = '';
      try {
        await client.query('BEGIN');
        const created = await client.query<{id:string}>(`INSERT INTO scans(user_id,status,source,image_count) VALUES($1,'queued',$2,$3) RETURNING id`, [req.user!.id, source, files.length]);
        scanId = created.rows[0].id;
        for (const { file, detected } of detectedFiles) {
          const content = await readTempFile(file.path);
          let key: string;
          try { key = await saveImage(content, detected.ext === 'jpeg' ? '.jpg' : `.${detected.ext}`); }
          finally { content.fill(0); }
          savedKeys.push(key);
          await client.query(`INSERT INTO images(scan_id,original_name,storage_key,mime_type,byte_size) VALUES($1,$2,$3,$4,$5)`, [scanId, file.originalname.slice(0,255).replace(/[\r\n\0]/g,''), key, detected.mime, file.size]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        await Promise.all(savedKeys.map(deleteImage));
        throw error;
      } finally { client.release(); }

      try {
        await scanQueue.add('process-scan', { scanId, userId: req.user!.id }, { jobId: scanId });
      } catch (error) {
        await query("UPDATE scans SET status='failed',error_code='QUEUE_UNAVAILABLE',error_message='Scan queue is temporarily unavailable.' WHERE id=$1", [scanId]);
        throw error;
      }
      await audit(req, 'scan.created', 'scan', scanId, { imageCount: files.length, source });
      return res.status(202).json({ scanId, status: 'queued', imageCount: files.length, message: 'Images received. Your quality report is being prepared.' });
    } catch (error) { next(error); }
    finally { await cleanupTempFiles(files); }
});

scanRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const result = await query(`SELECT s.id,s.status,s.source,s.image_count,s.onion_count,s.model_version,s.created_at,s.completed_at,
      COALESCE((SELECT ROUND(AVG(r.quality_stars)::numeric,2) FROM ratings r WHERE r.scan_id=s.id),0) AS average_stars
      FROM scans s WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT $2 OFFSET $3`, [req.user!.id, limit, offset]);
    res.json({ scans: result.rows, limit, offset });
  } catch (error) { next(error); }
});

scanRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const scan = await query(`SELECT id,user_id,status,source,image_count,onion_count,model_version,error_code,error_message,report,created_at,started_at,completed_at FROM scans WHERE id=$1 AND user_id=$2`, [req.params.id, req.user!.id]);
    if (!scan.rows[0]) return res.status(404).json({ error: { code:'SCAN_NOT_FOUND', message:'The requested scan was not found.' } });
    const images = await query(`SELECT id,original_name,mime_type,byte_size,onion_count,created_at FROM images WHERE scan_id=$1 ORDER BY created_at,id`, [req.params.id]);
    const predictions = await query(`SELECT p.id,p.image_id,p.onion_index,p.bbox,p.quality_stars,p.confidence,p.visual_metrics,p.reasons,p.model_version FROM ai_predictions p WHERE p.scan_id=$1 ORDER BY p.image_id,p.onion_index`, [req.params.id]);
    const ratings = await query(`SELECT quality_stars,label,onion_count,share_percent FROM ratings WHERE scan_id=$1 ORDER BY quality_stars DESC`, [req.params.id]);
    res.json({ scan: scan.rows[0], images: images.rows, predictions: predictions.rows, ratings: ratings.rows });
  } catch (error) { next(error); }
});

scanRouter.get('/:id/report.csv', authenticate, async (req, res, next) => {
  try {
    const scan = await query<{id:string;created_at:Date;report:any}>(`SELECT id,created_at,report FROM scans WHERE id=$1 AND user_id=$2 AND status='completed'`, [req.params.id, req.user!.id]);
    if (!scan.rows[0]) return res.status(404).json({ error: { code:'REPORT_NOT_FOUND', message:'A completed report was not found.' } });
    const predictions = await query<{image_id:string;onion_index:number;quality_stars:number;confidence:string;visual_metrics:any;reasons:any}>(`SELECT image_id,onion_index,quality_stars,confidence,visual_metrics,reasons FROM ai_predictions WHERE scan_id=$1 ORDER BY image_id,onion_index`, [req.params.id]);
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"','""')}"`;
    const lines = [['image_id','onion_number','quality_stars','quality_label','confidence','visual_metrics','reasons'].join(',')];
    for (const p of predictions.rows) lines.push([p.image_id,p.onion_index,p.quality_stars,QUALITY_LABELS[p.quality_stars],p.confidence,JSON.stringify(p.visual_metrics),JSON.stringify(p.reasons)].map(escape).join(','));
    res.setHeader('content-type','text/csv; charset=utf-8');
    res.setHeader('content-disposition',`attachment; filename="onion-quality-${req.params.id}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (error) { next(error); }
});
