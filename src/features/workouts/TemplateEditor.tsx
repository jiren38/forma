import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ArrowUp, ArrowDown, Repeat, Play, Copy, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useDoc } from '@/db/store';
import { store } from '@/db/store';
import { saveTemplate, useProfile, useSettings, useSessions } from '@/app/data';
import { PageHeader, Empty, Sheet, Confirm, NumberInput, Stepper, useToast } from '@/components/ui';
import { getExercise } from '@/data/exercises';
import { ExercisePicker, ExerciseRow, ExerciseThumb } from '@/features/exercises/components';
import { substitutes, prescription } from '@/lib/generator';
import { lastPerformance } from '@/lib/stats';
import { uid, fromDisplayWeight, toDisplayWeight, fmtW, formatClock } from '@/lib/util';
import { activeSession, startSession } from './session';
import { estimateMinutes } from './WorkoutsPage';
import type { Program, TemplateExercise, WorkoutTemplate } from '@/lib/types';

export default function TemplateEditor() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const t = useDoc<WorkoutTemplate>('templates', id);
  const profile = useProfile();
  const settings = useSettings();
  const sessions = useSessions();
  const [picker, setPicker] = useState(false);
  const [swap, setSwap] = useState<TemplateExercise | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [del, setDel] = useState(false);

  useEffect(() => { if (sp.get('new') && t && !t.exercises.length) setPicker(true); }, [sp.get('new'), !!t]); // eslint-disable-line

  const subs = useMemo(() => (swap && profile ? substitutes(swap.exerciseId, profile) : []), [swap, profile]);

  if (!t) return <div className="page"><PageHeader title="Scheda" back="/workouts" /><Empty icon={<Info />} title="Scheda non trovata" text="Potrebbe essere stata eliminata." action={<Link to="/workouts" className="btn">Torna agli allenamenti</Link>} /></div>;

  const update = (p: Partial<WorkoutTemplate>) => saveTemplate({ ...t, ...p });
  const updateEx = (u: string, p: Partial<TemplateExercise>) => update({ exercises: t.exercises.map((e) => (e.uid === u ? { ...e, ...p } : e)) });
  const move = (i: number, d: number) => {
    const ex = [...t.exercises];
    const j = i + d;
    if (j < 0 || j >= ex.length) return;
    [ex[i], ex[j]] = [ex[j], ex[i]];
    update({ exercises: ex });
  };

  function addExercises(ids: string[]) {
    const goals = profile?.goals ?? ['fitness'];
    const add: TemplateExercise[] = ids.map((exId) => {
      const e = getExercise(exId)!;
      const pr = prescription(goals, profile?.level ?? 'beginner', e.mechanic === 'compound', profile?.sessionStyle ?? 'long');
      const timed = e.tracking === 'time';
      const last = lastPerformance(sessions, exId);
      const lastW = last ? Math.max(0, ...last.sets.filter((s) => s.done).map((s) => s.weight ?? 0)) : 0;
      return { uid: uid('te_'), exerciseId: exId, ...pr, ...(timed ? { repMin: 30, repMax: 45, restSec: 45 } : {}), targetWeight: lastW || null, notes: '' };
    });
    update({ exercises: [...t!.exercises, ...add] });
    toast(ids.length === 1 ? 'Esercizio aggiunto' : `${ids.length} esercizi aggiunti`);
  }

  async function start() {
    if (activeSession()) { nav('/workout/live'); return; }
    await startSession(t!);
    nav('/workout/live');
  }
  async function remove() {
    await store.remove('templates', t!.id);
    for (const p of store.list<Program>('programs')) if (p.schedule.includes(t!.id)) await store.put('programs', p.id, { ...p, schedule: p.schedule.map((x) => (x === t!.id ? null : x)) });
    toast('Scheda eliminata');
    nav('/workouts', { replace: true });
  }
  async function duplicate() {
    const now = new Date().toISOString();
    const c: WorkoutTemplate = { ...t!, id: uid('tpl_'), name: `${t!.name} (copia)`, source: 'manual', programId: null, createdAt: now, updatedAt: now, exercises: t!.exercises.map((e) => ({ ...e, uid: uid('te_') })) };
    await saveTemplate(c);
    toast('Scheda duplicata');
    nav(`/workouts/template/${c.id}`, { replace: true });
  }

  const units = settings.units;

  return (
    <div className="page stack" style={{ paddingBottom: 120 }}>
      <PageHeader title="Modifica scheda" back sticky right={
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn ghost" onClick={duplicate} aria-label="Duplica scheda"><Copy size={19} /></button>
          <button className="icon-btn ghost" onClick={() => setDel(true)} aria-label="Elimina scheda"><Trash2 size={19} /></button>
        </div>
      } />

      <div className="card stack-sm">
        <div className="field"><label htmlFor="tname">Nome della scheda</label><input id="tname" className="input" value={t.name} maxLength={60} onChange={(e) => update({ name: e.target.value })} placeholder="Es. Petto e tricipiti" /></div>
        <div className="field"><label htmlFor="tnotes">Note (facoltative)</label><textarea id="tnotes" className="textarea" style={{ minHeight: 60 }} value={t.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} placeholder="Riscaldamento, indicazioni, obiettivi della seduta…" /></div>
        <div className="small muted">{t.exercises.length} esercizi · {t.exercises.reduce((a, e) => a + e.sets, 0)} serie · durata stimata ~{estimateMinutes(t)} min</div>
      </div>

      {t.exercises.length === 0 ? (
        <div className="card"><Empty icon={<Plus />} title="Nessun esercizio" text="Aggiungi esercizi dalla libreria: potrai poi impostare serie, ripetizioni, recupero e note." action={<button className="btn primary" onClick={() => setPicker(true)}><Plus size={18} /> Aggiungi esercizi</button>} /></div>
      ) : (
        <div className="stack-sm">
          {t.exercises.map((te, i) => {
            const e = getExercise(te.exerciseId);
            if (!e) return null;
            const isOpen = open === te.uid;
            const timed = e.tracking === 'time';
            const weighted = e.tracking === 'weight_reps';
            return (
              <div key={te.uid} className="card" style={{ padding: 12 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="pill" aria-hidden>{i + 1}</span>
                  <button className="row grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', cursor: 'pointer', minWidth: 0, gap: 10 }} onClick={() => setOpen(isOpen ? null : te.uid)} aria-expanded={isOpen}>
                    <ExerciseThumb e={e} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <b className="ellipsis" style={{ display: 'block' }}>{e.name}</b>
                      <span className="tiny muted">{te.sets} × {te.repMin}{te.repMax !== te.repMin ? `–${te.repMax}` : ''} {timed ? 's' : 'rip.'} · recupero {formatClock(te.restSec)}{weighted && te.targetWeight ? ` · ${fmtW(te.targetWeight, units)}` : ''}</span>
                    </span>
                    {isOpen ? <ChevronUp size={18} className="muted" /> : <ChevronDown size={18} className="muted" />}
                  </button>
                </div>
                {isOpen && (
                  <div className="stack-sm" style={{ marginTop: 12 }}>
                    <div className="grid-2">
                      <div className="field"><label>Serie</label><Stepper value={te.sets} min={1} max={12} onChange={(v) => updateEx(te.uid, { sets: v })} /></div>
                      <div className="field"><label>Recupero</label><Stepper value={te.restSec} min={0} max={600} step={15} format={formatClock} onChange={(v) => updateEx(te.uid, { restSec: v })} /></div>
                      <div className="field"><label>{timed ? 'Secondi min' : 'Ripetizioni min'}</label><Stepper value={te.repMin} min={1} max={timed ? 600 : 100} step={timed ? 5 : 1} onChange={(v) => updateEx(te.uid, { repMin: v, repMax: Math.max(v, te.repMax) })} /></div>
                      <div className="field"><label>{timed ? 'Secondi max' : 'Ripetizioni max'}</label><Stepper value={te.repMax} min={1} max={timed ? 600 : 100} step={timed ? 5 : 1} onChange={(v) => updateEx(te.uid, { repMax: v, repMin: Math.min(v, te.repMin) })} /></div>
                    </div>
                    {weighted && (
                      <div className="field"><label>Carico di partenza (facoltativo)</label>
                        <NumberInput value={toDisplayWeight(te.targetWeight, units)} onChange={(v) => updateEx(te.uid, { targetWeight: fromDisplayWeight(v, units) })} suffix={units} min={0} max={1000} placeholder="Usa l’ultimo carico" ariaLabel="Carico di partenza" />
                      </div>
                    )}
                    <div className="field"><label>Note sull’esercizio</label><input className="input" value={te.notes ?? ''} onChange={(ev) => updateEx(te.uid, { notes: ev.target.value })} placeholder="Es. presa stretta, tempo 3-1-1" /></div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su"><ArrowUp size={15} /> Su</button>
                      <button className="btn sm" onClick={() => move(i, 1)} disabled={i === t.exercises.length - 1} aria-label="Sposta giù"><ArrowDown size={15} /> Giù</button>
                      <button className="btn sm" onClick={() => setSwap(te)}><Repeat size={15} /> Sostituisci</button>
                      <Link className="btn sm ghost" to={`/exercises/${e.id}`}><Info size={15} /> Tecnica</Link>
                      <button className="btn sm danger" onClick={() => { update({ exercises: t.exercises.filter((x) => x.uid !== te.uid) }); toast('Esercizio rimosso'); }}><Trash2 size={15} /> Rimuovi</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button className="btn block" onClick={() => setPicker(true)}><Plus size={18} /> Aggiungi esercizi</button>
        </div>
      )}

      {t.exercises.length > 0 && (
        <button className="btn primary lg fab" onClick={start}><Play size={18} fill="currentColor" /> Inizia</button>
      )}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercises} multi />
      <Sheet open={!!swap} onClose={() => setSwap(null)} title="Sostituisci esercizio" wide>
        {swap && (
          <div className="stack-sm">
            <p className="small text-2">Alternative per <b>{getExercise(swap.exerciseId)?.name}</b> che allenano lo stesso muscolo e sono eseguibili con la tua attrezzatura.</p>
            {subs.length === 0 ? <p className="muted small">Nessuna alternativa disponibile con l’attrezzatura attuale.</p> : subs.map((e) => (
              <ExerciseRow key={e.id} e={e} onClick={() => { updateEx(swap.uid, { exerciseId: e.id, targetWeight: null }); setSwap(null); toast(`Sostituito con ${e.name}`); }} right={<Repeat size={17} className="muted" />} />
            ))}
          </div>
        )}
      </Sheet>
      <Confirm open={del} onClose={() => setDel(false)} danger confirmLabel="Elimina" title="Eliminare la scheda?" body="La scheda verrà rimossa anche dai programmi. Gli allenamenti già svolti restano nello storico." onConfirm={remove} />
    </div>
  );
}
