import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ArrowUp, ArrowDown, Repeat, Play, Copy, Info, ChevronDown, ChevronUp, Bike, Dumbbell } from 'lucide-react';
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
import { AddCardioSheet, CardioIcon, CardioPlanEditor, CardioPlanLines, MachinePicker, convertPlan } from './cardio-ui';
import { cardioMinutesOf, defaultPlanFor, isCardioId, planFromLegacy, planMinutes, planSummary, templateCardio, MACHINE_INFO } from '@/lib/cardio';
import type { CardioPlan, Program, TemplateExercise, WorkoutTemplate } from '@/lib/types';

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
  const [addCardio, setAddCardio] = useState(false);
  const [machineFor, setMachineFor] = useState<TemplateExercise | null>(null);

  useEffect(() => { if (sp.get('new') && t && !t.exercises.length) setPicker(true); }, [sp.get('new'), !!t]); // eslint-disable-line

  const subs = useMemo(() => (swap && profile ? substitutes(swap.exerciseId, profile) : []), [swap, profile]);

  if (!t) return <div className="page"><PageHeader title="Scheda" back="/workouts" /><Empty icon={<Info />} title="Scheda non trovata" text="Potrebbe essere stata eliminata." action={<Link to="/workouts" className="btn">Torna agli allenamenti</Link>} /></div>;

  const update = (p: Partial<WorkoutTemplate>) => saveTemplate({ ...t, ...p });
  const setPlan = (u: string, plan: CardioPlan, exerciseId?: string) => {
    const m = Math.round(planMinutes(plan));
    updateEx(u, { cardio: plan, repMin: m, repMax: m, sets: 1, restSec: 0, ...(exerciseId ? { exerciseId } : {}) });
  };
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
      if (isCardioId(exId) && profile) return templateCardio(exId, defaultPlanFor(exId, profile));
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
  const strength = t.exercises.filter((e) => !e.cardio && !isCardioId(e.exerciseId));
  const cardioN = t.exercises.length - strength.length;
  const planOf = (te: TemplateExercise): CardioPlan | null => te.cardio ?? (isCardioId(te.exerciseId) && profile ? planFromLegacy(te, profile) : null);

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
        <div className="small muted">
          <span className="row wrap" style={{ gap: 10 }}>
            <span className="row" style={{ gap: 4 }}><Dumbbell size={14} /> {strength.length} esercizi · {strength.reduce((a, e) => a + e.sets, 0)} serie</span>
            <span className="row" style={{ gap: 4, color: cardioN ? 'var(--blue)' : undefined }}><Bike size={14} /> {cardioN ? `${cardioN} cardio · ${Math.round(cardioMinutesOf(t))} min` : 'nessun cardio'}</span>
            <span>durata stimata ~{estimateMinutes(t)} min</span>
          </span>
        </div>
      </div>

      {t.exercises.length === 0 ? (
        <div className="card"><Empty icon={<Plus />} title="Nessun esercizio" text="Aggiungi esercizi dalla libreria o attività cardio: potrai poi impostare serie e ripetizioni, oppure durata, velocità, pendenza e resistenza." action={<div className="row wrap" style={{ justifyContent: 'center' }}><button className="btn primary" onClick={() => setPicker(true)}><Plus size={18} /> Aggiungi esercizi</button><button className="btn" onClick={() => setAddCardio(true)}><Bike size={18} /> Aggiungi cardio</button></div>} /></div>
      ) : (
        <div className="stack-sm">
          {t.exercises.map((te, i) => {
            const e = getExercise(te.exerciseId);
            if (!e) return null;
            const isOpen = open === te.uid;
            const cplan = planOf(te);
            if (cplan) {
              return (
                <div key={te.uid} className="card cardio-card" style={{ padding: 12 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="pill blue" aria-hidden>{i + 1}</span>
                    <button className="row grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', cursor: 'pointer', minWidth: 0, gap: 10 }} onClick={() => setOpen(isOpen ? null : te.uid)} aria-expanded={isOpen}>
                      <CardioIcon machine={cplan.machine} />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="row" style={{ gap: 6 }}><b className="ellipsis">{e.name}</b><span className="pill blue">Cardio</span></span>
                        <span className="tiny muted">{planSummary(cplan)}</span>
                      </span>
                      {isOpen ? <ChevronUp size={18} className="muted" /> : <ChevronDown size={18} className="muted" />}
                    </button>
                  </div>
                  {!isOpen && <div style={{ marginTop: 8 }}><CardioPlanLines plan={cplan} compact /></div>}
                  {isOpen && (
                    <div className="stack-sm" style={{ marginTop: 12 }}>
                      <CardioPlanEditor plan={cplan} exerciseId={te.exerciseId} profile={profile} onChange={(np) => setPlan(te.uid, np)} />
                      {cplan.progression && <p className="hint">Progressione automatica: +{cplan.progression.stepMin} min quando completi due sessioni come previsto, fino a {cplan.progression.capMin} min.</p>}
                      <div className="field"><label>Note</label><input className="input" value={te.notes ?? ''} onChange={(ev) => updateEx(te.uid, { notes: ev.target.value })} placeholder="Es. programma della macchina, sensazioni" /></div>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su"><ArrowUp size={15} /> Su</button>
                        <button className="btn sm" onClick={() => move(i, 1)} disabled={i === t.exercises.length - 1} aria-label="Sposta giù"><ArrowDown size={15} /> Giù</button>
                        <button className="btn sm" onClick={() => setMachineFor(te)}><Repeat size={15} /> Cambia macchina</button>
                        <button className="btn sm danger" onClick={() => { update({ exercises: t.exercises.filter((x) => x.uid !== te.uid) }); toast('Attività cardio rimossa'); }}><Trash2 size={15} /> Rimuovi</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }
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
          <div className="grid-2">
            <button className="btn block" onClick={() => setPicker(true)}><Plus size={18} /> Aggiungi esercizi</button>
            <button className="btn block" onClick={() => setAddCardio(true)}><Bike size={18} /> Aggiungi cardio</button>
          </div>
        </div>
      )}

      {t.exercises.length > 0 && (
        <button className="btn primary lg fab" onClick={start}><Play size={18} fill="currentColor" /> Inizia</button>
      )}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercises} multi />
      <AddCardioSheet open={addCardio} onClose={() => setAddCardio(false)} profile={profile} onAdd={(exId, plan) => { const te = templateCardio(exId, plan); update({ exercises: [...t.exercises, te] }); setOpen(te.uid); toast('Cardio aggiunto alla scheda'); }} />
      <MachinePicker open={!!machineFor} onClose={() => setMachineFor(null)} profile={profile} current={machineFor ? planOf(machineFor)?.machine : undefined}
        onPick={(m) => {
          const te = machineFor; setMachineFor(null);
          if (!te || !profile) return;
          const cur = planOf(te)!;
          const c = convertPlan(cur, m, te.exerciseId, profile);
          setPlan(te.uid, c.plan, c.exerciseId);
          toast(`Macchina cambiata: ${MACHINE_INFO[m].label}`);
        }} />
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
