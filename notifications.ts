import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
export const notificationsRouter=Router();
notificationsRouter.use(authenticate);
notificationsRouter.get('/',async(req,res,next)=>{try{const result=await query('SELECT id,title,body,kind,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[req.user!.id]);res.json({notifications:result.rows})}catch(error){next(error)}});
notificationsRouter.patch('/:id/read',async(req,res,next)=>{try{const id=z.uuid().parse(req.params.id);const result=await query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at',[id,req.user!.id]);if(!result.rows[0])return res.status(404).json({error:{code:'NOTIFICATION_NOT_FOUND',message:'Notification not found.'}});res.json({notification:result.rows[0]})}catch(error){next(error)}});
