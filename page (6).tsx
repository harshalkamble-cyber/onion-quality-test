'use client';
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Upload, ImagePlus, X, ScanLine, Sparkles, FileDown, Volume2, AlertTriangle, CheckCircle2, Info, Clock3, RotateCcw } from 'lucide-react';
import { apiFetch, API_BASE } from '@/lib/api';
import { useLanguage } from '@/components/language-provider';
import { deletePendingBatch, listPendingBatches, savePendingBatch, type PendingOfflineBatch } from '@/lib/offline-queue';

type ScanStatus = 'queued'|'processing'|'completed'|'failed';
type Prediction = { id:string; image_id:string; onion_index:number; bbox:Record<string,number>; quality_stars:number; confidence:number; visual_metrics:{color_consistency:number;shape_regularity:number;surface_uniformity:number;visible_defect_score?:number|null}; reasons:string[]; visible_defects?:string[]; model_version:string };
type ScanRecord = { id:string; status:ScanStatus; source:string; image_count:number; onion_count:number; model_version?:string; error_message?:string; report?:{averageStars:number|null;distribution:Array<{stars:number;label:string;count:number;percent:number}>;disclaimer:string;processingMs:number;totalOnions:number;completedAt:string}; created_at:string; completed_at?:string };
type ScanDetail = { scan:ScanRecord; images:Array<{id:string;original_name:string;onion_count:number}>; predictions:Prediction[]; ratings:Array<{quality_stars:number;label:string;onion_count:number;share_percent:string}> };
type CreateScan = { scanId:string; status:ScanStatus; imageCount:number; message:string };
const ratingLabels:Record<number,string>={5:'Premium Quality',4:'Good Quality',3:'Average Quality',2:'Poor Quality',1:'Very Poor Quality'};

