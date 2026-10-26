import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LanguageProvider } from '@/components/language-provider';
import { SiteHeader } from '@/components/site-header';
import { PwaRegistration } from '@/components/pwa-registration';

export const metadata: Metadata = {
  title: { default:'OnionGrade | Onion Quality Rating for Farmers', template:'%s | OnionGrade' },
  description:'AI-assisted visual onion quality rating for farmers. Scan a lot, review the quality grade, and export your records. No price predictions.',
  manifest:'/manifest.json',
  appleWebApp:{ capable:true, statusBarStyle:'default', title:'OnionGrade' },
  robots:{ index:true, follow:true }
};
export const viewport: Viewport = { themeColor:'#f7f8f0', width:'device-width', initialScale:1, maximumScale:5 };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="mr"><body><LanguageProvider><PwaRegistration/><SiteHeader/><main>{children}</main><footer className="site-footer"><div className="container footer-inner"><div className="brand footer-brand"><span className="brand-mark"><span>✳</span></span><span className="brand-name">Onion<span>Grade</span><small>QUALITY FIRST</small></span></div><p>Clear visual quality information for farmers. No price prediction, no hidden promises.</p><div className="footer-links"><a href="/">Home</a><a href="/scan">Scan</a><a href="/login">Account</a></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} OnionGrade</span><span>AI-assisted assessment · Human review still matters</span></div></footer></LanguageProvider></body></html>;
}
