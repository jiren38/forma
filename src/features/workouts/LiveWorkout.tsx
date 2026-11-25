/**
 * Modalità allenamento live: registrazione serie, timer di recupero, record in tempo reale,
 * pausa/ripresa, salvataggio continuo (IndexedDB + backup sincrono in localStorage).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check, Pause, Play, Plus, MoreHorizontal, Trash2, Repeat, ArrowUp, ArrowDown, Info, Trophy, Minimize2,
  SkipForward, StickyNote, Flag, X, Dumbbell, RotateCcw, Bike, Pencil, Target, TrendingUp, TrendingDown, Minus, Sparkles, CalendarRange,
} from 'lucide-react';
import { useProfile, useSessions, useSettings } from '@/app/data';
import { store } from '@/db/store';
import { Sheet, Confirm, Empty, NumberInput, Segmented, Bar, useToast } from '@/components/ui';
import { ExerciseVisual } from '@/features/exercises/media';
import { ExercisePicker, ExerciseRow } from '@/features/exercises/components';
import { getExercise, type Exercise } from '@/data/exercises';
import { substitutes } from '@/lib/generator';
import { lastPerformance, sessionDurationMs, sessionStats } from '@/lib/stats';
import { liveSetRecords, mainHit, recordBook, recordDeltaText, recordValueText, type RecordBook, type RecordHit } from '@/lib/records';
import { adviseNextSet, defaultRir, targetDelta, type NextSetAdvice } from '@/lib/progression';
import { WEEK_HINT, WEEK_LABEL, weekParams } from '@/lib/periodization';
import { formatClock, formatDuration, fromDisplayWeight, toDisplayWeight, uid, vibrate, fmtN, fmtW } from '@/lib/util';
import { discardSession, exerciseLogFor, finishSession, recoverBackup, saveSession, startSession, trainingPrefs } from './session';
import type { CardioLogState, ExerciseLog, LoadTarget, SetLog, WorkoutSession } from '@/lib/types';
import { CardioLive, startCardioTimer } from './CardioLive';
import { disconnectFtms } from '@/lib/ble/ftms';
import { AddCardioSheet, CardioPlanEditor, MachinePicker, convertPlan } from './cardio-ui';
import { logStateFor, pauseTimer, timerElapsedMs } from '@/lib/cardio';

const REST_KEY = 'forma.restTimer';
const EFFORT_KEY = 'forma.effortMode';
type Effort = 'rpe' | 'rir' | 'off';
interface Rest { endsAt: number; total: number; label: string }

function loadRest(): Rest | null { try { const r = JSON.parse(localStorage.getItem(REST_KEY) ?? 'null'); return r && r.endsAt > Date.now() ? r : null; } catch { return null; } }
function saveRest(r: Rest | null) { try { r ? localStorage.setItem(REST_KEY, JSON.stringify(r)) : localStorage.removeItem(REST_KEY); } catch { /* ignore */ } }

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i === 2 ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* ignore */ }
}

