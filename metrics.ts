import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ service:'onion-quality-api' });
collectDefaultMetrics({ register:metricsRegistry });
const requests = new Counter({ name:'http_requests_total', help:'HTTP requests served by the API.', labelNames:['method','route','status'], registers:[metricsRegistry] });
const duration = new Histogram({ name:'http_request_duration_seconds', help:'HTTP request duration in seconds.', labelNames:['method','route','status'], buckets:[0.01,0.025,0.05,0.1,0.25,0.5,1,2,5,10], registers:[metricsRegistry] });
export function metricsMiddleware(req:Request,res:Response,next:NextFunction){
 const start=process.hrtime.bigint();
 res.on('finish',()=>{
  if(req.path==='/metrics')return;
  const route=req.route?.path ? `${req.baseUrl}${req.route.path}` : (req.path.startsWith('/health/')?req.path:'unmatched');
  const labels={method:req.method,route,status:String(res.statusCode)};
  requests.inc(labels);duration.observe(labels,Number(process.hrtime.bigint()-start)/1e9);
 });
 next();
}
