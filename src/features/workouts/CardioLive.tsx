/**
 * Attività cardio nella modalità allenamento: timer (avvia, pausa, riprendi, termina),
 * fasi degli intervalli con avviso a ogni cambio, registrazione dei valori effettivi.
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, Square, MoreHorizontal, Pencil, HeartPulse, Flame, Route, Timer, CheckCircle2, ChevronRight } from 'lucide-react';
import { Bar, NumberInput, Segmented, Sheet } from '@/components/ui';
import { getExercise } from '@/data/exercises';
import {
  INTENSITY_INFO, MACHINE_INFO, PHASE_LABEL, actualFromPlan, estimateActualKcal, expandPhases, phaseAt, phaseParams, planDurationSec, planSummary,
  startTimer, pauseTimer, timerElapsedMs,
} from '@/lib/cardio';
import { formatClock, fmtN, round, vibrate } from '@/lib/util';
import type { CardioActual, CardioIntensity, CardioLogState, ExerciseLog, Profile } from '@/lib/types';
import { CardioIcon, CardioPlanLines } from './cardio-ui';

function tone(high = false) {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = high ? 1046 : 784;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.32);
    setTimeout(() => ctx.close(), 800);
  } catch { /* ignore */ }
}

export function CardioLive({ ex, profile, onChange, onStart, onMenu, sessionPaused }: {
  ex: ExerciseLog & { cardio: CardioLogState }; profile?: Profile; sessionPaused: boolean;
  onChange: (c: CardioLogState) => void; onStart: () => void; onMenu: () => void;
}) {
  const c = ex.cardio;
  const e = getExercise(ex.exerciseId);
  const plan = c.plan;
  const phases = expandPhases(plan);
  const total = planDurationSec(plan);
  const elapsedSec = Math.floor(timerElapsedMs(c.timer) / 1000);
  const pos = phaseAt(phases, elapsedSec);
  const started = c.timer.running || c.timer.accumulatedMs > 0;
  const [result, setResult] = useState<CardioActual | null>(null);
  const lastIdx = useRef<number | null>(null);
  const reached = useRef(false);

  // avviso sonoro e vibrazione a ogni cambio di fase e al raggiungimento della durata prevista
  useEffect(() => {
    if (!c.timer.running) { lastIdx.current = pos.index; return; }
    if (lastIdx.current !== null && lastIdx.current !== pos.index && !pos.finished) { vibrate([120, 60, 120]); tone(pos.phase.kind === 'work'); }
    lastIdx.current = pos.index;
    if (pos.finished && !reached.current) { reached.current = true; vibrate([200, 100, 200, 100, 200]); tone(true); }
  });

  const pause = () => onChange({ ...c, timer: pauseTimer(c.timer) });
  function openResult() {
    const t = pauseTimer(c.timer);
    if (c.timer.running) onChange({ ...c, timer: t });
    const base = c.actual ?? actualFromPlan(plan, timerElapsedMs(t) / 1000, profile?.weightKg ?? 0);
    setResult(base);
  }

  const info = MACHINE_INFO[plan.machine];
  const next = phases[pos.index + 1];

  return (
    <section className="card cardio-card" style={{ padding: 14 }} aria-label={e?.name}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <CardioIcon machine={plan.machine} play={c.timer.running} size={56} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}><Link to={`/exercises/${ex.exerciseId}`} style={{ fontWeight: 700, fontSize: 16 }} className="ellipsis">{e?.name ?? info.label}</Link><span className="pill blue">Cardio</span></div>
          <div className="tiny muted">{planSummary(plan)}</div>
          {plan.hrMin && plan.hrMax ? <div className="tiny" style={{ color: 'var(--danger)', marginTop: 2 }}><HeartPulse size={11} style={{ verticalAlign: -1 }} /> FC obiettivo {plan.hrMin}–{plan.hrMax} bpm</div> : null}
        </div>
        <button className="icon-btn ghost" onClick={onMenu} aria-label={`Opzioni ${e?.name ?? ''}`}><MoreHorizontal size={20} /></button>
      </div>

      {c.done && c.actual ? (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 6, color: 'var(--success)', fontWeight: 700 }}><CheckCircle2 size={18} /> Attività completata</div>
          <PlannedVsActual plan={c} />
          <button className="btn sm" onClick={() => setResult(c.actual!)}><Pencil size={15} /> Modifica risultati</button>
        </div>
      ) : (
        <>
          <div className="row-between" style={{ marginTop: 12, alignItems: 'flex-end' }}>
            <div>
              <div className="tiny muted">Tempo svolto</div>
              <div className={`cardio-timer ${c.timer.running ? '' : 'muted'}`} role="timer" aria-label="Tempo svolto">{formatClock(elapsedSec)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="tiny muted">Previsti</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{formatClock(total)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}><Bar value={Math.min(elapsedSec, total)} max={Math.max(1, total)} color="var(--blue)" /></div>
          {pos.finished && started && <div className="banner" style={{ marginTop: 8 }}><CheckCircle2 size={18} /><span>Durata prevista raggiunta. Puoi continuare o premere <b>Termina</b> per registrare i valori.</span></div>}

          {plan.mode === 'intervals' ? (
            <>
              {!pos.finished && (
                <div className="cardio-now" aria-live="polite">
                  <div className="row-between">
                    <div style={{ minWidth: 0 }}>
                      <div className="tiny muted">{PHASE_LABEL[pos.phase.kind]} · fase {pos.index + 1} di {phases.length}</div>
                      <div style={{ fontWeight: 700 }} className="ellipsis">{pos.phase.label}</div>
                      <div className="small text-2">{[...phaseParams(pos.phase, plan.machine, plan.resistanceMax), INTENSITY_INFO[pos.phase.intensity].label.toLowerCase()].join(' · ')}</div>
                    </div>
                    <div className="big" aria-label="Tempo rimanente della fase">{formatClock(pos.phaseRemaining)}</div>
                  </div>
                  {next && <div className="tiny muted row" style={{ gap: 4, marginTop: 6 }}><ChevronRight size={12} /> Poi: {next.label} · {formatClock(next.durationSec)} · {phaseParams(next, plan.machine, plan.resistanceMax).join(' · ') || INTENSITY_INFO[next.intensity].label.toLowerCase()}</div>}
                </div>
              )}
              <div className="phase-list" aria-label="Fasi dell’allenamento">
                {phases.map((p, i) => (
                  <div key={p.uid} className={`phase-row ${i === pos.index && started && !pos.finished ? 'now' : i < pos.index || pos.finished ? (started ? 'past' : '') : ''}`}>
                    <span className={`k ${p.kind}`} aria-hidden />
                    <span className="grow ellipsis">{p.label}</span>
                    <span className="tiny muted">{phaseParams(p, plan.machine, plan.resistanceMax).join(' · ')}</span>
                    <span className="num" style={{ width: 44, textAlign: 'right' }}>{formatClock(p.durationSec)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="cardio-now"><CardioPlanLines plan={plan} /></div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            {!c.timer.running
              ? <button className="btn primary grow" onClick={onStart} disabled={sessionPaused}><Play size={17} fill="currentColor" /> {started ? 'Riprendi' : 'Avvia'}</button>
              : <button className="btn grow" onClick={pause}><Pause size={17} /> Pausa</button>}
            <button className="btn grow" onClick={openResult}><Square size={15} /> {started ? 'Termina' : 'Registra senza timer'}</button>
          </div>
          {sessionPaused && <p className="tiny muted" style={{ marginTop: 6 }}>Allenamento in pausa: riprendilo per avviare il timer.</p>}
        </>
      )}

      {result && (
        <ResultSheet key={String(!!c.actual)} initial={result} c={c} profile={profile} onClose={() => setResult(null)}
          onSave={(a) => { onChange({ ...c, timer: pauseTimer(c.timer), actual: a, done: true }); setResult(null); }}
          onReopen={c.done ? () => { onChange({ ...c, done: false, actual: null }); setResult(null); } : undefined} />
      )}
    </section>
  );
}

export function PlannedVsActual({ plan: c }: { plan: CardioLogState }) {
  const a = c.actual!;
  const p = c.plan;
  const info = MACHINE_INFO[p.machine];
  const phases = expandPhases(p);
  const avg = (k: 'speedKmh' | 'inclinePct' | 'resistance' | 'rpm') => {
    const v = phases.filter((x) => x[k] != null); const t = v.reduce((s, x) => s + x.durationSec, 0);
    return t ? round(v.reduce((s, x) => s + (x[k] as number) * x.durationSec, 0) / t, 1) : null;
  };
  const rows: [string, string, string][] = [['Durata', `${fmtN(planDurationSec(p) / 60, 1)} min`, `${fmtN(a.durationSec / 60, 1)} min`]];
  if (info.speed) rows.push(['Velocità', avg('speedKmh') != null ? `${fmtN(avg('speedKmh')!, 1)} km/h` : '–', a.speedKmh != null ? `${fmtN(a.speedKmh, 1)} km/h` : '–']);
  if (info.incline) rows.push(['Pendenza', avg('inclinePct') != null ? `${fmtN(avg('inclinePct')!, 1)}%` : '–', a.inclinePct != null ? `${fmtN(a.inclinePct, 1)}%` : '–']);
  if (info.resistance) rows.push(['Resistenza', avg('resistance') != null ? `${fmtN(avg('resistance')!, 1)}` : '–', a.resistance != null ? `${fmtN(a.resistance, 1)}` : '–']);
  if (info.rpm) rows.push([info.rpmLabel, avg('rpm') != null ? `${Math.round(avg('rpm')!)}` : '–', a.rpm != null ? `${Math.round(a.rpm)}` : '–']);
  rows.push(['Intensità', INTENSITY_INFO[p.intensity].label, INTENSITY_INFO[a.intensity ?? p.intensity].label]);
  return (
    <div>
      <div className="compare">
        <span className="h" /> <span className="h">Previsto</span><span className="h">Effettivo</span>
        {rows.map(([l, x, y]) => <Fragment key={l}><span className="muted">{l}</span><span>{x}</span><b>{y}</b></Fragment>)}
      </div>
      <div className="row wrap small text-2" style={{ gap: 12, marginTop: 8 }}>
        {a.distanceKm != null && <span className="row" style={{ gap: 4 }}><Route size={14} /> {fmtN(a.distanceKm, 2)} km</span>}
        {a.avgHr != null && <span className="row" style={{ gap: 4 }}><HeartPulse size={14} /> {a.avgHr} bpm</span>}
        {a.kcal != null && <span className="row" style={{ gap: 4 }}><Flame size={14} /> ~{a.kcal} kcal (stima)</span>}
      </div>
      {a.notes && <p className="tiny text-2" style={{ marginTop: 4 }}>📝 {a.notes}</p>}
    </div>
  );
}

function ResultSheet({ initial, c, profile, onClose, onSave, onReopen }: { initial: CardioActual; c: CardioLogState; profile?: Profile; onClose: () => void; onSave: (a: CardioActual) => void; onReopen?: () => void }) {
  const [a, setA] = useState<CardioActual>(initial);
  const [kcalTouched, setKcalTouched] = useState(false);
  const info = MACHINE_INFO[c.plan.machine];
  const min = Math.floor(a.durationSec / 60), sec = a.durationSec % 60;
  const set = (x: Partial<CardioActual>) => setA((prev) => {
    const n = { ...prev, ...x };
    // distanza ⇄ velocità coerenti con la durata reale
    if (info.speed && ('speedKmh' in x || 'durationSec' in x) && n.speedKmh && !('distanceKm' in x)) n.distanceKm = round((n.speedKmh * n.durationSec) / 3600, 2);
    if (info.speed && 'distanceKm' in x && n.distanceKm && n.durationSec) n.speedKmh = round(n.distanceKm / (n.durationSec / 3600), 1);
    return n;
  });
  const est = estimateActualKcal(c.plan.machine, a, c.plan, profile?.weightKg ?? 0);
  const valid = a.durationSec > 0 && a.durationSec <= 6 * 3600;
  return (
    <Sheet open onClose={onClose} title="Valori effettivi" footer={<>
      {onReopen && <button className="btn grow" onClick={onReopen}>Riapri attività</button>}
      <button className="btn primary grow" disabled={!valid} onClick={() => onSave({ ...a, kcal: kcalTouched ? a.kcal ?? null : est, completedAt: a.completedAt || new Date().toISOString() })}><CheckCircle2 size={16} /> Salva risultato</button>
    </>}>
      <div className="stack-sm">
        <p className="small text-2">Registra quello che hai fatto davvero, anche se diverso dal previsto ({planSummary(c.plan)}).</p>
        <div className="grid-2">
          <div className="field"><label><Timer size={13} /> Minuti</label><NumberInput value={min} min={0} max={360} ariaLabel="Minuti effettivi" onChange={(v) => set({ durationSec: Math.max(0, Math.round(v ?? 0)) * 60 + sec })} /></div>
          <div className="field"><label>Secondi</label><NumberInput value={sec} min={0} max={59} ariaLabel="Secondi effettivi" onChange={(v) => set({ durationSec: min * 60 + Math.min(59, Math.max(0, Math.round(v ?? 0))) })} /></div>
          {info.speed && <div className="field"><label>Velocità media</label><NumberInput value={a.speedKmh} min={0} max={30} suffix="km/h" ariaLabel="Velocità effettiva" onChange={(v) => set({ speedKmh: v })} /></div>}
          {info.incline && <div className="field"><label>Pendenza media</label><NumberInput value={a.inclinePct} min={-5} max={40} suffix="%" ariaLabel="Pendenza effettiva" onChange={(v) => set({ inclinePct: v })} /></div>}
          {info.resistance && <div className="field"><label>Resistenza media</label><NumberInput value={a.resistance} min={0} max={c.plan.resistanceMax ?? 100} suffix={c.plan.resistanceMax ? `/ ${c.plan.resistanceMax}` : undefined} ariaLabel="Resistenza effettiva" onChange={(v) => set({ resistance: v })} /></div>}
          {info.rpm && <div className="field"><label>{info.rpmLabel}</label><NumberInput value={a.rpm} min={0} max={250} ariaLabel="Cadenza effettiva" onChange={(v) => set({ rpm: v == null ? null : Math.round(v) })} /></div>}
          <div className="field"><label><Route size={13} /> Distanza</label><NumberInput value={a.distanceKm} min={0} max={300} suffix="km" ariaLabel="Distanza percorsa" onChange={(v) => set({ distanceKm: v })} placeholder={info.speed ? '' : 'dal display'} /></div>
          <div className="field"><label><HeartPulse size={13} /> FC media</label><NumberInput value={a.avgHr} min={0} max={230} suffix="bpm" ariaLabel="Frequenza cardiaca media" onChange={(v) => set({ avgHr: v == null ? null : Math.round(v) })} /></div>
        </div>
        <div className="field"><label>Intensità percepita</label>
          <Segmented label="Intensità percepita" value={(a.intensity ?? c.plan.intensity) as CardioIntensity} onChange={(v) => set({ intensity: v })} options={(['light', 'moderate', 'vigorous', 'high'] as CardioIntensity[]).map((i) => ({ value: i, label: INTENSITY_INFO[i].label }))} />
        </div>
        <div className="field"><label><Flame size={13} /> Calorie (stima)</label>
          <NumberInput value={kcalTouched ? a.kcal : est} min={0} max={5000} suffix="kcal" ariaLabel="Calorie stimate" onChange={(v) => { setKcalTouched(v != null); set({ kcal: v }); }} />
          <p className="hint">Stima calcolata da durata, velocità, pendenza o intensità e dal tuo peso: non è una misurazione. Puoi sostituirla con il dato del tuo dispositivo.</p>
        </div>
        <div className="field"><label>Note</label><input className="input" value={a.notes ?? ''} onChange={(ev) => set({ notes: ev.target.value })} placeholder="Es. programma della macchina, sensazioni" /></div>
      </div>
    </Sheet>
  );
}

export const startCardioTimer = (c: CardioLogState): CardioLogState => ({ ...c, timer: startTimer(c.timer) });
