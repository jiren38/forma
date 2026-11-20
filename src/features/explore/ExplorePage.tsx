/**
 * Esplora: tutte le sezioni di Forma come grandi elementi visivi, più un indice di tutte le funzioni
 * e una ricerca che porta direttamente alla funzione o all'esercizio cercato.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Search } from 'lucide-react';
import { PageHeader, SearchInput } from '@/components/ui';
import { ArtPanel } from '@/design/Art';
import { EXPLORE_ORDER, SECTIONS, type SectionKey } from '@/design/sections';
import type { VisualKey } from '@/design/visuals';
import { EXERCISES } from '@/data/exercises';
import { searchExercises } from '@/features/exercises/components';
import { normalize } from '@/lib/util';
import { useSessions } from '@/app/data';

const LAYOUT: Record<string, string> = {
  training: 'xp-hero', exercises: 'xp-tall', cardio: 'xp-tall', nutrition: 'xp-wide', progress: 'xp-tall', wellness: 'xp-tall', coach: 'xp-wide',
};

export default function ExplorePage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const live = useSessions().some((s) => s.status === 'active');
  const linksOf = (k: SectionKey) => SECTIONS[k].links.filter((l) => l.to !== '/workout/live' || live);

  const results = useMemo(() => {
    const n = normalize(q.trim());
    if (!n) return null;
    const feats = EXPLORE_ORDER.flatMap((k) => [{ label: SECTIONS[k].label, to: SECTIONS[k].to, k }, ...linksOf(k).map((l) => ({ ...l, k }))])
      .filter((f) => normalize(`${f.label} ${SECTIONS[f.k].label} ${SECTIONS[f.k].tagline}`).includes(n));
    const ex = searchExercises(EXERCISES, q).slice(0, 6);
    return { feats: feats.filter((f, i, a) => a.findIndex((x) => x.to === f.to && x.label === f.label) === i).slice(0, 8), ex };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, live]);

  return (
    <div className="page stack">
      <PageHeader title="Esplora" sub="Tutto Forma in un colpo d’occhio: scegli una sezione o cerca una funzione." />
      <SearchInput value={q} onChange={setQ} placeholder="Cerca una funzione o un esercizio…" />

      {results ? (
        <div className="stack-sm">
          {results.feats.length > 0 && (
            <div className="settings-group">
              {results.feats.map((f) => (
                <Link key={f.k + f.to + f.label} to={f.to} className="list-item" style={{ ['--sc' as string]: SECTIONS[f.k].color } as CSSProperties}>
                  <span className="li-icon sec-ic">{(() => { const I = SECTIONS[f.k].icon; return <I size={18} />; })()}</span>
                  <span className="grow"><div className="li-title">{f.label}</div><div className="li-sub">{SECTIONS[f.k].label}</div></span>
                  <ChevronRight size={18} className="muted" />
                </Link>
              ))}
            </div>
          )}
          {results.ex.length > 0 && (
            <>
              <div className="section-title">Esercizi <Link to={`/exercises?q=${encodeURIComponent(q)}`}>Vedi tutti <ChevronRight size={15} /></Link></div>
              <div className="settings-group">
                {results.ex.map((e) => (
                  <Link key={e.id} to={`/exercises/${e.id}`} className="list-item"><span className="li-icon"><Search size={17} /></span><span className="grow"><div className="li-title">{e.name}</div><div className="li-sub">{e.nameEn}</div></span><ChevronRight size={18} className="muted" /></Link>
                ))}
              </div>
            </>
          )}
          {!results.feats.length && !results.ex.length && <p className="muted center" style={{ padding: 24 }}>Nessun risultato per “{q}”.</p>}
        </div>
      ) : (
        <>
          <div className="xp-grid">
            {EXPLORE_ORDER.map((k, i) => {
              const s = SECTIONS[k];
              const links = linksOf(k);
              const layout = LAYOUT[k];
              return (
                <div key={k} className={`xp-card ${layout}`} style={{ ['--sc' as string]: s.color, animationDelay: `${i * 0.05}s` } as CSSProperties}
                  role="link" tabIndex={0} aria-label={`${s.label}: ${s.tagline}`}
                  onClick={() => nav(s.to)} onKeyDown={(e) => { if (e.key === 'Enter') nav(s.to); }}>
                  <ArtPanel visual={k as VisualKey} animate={k === 'training' || k === 'cardio'} className="xp-art" />
                  <div className="xp-body">
                    <span className="xp-ic"><s.icon size={18} /></span>
                    <div className="xp-text">
                      <h2>{s.label}</h2>
                      <p>{s.tagline}</p>
                    </div>
                    {layout !== 'xp-tall' && (
                      <div className="xp-links" onClick={(e) => e.stopPropagation()}>
                        {links.slice(0, layout === 'xp-hero' ? 5 : 4).map((l) => <Link key={l.label} to={l.to} className="xp-link">{l.label}</Link>)}
                      </div>
                    )}
                    <span className="xp-go" aria-hidden><ArrowUpRight size={18} /></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="section-title">Tutte le funzioni</div>
          <div className="xp-index">
            {EXPLORE_ORDER.map((k) => {
              const s = SECTIONS[k];
              return (
                <section key={k} className="xp-group" style={{ ['--sc' as string]: s.color } as CSSProperties} aria-label={s.label}>
                  <Link to={s.to} className="xp-group-h"><span className="sec-dot" />{s.label}<ChevronRight size={15} /></Link>
                  <div className="xp-group-l">
                    {linksOf(k).map((l) => <Link key={l.label} to={l.to}>{l.label}</Link>)}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
