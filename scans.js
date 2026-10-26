import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

export const options = {
  scenarios: { farmer_scans: { executor:'constant-vus', vus:Number(__ENV.VUS||5), duration:__ENV.DURATION||'2m' } },
  thresholds: { http_req_failed:['rate<0.02'], scan_submit_seconds:['p(95)<2'] }
};
const submitDuration = new Trend('scan_submit_seconds');
const scanSuccess = new Rate('scan_completed_rate');
const base = (__ENV.BASE_URL||'http://localhost:4000').replace(/\/$/,'');
const imageBytes = open(__ENV.TEST_IMAGE_PATH || './tests/fixtures/onion-lot.jpg','b');

export default function(){
  const login=http.post(`${base}/api/auth/login`,JSON.stringify({email:__ENV.TEST_USER_EMAIL,password:__ENV.TEST_USER_PASSWORD}),{headers:{'Content-Type':'application/json'}});
  check(login,{ 'login succeeds':r=>r.status===200 });
  if(login.status!==200){sleep(1);return}
  const csrf=login.json('csrfToken');
  const res=http.post(`${base}/api/scans`,{source:'upload',images:http.file(imageBytes,'onion-lot.jpg','image/jpeg')},{headers:{'X-CSRF-Token':csrf}});
  submitDuration.add(res.timings.duration/1000);
  const ok=check(res,{'scan accepted':r=>r.status===202});
  if(!ok){scanSuccess.add(false);sleep(1);return}
  const id=res.json('scanId');let completed=false;
  for(let i=0;i<90;i++){
    sleep(1.5);
    const status=http.get(`${base}/api/scans/${id}`);
    if(status.status!==200)continue;
    const value=status.json('scan.status');
    if(value==='completed'){completed=true;break}
    if(value==='failed')break;
  }
  scanSuccess.add(completed);
  check(null,{'scan finishes eventually':()=>completed});
}
