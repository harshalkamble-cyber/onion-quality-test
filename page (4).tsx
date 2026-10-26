'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, UsersRound, ScanLine, RefreshCw, ShieldAlert, Database,
  Cpu, Settings2, CheckCircle2, XCircle, FlaskConical, ClipboardList
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/components/language-provider';

type Overview = {
  users: { total: number; active: number };
  scans: { total: number; completed: number; failed: number; pending: number; onions: number };
  grades: Array<{ quality_stars: number; count: number }>;
  feedback: { open: number };
  modelHealth: {
    status: string; model_ready?: boolean; model_version?: string; device?: string;
    missing_models?: string[]; checks?: Record<string, string>
  };
};
type UserRow = {
  id: string; full_name: string; email: string; role: string; is_active: boolean;
  created_at: string; scans_count: number;
};
type DatasetRow = {
  id: string; source_name: string; label_state: 'unreviewed' | 'in_review' | 'approved' | 'rejected';
  image_count: number; dataset_version?: string | null; created_at: string;
  license_reference?: string | null; notes?: string | null;
};
type ModelRow = {
  id: string; version: string; status: string; dataset_version?: string | null;
  created_at: string; validation_metrics?: Record<string, unknown>;
};
type FeedbackRow = { id: string; rating: number | null; category: string; message: string; status: string; created_at: string; full_name?: string | null; email?: string | null; scan_id?: string | null };
type TrainingJob = {
  id: string; dataset_version: string; status: string; created_at: string;
  requested_config?: { epochs?: number; imageSize?: number; notes?: string };
  result_summary?: Record<string, unknown> | null;
};
const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export default function AdminPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [storageKey, setStorageKey] = useState('');
  const [imageCount, setImageCount] = useState('1000');
  const [datasetVersion, setDatasetVersion] = useState('onion-dataset-v1');
  const [trainDataset, setTrainDataset] = useState('onion-dataset-v1');
  const [epochs, setEpochs] = useState('80');
  const [imageSize, setImageSize] = useState('640');
  const [modelVersion, setModelVersion] = useState('onion-quality-v1');
  const [modelDatasetVersion, setModelDatasetVersion] = useState('');
  const [detectorHash, setDetectorHash] = useState('');
  const [classifierHash, setClassifierHash] = useState('');
  const [validationMetrics, setValidationMetrics] = useState('{"holdout": true, "per_grade_recall": {}}');

  async function load() {
    setLoading(true); setError('');
    try {
      const [overview, userData, datasetData, modelData, feedbackData] = await Promise.all([
        apiFetch<Overview>('/admin/overview'),
        apiFetch<{ users: UserRow[] }>('/admin/users?limit=20'),
        apiFetch<{ assets: DatasetRow[] }>('/admin/datasets'),
        apiFetch<{ models: ModelRow[] }>('/admin/model-versions'),
        apiFetch<{ feedback: FeedbackRow[] }>('/admin/feedback')
      ]);
      setData(overview); setUsers(userData.users); setDatasets(datasetData.assets); setModels(modelData.models); setFeedbacks(feedbackData.feedback);
      const jobResult = await apiFetch<{ jobs: TrainingJob[] }>('/admin/retraining').catch(() => ({ jobs: [] as TrainingJob[] }));
      setJobs(jobResult.jobs);
      const firstApproved = datasetData.assets.find((d) => d.label_state === 'approved' && d.dataset_version)?.dataset_version;
      if (firstApproved) setTrainDataset(firstApproved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin data.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function toggle(user: UserRow) {
    setError(''); setNotice('');
    try {
      await apiFetch(`/admin/users/${user.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ isActive: !user.is_active })
      });
      setNotice(`Account ${user.is_active ? 'disabled' : 'enabled'}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update user.'); }
  }

  async function registerDataset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await apiFetch('/admin/datasets', { method: 'POST', body: JSON.stringify({
        sourceName, storageKey, imageCount: Number(imageCount), datasetVersion
      }) });
      setNotice('Dataset metadata registered. Review the labels before using it for model training.');
      setSourceName(''); setStorageKey(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not register dataset metadata.'); }
    finally { setSaving(false); }
  }

  async function reviewDataset(dataset: DatasetRow, labelState: 'in_review' | 'approved' | 'rejected') {
    setError(''); setNotice('');
    try {
      await apiFetch(`/admin/datasets/${dataset.id}/review`, { method: 'PATCH', body: JSON.stringify({ labelState }) });
      setNotice(`Dataset “${dataset.source_name}” marked ${labelState.replace('_', ' ')}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update dataset review state.'); }
  }

  async function startTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const result = await apiFetch<{ message: string; job: TrainingJob; pipelineConfigured: boolean }>('/admin/retraining', {
        method: 'POST', body: JSON.stringify({ datasetVersion: trainDataset, epochs: Number(epochs), imageSize: Number(imageSize) })
      });
      setNotice(result.message); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start retraining.'); }
    finally { setSaving(false); }
  }

  async function updateFeedback(item: FeedbackRow, status: 'reviewing' | 'resolved' | 'dismissed') {
    setError(''); setNotice('');
    try {
      await apiFetch(`/admin/feedback/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(`Feedback marked ${status}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update feedback.'); }
  }

  async function registerModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const metrics = JSON.parse(validationMetrics) as Record<string, unknown>;
      if (!metrics || Array.isArray(metrics) || typeof metrics !== 'object') throw new Error('Validation metrics must be a JSON object.');
      await apiFetch('/admin/model-versions', { method: 'POST', body: JSON.stringify({
        version: modelVersion, detectorHash, classifierHash, datasetVersion: modelDatasetVersion || undefined, validationMetrics: metrics
      }) });
      setNotice('Candidate model metadata registered. It remains inactive until the review and release workflow approves the exact artifacts.');
      setDetectorHash(''); setClassifierHash(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not register model metadata.'); }
    finally { setSaving(false); }
  }

  async function reviewModel(model: ModelRow, status: 'validated' | 'rejected') {
    setError(''); setNotice('');
    try {
      await apiFetch(`/admin/model-versions/${model.id}/review`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(`Model ${model.version} marked ${status}. This updates the review record only; it does not deploy or activate weights.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not review model candidate.'); }
  }

  return <div className="container page-shell">
    <div className="page-heading">
      <div><span className="eyebrow"><Settings2 size={14}/> Restricted access</span><h1>{t('adminTitle')}</h1><p>Review platform activity, dataset quality, model readiness and account status.</p></div>
      <button className="button button-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? t('loading') : t('retry')}</button>
    </div>
    {error && <div className="error-banner" role="alert">{error}{error.toLowerCase().includes('permission') || error.toLowerCase().includes('sign') ? <Link href="/login" style={{ fontWeight: 800, textDecoration: 'underline', marginLeft: 8 }}>Sign in with an admin account</Link> : null}</div>}
    {notice && <div className="success-banner" role="status">{notice}</div>}
    {loading && !data ? <div className="surface-card report-placeholder"><span className="spinner"/><p>{t('loading')}</p></div> : data && <>
      <div className="admin-grid">
        <article className="admin-status"><h3>{t('users')}</h3><strong>{data.users.total}</strong><div className="metric-foot">{data.users.active} active accounts</div></article>
        <article className="admin-status"><h3>Total scans</h3><strong>{data.scans.total}</strong><div className="metric-foot">{data.scans.onions} onions analyzed</div></article>
        <article className="admin-status"><h3>{t('openFeedback')}</h3><strong>{data.feedback.open}</strong><div className="metric-foot">Needs review</div></article>
        <article className="admin-status"><h3>{t('modelStatus')}</h3><strong style={{ fontSize: 17 }}>{data.modelHealth.model_ready ? 'Ready' : 'Not ready'}</strong><div className="model-health"><span className={`health-dot ${data.modelHealth.model_ready ? '' : 'bad'}`}/>{data.modelHealth.model_version || data.modelHealth.status || 'Unknown'}</div>{data.modelHealth.missing_models?.length ? <div className="help-small" style={{ marginTop: 9 }}>Missing: {data.modelHealth.missing_models.join(', ')}</div> : null}</article>
      </div>

      <div className="dashboard-columns">
        <section className="surface-card dashboard-panel"><div className="panel-heading"><div><h2><Activity size={17} style={{ display: 'inline', marginRight: 7, verticalAlign: 'middle' }}/>Processing health</h2><p>Scan status counts</p></div></div>
          {[{ label: 'Completed', value: data.scans.completed, color: '#6d9650' }, { label: 'Queued / processing', value: data.scans.pending, color: '#d5a23e' }, { label: 'Failed', value: data.scans.failed, color: '#bf5b48' }].map((x) => { const pct = data.scans.total ? x.value * 100 / data.scans.total : 0; return <div key={x.label} style={{ marginBottom: 17 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 7 }}><span>{x.label}</span><strong>{x.value}</strong></div><div className="dist-track"><div className="dist-fill" style={{ width: `${pct}%`, background: x.color }}/></div></div>; })}
          <div className="help-small">Uptime and latency SLOs must be wired to a deployed metrics backend. This page shows application-level status only.</div>
        </section>
        <section className="surface-card dashboard-panel"><div className="panel-heading"><div><h2><Cpu size={17} style={{ display: 'inline', marginRight: 7, verticalAlign: 'middle' }}/>Model and infrastructure</h2><p>Readiness checks, not model accuracy</p></div></div>
          <div className="admin-status" style={{ padding: 16, boxShadow: 'none' }}><h3>AI service</h3><strong style={{ fontSize: 18 }}>{data.modelHealth.status || 'Unknown'}</strong><div className="metric-foot">Device: {data.modelHealth.device || 'unknown'}</div>{data.modelHealth.missing_models?.length ? <div className="error-banner">Install trained weights: {data.modelHealth.missing_models.join(', ')}</div> : null}</div>
          <div className="admin-status" style={{ marginTop: 12, padding: 16, boxShadow: 'none' }}><h3><Database size={14} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }}/>Database and job queue</h3><p className="help-small">Check the API readiness endpoint for PostgreSQL and Redis state. Queue depth and worker latency should be exported to Prometheus in production.</p></div>
        </section>
      </div>

      <section className="surface-card dashboard-panel" style={{ marginTop: 20 }}><div className="panel-heading"><div><h2><UsersRound size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }}/>User management</h2><p>Disable compromised or inactive accounts. Public signup can only create farmer accounts.</p></div></div>
        <div style={{ overflowX: 'auto' }}><table className="scan-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Scans</th><th>Created</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.scans_count}</td><td>{dateLabel(u.created_at)}</td><td><span className={`table-status ${u.is_active ? 'completed' : 'failed'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td><td><button disabled={u.role === 'admin' && u.is_active} className="button button-secondary button-small" onClick={() => void toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</button></td></tr>)}</tbody></table>{!users.length && <div className="empty-state"><UsersRound size={25}/><p>No users found.</p></div>}</div>
      </section>

      <section className="surface-card dashboard-panel" style={{ marginTop: 20 }}>
        <div className="panel-heading"><div><h2><Database size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }}/>Dataset registry</h2><p>Register dataset metadata already stored in the configured dataset repository. This form does not upload image files.</p></div></div>
        <form onSubmit={registerDataset} className="admin-form-grid">
          <label className="form-field"><span>Dataset source name</span><input required minLength={2} maxLength={255} value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. Kharif onion field set"/></label>
          <label className="form-field"><span>Relative storage key</span><input required minLength={1} maxLength={500} value={storageKey} onChange={(e) => setStorageKey(e.target.value)} placeholder="datasets/onion-2026-v1/"/><small className="form-helper">Must be a relative key, not a filesystem absolute path.</small></label>
          <label className="form-field"><span>Image count</span><input type="number" required min="1" max="1000000" value={imageCount} onChange={(e) => setImageCount(e.target.value)}/></label>
          <label className="form-field"><span>Dataset version</span><input required maxLength={80} value={datasetVersion} onChange={(e) => setDatasetVersion(e.target.value)}/></label>
          <div><button className="button button-primary" type="submit" disabled={saving || !sourceName.trim() || !storageKey.trim()}>{saving ? 'Saving…' : 'Register dataset metadata'}</button></div>
        </form>
        <div style={{ overflowX: 'auto', marginTop: 24 }}><table className="scan-table"><thead><tr><th>Dataset</th><th>Version</th><th>Images</th><th>Label state</th><th>Registered</th><th>Review</th></tr></thead><tbody>{datasets.map((d) => <tr key={d.id}><td>{d.source_name}</td><td>{d.dataset_version || '—'}</td><td>{d.image_count.toLocaleString()}</td><td><span className={`table-status ${d.label_state === 'rejected' ? 'failed' : d.label_state === 'approved' ? 'completed' : 'queued'}`}>{d.label_state.replace('_', ' ')}</span></td><td>{dateLabel(d.created_at)}</td><td><div className="admin-actions"><button className="button button-secondary button-small" onClick={() => void reviewDataset(d, 'in_review')} disabled={d.label_state === 'in_review'}>Review</button><button className="button button-secondary button-small" onClick={() => void reviewDataset(d, 'approved')} disabled={d.label_state === 'approved'}><CheckCircle2 size={13}/>Approve</button><button className="button button-secondary button-small" onClick={() => void reviewDataset(d, 'rejected')} disabled={d.label_state === 'rejected'}><XCircle size={13}/>Reject</button></div></td></tr>)}</tbody></table>{!datasets.length && <div className="empty-state"><Database size={25}/><p>No dataset metadata registered yet.</p></div>}</div>
      </section>

      <section className="surface-card dashboard-panel" style={{ marginTop: 20 }}><div className="panel-heading"><div><h2><ClipboardList size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }}/>Feedback review</h2><p>Review farmer feedback and close the loop on report accuracy or usability issues.</p></div></div><div style={{ overflowX: 'auto' }}><table className="scan-table"><thead><tr><th>Farmer</th><th>Category</th><th>Feedback</th><th>Rating</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{feedbacks.map((f) => <tr key={f.id}><td>{f.full_name || 'Former user'}<div className="help-small">{f.email || ''}</div></td><td>{f.category}</td><td style={{ maxWidth: 340, whiteSpace: 'normal' }}>{f.message}</td><td>{f.rating ? `${f.rating}/5` : '—'}</td><td><span className={`table-status ${f.status === 'resolved' ? 'completed' : f.status === 'dismissed' ? 'failed' : 'queued'}`}>{f.status}</span></td><td>{dateLabel(f.created_at)}</td><td><div className="admin-actions"><button className="button button-secondary button-small" onClick={() => void updateFeedback(f, 'reviewing')} disabled={f.status === 'reviewing'}>Reviewing</button><button className="button button-secondary button-small" onClick={() => void updateFeedback(f, 'resolved')} disabled={f.status === 'resolved'}>Resolve</button><button className="button button-secondary button-small" onClick={() => void updateFeedback(f, 'dismissed')} disabled={f.status === 'dismissed'}>Dismiss</button></div></td></tr>)}</tbody></table>{!feedbacks.length && <div className="empty-state"><ClipboardList size={25}/><p>No feedback has been submitted.</p></div>}</div></section>

      <section className="surface-card dashboard-panel" style={{ marginTop: 20 }}>
        <div className="panel-heading"><div><h2><FlaskConical size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }}/>Controlled model retraining</h2><p>Only approved dataset versions should enter training. Candidate weights require independent evaluation and review before release.</p></div></div>
        <form onSubmit={startTraining} className="admin-form-grid">
          <label className="form-field"><span>Approved dataset version</span><select required value={trainDataset} onChange={(e) => setTrainDataset(e.target.value)}><option value="">Choose a dataset version</option>{Array.from(new Set(datasets.filter((d) => d.label_state === 'approved' && d.dataset_version).map((d) => d.dataset_version as string))).map((v) => <option key={v} value={v}>{v}</option>)}</select><small className="form-helper">Training API receives the version identifier; dataset retrieval is configured in the CI runner.</small></label>
          <label className="form-field"><span>Epochs</span><input type="number" min="1" max="300" value={epochs} onChange={(e) => setEpochs(e.target.value)}/></label>
          <label className="form-field"><span>Image size</span><select value={imageSize} onChange={(e) => setImageSize(e.target.value)}>{[224,320,416,512,640,768].map((size) => <option key={size} value={size}>{size} px</option>)}</select></label>
          <div><button className="button button-primary" type="submit" disabled={saving || !trainDataset || !datasets.some((d) => d.label_state === 'approved' && d.dataset_version === trainDataset)}><FlaskConical size={15}/>{saving ? 'Submitting…' : 'Request retraining'}</button></div>
        </form>
        <div style={{ overflowX: 'auto', marginTop: 24 }}><table className="scan-table"><thead><tr><th>Job</th><th>Dataset</th><th>Config</th><th>Status</th><th>Created</th></tr></thead><tbody>{jobs.map((j) => <tr key={j.id}><td><code>{j.id.slice(0, 8)}</code></td><td>{j.dataset_version}</td><td>{j.requested_config?.epochs ?? '—'} epochs / {j.requested_config?.imageSize ?? '—'} px</td><td><span className={`table-status ${['failed','rejected'].includes(j.status) ? 'failed' : ['completed','candidate','succeeded','validated'].includes(j.status) ? 'completed' : 'queued'}`}>{j.status}</span></td><td>{dateLabel(j.created_at)}</td></tr>)}</tbody></table>{!jobs.length && <div className="empty-state"><ClipboardList size={25}/><p>No retraining jobs recorded. GitHub workflow dispatch credentials are optional for local development.</p></div>}</div>
        <div className="help-small" style={{ marginTop: 12 }}>Requesting a job does not approve or deploy a model. GitHub Actions needs repository access, a self-hosted GPU runner, dataset access, and the callback token configured separately.</div>
      </section>

      <section className="surface-card dashboard-panel" style={{ marginTop: 20 }}><div className="panel-heading"><div><h2><ScanLine size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }}/>Model registry</h2><p>Register the exact artifact hashes and holdout metrics before review. This does not upload or activate model files.</p></div></div><form onSubmit={registerModel} className="admin-form-grid"><label className="form-field"><span>Model version</span><input required maxLength={80} value={modelVersion} onChange={(e) => setModelVersion(e.target.value)}/></label><label className="form-field"><span>Dataset version</span><input maxLength={80} value={modelDatasetVersion} onChange={(e) => setModelDatasetVersion(e.target.value)} placeholder="Approved dataset version"/></label><label className="form-field"><span>Detector SHA-256 hash</span><input required minLength={32} maxLength={128} pattern="[a-fA-F0-9]{32,128}" value={detectorHash} onChange={(e) => setDetectorHash(e.target.value)} placeholder="64-character SHA-256"/></label><label className="form-field"><span>Classifier SHA-256 hash</span><input required minLength={32} maxLength={128} pattern="[a-fA-F0-9]{32,128}" value={classifierHash} onChange={(e) => setClassifierHash(e.target.value)} placeholder="64-character SHA-256"/></label><label className="form-field" style={{ gridColumn: '1 / -1' }}><span>Validation metrics JSON</span><textarea required rows={4} value={validationMetrics} onChange={(e) => setValidationMetrics(e.target.value)} style={{ width: '100%', border: '1px solid #dce5d5', borderRadius: 12, padding: 13, fontFamily: 'monospace', fontSize: 12 }}/><small className="form-helper">Include holdout source, per-grade precision/recall, confusion-matrix reference, calibration, subgroup results and reviewed-by metadata where available.</small></label><div><button className="button button-primary" type="submit" disabled={saving || detectorHash.length < 32 || classifierHash.length < 32}>Register candidate metadata</button></div></form><div style={{ overflowX: 'auto', marginTop: 24 }}><table className="scan-table"><thead><tr><th>Version</th><th>Dataset</th><th>Status</th><th>Registered</th><th>Validation metadata</th><th>Review</th></tr></thead><tbody>{models.map((m) => <tr key={m.id}><td>{m.version}</td><td>{m.dataset_version || '—'}</td><td><span className={`table-status ${m.status === 'validated' ? 'completed' : m.status === 'rejected' ? 'failed' : 'queued'}`}>{m.status}</span></td><td>{dateLabel(m.created_at)}</td><td><code style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(m.validation_metrics || {})}</code></td><td><div className="admin-actions"><button className="button button-secondary button-small" onClick={() => void reviewModel(m, 'validated')} disabled={m.status !== 'candidate'}>Validate</button><button className="button button-secondary button-small" onClick={() => void reviewModel(m, 'rejected')} disabled={m.status !== 'candidate'}>Reject</button></div></td></tr>)}</tbody></table>{!models.length && <div className="empty-state"><Cpu size={25}/><p>No model versions registered yet. Register a candidate only after hashing the exact weight files and recording holdout validation metrics.</p></div>}</div></section>

      <p className="report-disclaimer"><ShieldAlert size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }}/>Model version visibility does not mean model accuracy is certified. Dataset labels and model artifacts must be independently reviewed before production grading.</p>
    </>}
  </div>;
}
