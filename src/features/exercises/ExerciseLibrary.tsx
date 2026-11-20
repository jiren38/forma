import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SectionHero } from '@/design/SectionHero';
import { ArtPanel } from '@/design/Art';
import { CATEGORY_TINT, CATEGORY_VISUAL, FEATURED_CATEGORIES } from '@/design/visuals';
import { Heart, SlidersHorizontal, Clock, X, Library, ChevronRight, Dumbbell } from 'lucide-react';
import { CATEGORY_LABEL, CATEGORY_ORDER, EXERCISES, KIND_LABEL, MOVEMENT_LABEL, getExercise, inCategory, isAvailable, type ExCategory, type ExKind, type Movement, type Exercise } from '@/data/exercises';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '@/lib/labels';
import { useMeta, useProfile, toggleFavorite } from '@/app/data';
import { availableEquipment } from '@/lib/generator';
import { PageHeader, SearchInput, Sheet, Empty, Chips } from '@/components/ui';
import { ExerciseCard, searchExercises } from './components';
import type { Equipment, MuscleGroup } from '@/lib/types';

interface Filters { primary: MuscleGroup[]; secondary: MuscleGroup[]; equipment: Equipment[]; difficulty: number[]; movement: Movement[]; kind: ExKind[]; onlyAvailable: boolean }
const EMPTY: Filters = { primary: [], secondary: [], equipment: [], difficulty: [], movement: [], kind: [], onlyAvailable: false };
const MUSCLES = Array.from(new Set(EXERCISES.flatMap((e) => e.primary))).filter((m) => m !== 'cardio' && m !== 'full_body') as MuscleGroup[];
const SEC_MUSCLES = Array.from(new Set(EXERCISES.flatMap((e) => e.secondary))) as MuscleGroup[];
const EQUIPS = Array.from(new Set(EXERCISES.flatMap((e) => e.equipment))) as Equipment[];
const DIFF = ['', 'Facile', 'Intermedio', 'Avanzato'];

