import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Trophy, Clock, Layers, Repeat2, Weight, Trash2, Save, Info, TrendingUp, TrendingDown, Minus, Star, PartyPopper, Play, Bike, Route, Gauge, Flame, Dumbbell } from 'lucide-react';
import { useDoc, store } from '@/db/store';
import { useSessions, useSettings, saveTemplate } from '@/app/data';
import { PageHeader, Empty, Confirm, useToast } from '@/components/ui';
import { getExercise } from '@/data/exercises';
import { completedSessions, doneSets, sessionStats } from '@/lib/stats';
import { formatDuration, formatLongDate, formatTime, fmtN, fmtW, toDisplayWeight, uid } from '@/lib/util';
import type { WorkoutSession, WorkoutTemplate } from '@/lib/types';
import { ExerciseThumb } from '@/features/exercises/components';
import { activeSession, startSession, exerciseLogFor, saveSession } from './session';
import { sessionCardioStats, templateCardio } from '@/lib/cardio';
import { CardioIcon } from './cardio-ui';
import { PlannedVsActual } from './CardioLive';

function prText(kind: string, value: number, reps: number | undefined, units: 'kg' | 'lb') {
  if (kind === 'weight') return `${fmtW(value, units)} × ${reps}`;
  if (kind === 'e1rm') return `1RM stimato ${fmtW(value, units)}`;
  if (kind === 'reps') return `${value} ripetizioni`;
  return `volume ${fmtW(value, units)}`;
}