export default function LiveWorkout() {
  const nav = useNavigate();
  const toast = useToast();
  const sessions = useSessions();
  const settings = useSettings();
  const profile = useProfile();
  const s = sessions.find((x) => x.status === 'active');
  const [, tick] = useState(0);
  const [rest, setRestState] = useState<Rest | null>(loadRest);
  const [effort, setEffortState] = useState<Effort>(() => (localStorage.getItem(EFFORT_KEY) as Effort) || 'rpe');
  const [picker, setPicker] = useState(false);
  const [swapFor, setSwapFor] = useState<ExerciseLog | null>(null);
  const [exMenu, setExMenu] = useState<ExerciseLog | null>(null);
  const [setMenu, setSetMenu] = useState<{ ex: ExerciseLog; set: SetLog } | null>(null);
  const [showAnim, setShowAnim] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addCardio, setAddCardio] = useState(false);
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [machineFor, setMachineFor] = useState<ExerciseLog | null>(null);
  const [whyFor, setWhyFor] = useState<ExerciseLog | null>(null);
  const [hints, setHints] = useState<Record<string, NextSetAdvice & { applied: boolean }>>({});
  const [flash, setFlash] = useState<{ id: number; name: string; hit: RecordHit } | null>(null);
  const recovered = useRef(false);
  const units = settings.units;

  const setRest = (r: Rest | null) => { setRestState(r); saveRest(r); };
  const setEffort = (e: Effort) => { setEffortState(e); try { localStorage.setItem(EFFORT_KEY, e); } catch { /* ignore */ } };

  // Ripristino dopo chiusura improvvisa: se IndexedDB non ha la sessione attiva ma il backup sì
  useEffect(() => {
    if (recovered.current || s) return;
    recovered.current = true;
    const b = recoverBackup();
    if (b && !store.get('sessions', b.id)) { saveSession(b); toast('Allenamento ripristinato dopo una chiusura improvvisa', 'info'); }
  }, [s, toast]);

  // orologio
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  // schermo sempre acceso durante l'allenamento (dove supportato)
  useEffect(() => {
    let lock: any = null;
    const req = async () => { try { if (document.visibilityState === 'visible') lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* ignore */ } };
    req();
    document.addEventListener('visibilitychange', req);
    return () => { document.removeEventListener('visibilitychange', req); try { lock?.release(); } catch { /* ignore */ } };
  }, []);

  // fine recupero
  const restLeft = rest ? Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000)) : 0;
  useEffect(() => {
    if (rest && restLeft <= 0) {
      setRest(null);
      vibrate([200, 100, 200]);
      beep();
      try { if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') new Notification('Recupero terminato', { body: `Pronto per la prossima serie: ${rest.label}`, icon: './icon.svg', tag: 'rest' }); } catch { /* ignore */ }
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // record precedenti per esercizio (calcolati sullo storico, esclusa la sessione corrente)
  const prBefore = useMemo(() => {
    const m: Record<string, RecordBook> = {};
    if (!s) return m;
    for (const ex of s.exercises) if (!m[ex.exerciseId] && !ex.cardio) m[ex.exerciseId] = recordBook(sessions, ex.exerciseId, { beforeIso: s.startedAt, excludeId: s.id });
    return m;
  }, [s?.id, s?.exercises.map((e) => e.exerciseId).join(), sessions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // il riquadro del nuovo record sparisce da solo
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 4500); return () => clearTimeout(t); }, [flash]);
  const prevLogs = useMemo(() => {
    const m: Record<string, ExerciseLog | null> = {};
    if (!s) return m;
    for (const ex of s.exercises) if (!(ex.exerciseId in m)) m[ex.exerciseId] = lastPerformance(sessions, ex.exerciseId, s.id);
    return m;
  }, [s?.id, s?.exercises.length, sessions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) {
    return (
      <div className="player">
        <div className="page" style={{ paddingTop: 40 }}>
          <Empty icon={<Dumbbell />} title="Nessun allenamento in corso" text="Inizia un allenamento libero oppure scegli una scheda dalla sezione Allenamenti."
            action={<div className="row wrap" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => startSession(null)}><Play size={18} /> Allenamento libero</button>
              <Link to="/workouts" className="btn">Le mie schede</Link>
            </div>} />
        </div>
      </div>
    );
  }
  const session = s;
  const save = (patch: Partial<WorkoutSession>) => saveSession({ ...session, ...patch });
  const updateEx = (exUid: string, fn: (e: ExerciseLog) => ExerciseLog) => save({ exercises: session.exercises.map((e) => (e.uid === exUid ? fn(e) : e)) });
  const updateSet = (exUid: string, setUid: string, p: Partial<SetLog>) => updateEx(exUid, (e) => ({ ...e, sets: e.sets.map((x) => (x.uid === setUid ? { ...x, ...p } : x)) }));

  const paused = !!session.pausedAt;
  const elapsed = sessionDurationMs(session);
  const stats = sessionStats(session);
  const totalSets = session.exercises.reduce((a, e) => a + e.sets.length, 0);
  const cardioLogs = session.exercises.filter((e) => e.cardio);
  const cardioDoneMin = Math.round(cardioLogs.reduce((a, e) => a + (e.cardio!.done && e.cardio!.actual ? e.cardio!.actual.durationSec : timerElapsedMs(e.cardio!.timer)/1000), 0) / 60);
  const cardioPlannedMin = Math.round(cardioLogs.reduce((a, e) => a + e.cardio!.plan.durationMin, 0));
  const cardioDone = cardioLogs.filter((e) => e.cardio!.done || timerElapsedMs(e.cardio!.timer) >= 60000).length;
  const setCardio = (exUid: string, c: CardioLogState) => updateEx(exUid, (x) => ({ ...x, cardio: c }));
  // un solo timer cardio alla volta: avviarne uno mette in pausa gli altri
  const startCardio = (exUid: string) => save({ exercises: session.exercises.map((e) => (e.cardio ? { ...e, cardio: e.uid === exUid ? startCardioTimer(e.cardio) : { ...e.cardio, timer: pauseTimer(e.cardio.timer) } } : e)) });

  function togglePause() {
    if (paused) save({ pausedMs: session.pausedMs + (Date.now() - new Date(session.pausedAt!).getTime()), pausedAt: null });
    else {
      save({ pausedAt: new Date().toISOString(), exercises: session.exercises.map((e) => (e.cardio?.timer.running ? { ...e, cardio: { ...e.cardio, timer: pauseTimer(e.cardio.timer) } } : e)) });
      setRest(null);
    }
  }

  function toggleSet(ex: ExerciseLog, st: SetLog, idx: number) {
    const e = getExercise(ex.exerciseId);
    if (st.done) { updateSet(ex.uid, st.uid, { done: false, completedAt: null }); setHints(({ [ex.uid]: _, ...h }) => h); return; }
    const prev = prevLogs[ex.exerciseId]?.sets.filter((x) => x.done)[idx];
    let weight = st.weight, reps = st.reps;
    if (reps == null && ex.target?.aimReps != null && st.type !== 'warmup') reps = ex.target.aimReps;
    if (reps == null && prev?.reps != null) reps = prev.reps;
    if (weight == null && prev?.weight != null && e?.tracking === 'weight_reps') weight = prev.weight;
    if (reps == null) { toast(e?.tracking === 'time' ? 'Inserisci i secondi' : e?.tracking === 'cardio' ? 'Inserisci i minuti' : 'Inserisci le ripetizioni', 'error'); return; }
    if (e?.tracking === 'weight_reps' && weight == null) weight = 0;
    const doneSet: SetLog = { ...st, done: true, weight, reps, completedAt: new Date().toISOString() };
    // adattamento automatico delle serie successive (solo i carichi proposti dall'app, mai quelli scritti a mano)
    const advice = trainingPrefs(settings).liveAdjust ? adviseNextSet({ exerciseId: ex.exerciseId, done: doneSet, repMin: ex.repMin, repMax: ex.repMax, rir: ex.target?.rir ?? session.block?.rir ?? defaultRir(profile), units }) : null;
    const after = ex.sets.slice(idx + 1);
    const adjustable = after.filter((x) => !x.done && x.type !== 'warmup' && (x.auto || x.weight == null));
    const apply = !!advice && advice.change !== 'same' && adjustable.length > 0;
    updateEx(ex.uid, (x) => ({
      ...x,
      sets: x.sets.map((y) => (y.uid === st.uid ? doneSet : apply && adjustable.some((a) => a.uid === y.uid) ? { ...y, weight: advice!.weight, auto: true } : y)),
    }));
    if (advice && after.some((x) => !x.done)) setHints((h) => ({ ...h, [ex.uid]: { ...advice, applied: apply } }));
    // nuovo record durante la seduta
    const book = prBefore[ex.exerciseId];
    const hit = book ? mainHit(liveSetRecords(book, ex.sets.filter((x) => x.done), doneSet)) : null;
    if (hit && settings.notifications.prs !== false) { setFlash({ id: Date.now(), name: e?.name ?? '', hit }); vibrate([40, 60, 40, 60, 120]); }
    else vibrate(30);
    if (paused) return;
    const restSec = st.type === 'warmup' ? Math.min(60, ex.restSec) : ex.restSec;
    if (restSec > 0) setRest({ endsAt: Date.now() + restSec * 1000, total: restSec, label: e?.name ?? '' });
  }

  /** Record battuto dalla serie (per il badge), rispetto allo storico e alle serie precedenti della seduta. */
  function prOf(ex: ExerciseLog, st: SetLog, i: number): RecordHit | null {
    if (!st.done || st.type === 'warmup') return null;
    const b = prBefore[ex.exerciseId];
    if (!b) return null;
    return mainHit(liveSetRecords(b, ex.sets.slice(0, i).filter((x) => x.done), st));
  }
  const fw = (kg: number) => fmtW(kg, units);

  function addExercises(ids: string[]) {
    const add = ids.map((id) => exerciseLogFor(id, sessions, { restSec: settings.restDefaultSec, week: weekOfSession(session) }));
    save({ exercises: [...session.exercises, ...add] });
    toast(ids.length === 1 ? 'Esercizio aggiunto' : `${ids.length} esercizi aggiunti`);
  }
  function swapExercise(ex: ExerciseLog, newId: string) {
    const keep = ex.sets.filter((x) => x.done);
    const n = Math.max(1, ex.sets.length - keep.length);
    // il sostituto riceve il proprio obiettivo di carico (dallo storico di quell'esercizio)
    const fresh = exerciseLogFor(newId, sessions.filter((x) => x.id !== session.id), { sets: n, repMin: ex.repMin, repMax: ex.repMax, restSec: ex.restSec, week: weekOfSession(session) ? { ...weekOfSession(session)!, repShift: 0, extraSets: 0, setsFactor: 1 } : null });
    const replacement: ExerciseLog = { ...ex, exerciseId: newId, sets: fresh.sets, target: fresh.target ?? null };
    // le serie già completate restano registrate sull'esercizio originale
    const parts = keep.length ? [{ ...ex, uid: uid('el_'), sets: keep }, replacement] : [replacement];
    save({ exercises: session.exercises.flatMap((e) => (e.uid === ex.uid ? parts : [e])) });
    toast(`Sostituito con ${getExercise(newId)?.name}`);
  }
  function move(ex: ExerciseLog, d: number) {
    const list = [...session.exercises];
    const i = list.findIndex((e) => e.uid === ex.uid), j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save({ exercises: list });
  }

  async function finish() {
    setBusy(true);
    try {
      const ended = await finishSession(session);
      void disconnectFtms();
      setRest(null);
      nav(`/session/${ended.id}?done=1`, { replace: true });
    } catch (e: any) { toast(e?.message ?? 'Errore nel salvataggio', 'error'); } finally { setBusy(false); }
  }
  async function discard() {
    await discardSession(session);
    void disconnectFtms();
    setRest(null);
    toast('Allenamento annullato', 'info');
    nav('/workouts', { replace: true });
  }

  const pending = session.exercises.reduce((a, e) => a + e.sets.filter((x) => !x.done).length, 0);

  return (
    <div className="player">
      <div className="player-top">
        <div className="row-between" style={{ maxWidth: 760, margin: '0 auto' }}>
          <button className="icon-btn ghost" onClick={() => nav('/')} aria-label="Riduci: l’allenamento resta attivo"><Minimize2 size={20} /></button>
          <div className="center">
            <div className={`timer-big ${paused ? 'muted' : ''}`} aria-live="off">{formatDuration(elapsed)}</div>
            <div className="tiny muted">{paused ? 'In pausa' : [totalSets ? `${stats.sets}/${totalSets} serie · ${fmtN(toDisplayWeight(stats.volume, units) ?? 0)} ${units}` : '', cardioLogs.length ? `${cardioDoneMin}/${cardioPlannedMin} min cardio` : ''].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn" onClick={togglePause} aria-label={paused ? 'Riprendi allenamento' : 'Metti in pausa'}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
            <button className="btn sm primary" onClick={() => setFinishOpen(true)}><Flag size={15} /> Fine</button>
          </div>
        </div>
        {(totalSets > 0 || cardioLogs.length > 0) && (
          <div className="player-progress" role="progressbar" aria-label="Avanzamento allenamento" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(((stats.sets + cardioLogs.filter((c) => c.cardio?.done).length) / Math.max(1, totalSets + cardioLogs.length)) * 100)}>
            <i style={{ width: `${((stats.sets + cardioLogs.filter((c) => c.cardio?.done).length) / Math.max(1, totalSets + cardioLogs.length)) * 100}%` }} />
          </div>
        )}
      </div>

      <div className="page stack" style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="row-between">
          <input className="input" value={session.name} onChange={(e) => save({ name: e.target.value })} aria-label="Nome allenamento" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, background: 'transparent', border: 0, padding: 0, height: 36 }} />
          <button className="icon-btn ghost" onClick={() => setMenuOpen(true)} aria-label="Opzioni allenamento"><MoreHorizontal size={20} /></button>
        </div>
        {paused && <div className="banner warn"><Pause size={18} /><span>Allenamento in pausa: il tempo non viene conteggiato. <button className="link accent" style={{ background: 'none', border: 0, padding: 0, fontWeight: 700, cursor: 'pointer' }} onClick={togglePause}>Riprendi</button></span></div>}
        {session.block && (
          <div className={`block-banner ${session.block.kind}`} role="note">
            <CalendarRange size={18} />
            <span className="grow"><b>Settimana {session.block.week + 1} di {session.block.weeks} · {WEEK_LABEL[session.block.kind]}</b>
              <span className="tiny">{WEEK_HINT[session.block.kind]} Obiettivo: {session.block.rir} {session.block.rir === 1 ? 'ripetizione' : 'ripetizioni'} in riserva{session.block.load < 1 ? `, carichi −${Math.round((1 - session.block.load) * 100)}%` : ''}.</span></span>
          </div>
        )}

        {session.exercises.length === 0 && (
          <div className="card"><Empty icon={<Plus />} title="Aggiungi il primo esercizio" text="Scegli dalla libreria: vedrai animazione, serie precedenti e record. Oppure aggiungi un’attività cardio con timer." action={<div className="row wrap" style={{ justifyContent: 'center' }}><button className="btn primary" onClick={() => setPicker(true)}><Plus size={18} /> Aggiungi esercizio</button><button className="btn" onClick={() => setAddCardio(true)}><Bike size={18} /> Aggiungi cardio</button></div>} /></div>
        )}

        {session.exercises.map((ex) => {
          const e = getExercise(ex.exerciseId);
          if (!e) return null;
          if (ex.cardio) {
            return <CardioLive key={ex.uid} ex={ex as ExerciseLog & { cardio: CardioLogState }} profile={profile} sessionPaused={paused}
              onChange={(c) => setCardio(ex.uid, c)} onStart={() => startCardio(ex.uid)} onMenu={() => setExMenu(ex)} />;
          }
          const prev = prevLogs[ex.exerciseId];
          const prevDone = prev?.sets.filter((x) => x.done) ?? [];
          const doneN = ex.sets.filter((x) => x.done).length;
          const animOpen = showAnim === ex.uid;
          let normalIdx = 0;
          return (
            <section key={ex.uid} className={`card live-ex ${doneN === ex.sets.length && doneN > 0 ? 'complete' : ''}`} aria-label={e.name}>
              <span className="live-kind"><Dumbbell size={12} /> Forza</span>
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                <button className="ex-thumb live-thumb" style={{ border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setShowAnim(animOpen ? null : ex.uid)} aria-label={animOpen ? 'Nascondi animazione' : 'Mostra animazione'} aria-expanded={animOpen}>
                  <ExerciseVisual exerciseId={e.id} patternId={e.pattern} muscles={e.primary} className="thumb" label={e.name} />
                </button>
                <div className="grow" style={{ minWidth: 0 }}>
                  <Link to={`/exercises/${e.id}`} style={{ fontWeight: 700, fontSize: 16 }} className="ellipsis">{e.name}</Link>
                  <div className="tiny muted">{ex.sets.length} serie · {ex.repMin}{ex.repMax !== ex.repMin ? `–${ex.repMax}` : ''} {e.tracking === 'time' ? 's' : e.tracking === 'cardio' ? 'min' : 'rip.'} · recupero {formatClock(ex.restSec)}</div>
                  <div className="pips" aria-label={`${doneN} serie su ${ex.sets.length} completate`}>{ex.sets.map((x) => <i key={x.uid} className={x.done ? 'on' : ''} />)}<span>{doneN}/{ex.sets.length}</span></div>
                </div>
                <button className="icon-btn ghost" onClick={() => setExMenu(ex)} aria-label={`Opzioni ${e.name}`}><MoreHorizontal size={20} /></button>
              </div>

              {ex.target && <TargetLine t={ex.target} units={units} weighted={e.tracking === 'weight_reps'} unit={e.tracking === 'time' ? 's' : 'rip.'} onWhy={() => setWhyFor(ex)} />}

              {animOpen && <div style={{ marginTop: 12, maxWidth: 320, marginInline: 'auto' }}><ExerciseVisual exerciseId={e.id} patternId={e.pattern} muscles={e.primary} controls label={e.name} /></div>}

              <input className="input" style={{ marginTop: 10, height: 38, fontSize: 13.5 }} placeholder="Note (es. sensazioni, regolazioni macchina)" value={ex.notes ?? ''} onChange={(ev) => updateEx(ex.uid, (x) => ({ ...x, notes: ev.target.value }))} aria-label={`Note ${e.name}`} />

              <table className="set-table" style={{ marginTop: 6 }}>
                <thead>
                  <tr>
                    <th>Serie</th><th>Precedente</th>
                    {e.tracking === 'weight_reps' && <th>{units}</th>}
                    {e.tracking === 'reps' && <th>+{units}</th>}
                    <th>{e.tracking === 'time' ? 'Sec' : e.tracking === 'cardio' ? 'Min' : 'Rip'}</th>
                    {effort !== 'off' && e.tracking !== 'cardio' && <th>{effort === 'rpe' ? 'RPE' : 'RIR'}</th>}
                    <th><span className="sr-only">Completata</span><Check size={13} /></th>
                  </tr>
                </thead>
                <tbody>
                  {ex.sets.map((st, i) => {
                    if (st.type !== 'warmup') normalIdx++;
                    const p = prevDone[i];
                    const pr = prOf(ex, st, i);
                    const label = st.type === 'warmup' ? 'R' : st.type === 'drop' ? 'D' : st.type === 'failure' ? 'C' : String(normalIdx);
                    return (
                      <tr key={st.uid} className={`set-row ${st.done ? 'done' : ''}`}>
                        <td><button className={`idx ${st.type === 'warmup' ? 'warmup' : ''}`} onClick={() => setSetMenu({ ex, set: st })} aria-label={`Serie ${label}: tipo e opzioni`}>{label}</button></td>
                        <td>
                          <button className="prev" style={{ background: 'none', border: 0, cursor: p ? 'pointer' : 'default', padding: 0 }} disabled={!p}
                            onClick={() => p && updateSet(ex.uid, st.uid, { weight: p.weight, reps: p.reps })} aria-label={p ? 'Copia i valori precedenti' : 'Nessun dato precedente'}>
                            {p ? (e.tracking === 'weight_reps' ? `${toDisplayWeight(p.weight, units) ?? 0}×${p.reps ?? 0}` : `${p.reps ?? 0}${e.tracking === 'time' ? 's' : ''}`) : '–'}
                          </button>
                          {pr && <div><span className="pr-badge" title={recordValueText(pr, fw)}><Trophy size={10} /> {pr.kind === 'rm' ? `${pr.reps}RM` : pr.kind === 'e1rm' ? '1RM' : 'PR'}</span></div>}
                        </td>
                        {(e.tracking === 'weight_reps' || e.tracking === 'reps') && (
                          <td><NumberInput className={`set-input ${st.auto && !st.done ? 'auto' : ''}`} value={toDisplayWeight(st.weight, units)} min={0} max={1000} placeholder={p?.weight != null ? String(toDisplayWeight(p.weight, units)) : '0'} ariaLabel={`Carico serie ${label}${st.auto && !st.done ? ' (proposto dall’app)' : ''}`} onChange={(v) => updateSet(ex.uid, st.uid, { weight: fromDisplayWeight(v, units), auto: false })} /></td>
                        )}
                        <td><NumberInput className="set-input" value={st.reps} min={0} max={e.tracking === 'time' ? 3600 : 500} placeholder={st.type !== 'warmup' && ex.target?.aimReps != null ? String(ex.target.aimReps) : p?.reps != null ? String(p.reps) : `${ex.repMin}`} ariaLabel={`Ripetizioni serie ${label}`} onChange={(v) => updateSet(ex.uid, st.uid, { reps: v == null ? null : Math.round(v) })} /></td>
                        {effort !== 'off' && e.tracking !== 'cardio' && (
                          <td><NumberInput className="set-input sm" value={effort === 'rpe' ? st.rpe : st.rir} min={0} max={effort === 'rpe' ? 10 : 10} placeholder="–" ariaLabel={`${effort.toUpperCase()} serie ${label}`} onChange={(v) => updateSet(ex.uid, st.uid, effort === 'rpe' ? { rpe: v } : { rir: v })} /></td>
                        )}
                        <td><button className={`set-check ${st.done ? 'on' : ''}`} onClick={() => toggleSet(ex, st, i)} aria-pressed={st.done} aria-label={st.done ? `Serie ${label} completata, tocca per annullare` : `Completa serie ${label}`}><Check size={20} strokeWidth={3} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hints[ex.uid] && ex.sets.some((x) => !x.done) && (
                <div className={`next-set ${hints[ex.uid].change}`} role="status">
                  {hints[ex.uid].change === 'up' ? <TrendingUp size={15} /> : hints[ex.uid].change === 'down' ? <TrendingDown size={15} /> : <Minus size={15} />}
                  <span className="grow">{hints[ex.uid].reason}{hints[ex.uid].applied ? ' Carico aggiornato nelle prossime serie.' : ''}</span>
                </div>
              )}
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <button className="btn sm grow" onClick={() => updateEx(ex.uid, (x) => {
                  const last = x.sets[x.sets.length - 1];
                  return { ...x, sets: [...x.sets, { uid: uid('s_'), weight: last?.weight ?? null, reps: null, rpe: null, rir: null, done: false, type: 'normal' }] };
                })}><Plus size={15} /> Aggiungi serie</button>
                <button className="btn sm" onClick={() => setRest({ endsAt: Date.now() + ex.restSec * 1000, total: ex.restSec, label: e.name })} aria-label="Avvia recupero manualmente">{formatClock(ex.restSec)}</button>
              </div>
            </section>
          );
        })}

        {session.exercises.length > 0 && (
          <div className="grid-2">
            <button className="btn block lg" onClick={() => setPicker(true)}><Plus size={18} /> Esercizio</button>
            <button className="btn block lg" onClick={() => setAddCardio(true)}><Bike size={18} /> Cardio</button>
          </div>
        )}
        <textarea className="textarea" placeholder="Note sull’allenamento" value={session.notes ?? ''} onChange={(e) => save({ notes: e.target.value })} aria-label="Note sull’allenamento" />
        <button className="btn danger block" onClick={() => setDiscardOpen(true)}><Trash2 size={16} /> Annulla allenamento</button>
      </div>

      {rest && restLeft > 0 && (
        <div className="rest-bar" role="timer" aria-label="Timer di recupero">
          <div className="row-between">
            <div><div className="tiny muted">Recupero · {rest.label}</div><div className="timer-big">{formatClock(restLeft)}</div></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => setRest({ ...rest, endsAt: Math.max(Date.now() + 1000, rest.endsAt - 15000) })} aria-label="Togli 15 secondi">−15</button>
              <button className="btn sm" onClick={() => setRest({ ...rest, endsAt: rest.endsAt + 15000, total: rest.total + 15 })} aria-label="Aggiungi 15 secondi">+15</button>
              <button className="btn sm primary" onClick={() => setRest(null)}><SkipForward size={15} /> Salta</button>
            </div>
          </div>
          <Bar value={restLeft} max={rest.total} />
        </div>
      )}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercises} multi />
      <AddCardioSheet open={addCardio} onClose={() => setAddCardio(false)} profile={profile} onAdd={(exId, plan) => { save({ exercises: [...session.exercises, { uid: uid('el_'), exerciseId: exId, restSec: 0, repMin: Math.round(plan.durationMin), repMax: Math.round(plan.durationMin), notes: '', sets: [], cardio: logStateFor(plan) }] }); toast('Cardio aggiunto'); }} />
      {(() => {
        const ex = planFor ? session.exercises.find((x) => x.uid === planFor && x.cardio) : undefined;
        return (
          <Sheet open={!!ex} onClose={() => setPlanFor(null)} title="Parametri previsti" wide footer={<button className="btn primary block" onClick={() => setPlanFor(null)}>Fatto</button>}>
            {ex?.cardio && <CardioPlanEditor plan={ex.cardio.plan} exerciseId={ex.exerciseId} profile={profile} onChange={(plan) => setCardio(ex.uid, { ...ex.cardio!, plan })} />}
          </Sheet>
        );
      })()}
      <MachinePicker open={!!machineFor} onClose={() => setMachineFor(null)} profile={profile} current={machineFor?.cardio?.plan.machine}
        onPick={(m) => {
          const ex = machineFor; setMachineFor(null);
          if (!ex?.cardio || !profile) return;
          const c = convertPlan(ex.cardio.plan, m, ex.exerciseId, profile);
          updateEx(ex.uid, (x) => ({ ...x, exerciseId: c.exerciseId, cardio: { ...x.cardio!, plan: c.plan } }));
          toast(`Macchina cambiata: ${getExercise(c.exerciseId)?.name}`);
        }} />

      {flash && (
        <div key={flash.id} className="pr-flash" role="status" aria-live="polite" onClick={() => setFlash(null)}>
          <span className="pr-flash-ic"><Trophy size={22} /></span>
          <span className="grow"><b>Nuovo record!</b><span className="small">{flash.name}: {recordValueText(flash.hit, fw)}{recordDeltaText(flash.hit, fw) ? ` · ${recordDeltaText(flash.hit, fw)}` : ''}</span></span>
        </div>
      )}

      <Sheet open={!!whyFor} onClose={() => setWhyFor(null)} title={whyFor ? `Obiettivo di oggi · ${getExercise(whyFor.exerciseId)?.name ?? ''}` : ''}>
        {whyFor?.target && (() => {
          const t = whyFor.target!;
          const prevSets = prevLogs[whyFor.exerciseId]?.sets.filter((x) => x.done && x.type !== 'warmup') ?? [];
          const weighted = getExercise(whyFor.exerciseId)?.tracking === 'weight_reps';
          return (
            <div className="stack">
              <div className="target-hero">
                <span className="th-v">{t.weight != null ? fmtW(t.weight, units) : '—'}</span>
                <span className="th-l">{t.aimReps ? `${t.aimReps} ripetizioni per serie` : `${t.repMin}–${t.repMax} ${weighted || getExercise(whyFor.exerciseId)?.tracking === 'reps' ? 'ripetizioni' : 'secondi'}`}{t.rir != null ? ` · ${t.rir} in riserva` : ''}</span>
              </div>
              <p className="small text-2">{t.reason}</p>
              {prevSets.length > 0 && (
                <div className="field"><label>Ultima volta</label>
                  <div className="row wrap" style={{ gap: 6 }}>{prevSets.map((x) => <span key={x.uid} className="pill">{weighted ? `${toDisplayWeight(x.weight, units) ?? 0} × ${x.reps ?? 0}` : `${x.reps ?? 0}`}{x.rir != null ? ` · RIR ${x.rir}` : x.rpe != null ? ` · RPE ${x.rpe}` : ''}</span>)}</div>
                </div>
              )}
              <div className="hint">
                <b>Come funziona.</b> Doppia progressione: resti sullo stesso carico aggiungendo ripetizioni finché tutte le serie arrivano a {t.repMax}, poi il carico sale del passo minimo dell’attrezzo. Se registri RPE o RIR, l’app adatta anche le serie successive di oggi in base alla fatica. Puoi sempre cambiare il carico a mano: i valori che scrivi tu non vengono toccati.
              </div>
              <Link to="/settings" className="small accent">Impostazioni della progressione</Link>
            </div>
          );
        })()}
      </Sheet>

      {/* Menu esercizio */}
      <Sheet open={!!exMenu} onClose={() => setExMenu(null)} title={exMenu ? getExercise(exMenu.exerciseId)?.name : ''}>
        {exMenu && exMenu.cardio && (
          <div className="settings-group">
            <button className="list-item" onClick={() => { setPlanFor(exMenu.uid); setExMenu(null); }}><span className="li-icon"><Pencil size={18} /></span><span className="li-title">Modifica parametri previsti</span></button>
            <button className="list-item" onClick={() => { setMachineFor(exMenu); setExMenu(null); }}><span className="li-icon"><Repeat size={18} /></span><span className="li-title">Cambia macchina</span></button>
            <button className="list-item" onClick={() => { move(exMenu, -1); setExMenu(null); }}><span className="li-icon"><ArrowUp size={18} /></span><span className="li-title">Sposta su</span></button>
            <button className="list-item" onClick={() => { move(exMenu, 1); setExMenu(null); }}><span className="li-icon"><ArrowDown size={18} /></span><span className="li-title">Sposta giù</span></button>
            <button className="list-item" onClick={() => { save({ exercises: session.exercises.filter((x) => x.uid !== exMenu.uid) }); setExMenu(null); toast('Attività rimossa'); }}><span className="li-icon"><Trash2 size={18} color="var(--danger)" /></span><span className="li-title danger-text">Rimuovi attività</span></button>
          </div>
        )}
        {exMenu && !exMenu.cardio && (
          <div className="stack">
            <div className="field"><label>Recupero tra le serie</label>
              <div className="row wrap" style={{ gap: 6 }}>
                {[30, 45, 60, 90, 120, 150, 180, 240].map((sec) => <button key={sec} className={`chip ${exMenu.restSec === sec ? 'on' : ''}`} onClick={() => { updateEx(exMenu.uid, (x) => ({ ...x, restSec: sec })); setExMenu({ ...exMenu, restSec: sec }); }}>{formatClock(sec)}</button>)}
              </div>
            </div>
            <div className="settings-group">
              <button className="list-item" onClick={() => { setSwapFor(exMenu); setExMenu(null); }}><span className="li-icon"><Repeat size={18} /></span><span className="li-title">Sostituisci esercizio</span></button>
              <Link className="list-item" to={`/exercises/${exMenu.exerciseId}`}><span className="li-icon"><Info size={18} /></span><span className="li-title">Tecnica di esecuzione</span></Link>
              <button className="list-item" onClick={() => { move(exMenu, -1); setExMenu(null); }}><span className="li-icon"><ArrowUp size={18} /></span><span className="li-title">Sposta su</span></button>
              <button className="list-item" onClick={() => { move(exMenu, 1); setExMenu(null); }}><span className="li-icon"><ArrowDown size={18} /></span><span className="li-title">Sposta giù</span></button>
              <button className="list-item" onClick={() => { save({ exercises: session.exercises.filter((x) => x.uid !== exMenu.uid) }); setExMenu(null); toast('Esercizio rimosso'); }}><span className="li-icon"><Trash2 size={18} color="var(--danger)" /></span><span className="li-title danger-text">Rimuovi esercizio</span></button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Menu serie */}
      <Sheet open={!!setMenu} onClose={() => setSetMenu(null)} title="Tipo di serie">
        {setMenu && (
          <div className="stack">
            <div className="option-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {([['normal', 'Normale', 'Serie allenante'], ['warmup', 'Riscaldamento', 'Non conta per i record'], ['drop', 'Drop set', 'Carico ridotto senza pausa'], ['failure', 'Cedimento', 'Fino all’ultima ripetizione']] as const).map(([v, l, d]) => (
                <button key={v} className={`option ${(setMenu.set.type ?? 'normal') === v ? 'on' : ''}`} onClick={() => { updateSet(setMenu.ex.uid, setMenu.set.uid, { type: v }); setSetMenu(null); }}>
                  <span className="col" style={{ gap: 2 }}><span className="o-title">{l}</span><span className="o-desc">{d}</span></span>
                </button>
              ))}
            </div>
            <button className="btn danger block" disabled={setMenu.ex.sets.length <= 1} onClick={() => { updateEx(setMenu.ex.uid, (x) => ({ ...x, sets: x.sets.filter((y) => y.uid !== setMenu.set.uid) })); setSetMenu(null); }}><Trash2 size={16} /> Elimina serie</button>
          </div>
        )}
      </Sheet>

      {/* Sostituzione */}
      <SwapSheet ex={swapFor} onClose={() => setSwapFor(null)} profileSubs={(id) => (profile ? substitutes(id, profile) : [])} onPick={(id) => { if (swapFor) swapExercise(swapFor, id); setSwapFor(null); }} />

      {/* Menu allenamento */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Opzioni allenamento">
        <div className="stack">
          <div className="field"><label>Intensità percepita da registrare</label>
            <Segmented label="Intensità" value={effort} onChange={setEffort} options={[{ value: 'rpe', label: 'RPE' }, { value: 'rir', label: 'RIR' }, { value: 'off', label: 'Nessuna' }]} />
            <p className="hint">RPE: sforzo da 1 a 10. RIR: ripetizioni che avresti ancora potuto fare.</p>
          </div>
          <div className="settings-group">
            <button className="list-item" onClick={() => { togglePause(); setMenuOpen(false); }}><span className="li-icon">{paused ? <Play size={18} /> : <Pause size={18} />}</span><span className="li-title">{paused ? 'Riprendi' : 'Metti in pausa'}</span></button>
            <button className="list-item" onClick={() => { setMenuOpen(false); setPicker(true); }}><span className="li-icon"><Plus size={18} /></span><span className="li-title">Aggiungi esercizio</span></button>
            <button className="list-item" onClick={() => { setMenuOpen(false); setAddCardio(true); }}><span className="li-icon"><Bike size={18} /></span><span className="li-title">Aggiungi cardio</span></button>
            <button className="list-item" onClick={() => { setMenuOpen(false); setDiscardOpen(true); }}><span className="li-icon"><X size={18} color="var(--danger)" /></span><span className="li-title danger-text">Annulla allenamento</span></button>
          </div>
        </div>
      </Sheet>

      {/* Conclusione */}
      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title="Concludere l’allenamento?"
        footer={stats.sets > 0 || cardioDone > 0
          ? <><button className="btn grow" onClick={() => setFinishOpen(false)}>Continua</button><button className="btn primary grow" disabled={busy} onClick={finish}><Flag size={16} /> Concludi e salva</button></>
          : <><button className="btn grow" onClick={() => setFinishOpen(false)}>Continua</button><button className="btn danger grow" onClick={discard}>Annulla allenamento</button></>}>
        <div className="stack-sm">
          <div className="grid-3">
            <div className="stat-tile"><div className="stat"><span className="v">{formatDuration(elapsed)}</span><span className="l">durata</span></div></div>
            <div className="stat-tile"><div className="stat"><span className="v">{stats.sets}</span><span className="l">serie</span></div></div>
            <div className="stat-tile"><div className="stat"><span className="v">{fmtW(stats.volume, units).replace(` ${units}`, '')}</span><span className="l">volume {units}</span></div></div>
          </div>
          {cardioLogs.length > 0 && <p className="small text-2"><Bike size={14} style={{ verticalAlign: -2 }} /> Cardio: {cardioDone}/{cardioLogs.length} attività, {cardioDoneMin} min svolti su {cardioPlannedMin} previsti.{cardioLogs.some((e) => !e.cardio!.done && timerElapsedMs(e.cardio!.timer) >= 60000) ? ' Le attività non terminate vengono salvate con il tempo svolto e i parametri previsti.' : ''}</p>}
          {stats.sets === 0 && cardioDone === 0 ? <p className="small text-2">Non hai completato nessuna serie: non c’è nulla da salvare. Puoi continuare o annullare l’allenamento.</p>
            : stats.sets === 0 ? null : pending > 0 ? <p className="small text-2"><StickyNote size={14} style={{ verticalAlign: -2 }} /> {pending} serie non completate verranno rimosse dal riepilogo (quelle con dati inseriti restano visibili ma non conteggiate).</p>
              : <p className="small text-2">Tutte le serie completate. Ottimo lavoro!</p>}
        </div>
      </Sheet>
      <Confirm open={discardOpen} onClose={() => setDiscardOpen(false)} danger confirmLabel="Annulla allenamento" title="Annullare l’allenamento?" body="Tutti i dati di questa sessione verranno eliminati. L’operazione non è reversibile." onConfirm={discard} />
    </div>
  );
}

function SwapSheet({ ex, onClose, onPick, profileSubs }: { ex: ExerciseLog | null; onClose: () => void; onPick: (id: string) => void; profileSubs: (id: string) => Exercise[] }) {
  const [all, setAll] = useState(false);
  const subs = ex ? profileSubs(ex.exerciseId) : [];
  return (
    <>
      <Sheet open={!!ex && !all} onClose={onClose} title="Sostituisci esercizio" wide>
        {ex && (
          <div className="stack-sm">
            <p className="small text-2">Alternative per <b>{getExercise(ex.exerciseId)?.name}</b> con la tua attrezzatura. Le serie già completate restano registrate.</p>
            {subs.map((e) => <ExerciseRow key={e.id} e={e} onClick={() => onPick(e.id)} right={<Repeat size={17} className="muted" />} />)}
            <button className="btn block" onClick={() => setAll(true)}><RotateCcw size={16} /> Cerca nella libreria completa</button>
          </div>
        )}
      </Sheet>
      <ExercisePicker open={!!ex && all} onClose={() => { setAll(false); onClose(); }} onPick={(ids) => { setAll(false); onPick(ids[0]); }} title="Scegli il sostituto" />
    </>
  );
}

/** Parametri della settimana del programma registrati nella seduta (per esercizi aggiunti o sostituiti). */
function weekOfSession(s: WorkoutSession) {
  const b = s.block;
  return b ? { kind: b.kind, rir: b.rir, load: b.load, extraSets: 0, setsFactor: b.kind === 'deload' ? 0.6 : 1, repShift: 0 } : null;
}

const TARGET_TONE: Record<LoadTarget['kind'], string> = { start: 'info', increase: 'up', reps: 'same', hold: 'same', decrease: 'down', deload: 'deload', convert: 'info' };

/** Riga "Obiettivo di oggi" proposta dalla progressione automatica. */
function TargetLine({ t, units, weighted, unit, onWhy }: { t: LoadTarget; units: 'kg' | 'lb'; weighted: boolean; unit: string; onWhy: () => void }) {
  const delta = targetDelta(t, units);
  const main = weighted && t.weight != null ? `${fmtW(t.weight, units)} × ${t.aimReps ?? `${t.repMin}–${t.repMax}`}` : t.aimReps ? `${t.aimReps} ${unit}` : `${t.repMin}–${t.repMax} ${unit}`;
  return (
    <button type="button" className={`target-line ${TARGET_TONE[t.kind]}`} onClick={onWhy} aria-label={`Obiettivo di oggi: ${main}. Tocca per sapere perché`}>
      {t.kind === 'start' ? <Sparkles size={15} /> : <Target size={15} />}
      <span className="grow ellipsis"><b>{t.kind === 'start' ? 'Prima volta' : 'Oggi'}</b> {t.kind === 'start' && t.weight == null ? `${t.repMin}–${t.repMax} ${unit}` : main}{t.rir != null ? ` · RIR ${t.rir}` : ''}</span>
      {delta && <span className="tl-delta">{delta}</span>}
      <Info size={14} className="muted" />
    </button>
  );
}
