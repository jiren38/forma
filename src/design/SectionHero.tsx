/**
 * Intestazione illustrata delle pagine principali di ogni sezione:
 * percorso, titolo, descrizione e azioni su un pannello con l'identità visiva della sezione.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ArtPanel } from './Art';
import { SECTIONS, type SectionKey } from './sections';
import type { ArtSpec, VisualKey } from './visuals';

export function SectionHero({ section, title, desc, actions, right, back, visual, spec, children, compact }: {
  section: SectionKey; title?: ReactNode; desc?: ReactNode; actions?: ReactNode; right?: ReactNode; back?: boolean | string;
  visual?: VisualKey; spec?: ArtSpec; children?: ReactNode; compact?: boolean;
}) {
  const s = SECTIONS[section];
  const nav = useNavigate();
  return (
    <header className={`sec-hero ${compact ? 'compact' : ''}`} style={{ ['--sc' as string]: s.color } as CSSProperties}>
      <ArtPanel visual={visual ?? (section as VisualKey)} spec={spec} className="sec-hero-art" animate={section === 'cardio'} />
      <div className="sec-hero-top">
        {back && (
          <button className="icon-btn glass-ic" aria-label="Indietro" onClick={() => (typeof back === 'string' ? nav(back) : window.history.length > 1 ? nav(-1) : nav('/explore'))}><ArrowLeft size={20} /></button>
        )}
        <nav className="sec-crumbs" aria-label="Percorso"><Link to="/explore">Esplora</Link><span>›</span><b><i className="sec-dot" />{s.label}</b></nav>
        {right && <div className="ph-actions">{right}</div>}
      </div>
      <div className="sec-hero-body">
        <span className="sec-hero-ic"><s.icon size={20} /></span>
        <h1>{title ?? s.label}</h1>
        <p>{desc ?? s.tagline}</p>
        {actions && <div className="sec-hero-actions">{actions}</div>}
        {children}
      </div>
    </header>
  );
}
