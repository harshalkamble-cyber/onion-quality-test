import express from 'express';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { csrfProtection } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { scanRouter } from './routes/scans.js';
import { dashboardRouter } from './routes/dashboard.js';
import { adminRouter } from './routes/admin.js';
import { healthRouter } from './routes/health.js';
import { feedbackRouter } from './routes/feedback.js';
import { notificationsRouter } from './routes/notifications.js';
import { internalRouter } from './routes/internal.js';
import { openapiSpec } from './swagger.js';
import { metricsMiddleware, metricsRegistry } from './metrics.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc:["'self'"], scriptSrc:["'self'","'unsafe-inline'"], styleSrc:["'self'","'unsafe-inline'"], imgSrc:["'self'",'data:'], connectSrc:["'self'"], frameAncestors:["'none'"], baseUri:["'none'"], formAction:["'self'"] } },
  crossOriginResourcePolicy: { policy:'same-site' }, referrerPolicy:{ policy:'no-referrer' }
}));
app.use(cors({ origin: config.WEB_ORIGIN, credentials:true, methods:['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders:['Content-Type','X-CSRF-Token','X-Request-ID','Authorization'] }));
app.use(express.json({ limit:'1mb', strict:true }));
app.use(express.urlencoded({ extended:false, limit:'32kb' }));
app.use(cookieParser());
app.use(metricsMiddleware);
app.get('/metrics', async (_req,res,next) => { try { res.setHeader('Content-Type',metricsRegistry.contentType); res.send(await metricsRegistry.metrics()); } catch(error) { next(error); } });
app.use((req,res,next) => {
  const id = req.header('x-request-id')?.slice(0,80) ?? cryptoRandomId();
  res.setHeader('X-Request-ID', id);
  const started = Date.now();
  res.on('finish', () => console.info(JSON.stringify({ level:'info', event:'http_request', requestId:id, method:req.method, path:req.path, status:res.statusCode, durationMs:Date.now()-started })));
  next();
});
const apiLimiter = rateLimit({ windowMs:60_000, limit:240, standardHeaders:'draft-8', legacyHeaders:false, message:{ error:{ code:'RATE_LIMITED', message:'Too many requests. Please wait a moment and try again.' } } });
const authLimiter = rateLimit({ windowMs:15*60_000, limit:30, standardHeaders:'draft-8', legacyHeaders:false, message:{ error:{ code:'AUTH_RATE_LIMITED', message:'Too many sign-in attempts. Please wait 15 minutes.' } } });
app.use('/health', healthRouter);
app.use('/api', apiLimiter, csrfProtection);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/scans', scanRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/internal', internalRouter);
if (config.NODE_ENV !== 'production') app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.use(notFound);
app.use(errorHandler);
function cryptoRandomId() { return randomUUID(); }
