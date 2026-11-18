/** Componenti condivisi della libreria esercizi: riga esercizio e selettore (usato in schede e sessione live). */
import { useMemo, useState } from 'react';
import { Heart, Check, Plus } from 'lucide-react';
import { ExerciseVisual } from './media';
import { CATEGORY_LABEL, CATEGORY_ORDER, EXERCISES, inCategory, isAvailable, type ExCategory, type Exercise } from '@/data/exercises';
import { MUSCLE_LABEL, EQUIPMENT_LABEL } from '@/lib/labels';
import { normalize } from '@/lib/util';
import { Sheet, SearchInput, Empty } from '@/components/ui';
import { useMeta, useProfile } from '@/app/data';
import { availableEquipment } from '@/lib/generator';

export function ExerciseThumb({ e }: { e: Exercise }) {
  return <div className="ex-thumb"><ExerciseVisual exerciseId={e.id} patternId={e.pattern} muscles={e.primary} className="thumb" label={e.name} /></div>;
}

export function equipmentText(e: Exercise) {
  const eq = e.equipment.filter((x) => x !== 'bodyweight');
  return eq.length ? eq.map((x) => EQUIPMENT_LABEL[x]).join(', ') : 'Corpo libero';
}

export function ExerciseRow({ e, onClick, right, sub }: { e: Exercise; onClick?: () => void; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="ex-row" role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(k) => { if (onClick && (k.key === 'Enter' || k.key === ' ')) { k.preventDefault(); onClick(); } }}>
      <ExerciseThumb e={e} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ex-name ellipsis">{e.name}</div>
        <div className="ex-sub ellipsis">{sub ?? `${e.primary.map((m) => MUSCLE_LABEL[m]).join(', ')} · ${equipmentText(e)}`}</div>
      </div>
      {right}
    </div>
  );
}

/** Ricerca testuale su nome italiano, inglese, muscoli e attrezzi. */
export function searchExercises(list: Exercise[], q: string) {
  const n = normalize(q.trim());
  if (!n) return list;
  const words = n.split(/\s+/);
  return list
    .map((e) => {
      const hay = normalize(`${e.name} ${e.nameEn} ${e.primary.map((m) => MUSCLE_LABEL[m]).join(' ')} ${e.secondary.map((m) => MUSCLE_LABEL[m]).join(' ')} ${equipmentText(e)} ${CATEGORY_LABEL[e.category]}`);
      if (!words.every((w) => hay.includes(w))) return null;
      const nm = normalize(e.name);
      const score = (nm.startsWith(n) ? 3 : 0) + (nm.includes(n) ? 2 : 0) + (normalize(e.nameEn).includes(n) ? 1 : 0);
      return { e, score };
    })
    .filter((x): x is { e: Exercise; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}

/**
 * Selettore esercizi in un pannello: ricerca, categorie, solo disponibili, preferiti.
 * multi=true consente di aggiungerne più di uno alla volta.
 */
export function ExercisePicker({ open, onClose, onPick, multi, title = 'Aggiungi esercizi', initialCategory, suggested }: {
  open: boolean; onClose: () => void; onPick: (ids: string[]) => void; multi?: boolean; title?: string; initialCategory?: ExCategory | 'all'; suggested?: Exercise[];
}) {
  const profile = useProfile();
  const meta = useMeta();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ExCategory | 'all' | 'fav'>(initialCategory ?? 'all');
  const [onlyAvail, setOnlyAvail] = useState(true);
  const [sel, setSel] = useState<string[]>([]);
  const eq = useMemo(() => (profile ? availableEquipment(profile) : new Set<string>()), [profile]);

  const list = useMemo(() => {
    let l = EXERCISES;
    if (cat === 'fav') l = l.filter((e) => meta.favorites.includes(e.id));
    else if (cat !== 'all') l = l.filter((e) => inCategory(e, cat));
    if (onlyAvail && profile) l = l.filter((e) => isAvailable(e, eq as Set<string>));
    return searchExercises(l, q);
  }, [cat, q, onlyAvail, eq, meta.favorites, profile]);

  const close = () => { setSel([]); setQ(''); onClose(); };
  const toggle = (id: string) => {
    if (!multi) { onPick([id]); close(); return; }
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  return (
    <Sheet open={open} onClose={close} title={title} wide
      footer={multi ? <button className="btn primary block lg" disabled={!sel.length} onClick={() => { onPick(sel); close(); }}><Plus size={18} /> Aggiungi {sel.length || ''} {sel.length === 1 ? 'esercizio' : 'esercizi'}</button> : undefined}>
      <div className="stack-sm">
        <SearchInput value={q} onChange={setQ} placeholder="Cerca per nome, muscolo o attrezzo" />
        <div className="chips">
          <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Tutti</button>
          <button className={`chip ${cat === 'fav' ? 'on' : ''}`} onClick={() => setCat('fav')}><Heart size={13} /> Preferiti</button>
          {CATEGORY_ORDER.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>)}
        </div>
        <label className="row small text-2" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyAvail} onChange={(e) => setOnlyAvail(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          Solo esercizi eseguibili con la mia attrezzatura
        </label>
        {!q && cat === 'all' && suggested && suggested.length > 0 && (
          <>
            <div className="section-title">Suggeriti</div>
            {suggested.map((e) => <PickRow key={`s${e.id}`} e={e} on={sel.includes(e.id)} multi={multi} onClick={() => toggle(e.id)} />)}
            <div className="section-title">Tutti gli esercizi</div>
          </>
        )}
        {list.length === 0 ? <Empty icon={<Plus />} title="Nessun esercizio trovato" text="Prova a cambiare ricerca o filtri." /> : (
          <div>{list.slice(0, 120).map((e) => <PickRow key={e.id} e={e} on={sel.includes(e.id)} multi={multi} onClick={() => toggle(e.id)} />)}</div>
        )}
        {list.length > 120 && <p className="hint center">Mostrati 120 di {list.length}: affina la ricerca per vedere gli altri.</p>}
      </div>
    </Sheet>
  );
}

function PickRow({ e, on, multi, onClick }: { e: Exercise; on: boolean; multi?: boolean; onClick: () => void }) {
  return (
    <ExerciseRow e={e} onClick={onClick} right={multi ? <span className={`set-check ${on ? 'on' : ''}`} aria-hidden><Check size={18} strokeWidth={3} /></span> : <Plus size={18} className="muted" />} />
  );
}