export default function ScanPage() {
  const {t,language}=useLanguage(); const [files,setFiles]=useState<File[]>([]); const [previews,setPreviews]=useState<string[]>([]); const [dragging,setDragging]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [scan,setScan]=useState<ScanDetail|null>(null); const [authRequired,setAuthRequired]=useState(false); const [source,setSource]=useState<'upload'|'camera'|'bulk'>('upload'); const [pollText,setPollText]=useState(''); const [offlineMessage,setOfflineMessage]=useState(''); const syncingRef=useRef(false);
  const fileInput=useRef<HTMLInputElement>(null); const cameraInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{const urls=files.map(f=>URL.createObjectURL(f));setPreviews(urls);return()=>urls.forEach(URL.revokeObjectURL)},[files]);
  const totalBytes=useMemo(()=>files.reduce((sum,f)=>sum+f.size,0),[files]);
  function appendFiles(incoming:FileList|File[],selectedSource:'upload'|'camera'|'bulk'='upload') {
    const acceptable=Array.from(incoming).filter(f=>['image/jpeg','image/png','image/webp'].includes(f.type));
    if(!acceptable.length){setError('Choose JPEG, PNG, or WebP photos.');return;}
    setError('');setSource(acceptable.length>1?'bulk':selectedSource);
    setFiles(current=>{const merged=[...current,...acceptable].filter((f,i,arr)=>arr.findIndex(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified)===i);if(merged.length>30){setError('You can upload up to 30 images in one scan.');return merged.slice(0,30)}return merged});
  }
  function onFileChange(event:ChangeEvent<HTMLInputElement>,kind:'upload'|'camera'|'bulk'){if(event.target.files)appendFiles(event.target.files,kind);event.target.value='';}
  function onDrop(event:DragEvent<HTMLDivElement>){event.preventDefault();setDragging(false);if(event.dataTransfer.files)appendFiles(event.dataTransfer.files,'bulk');}
  async function submitFiles(batchFiles:File[], batchSource:'upload'|'camera'|'bulk') {
    const body=new FormData();body.append('source',batchFiles.length>1?'bulk':batchSource);batchFiles.forEach(f=>body.append('images',f,f.name));
    const created=await apiFetch<CreateScan>('/scans',{method:'POST',body});let detail:ScanDetail|null=null;
    for(let attempt=0;attempt<90;attempt++){
      await new Promise(resolve=>setTimeout(resolve,1500));
      detail=await apiFetch<ScanDetail>(`/scans/${created.scanId}`);setScan(detail);
      if(detail.scan.status==='completed'||detail.scan.status==='failed')break;
    }
    return detail;
  }
  async function runScan(){
    if(!files.length)return;setBusy(true);setError('');setScan(null);setPollText(t('waiting'));setAuthRequired(false);setOfflineMessage('');
    try{
      if(!navigator.onLine){
        if(totalBytes>100*1024*1024)throw new Error('This batch is larger than the 100 MB offline queue limit. Split it into smaller scans.');
        await savePendingBatch(files,source);
        setOfflineMessage('No internet connection. Your photos are saved on this device and will upload automatically when connection returns. Do not clear this browser’s site data before the upload finishes.');
        return;
      }
      const detail=await submitFiles(files,source);
      if(detail?.scan.status==='failed')setError(detail.scan.error_message||'Analysis failed. Retake the images in better light and try again.');
      else if(detail?.scan.status!=='completed')setError('This scan is taking longer than expected. It is saved and may still finish. Open My reports to check its status.');
    }catch(e){const err=e as Error&{status?:number};if(err.status===401||err.status===403){setAuthRequired(true);setError('Sign in to save and analyze your images.');}else setError(err.message||'Unable to submit your scan. Please try again.');}
    finally{setBusy(false);setPollText('');}
  }
  useEffect(()=>{
    let disposed=false;
    const syncOffline=async()=>{
      if(disposed||syncingRef.current||!navigator.onLine)return;
      syncingRef.current=true;
      try{
        const batches=await listPendingBatches();if(!batches.length)return;
        for(const batch of batches){
          if(disposed||!navigator.onLine)break;
          const restored=batch.files.map(item=>new File([item.blob],item.name,{type:item.type,lastModified:item.lastModified}));
          setBusy(true);setPollText('Uploading a saved offline scan…');setError('');
          try{
            const detail=await submitFiles(restored,batch.source);
            await deletePendingBatch(batch.id);
            setOfflineMessage('A saved offline scan was uploaded. Its report is shown here or in My reports.');
            if(detail?.scan.status==='failed')setError(detail.scan.error_message||'The saved scan uploaded, but analysis failed.');
          }catch(e){const err=e as Error&{status?:number};if(err.status===401||err.status===403){setAuthRequired(true);setError('Sign in to upload your saved offline scans. They remain on this device.');}else setError('The offline scan is still saved on this device. It will retry when you reconnect.');break;}
        }
      }catch{ /* IndexedDB may be disabled by browser privacy settings. */ }
      finally{syncingRef.current=false;setBusy(false);setPollText('');}
    };
    window.addEventListener('online',syncOffline);if(navigator.onLine)void syncOffline();
    return()=>{disposed=true;window.removeEventListener('online',syncOffline)};
  },[]);
  function speakReport(){if(!scan?.scan.report||!('speechSynthesis'in window))return;const r=scan.scan.report;const text=`Quality report. We analyzed ${r.totalOnions} onions. Average quality rating ${r.averageStars??'unavailable'} out of 5 stars. `+r.distribution.map(d=>`${d.count} onions received ${d.stars} stars`).join('. ');const utterance=new SpeechSynthesisUtterance(text);utterance.lang=language==='mr'?'mr-IN':language==='hi'?'hi-IN':'en-IN';window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);}
  function stars(value:number){return <span className="stars" aria-label={`${value} out of 5 stars`}>{'★'.repeat(value)}<span className="empty">{'★'.repeat(5-value)}</span></span>}
  const report=scan?.scan.report;
  return <div className="container page-shell"><div className="page-heading"><div><span className="eyebrow"><ScanLine size={14}/> Step 1 · Capture and review</span><h1>{t('scanTitle')}</h1><p>{t('scanLead')}</p></div><Link className="button button-secondary" href="/dashboard">My reports <FileDown size={16}/></Link></div>
    <div className="scan-layout"><section className="surface-card upload-card"><div className={`upload-zone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={e=>{if((e.target as HTMLElement).closest('button'))return;fileInput.current?.click()}} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileInput.current?.click()}}} aria-label="Upload onion photos" style={{cursor:'pointer'}}>
      <div className="upload-icon"><ImagePlus size={27}/></div><h2>{dragging?'Drop your photos here':'Add photos of your onions'}</h2><p>Drag and drop photos, or choose from your phone. Use a plain background and even light for better results.</p><div className="upload-actions"><button className="button button-primary" type="button" onClick={()=>fileInput.current?.click()}><Upload size={17}/>{t('upload')}</button><button className="button button-secondary" type="button" onClick={()=>{setSource('camera');cameraInput.current?.click()}}><Camera size={17}/>{t('camera')}</button></div>
      <input ref={fileInput} className="hidden-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>onFileChange(e,'bulk')}/><input ref={cameraInput} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={e=>onFileChange(e,'camera')}/>
    </div>
    {files.length>0&&<><div className="file-list">{files.map((file,i)=><div className="file-preview" key={`${file.name}-${file.lastModified}-${i}`}><img src={previews[i]} alt={`Selected onion photo ${i+1}`}/><button className="remove-file" type="button" onClick={()=>setFiles(current=>current.filter((_,n)=>n!==i))} aria-label={`Remove ${file.name}`}><X size={15}/></button><div className="file-preview-name">{file.name}</div></div>)}</div><div className="upload-footer"><div><strong>{files.length} {files.length===1?'image':'images'} selected</strong><div className="help-small">{(totalBytes/1024/1024).toFixed(1)} MB total · Up to 30 images · 15 MB each</div></div><button className="button button-primary" disabled={busy} type="button" onClick={runScan}>{busy?<><span className="spinner"/>{t('loading')}</>:<><Sparkles size={17}/>{t('analyze')}</>}</button></div></>}
    {offlineMessage&&<div className="success-banner" role="status">{offlineMessage}</div>}
    {error&&<div className="error-banner" role="alert"><AlertTriangle size={16} style={{display:'inline',verticalAlign:'middle',marginRight:6}}/>{error}{authRequired&&<> <Link href="/login" style={{fontWeight:800,textDecoration:'underline'}}>Sign in</Link></>}</div>}
    {pollText&&<div className="processing-indicator" role="status"><span className="spinner"/>{pollText}</div>}
    <p className="help-small" style={{marginTop:18}}><Info size={14} style={{display:'inline',verticalAlign:'middle',marginRight:5}}/>Take photos where bulbs are visible and not heavily overlapping. A lot photo may miss small defects; scan representative samples.</p>
    </section>

    <section className="surface-card report-card" aria-live="polite">{!scan&&!busy&&<div className="report-placeholder"><div className="upload-icon"><ScanLine size={26}/></div><h2>{t('result')}</h2><p>Your onion count, star distribution and the reason for each rating will appear here after analysis.</p><div style={{marginTop:19}} className="quality-stars">★★★★★</div></div>}
      {busy&&!scan&&<div className="report-placeholder"><div className="upload-icon"><span className="spinner"/></div><h2>{t('waiting')}</h2><p>Images are queued for model analysis. Larger batches may take longer.</p><div className="processing-indicator"><span className="spinner"/>Please keep this page open</div></div>}
      {scan&&<><div className="report-top"><div><h2>{t('result')}</h2><p>{scan.scan.image_count} image(s) · {scan.scan.created_at?new Date(scan.scan.created_at).toLocaleString():''}</p></div><span className="status-pill">{scan.scan.status==='completed'?<CheckCircle2 size={14}/>:scan.scan.status==='failed'?<AlertTriangle size={14}/>:<Clock3 size={14}/>} {scan.scan.status==='completed'?t('statusCompleted'):scan.scan.status==='failed'?t('statusFailed'):scan.scan.status==='queued'?t('statusQueued'):t('statusProcessing')}</span></div>
        {report&&scan.scan.status==='completed'?<><div className="grade-summary"><div><strong>{report.averageStars??'—'}<span style={{fontSize:15,letterSpacing:0,color:'#708267'}}> / 5</span></strong><div className="quality-stars" style={{marginTop:8}}>{'★'.repeat(Math.round(report.averageStars??0))}<span style={{color:'#d9dfd1'}}>{'★'.repeat(5-Math.round(report.averageStars??0))}</span></div></div><div><h3>{report.averageStars&&report.averageStars>=4?'Strong visual grade':report.averageStars&&report.averageStars>=3?'Mixed / average visual grade':'Review this lot carefully'}</h3><p>{report.totalOnions} onions detected across {scan.scan.image_count} image(s)</p></div></div>
          <div className="grade-dist"><h3 className="subheading">Grade distribution</h3>{[...report.distribution].sort((a,b)=>b.stars-a.stars).map(d=><div className="dist-row" key={d.stars}><span className="dist-label">{'★'.repeat(d.stars)}{'☆'.repeat(5-d.stars)}</span><div className="dist-track"><div className="dist-fill" style={{width:`${Math.max(0,Math.min(100,d.percent))}%`}}/></div><span className="dist-value">{d.count}</span></div>)}</div>
          <hr className="divider"/><h3 className="subheading">Individual onion findings</h3>
          {scan.predictions.length===0?<div className="empty-state"><AlertTriangle size={24}/><p>{t('noPrediction')}</p></div>:<div className="onion-results">{scan.predictions.map(p=><article className="onion-result" key={p.id}><div className="onion-result-top"><strong>Onion #{p.onion_index}</strong>{stars(p.quality_stars)}</div><div className="quality-label">{ratingLabels[p.quality_stars]}</div><p>{p.reasons?.[0]||'Grade assigned by the configured quality classifier.'}</p><div className="metric-chips"><span className="metric-chip">Color {Math.round(p.visual_metrics?.color_consistency??0)}%</span><span className="metric-chip">Shape {Math.round(p.visual_metrics?.shape_regularity??0)}%</span><span className="metric-chip">Surface {Math.round(p.visual_metrics?.surface_uniformity??0)}%</span><span className="metric-chip">Conf. {Math.round(p.confidence*100)}%</span>{p.visual_metrics?.visible_defect_score!==null&&p.visual_metrics?.visible_defect_score!==undefined&&<span className="metric-chip">Defect-free cue {Math.round(p.visual_metrics.visible_defect_score)}%</span>}{p.visible_defects?.length?<span className="metric-chip">Flags: {p.visible_defects.join(', ')}</span>:null}</div><ul className="reason-list">{(p.reasons??[]).map((reason,i)=><li key={i}>{reason}</li>)}</ul></article>)}</div>}
          <div className="report-actions"><a className="button button-secondary" href={`${API_BASE}/scans/${scan.scan.id}/report.csv`}><FileDown size={15}/>{t('export')}</a><button className="button button-secondary" onClick={speakReport}><Volume2 size={15}/>{t('voice')}</button><button className="button button-primary" onClick={()=>{setScan(null);setFiles([]);setError('');}}><RotateCcw size={15}/>New scan</button></div><p className="report-disclaimer">{report.disclaimer||t('disclaimer')} Visual shape, color and surface indicators are image descriptors, not laboratory measurements.</p>
        </>:scan.scan.status==='failed'?<div className="empty-state"><AlertTriangle size={25}/><p>{scan.scan.error_message||'Analysis did not complete. Try clear images with even lighting.'}</p><button className="button button-primary" style={{marginTop:15}} onClick={()=>{setScan(null);runScan()}}><RotateCcw size={15}/>{t('retry')}</button></div>:<div className="report-placeholder"><div className="upload-icon"><span className="spinner"/></div><h2>{t('waiting')}</h2><p>Status will refresh automatically. You can check the saved scan in My reports if you navigate away.</p><div className="processing-indicator"><span className="spinner"/> {scan.scan.status==='queued'?t('statusQueued'):t('statusProcessing')}</div></div>}
      </>}
    </section></div>
  </div>;
}
