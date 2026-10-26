import { pool, query } from '../db.js';
import { config } from '../config.js';
import { readImage } from './storage.js';
import { QUALITY_LABELS, buildGradeDistribution } from './quality.js';

type ImageRow = { id: string; storage_key: string; original_name: string; mime_type: string };
type AiPrediction = { onion_index: number; bbox: Record<string, number>; quality_stars: number; quality_label: string; confidence: number; visual_metrics: Record<string, number>; reasons: string[] };
type AiResponse = { model_version: string; device: string; processing_ms: number; total_images: number; total_onions: number; images: Array<{ image_index: number; detected_onions: number; predictions: AiPrediction[] }>; disclaimer: string };

export async function processScan(scanId: string) {
  await query("UPDATE scans SET status='processing',started_at=COALESCE(started_at,NOW()),error_code=NULL,error_message=NULL WHERE id=$1", [scanId]);
  const result = await query<ImageRow>('SELECT id,storage_key,original_name,mime_type FROM images WHERE scan_id=$1 ORDER BY created_at,id', [scanId]);
  const images = result.rows;
  if (!images.length) throw new Error('No images were found for this scan.');

  const form = new FormData();
  for (const image of images) {
    const buffer = await readImage(image.storage_key);
    form.append('files', new Blob([new Uint8Array(buffer)], { type: image.mime_type }), image.original_name);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 90_000));
  let response: Response;
  try {
    response = await fetch(`${config.AI_SERVICE_URL.replace(/\/$/, '')}/v1/analyze`, {
      method: 'POST', headers: { 'x-ai-service-token': config.AI_SERVICE_TOKEN }, body: form, signal: controller.signal
    });
  } finally { clearTimeout(timeout); }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 1000);
    throw new Error(`AI_SERVICE_${response.status}: ${body}`);
  }
  const analysis = await response.json() as AiResponse;
  if (!Array.isArray(analysis.images) || analysis.images.length !== images.length) throw new Error('AI service returned a mismatched image count.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ai_predictions WHERE scan_id=$1', [scanId]);
    await client.query('DELETE FROM ratings WHERE scan_id=$1', [scanId]);
    await client.query('DELETE FROM reports WHERE scan_id=$1', [scanId]);
    let totalOnions = 0;
    const counts = [0,0,0,0,0,0];
    for (const imgAnalysis of analysis.images) {
      const row = images[imgAnalysis.image_index];
      if (!row) throw new Error('AI service returned an invalid image index.');
      await client.query('UPDATE images SET onion_count=$2 WHERE id=$1', [row.id, imgAnalysis.detected_onions]);
      totalOnions += imgAnalysis.detected_onions;
      for (const pred of imgAnalysis.predictions) {
        if (pred.quality_stars < 1 || pred.quality_stars > 5) throw new Error('AI returned an invalid star category.');
        counts[pred.quality_stars] += 1;
        await client.query(`INSERT INTO ai_predictions(scan_id,image_id,onion_index,bbox,quality_stars,confidence,visual_metrics,reasons,model_version)
          VALUES($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9)`, [scanId,row.id,pred.onion_index,JSON.stringify(pred.bbox),pred.quality_stars,pred.confidence,JSON.stringify(pred.visual_metrics),JSON.stringify(pred.reasons),analysis.model_version]);
      }
    }
    const averageStars = totalOnions ? Number((counts.slice(1).reduce((sum,count,idx) => sum + count * (idx + 1), 0) / totalOnions).toFixed(2)) : null;
    for (let star = 1; star <= 5; star++) {
      if (!counts[star]) continue;
      const label = QUALITY_LABELS[star];
      await client.query('INSERT INTO ratings(scan_id,quality_stars,label,onion_count,share_percent) VALUES($1,$2,$3,$4,$5)', [scanId,star,label,counts[star],totalOnions ? Number((counts[star] * 100 / totalOnions).toFixed(2)) : 0]);
    }
    const report = {
      scanId, modelVersion: analysis.model_version, device: analysis.device, processingMs: analysis.processing_ms,
      imageCount: images.length, totalOnions, averageStars,
      distribution: buildGradeDistribution(counts),
      disclaimer: analysis.disclaimer, completedAt: new Date().toISOString()
    };
    await client.query("UPDATE scans SET status='completed',onion_count=$2,model_version=$3,report=$4::jsonb,completed_at=NOW(),error_code=NULL,error_message=NULL WHERE id=$1", [scanId,totalOnions,analysis.model_version,JSON.stringify(report)]);
    await client.query("INSERT INTO reports(scan_id,format,report_data) VALUES($1,'json',$2::jsonb)", [scanId,JSON.stringify(report)]);
    await client.query(`INSERT INTO notifications(user_id,title,body,kind) SELECT user_id,$2,$3,'scan_complete' FROM scans WHERE id=$1`, [scanId,'Your onion quality report is ready',`We analyzed ${totalOnions} onions across ${images.length} image(s). Open the report to review the grade breakdown.`]);
    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