export default function ExerciseLibrary() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const meta = useMeta();
  const profile = useProfile();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const cat = (sp.get('cat') ?? 'all') as ExCategory | 'all' | 'fav' | 'recent';
  const setCat = (c: string) => { const n = new URLSearchParams(sp); if (c === 'all') { n.delete('cat'); n.set('view', 'all'); } else { n.set('cat', c); n.delete('view'); } setSp(n); };
  const [f, setF] = useState<Filters>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(40);
  const eq = useMemo(() => (profile ? availableEquipment(profile) : new Set<Equipment>()), [profile]);

  const list = useMemo(() => {
    let l = EXERCISES;
    if (cat === 'fav') l = meta.favorites.map(getExercise).filter((e): e is NonNullable<typeof e> => !!e);
    else if (cat === 'recent') l = meta.recent.map(getExercise).filter((e): e is NonNullable<typeof e> => !!e);
    else if (cat !== 'all') l = l.filter((e) => inCategory(e, cat));
    if (f.primary.length) l = l.filter((e) => e.primary.some((m) => f.primary.includes(m)));
    if (f.secondary.length) l = l.filter((e) => e.secondary.some((m) => f.secondary.includes(m)));
    if (f.equipment.length) l = l.filter((e) => f.equipment.some((x) => x === 'bodyweight' ? e.equipment.length === 0 || e.equipment.includes('bodyweight') : e.equipment.includes(x)));
    if (f.difficulty.length) l = l.filter((e) => f.difficulty.includes(e.difficulty));
    if (f.movement.length) l = l.filter((e) => f.movement.includes(e.movement));
    if (f.kind.length) l = l.filter((e) => f.kind.includes(e.kind));
    if (f.onlyAvailable) l = l.filter((e) => isAvailable(e, eq as Set<string>));
    return searchExercises(l, q);
  }, [cat, f, q, meta.favorites, meta.recent, eq]);

  const nFilters = f.primary.length + f.secondary.length + f.equipment.length + f.difficulty.length + f.movement.length + f.kind.length + (f.onlyAvailable ? 1 : 0);
  const toggle = <K extends keyof Filters>(k: K, v: any) => setF((cur) => {
    const arr = cur[k] as any[];
    return { ...cur, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
  });

  const filtersSheet = (
    <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtri" wide footer={<><button className="btn grow" onClick={() => setF(EMPTY)}>Azzera</button><button className="btn primary grow" onClick={() => setFiltersOpen(false)}>Mostra {list.length} risultati</button></>}>
        <div className="stack">
          <label className="row-between" style={{ cursor: 'pointer' }}><span><b>Solo con la mia attrezzatura</b><div className="tiny muted">In base a quanto indicato nel profilo</div></span><input type="checkbox" checked={f.onlyAvailable} onChange={(e) => setF({ ...f, onlyAvailable: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} /></label>
          <FilterGroup title="Tipo" items={Object.keys(KIND_LABEL) as ExKind[]} label={(k) => KIND_LABEL[k]} sel={f.kind} onToggle={(v) => toggle('kind', v)} />
          <FilterGroup title="Muscolo principale" items={MUSCLES} label={(m) => MUSCLE_LABEL[m]} sel={f.primary} onToggle={(v) => toggle('primary', v)} />
          <FilterGroup title="Muscolo secondario" items={SEC_MUSCLES} label={(m) => MUSCLE_LABEL[m]} sel={f.secondary} onToggle={(v) => toggle('secondary', v)} />
          <FilterGroup title="Attrezzatura" items={EQUIPS} label={(m) => EQUIPMENT_LABEL[m]} sel={f.equipment} onToggle={(v) => toggle('equipment', v)} />
          <FilterGroup title="Difficoltà" items={[1, 2, 3]} label={(d) => DIFF[d]} sel={f.difficulty} onToggle={(v) => toggle('difficulty', v)} />
          <FilterGroup title="Tipo di movimento" items={Object.keys(MOVEMENT_LABEL) as Movement[]} label={(m) => MOVEMENT_LABEL[m]} sel={f.movement} onToggle={(v) => toggle('movement', v)} />
        </div>
      </Sheet>
  );

  const browse = cat === 'all' && !q && nFilters === 0 && sp.get('view') !== 'all';
  const favList = meta.favorites.map(getExercise).filter((e): e is NonNullable<typeof e> => !!e);
  const recentList = meta.recent.map(getExercise).filter((e): e is NonNullable<typeof e> => !!e);
  const count = (c: ExCategory) => EXERCISES.filter((e) => inCategory(e, c)).length;
  const heart = (e: Exercise) => (
    <button className="exc-fav" onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e.id); }} aria-label={meta.favorites.includes(e.id) ? `Rimuovi ${e.name} dai preferiti` : `Aggiungi ${e.name} ai preferiti`} aria-pressed={meta.favorites.includes(e.id)}>
      <Heart size={16} fill={meta.favorites.includes(e.id) ? 'currentColor' : 'none'} />
    </button>
  );
  const title = cat === 'all' ? (q ? 'Risultati' : 'Tutti gli esercizi') : cat === 'fav' ? 'Preferiti' : cat === 'recent' ? 'Visti di recente' : CATEGORY_LABEL[cat];
  const tint = cat !== 'all' && cat !== 'fav' && cat !== 'recent' ? CATEGORY_TINT[cat] : undefined;

  const searchBar = (
    <div className="row" style={{ gap: 8 }}>
      <div className="grow"><SearchInput value={q} onChange={(v) => { setQ(v); setLimit(40); }} placeholder="Cerca: panca, squat, glutei, manubri…" /></div>
      <button className={`btn ${nFilters ? 'soft' : ''}`} onClick={() => setFiltersOpen(true)} aria-label="Filtri"><SlidersHorizontal size={18} />{nFilters ? ` ${nFilters}` : ''}</button>
    </div>
  );

  if (browse) {
    return (
      <div className="page stack">
        <SectionHero section="exercises" title="Esercizi" desc={`${EXERCISES.length} esercizi con animazione, muscoli coinvolti e guida tecnica.`}
          actions={<><button className="btn primary" onClick={() => setSp({ view: 'all' }, { replace: false })}><Library size={17} /> Sfoglia tutti</button><button className="btn" onClick={() => setCat('fav')}><Heart size={17} /> Preferiti</button></>} />
        {searchBar}
        {(favList.length > 0 || recentList.length > 0) && (
          <section>
            <div className="section-title">{favList.length ? 'I tuoi preferiti' : 'Visti di recente'} <button className="link-btn small" onClick={() => setCat(favList.length ? 'fav' : 'recent')}>Vedi tutti <ChevronRight size={15} /></button></div>
            <div className="hscroll exc-strip">
              {(favList.length ? favList : recentList).slice(0, 10).map((e) => <ExerciseCard key={e.id} e={e} onClick={() => nav(`/exercises/${e.id}`)} action={heart(e)} />)}
            </div>
          </section>
        )}
        <section>
          <div className="section-title">Gruppi muscolari</div>
          <div className="cat-grid">
            {FEATURED_CATEGORIES.map((c, i) => <CategoryCard key={c} c={c} n={count(c)} i={i} onClick={() => setCat(c)} />)}
          </div>
        </section>
        <section>
          <div className="section-title">Altre categorie</div>
          <div className="cat-grid small">
            {CATEGORY_ORDER.filter((c) => !FEATURED_CATEGORIES.includes(c)).map((c, i) => <CategoryCard key={c} c={c} n={count(c)} i={i} small onClick={() => setCat(c)} />)}
          </div>
        </section>
        <Link to="/workouts" className="card clickable row" style={{ ['--sc' as string]: 'var(--c-training)' } as React.CSSProperties}>
          <span className="li-icon sec-ic" style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center' }}><Dumbbell size={20} /></span>
          <span className="grow"><b>Componi la tua scheda</b><div className="small muted">Da ogni esercizio puoi aggiungerlo direttamente a una scheda o all’allenamento in corso.</div></span>
          <ChevronRight className="muted" />
        </Link>
        {filtersSheet}
      </div>
    );
  }

  return (
    <div className="page stack">
      <PageHeader title={title} back={browse ? undefined : '/exercises'} crumb={title} sub={tint ? CATEGORY_VISUAL[cat as ExCategory].hint : undefined} />
      {searchBar}
      <Chips role="tablist" aria-label="Categorie">
        <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Tutti</button>
        <button className={`chip ${cat === 'fav' ? 'on' : ''}`} onClick={() => setCat('fav')}><Heart size={13} /> Preferiti {meta.favorites.length ? `(${meta.favorites.length})` : ''}</button>
        <button className={`chip ${cat === 'recent' ? 'on' : ''}`} onClick={() => setCat('recent')}><Clock size={13} /> Recenti</button>
        {CATEGORY_ORDER.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>)}
      </Chips>
      {nFilters > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          {f.onlyAvailable && <button className="pill accent" onClick={() => setF({ ...f, onlyAvailable: false })}>Con la mia attrezzatura <X size={12} /></button>}
          {f.primary.map((m) => <button key={`p${m}`} className="pill accent" onClick={() => toggle('primary', m)}>{MUSCLE_LABEL[m]} <X size={12} /></button>)}
          {f.secondary.map((m) => <button key={`s${m}`} className="pill" onClick={() => toggle('secondary', m)}>Sec.: {MUSCLE_LABEL[m]} <X size={12} /></button>)}
          {f.equipment.map((m) => <button key={`e${m}`} className="pill" onClick={() => toggle('equipment', m)}>{EQUIPMENT_LABEL[m]} <X size={12} /></button>)}
          {f.kind.map((m) => <button key={`k${m}`} className="pill" onClick={() => toggle('kind', m)}>{KIND_LABEL[m]} <X size={12} /></button>)}
          {f.movement.map((m) => <button key={`m${m}`} className="pill" onClick={() => toggle('movement', m)}>{MOVEMENT_LABEL[m]} <X size={12} /></button>)}
          {f.difficulty.map((m) => <button key={`d${m}`} className="pill" onClick={() => toggle('difficulty', m)}>{DIFF[m]} <X size={12} /></button>)}
          <button className="pill" onClick={() => setF(EMPTY)}>Azzera</button>
        </div>
      )}
      <div className="tiny muted" aria-live="polite">{list.length} {list.length === 1 ? 'esercizio' : 'esercizi'}</div>
      {list.length === 0 ? (
        <Empty icon={cat === 'fav' ? <Heart /> : <Library />} title={cat === 'fav' ? 'Nessun preferito' : cat === 'recent' ? 'Nessun esercizio visto di recente' : 'Nessun risultato'} text={cat === 'fav' ? 'Tocca il cuore su un esercizio per salvarlo qui.' : 'Prova con un altro termine o rimuovi qualche filtro.'} />
      ) : (
        <div className="exc-grid" style={tint ? { ['--tint' as string]: tint } as React.CSSProperties : undefined}>
          {list.slice(0, limit).map((e) => <ExerciseCard key={e.id} e={e} onClick={() => nav(`/exercises/${e.id}`)} action={heart(e)} />)}
        </div>
      )}
      {list.length > limit && <button className="btn block" onClick={() => setLimit((l) => l + 60)}>Mostra altri ({list.length - limit})</button>}
      {filtersSheet}
    </div>
  );
}

