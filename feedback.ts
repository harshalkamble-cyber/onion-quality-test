import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
export const feedbackRouter = Router();
const feedbackSchema = z.object({ rating: z.coerce.number().int().min(1).max(5).optional(), category: z.enum(['accuracy','usability','bug','support','general']).default('general'), message: z.string().trim().min(4).max(4000), scanId: z.uuid().optional() });
feedbackRouter.post('/', authenticate, async (req,res,next)=>{
  try {
    const data=feedbackSchema.parse(req.body);
    if(data.scanId){const own=await query('SELECT id FROM scans WHERE id=$1 AND user_id=$2',[data.scanId,req.user!.id]);if(!own.rows[0])return res.status(404).json({error:{code:'SCAN_NOT_FOUND',message:'The linked scan was not found.'}})}
    const result=await query('INSERT INTO feedback(user_id,scan_id,rating,category,message) VALUES($1,$2,$3,$4,$5) RETURNING id,status,created_at',[req.user!.id,data.scanId??null,data.rating??null,data.category,data.message]);
    await audit(req,'feedback.created','feedback',result.rows[0].id,{category:data.category});
    res.status(201).json({feedback:result.rows[0]});
  }catch(error){next(error)}
});
