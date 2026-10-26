import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
export const dashboardRouter = Router();

dashboardRouter.get('/summary', authenticate, async (req, res, next) => {
  try {
    const [totals, trend, distribution, recent] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total_scans, COUNT(*) FILTER (WHERE status='completed')::int AS completed_scans,
        COUNT(*) FILTER (WHERE status IN ('queued','processing'))::int AS pending_scans,
        COALESCE(SUM(onion_count),0)::int AS total_onions,
        COALESCE((SELECT ROUND(AVG(quality_stars)::numeric,2) FROM ai_predictions p JOIN scans ps ON ps.id=p.scan_id WHERE ps.user_id=$1),0) AS average_stars
        FROM scans WHERE user_id=$1`, [req.user!.id]),
      query(`SELECT DATE(created_at AT TIME ZONE 'Asia/Kolkata') AS day, COUNT(*)::int AS scans, COALESCE(SUM(onion_count),0)::int AS onions
        FROM scans WHERE user_id=$1 AND created_at >= NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day`, [req.user!.id]),
      query(`SELECT p.quality_stars, COUNT(*)::int AS onion_count FROM ai_predictions p JOIN scans s ON s.id=p.scan_id WHERE s.user_id=$1 GROUP BY p.quality_stars ORDER BY p.quality_stars DESC`, [req.user!.id]),
      query(`SELECT id,status,source,image_count,onion_count,created_at,completed_at,report FROM scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8`, [req.user!.id])
    ]);
    res.json({ totals: totals.rows[0], trend: trend.rows, distribution: distribution.rows, recent: recent.rows });
  } catch (error) { next(error); }
});
