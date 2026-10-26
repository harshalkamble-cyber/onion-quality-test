'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Leaf, Menu, X, UserRound, LayoutDashboard, ScanLine, LogOut, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from './language-provider';
import { LanguageSelect } from './language-select';
type User = { fullName:string; role:string };
export function SiteHeader() {
  const { t } = useLanguage(); const pathname = usePathname(); const router = useRouter();
  const [user,setUser] = useState<User|null>(null); const [menuOpen,setMenuOpen] = useState(false);
  useEffect(() => { let live=true; apiFetch<{user:User}>('/auth/me').then(r=>{if(live)setUser(r.user)}).catch(()=>{if(live)setUser(null)}); return ()=>{live=false}; }, [pathname]);
  async function signOut() { try { await apiFetch('/auth/logout',{method:'POST'}); } catch {} setUser(null); setMenuOpen(false); router.push('/'); router.refresh(); }
  const links = [{href:'/',label:t('home'),icon:Leaf},{href:'/scan',label:t('scan'),icon:ScanLine},{href:'/dashboard',label:t('dashboard'),icon:LayoutDashboard}];
  return <header className="site-header"><div className="container header-inner">
    <Link href="/" className="brand" aria-label="Onion Quality home"><span className="brand-mark"><Leaf size={23}/></span><span className="brand-name">Onion<span>Grade</span><small>FARMER QUALITY ASSIST</small></span></Link>
    <button className="mobile-menu-button" aria-label={menuOpen?'Close menu':'Open menu'} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X/>:<Menu/>}</button>
    <nav className={menuOpen?'main-nav is-open':'main-nav'} aria-label="Main navigation">
      {links.map(({href,label,icon:Icon})=><Link key={href} href={href} className={pathname===href?'nav-link active':'nav-link'} onClick={()=>setMenuOpen(false)}><Icon size={17}/>{label}</Link>)}
      {user?.role==='admin'&&<Link href="/admin" className="nav-link"><ShieldCheck size={17}/>{t('admin')}</Link>}
      <LanguageSelect/>
      {user?<button className="nav-account" onClick={signOut} title={t('signOut')}><span className="user-dot"><UserRound size={15}/></span><span>{user.fullName.split(' ')[0]}</span><LogOut size={15}/></button>:<Link href="/login" className="button button-primary button-small">{t('signIn')}</Link>}
    </nav>
  </div></header>;
}
