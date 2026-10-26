'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Language, translations } from '@/lib/i18n';
const Context = createContext<{ language:Language; setLanguage:(value:Language)=>void; t:(key:string)=>string }>({ language:'mr', setLanguage:()=>undefined, t:(key)=>key });
export function LanguageProvider({ children }: { children:React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('mr');
  useEffect(() => { const stored = localStorage.getItem('oqrs-language') as Language | null; if (stored && ['en','hi','mr'].includes(stored)) setLanguageState(stored); }, []);
  const setLanguage = useCallback((value:Language) => { setLanguageState(value); localStorage.setItem('oqrs-language',value); }, []);
  const t = useCallback((key:string) => translations[language][key] ?? translations.en[key] ?? key, [language]);
  return <Context.Provider value={{language,setLanguage,t}}>{children}</Context.Provider>;
}
export function useLanguage() { return useContext(Context); }