function Delta({ cur, prev, fmt }: { cur: number; prev: number | undefined; fmt: (n: number) => string }) {
  if (prev === undefined) return null;
  const d = cur - prev;
  if (Math.abs(d) < 0.0001) return <span className="tiny muted row" style={{ gap: 2 }}><Minus size={12} /> uguale</span>;
  return <span className="tiny row" style={{ gap: 2, color: d > 0 ? 'var(--success)' : 'var(--orange)' }}>{d > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{d > 0 ? '+' : '−'}{fmt(Math.abs(d))}</span>;
}

export default function SessionDetail() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const s = useDoc<WorkoutSession>('sessions', id);
  const sessions = useSessions();
  const settings = useSettings();
  const units = settings.units;
  const [del, setDel] = useState(false);

  if (!s) return <div className="page"><PageHeader title="Allenamento" back="/history" /><Empty icon={<Info />} title="Allenamento non trovato" action={<Link className="btn" to="/history">Vai allo storico</Link>} /></div>;
  const st = sessionStats(s);
  const done = completedSessions(sessions);
  const before = done.filter((x) => x.startedAt < s.startedAt && x.id !== s.id);
  const prev = [...before].reverse().find((x) => (s.templateId ? x.templateId === s.templateId : x.name === s.name));
  const pst = prev ? sessionStats(prev) : undefined;
  const cst = sessionCardioStats(s);
  const pcst = prev ? sessionCardioStats(prev) : undefined;
  const strengthLogs = s.exercises.filter((e) => !e.cardio);
  const cardioLogs = s.exercises.filter((e) => e.cardio?.done && e.cardio.actual);
  const justDone = sp.get('done') === '1';

  async function saveAsTemplate() {
    const now = new Date().toISOString();
    const t: WorkoutTemplate = {
      id: uid('tpl_'), name: s!.name, source: 'manual', createdAt: now, updatedAt: now, notes: '',
      exercises: s!.exercises.map((e) => {
        if (e.cardio) return templateCardio(e.exerciseId, e.cardio.plan, e.notes ?? '');
        const ds = doneSets(e).filter((x) => x.type !== 'warmup');
        const reps = ds.map((x) => x.reps ?? 0).filter(Boolean);
        return { uid: uid('te_'), exerciseId: e.exerciseId, sets: Math.max(1, ds.length), repMin: reps.length ? Math.min(...reps) : e.repMin, repMax: reps.length ? Math.max(...reps) : e.repMax, restSec: e.restSec, targetWeight: ds.length ? Math.max(...ds.map((x) => x.weight ?? 0)) || null : null, notes: e.notes ?? '' };
      }),
    };
    await saveTemplate(t);
    toast('Salvato come nuova scheda');
    nav(`/workouts/template/${t.id}`);
  }
  async function repeat() {
    if (activeSession()) { nav('/workout/live'); return; }
    const tpl = s!.templateId ? store.get<WorkoutTemplate>('templates', s!.templateId) : null;
    if (tpl) await startSession(tpl);
    else {
      const ns = await startSession(null, s!.name);
      await saveSession({ ...ns, exercises: s!.exercises.map((e) => exerciseLogFor(e.exerciseId, sessions, e.cardio ? { cardio: e.cardio.plan } : { sets: Math.max(1, doneSets(e).length), repMin: e.repMin, repMax: e.repMax, restSec: e.restSec })) });
    }
    nav('/workout/live');
  }

  return (
    <div className="page stack">
      <PageHeader title={s.name} back={justDone ? '/' : true} sub={`${formatLongDate(s.startedAt)} · ${formatTime(s.startedAt)}`}
        right={<button className="icon-btn ghost" onClick={() => setDel(true)} aria-label="Elimina allenamento"><Trash2 size={19} /></button>} />

      {justDone && (
        <div className="card hero pad-lg center">
          <PartyPopper size={34} className="accent" />
          <h2 style={{ marginTop: 6 }}>Allenamento completato!</h2>
          <p className="text-2 small">È il tuo allenamento numero {done.findIndex((x) => x.id === s.id) + 1}. {s.prs?.length ? `Hai stabilito ${s.prs.length} ${s.prs.length === 1 ? 'nuovo record' : 'nuovi record'}!` : 'Costanza e pazienza fanno la differenza.'}</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 10, gap: 4 }} role="radiogroup" aria-label="Valuta la sessione">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="icon-btn ghost" role="radio" aria-checked={s.rating === n} aria-label={`${n} su 5`} onClick={() => store.put('sessions', s.id, { ...s, rating: n })}>
                <Star size={22} fill={(s.rating ?? 0) >= n ? 'var(--accent)' : 'none'} color={(s.rating ?? 0) >= n ? 'var(--accent)' : 'currentColor'} />
              </button>
            ))}
          </div>
          <div className="tiny muted">Com’è andata?</div>
        </div>
      )}

      <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Clock size={13} /> Durata totale</span><span className="v">{formatDuration(st.durationMs)}</span><Delta cur={st.durationMs / 60000} prev={pst && pst.durationMs / 60000} fmt={(n) => `${Math.round(n)} min`} /></div></div>
      {st.sets > 0 && <div className="group-label"><Dumbbell size={13} /> Parte muscolare</div>}
      {st.sets > 0 && <div className="grid-2">
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Dumbbell size={13} /> Esercizi</span><span className="v">{st.exercises}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Weight size={13} /> Volume</span><span className="v">{fmtW(st.volume, units)}</span><Delta cur={st.volume} prev={pst?.volume} fmt={(n) => fmtW(n, units)} /></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Layers size={13} /> Serie</span><span className="v">{st.sets}</span><Delta cur={st.sets} prev={pst?.sets} fmt={(n) => String(n)} /></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Repeat2 size={13} /> Ripetizioni</span><span className="v">{fmtN(st.reps)}</span><Delta cur={st.reps} prev={pst?.reps} fmt={(n) => String(n)} /></div></div>
      </div>}
      {cst.activities > 0 && <>
        <div className="group-label cardio"><Bike size={13} /> Parte cardio</div>
        <div className="grid-2">
          <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Bike size={13} /> Minuti di cardio</span><span className="v">{fmtN(cst.minutes, 1)}</span><span className="tiny muted">{cst.activities} attività · previsti {fmtN(cst.plannedMin, 0)}</span><Delta cur={cst.minutes} prev={pcst?.activities ? pcst.minutes : undefined} fmt={(n) => `${fmtN(n, 1)} min`} /></div></div>
          <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Route size={13} /> Distanza</span><span className="v">{cst.distanceKm != null ? `${fmtN(cst.distanceKm, 2)} km` : 'n.d.'}</span></div></div>
          <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Gauge size={13} /> Velocità media</span><span className="v">{cst.avgSpeedKmh != null ? `${fmtN(cst.avgSpeedKmh, 1)} km/h` : 'n.d.'}</span></div></div>
          <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Flame size={13} /> Calorie stimate</span><span className="v">{cst.kcal != null ? `~${fmtN(cst.kcal)}` : 'n.d.'}</span><span className="tiny muted">stima, non misura</span></div></div>
        </div>
      </>}
      {prev ? <p className="tiny muted">Confronto con la sessione precedente “{prev.name}” del {new Date(prev.startedAt).toLocaleDateString('it-IT')}.</p> : <p className="tiny muted">Nessuna sessione precedente comparabile: il confronto comparirà dalla prossima volta.</p>}

      {!!s.prs?.length && (
        <section className="card">
          <div className="card-title"><h3><Trophy size={18} color="#ffb020" /> Record personali</h3></div>
          <div className="stack-sm">
            {s.prs.map((p, i) => <div key={i} className="row-between small"><Link to={`/exercises/${p.exerciseId}`} style={{ fontWeight: 600 }}>{getExercise(p.exerciseId)?.name}</Link><span className="pr-badge">{prText(p.kind, p.value, p.reps, units)}</span></div>)}
          </div>
        </section>
      )}

      {cardioLogs.length > 0 && <>
        <div className="section-title">Attività cardio · {cardioLogs.length}</div>
        <div className="stack-sm">
          {cardioLogs.map((ex) => (
            <div key={ex.uid} className="card cardio-card" style={{ padding: 12 }}>
              <Link to={`/exercises/${ex.exerciseId}`} className="row" style={{ gap: 10, marginBottom: 8 }}>
                <CardioIcon machine={ex.cardio!.plan.machine} />
                <b className="ellipsis grow">{getExercise(ex.exerciseId)?.name}</b>
              </Link>
              <PlannedVsActual plan={ex.cardio!} />
            </div>
          ))}
        </div>
      </>}
      {strengthLogs.length > 0 && <div className="section-title">Esercizi muscolari · {strengthLogs.length}</div>}
      <div className="stack-sm">
        {strengthLogs.map((ex) => {
          const e = getExercise(ex.exerciseId);
          if (!e) return null;
          const prevEx = prev?.exercises.find((x) => x.exerciseId === ex.exerciseId);
          const vol = doneSets(ex).reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0);
          const pvol = prevEx ? doneSets(prevEx).reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0) : undefined;
          let n = 0;
          return (
            <div key={ex.uid} className="card" style={{ padding: 12 }}>
              <Link to={`/exercises/${e.id}`} className="row" style={{ gap: 10 }}>
                <ExerciseThumb e={e} />
                <div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{e.name}</b>
                  {e.tracking === 'weight_reps' && <span className="tiny muted row" style={{ gap: 6 }}>Volume {fmtW(vol, units)} <Delta cur={vol} prev={pvol} fmt={(x) => fmtW(x, units)} /></span>}
                </div>
                {s.prs?.some((p) => p.exerciseId === e.id) && <span className="pr-badge"><Trophy size={11} /> PR</span>}
              </Link>
              <div className="stack-sm" style={{ marginTop: 8 }}>
                {ex.sets.map((x) => {
                  if (x.type !== 'warmup') n++;
                  return (
                    <div key={x.uid} className="row-between small" style={{ opacity: x.done ? 1 : 0.5 }}>
                      <span className="muted" style={{ width: 70 }}>{x.type === 'warmup' ? 'Riscald.' : x.type === 'drop' ? `Drop` : x.type === 'failure' ? `${n} · cedim.` : `Serie ${n}`}</span>
                      <span className="grow num" style={{ fontWeight: 600 }}>
                        {e.tracking === 'weight_reps' ? `${toDisplayWeight(x.weight, units) ?? 0} ${units} × ${x.reps ?? 0}` : e.tracking === 'time' ? `${x.reps ?? 0} s` : e.tracking === 'cardio' ? `${x.reps ?? 0} min` : `${x.reps ?? 0} rip.${x.weight ? ` +${toDisplayWeight(x.weight, units)} ${units}` : ''}`}
                      </span>
                      <span className="muted tiny">{x.rpe ? `RPE ${x.rpe}` : x.rir != null ? `RIR ${x.rir}` : ''}{!x.done ? 'non completata' : ''}</span>
                    </div>
                  );
                })}
              </div>
              {ex.notes && <p className="tiny text-2" style={{ marginTop: 6 }}>📝 {ex.notes}</p>}
            </div>
          );
        })}
      </div>
      {s.notes && <div className="card"><b className="small">Note</b><p className="small text-2" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{s.notes}</p></div>}

      <div className="row wrap">
        <button className="btn grow" onClick={repeat}><Play size={16} /> Ripeti allenamento</button>
        <button className="btn grow" onClick={saveAsTemplate}><Save size={16} /> Salva come scheda</button>
      </div>
      {justDone && <Link to="/" className="btn primary lg block">Torna alla Home</Link>}
      <Confirm open={del} onClose={() => setDel(false)} danger confirmLabel="Elimina" title="Eliminare questo allenamento?" body="Verrà rimosso dallo storico e dalle statistiche. L’operazione non è reversibile." onConfirm={async () => { await store.remove('sessions', s.id); toast('Allenamento eliminato'); nav('/history', { replace: true }); }} />
    </div>
  );
}
