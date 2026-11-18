import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Heart, SlidersHorizontal, Clock, X, Library } from 'lucide-react';
import { CATEGORY_LABEL, CATEGORY_ORDER, EXERCISES, KIND_LABEL, MOVEMENT_LABEL, getExercise, inCategory, isAvailable, type ExCategory, type ExKind, type Movement } from '@/data/exercises';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '@/lib/labels';
import { useMeta, useProfile, toggleFavorite } from '@/app/data';
import { availableEquipment } from '@/lib/generator';
import { PageHeader, SearchInput, Sheet, Empty } from '@/components/ui';
import { ExerciseRow, searchExercises } from './components';
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
  const setCat = (c: string) => { const n = new URLSearchParams(sp); if (c === 'all') n.delete('cat'); else n.set('cat', c); setSp(n, { replace: true }); };
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

  return (
    <div className="page stack">
      <PageHeader title="Esercizi" sub={`${EXERCISES.length} esercizi con animazione e guida tecnica`} />
      <div className="row" style={{ gap: 8 }}>
        <div className="grow"><SearchInput value={q} onChange={(v) => { setQ(v); setLimit(40); }} placeholder="Cerca: panca, squat, glutei, manubri…" /></div>
        <button className={`btn ${nFilters ? 'soft' : ''}`} onClick={() => setFiltersOpen(true)} aria-label="Filtri"><SlidersHorizontal size={18} />{nFilters ? ` ${nFilters}` : ''}</button>
      </div>
      <div className="chips" role="tablist" aria-label="Categorie">
        <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Tutti</button>
        <button className={`chip ${cat === 'fav' ? 'on' : ''}`} onClick={() => setCat('fav')}><Heart size={13} /> Preferiti {meta.favorites.length ? `(${meta.favorites.length})` : ''}</button>
        <button className={`chip ${cat === 'recent' ? 'on' : ''}`} onClick={() => setCat('recent')}><Clock size={13} /> Recenti</button>
        {CATEGORY_ORDER.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>)}
      </div>
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
        <div className="desk-grid">
          {list.slice(0, limit).map((e) => (
            <ExerciseRow key={e.id} e={e} onClick={() => nav(`/exercises/${e.id}`)}
              right={<button className="icon-btn ghost" onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e.id); }} aria-label={meta.favorites.includes(e.id) ? `Rimuovi ${e.name} dai preferiti` : `Aggiungi ${e.name} ai preferiti`} aria-pressed={meta.favorites.includes(e.id)}>
                <Heart size={18} fill={meta.favorites.includes(e.id) ? 'var(--accent)' : 'none'} color={meta.favorites.includes(e.id) ? 'var(--accent)' : 'currentColor'} />
              </button>} />
          ))}
        </div>
      )}
      {list.length > limit && <button className="btn block" onClick={() => setLimit((l) => l + 60)}>Mostra altri ({list.length - limit})</button>}

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
    </div>
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
