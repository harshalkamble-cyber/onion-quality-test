import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db.js';
const router=Router();
router.patch('/ml-jobs/:id/status',async(req,res,next)=>{
 try{
  const expected=process.env.ML_PIPELINE_CALLBACK_TOKEN??'';const provided=req.header('x-pipeline-token')??'';
  if(expected.length<32||provided.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return res.status(404).json({error:{code:'NOT_FOUND',message:'Route not found.'}});
  const body=z.object({status:z.enum(['queued','running','succeeded','failed','cancelled']),pipelineRunId:z.string().max(160).optional(),resultSummary:z.record(z.string(),z.unknown()).optional()}).parse(req.body);
  const mapped=body.status==='succeeded'?'succeeded':body.status;
  const result=await query(`UPDATE retraining_jobs SET status=$2,pipeline_run_id=COALESCE($3,pipeline_run_id),result_summary=COALESCE($4::jsonb,result_summary),started_at=CASE WHEN $2='running' THEN COALESCE(started_at,NOW()) ELSE started_at END,completed_at=CASE WHEN $2 IN ('succeeded','failed','cancelled') THEN NOW() ELSE NULL END WHERE id=$1 RETURNING id,status,pipeline_run_id`,[req.params.id,mapped,body.pipelineRunId??null,body.resultSummary?JSON.stringify(body.resultSummary):null]);
  if(!result.rows[0])return res.status(404).json({error:{code:'JOB_NOT_FOUND',message:'Training job not found.'}});
  res.json({job:result.rows[0]});
 }catch(error){next(error)}
});
export {router as internalRouter};
