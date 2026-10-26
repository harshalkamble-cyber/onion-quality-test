'use client';
import { useLanguage } from './language-provider';
export function LanguageSelect() {
  const { language, setLanguage } = useLanguage();
  return <label className="language-select" aria-label="Select language"><span className="sr-only">Language</span><select value={language} onChange={e=>setLanguage(e.target.value as 'en'|'hi'|'mr')}><option value="mr">मराठी</option><option value="hi">हिन्दी</option><option value="en">English</option></select></label>;
}
