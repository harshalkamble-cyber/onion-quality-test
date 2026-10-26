import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { authenticate, requireRole } from '../middleware/auth.js';
export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin','inspector'));

adminRouter.get('/overview', async (_req, res, next) => {
  try {
    const [users, scans, grades, feedback] = await Promise.all([
      query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE is_active)::int AS active FROM users'),
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE status='completed')::int AS completed, COUNT(*) FILTER(WHERE status='failed')::int AS failed, COUNT(*) FILTER(WHERE status IN ('queued','processing'))::int AS pending, COALESCE(SUM(onion_count),0)::int AS onions FROM scans`),
      query(`SELECT quality_stars,COUNT(*)::int AS count FROM ai_predictions GROUP BY quality_stars ORDER BY quality_stars DESC`),
      query(`SELECT COUNT(*)::int AS open FROM feedback WHERE status IN ('open','reviewing')`)
    ]);
    let modelHealth: unknown = { status: 'unknown' };
    try { const r = await fetch(`${config.AI_SERVICE_URL.replace(/\/$/,'')}/health/ready`, { signal: AbortSignal.timeout(2000) }); modelHealth = await r.json(); }
    catch { modelHealth = { status: 'unreachable' }; }
    res.json({ users: users.rows[0], scans: scans.rows[0], grades: grades.rows, feedback: feedback.rows[0], modelHealth });
  } catch (error) { next(error); }
});

adminRouter.get('/users', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25),1),100);
    const offset = Math.max(Number(req.query.offset ?? 0),0);
    const result = await query(`SELECT u.id,u.full_name,u.email,u.phone,u.role,u.preferred_language,u.is_active,u.created_at,
      COUNT(s.id)::int AS scans_count FROM users u LEFT JOIN scans s ON s.user_id=u.id
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`, [limit,offset]);
    res.json({ users: result.rows, limit, offset });
  } catch (error) { next(error); }
});

adminRouter.patch('/users/:id/status', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z.object({ isActive: z.boolean() }).parse(req.body);
    if (req.params.id === req.user!.id && !body.isActive) return res.status(400).json({ error: { code:'SELF_DEACTIVATION', message:'You cannot deactivate your own admin session.' } });
    const result = await query('UPDATE users SET is_active=$2 WHERE id=$1 RETURNING id,is_active', [req.params.id,body.isActive]);
    if (!result.rows[0]) return res.status(404).json({ error: { code:'USER_NOT_FOUND', message:'User not found.' } });
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get('/feedback', async (req, res, next) => {
  try {
    const status = z.enum(['open','reviewing','resolved','dismissed']).optional().parse(req.query.status);
    const result = await query(`SELECT f.id,f.rating,f.category,f.message,f.status,f.created_at,u.full_name,u.email,f.scan_id
      FROM feedback f LEFT JOIN users u ON u.id=f.user_id WHERE ($1::text IS NULL OR f.status=$1) ORDER BY f.created_at DESC LIMIT 100`, [status ?? null]);
    res.json({ feedback: result.rows });
  } catch (error) { next(error); }
});

adminRouter.patch('/feedback/:id', async (req, res, next) => {
  try {
    const body = z.object({ status: z.enum(['open','reviewing','resolved','dismissed']) }).parse(req.body);
    const result = await query(`UPDATE feedback SET status=$2,resolved_at=CASE WHEN $2='resolved' THEN NOW() ELSE NULL END WHERE id=$1 RETURNING id,status,resolved_at`, [req.params.id,body.status]);
    if (!result.rows[0]) return res.status(404).json({ error: { code:'FEEDBACK_NOT_FOUND', message:'Feedback item not found.' } });
    res.json({ feedback: result.rows[0] });
  } catch (error) { next(error); }
});


adminRouter.post('/datasets', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z.object({ sourceName:z.string().trim().min(1).max(255), storageKey:z.string().trim().min(1).max(500).refine(v=>!v.includes('..')&&!v.startsWith('/'),'Storage key must be relative'), imageCount:z.coerce.number().int().min(1).max(1000000).default(1), datasetVersion:z.string().trim().max(80).optional(), licenseReference:z.string().trim().max(1000).optional(), notes:z.string().trim().max(2000).optional() }).parse(req.body);
    const result=await query(`INSERT INTO dataset_assets(uploaded_by,storage_key,source_name,image_count,dataset_version,license_reference,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,source_name,label_state,image_count,dataset_version,created_at`,[req.user!.id,body.storageKey,body.sourceName,body.imageCount,body.datasetVersion??null,body.licenseReference??null,body.notes??null]);
    res.status(201).json({asset:result.rows[0]});
  }catch(error){next(error)}
});

adminRouter.get('/datasets', async (req, res, next) => {
  try {
    const state = z.enum(['unreviewed','in_review','approved','rejected']).optional().parse(req.query.state);
    const rows = await query(`SELECT d.id,d.source_name,d.label_state,d.image_count,d.dataset_version,d.license_reference,d.notes,d.created_at,d.reviewed_at,u.full_name AS uploaded_by_name
      FROM dataset_assets d LEFT JOIN users u ON u.id=d.uploaded_by WHERE ($1::text IS NULL OR d.label_state=$1) ORDER BY d.created_at DESC LIMIT 100`, [state ?? null]);
    const counts = await query(`SELECT label_state,COUNT(*)::int AS assets,COALESCE(SUM(image_count),0)::int AS images FROM dataset_assets GROUP BY label_state`);
    res.json({ assets: rows.rows, counts: counts.rows });
  } catch (error) { next(error); }
});

adminRouter.patch('/datasets/:id/review', async (req, res, next) => {
  try {
    const body = z.object({ labelState:z.enum(['unreviewed','in_review','approved','rejected']), notes:z.string().max(2000).optional() }).parse(req.body);
    const result = await query(`UPDATE dataset_assets SET label_state=$2,notes=COALESCE($3,notes),reviewed_at=CASE WHEN $2 IN ('approved','rejected') THEN NOW() ELSE NULL END WHERE id=$1 RETURNING id,label_state,notes,reviewed_at`, [req.params.id,body.labelState,body.notes ?? null]);
    if (!result.rows[0]) return res.status(404).json({ error: { code:'DATASET_ASSET_NOT_FOUND', message:'Dataset asset not found.' } });
    res.json({ asset: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.post('/model-versions', requireRole('admin'), async (req, res, next) => {
  try {
    const body=z.object({version:z.string().trim().min(1).max(80),detectorHash:z.string().regex(/^[a-fA-F0-9]{32,128}$/),classifierHash:z.string().regex(/^[a-fA-F0-9]{32,128}$/),datasetVersion:z.string().max(80).optional(),validationMetrics:z.record(z.string(),z.unknown()).default({})}).parse(req.body);
    const result=await query(`INSERT INTO model_versions(version,detector_hash,classifier_hash,dataset_version,validation_metrics,status) VALUES($1,$2,$3,$4,$5::jsonb,'candidate') RETURNING id,version,status,created_at`,[body.version,body.detectorHash,body.classifierHash,body.datasetVersion??null,JSON.stringify(body.validationMetrics)]);
    res.status(201).json({model:result.rows[0]});
  }catch(error){next(error)}
});

adminRouter.patch('/model-versions/:id/review', requireRole('admin'), async (req, res, next) => {
  try {
    const body=z.object({status:z.enum(['validated','rejected'])}).parse(req.body);
    const row=await query(`UPDATE model_versions SET status=$2,approved_by=$3 WHERE id=$1 AND status='candidate' RETURNING id,version,status,approved_by,created_at`,[req.params.id,body.status,req.user!.id]);
    if(!row.rows[0])return res.status(404).json({error:{code:'MODEL_CANDIDATE_NOT_FOUND',message:'A candidate model version was not found.'}});
    res.json({model:row.rows[0],message:'Model approval metadata updated. Activating model weights still requires the controlled deployment/release workflow.'});
  }catch(error){next(error)}
});

adminRouter.get('/model-versions', async (_req, res, next) => {
  try {
    const result = await query(`SELECT m.id,m.version,m.detector_hash,m.classifier_hash,m.validation_metrics,m.dataset_version,m.status,m.created_at,m.activated_at,u.full_name AS approved_by_name FROM model_versions m LEFT JOIN users u ON u.id=m.approved_by ORDER BY m.created_at DESC LIMIT 100`);
    res.json({ models: result.rows });
  } catch (error) { next(error); }
});

adminRouter.get('/retraining', requireRole('admin'), async (_req, res, next) => {
  try {
    const result = await query(`SELECT j.id,j.dataset_version,j.requested_config,j.status,j.pipeline_run_id,j.result_summary,j.created_at,j.started_at,j.completed_at,u.full_name AS requested_by_name FROM retraining_jobs j LEFT JOIN users u ON u.id=j.requested_by ORDER BY j.created_at DESC LIMIT 50`);
    res.json({ jobs: result.rows });
  } catch (error) { next(error); }
});

adminRouter.post('/retraining', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z.object({ datasetVersion:z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/), epochs:z.coerce.number().int().min(1).max(300).default(80), imageSize:z.coerce.number().int().refine(v=>[224,320,416,512,640,768].includes(v),'Unsupported image size').default(640), notes:z.string().trim().max(1000).optional() }).parse(req.body);
    const approvedDataset = await query('SELECT 1 FROM dataset_assets WHERE dataset_version=$1 AND label_state=\'approved\' LIMIT 1', [body.datasetVersion]);
    if (!approvedDataset.rows.length) return res.status(400).json({ error: { code:'DATASET_NOT_APPROVED', message:'Only a registered dataset version with approved labels can be used for retraining.' } });
    const cfg={epochs:body.epochs,imageSize:body.imageSize,notes:body.notes??'',requestedBy:req.user!.id};
    const created=await query<{id:string}>(`INSERT INTO retraining_jobs(requested_by,dataset_version,requested_config,status) VALUES($1,$2,$3::jsonb,'requested') RETURNING id`,[req.user!.id,body.datasetVersion,JSON.stringify(cfg)]);
    const jobId=created.rows[0].id;
    const token=process.env.ML_RETRAIN_GITHUB_TOKEN;const repo=process.env.ML_RETRAIN_GITHUB_REPOSITORY;const workflow=process.env.ML_RETRAIN_GITHUB_WORKFLOW;
    if(token&&repo&&workflow){
      try{
        const response=await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:process.env.ML_RETRAIN_GITHUB_REF??'main',inputs:{job_id:jobId,dataset_version:body.datasetVersion,epochs:String(body.epochs),image_size:String(body.imageSize)}}),signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw new Error(`Workflow dispatch returned HTTP ${response.status}`);
        await query("UPDATE retraining_jobs SET status='queued',pipeline_run_id='workflow-dispatch-accepted' WHERE id=$1",[jobId]);
      }catch(error){await query("UPDATE retraining_jobs SET status='failed',result_summary=$2::jsonb,completed_at=NOW() WHERE id=$1",[jobId,JSON.stringify({error:error instanceof Error?error.message:'dispatch_failed'})]);throw error;}
    }
    const result=await query('SELECT id,dataset_version,requested_config,status,pipeline_run_id,created_at FROM retraining_jobs WHERE id=$1',[jobId]);
    res.status(202).json({job:result.rows[0],pipelineConfigured:Boolean(token&&repo&&workflow),message:token&&repo&&workflow?'Retraining workflow queued.':'Request saved. Configure the GitHub Actions dispatch environment variables to launch the training pipeline.'});
  }catch(error){next(error)}
});