function CategoryCard({ c, n, i, small, onClick }: { c: ExCategory; n: number; i: number; small?: boolean; onClick: () => void }) {
  const v = CATEGORY_VISUAL[c];
  const tint = CATEGORY_TINT[c] ?? 'var(--c-exercises)';
  return (
    <button className={`cat-card ${small ? 'small' : ''}`} onClick={onClick} style={{ ['--sc' as string]: tint, animationDelay: `${i * 0.035}s` } as React.CSSProperties} aria-label={`${CATEGORY_LABEL[c]}: ${n} esercizi`}>
      <ArtPanel spec={{ kind: 'figure', pattern: v.pattern, muscles: v.muscles, phase: v.phase, scene: 'studio' }} color={tint} color2="#15161c" className="cat-art" />
      <span className="cat-body">
        <b>{CATEGORY_LABEL[c]}</b>
        <span>{small ? `${n} esercizi` : `${n} esercizi · ${v.hint}`}</span>
      </span>
    </button>
  );
}

function FilterGroup<T extends string | number>({ title, items, label, sel, onToggle }: { title: string; items: T[]; label: (v: T) => string; sel: T[]; onToggle: (v: T) => void }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>{title}</div>
      <div className="chips wrap">{items.map((v) => <button key={String(v)} className={`chip ${sel.includes(v) ? 'on' : ''}`} onClick={() => onToggle(v)} aria-pressed={sel.includes(v)}>{label(v)}</button>)}</div>
    </div>
  );
}
