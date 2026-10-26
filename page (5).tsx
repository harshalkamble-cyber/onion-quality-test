'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, Leaf, ShieldCheck, ScanLine, Globe2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/components/language-provider';
type AuthResponse = { user:{ id:string; fullName:string; role:string; language:string }; csrfToken:string };
export default function LoginPage() {
  const { t, language } = useLanguage(); const router = useRouter();
  const [mode,setMode] = useState<'login'|'register'>('login'); const [fullName,setFullName] = useState(''); const [email,setEmail] = useState(''); const [password,setPassword] = useState(''); const [phone,setPhone] = useState(''); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  async function submit(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = mode==='login' ? { email,password } : { fullName,email,password,phone:phone||undefined,language };
      await apiFetch<AuthResponse>(`/auth/${mode==='login'?'login':'register'}`,{method:'POST',body:JSON.stringify(payload)},false);
      router.push('/dashboard'); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to complete sign-in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="container login-shell"><section className="login-intro"><span className="eyebrow"><Leaf size={14}/> Farmer-first quality tools</span><h1>Clear quality information starts with one good photo.</h1><p>Keep every scan in one place, review the visible indicators, and export reports when you need them. Your account is private to you.</p><div className="login-bullet"><ShieldCheck size={19}/> Your scan history is tied to your account.</div><div className="login-bullet"><ScanLine size={19}/> Scan one image or upload a batch.</div><div className="login-bullet"><Globe2 size={19}/> मराठी · हिन्दी · English</div></section>
    <section className="login-card"><h2>{mode==='login'?t('loginTitle'):t('registerTitle')}</h2><p>{mode==='login'?'Sign in to open your saved reports and scan history.':'Create a private farmer account to save scans and reports.'}</p>
      <form onSubmit={submit}>
        {mode==='register'&&<div className="form-field"><label htmlFor="fullName">{t('fullName')}</label><input id="fullName" autoComplete="name" required minLength={2} maxLength={120} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your full name"/></div>}
        <div className="form-field"><label htmlFor="email">{t('email')}</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div>
        {mode==='register'&&<div className="form-field"><label htmlFor="phone">Phone number <span className="form-helper">(optional)</span></label><input id="phone" type="tel" autoComplete="tel" maxLength={20} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91…"/></div>}
        <div className="form-field"><label htmlFor="password">{t('password')}</label><input id="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='register'?10:1} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••"/></div>
        {error&&<div className="error-banner" role="alert">{error}</div>}
        <button className="button button-primary" style={{width:'100%',marginTop:5}} disabled={busy} type="submit"><LockKeyhole size={17}/>{busy?'Please wait…':mode==='login'?t('signIn'):t('createAccount')}</button>
      </form>
      <div className="form-switch">{mode==='login'?t('newHere'):t('alreadyHave')} <button onClick={()=>{setMode(mode==='login'?'register':'login');setError('')}} type="button">{mode==='login'?t('createAccount'):t('signIn')}</button></div>
      <p className="form-helper" style={{marginTop:20}}>Use a unique password. Administrators must be provisioned separately by the deployment operator.</p>
    </section></div>;
}
