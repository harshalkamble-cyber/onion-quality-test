'use client';
import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck, Camera, Mic2, Sprout, ChartNoAxesCombined, ScanLine, CircleHelp, Clock3, BadgeCheck, Handshake, Eye, Leaf } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';

export default function HomePage() {
  const { t } = useLanguage();
  return <>
    <section className="hero"><div className="container hero-grid">
      <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-dot"/> {t('heroEyebrow')}</span>
        <h1>{t('heroTitle').split('\n')[0]}<br/><em>{t('heroTitle').split('\n')[1]}</em></h1>
        <p>{t('heroBody')}</p>
        <div className="hero-actions"><Link className="button button-primary" href="/scan"><ScanLine size={18}/>{t('scanNow')}<ArrowRight size={17}/></Link><a className="button button-secondary" href="#how-it-works">{t('howItWorks')}</a></div>
        <div className="trust-row"><span><Check size={15}/> No price predictions</span><span><Check size={15}/> English · हिन्दी · मराठी</span><span><Check size={15}/> Bulk image support</span></div>
      </div>
      <div className="hero-visual" aria-label="Illustration of an onion and example quality rating">
        <div className="hero-orbit"><div className="onion-art"><div className="onion-stem"/><div className="onion-body"/><div className="onion-root"/></div></div>
        <div className="floating-card float-top"><span className="float-icon"><ScanLine size={21}/></span><span><strong>Visual scan</strong><small>One lot at a time</small></span></div>
        <div className="floating-card float-bottom"><span className="float-icon"><ShieldCheck size={21}/></span><span><strong>Quality evidence</strong><small>Rating with reasons</small></span></div>
        <div className="demo-grade"><div className="quality-stars">★★★★★</div><strong>5 / 5 stars</strong><small>Illustrative example only</small></div>
      </div>
    </div></section>

    <section className="stats-strip"><div className="container stats-grid">
      <div className="stat-note"><ShieldCheck size={22}/><div><strong>Quality, not price</strong><small>Independent visual rating</small></div></div>
      <div className="stat-note"><Mic2 size={22}/><div><strong>Voice-friendly</strong><small>Read findings aloud</small></div></div>
      <div className="stat-note"><Camera size={22}/><div><strong>Single or bulk</strong><small>Phone camera or upload</small></div></div>
    </div></section>

    <section className="section"><div className="container"><div className="section-heading"><span className="eyebrow">{t('benefitTitle')}</span><h2>More clarity between the field and the market.</h2><p>Useful information should not require a technical background. OnionGrade keeps the flow simple and explains what the camera can actually see.</p></div>
      <div className="benefit-grid">
        <article className="feature-card"><div className="feature-icon"><Eye size={25}/></div><h3>{t('benefitOne')}</h3><p>{t('benefitOneBody')} Quality findings use simple labels and clear visual cues, not a wall of technical numbers.</p></article>
        <article className="feature-card"><div className="feature-icon"><BadgeCheck size={25}/></div><h3>{t('benefitTwo')}</h3><p>{t('benefitTwoBody')} Every result includes the model grade, confidence and visible image indicators.</p></article>
        <article className="feature-card"><div className="feature-icon"><ChartNoAxesCombined size={25}/></div><h3>{t('benefitThree')}</h3><p>{t('benefitThreeBody')} Your scan history stays with your account and can be downloaded as a spreadsheet.</p></article>
      </div>
    </div></section>

    <section className="section" id="how-it-works" style={{paddingTop:0}}><div className="container"><div className="section-heading"><span className="eyebrow">Three simple steps</span><h2>{t('howItWorks')}</h2><p>From a phone photo to a quality summary, without needing to understand machine learning.</p></div>
      <div className="steps-grid"><article className="step-card"><div className="step-number">01</div><h3>{t('stepOne')}</h3><p>{t('stepOneBody')}</p></article><article className="step-card"><div className="step-number">02</div><h3>{t('stepTwo')}</h3><p>{t('stepTwoBody')}</p></article><article className="step-card"><div className="step-number">03</div><h3>{t('stepThree')}</h3><p>{t('stepThreeBody')}</p></article></div>
    </div></section>

    <section className="section stories-section"><div className="container"><div className="section-heading"><span className="eyebrow"><Sprout size={14}/> Designed around farmer workflows</span><h2>Better records. Clearer conversations.</h2><p>These are example use cases, not customer testimonials. Field results should be added only after a verified pilot.</p></div>
      <div className="story-grid"><article className="story-card"><span className="story-tag">Example · Before sale</span><h3>Compare two lots</h3><p>A farmer scans separate lots, checks the grade distribution and keeps each report for the market-day discussion.</p></article><article className="story-card"><span className="story-tag">Example · Bulk sorting</span><h3>Spot the weaker section</h3><p>A cooperative scans a representative set of images to understand visible quality variation before manual sorting.</p></article><article className="story-card"><span className="story-tag">Example · Record keeping</span><h3>Track quality over time</h3><p>A grower stores scan reports from different harvest dates and compares their visual quality indicators.</p></article></div>
    </div></section>

    <section className="section"><div className="container"><div className="section-heading"><span className="eyebrow"><CircleHelp size={14}/> Help and clarity</span><h2>{t('faqTitle')}</h2></div>
      <div className="faq-grid"><article className="faq-card"><h3><CircleHelp size={18}/>{t('faqOne')}</h3><p>{t('faqOneAnswer')}</p></article><article className="faq-card"><h3><CircleHelp size={18}/>{t('faqTwo')}</h3><p>{t('faqTwoAnswer')}</p></article><article className="faq-card"><h3><CircleHelp size={18}/>{t('faqThree')}</h3><p>{t('faqThreeAnswer')}</p></article><article className="faq-card"><h3><Handshake size={18}/>How can I get help?</h3><p>Ask your cooperative or project support team to review your capture technique and model output. Contact details can be configured for your deployment.</p></article></div>
    </div></section>

    <section className="section" style={{paddingTop:0}}><div className="container"><div className="cta-banner"><div><h2>Make quality easier to explain.</h2><p>Start with a clear photo. Review every result before acting on it.</p></div><Link href="/scan" className="button">{t('scanNow')}<ArrowRight size={17}/></Link></div></div></section>
  </>;
}
