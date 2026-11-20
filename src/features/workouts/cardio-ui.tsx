/** Componenti condivisi per il cardio nelle schede e nell'allenamento live. */
import { useState } from 'react';
import { Plus, Trash2, HeartPulse, Route, Flame, Check, Bike } from 'lucide-react';
import { NumberInput, Segmented, Sheet, Stepper } from '@/components/ui';
import { patchProfile } from '@/app/data';
import { ExerciseAnimation } from '@/features/exercises/anim/render';
import { getExercise } from '@/data/exercises';
import {
  INTENSITY_INFO, KIND_NAME, MACHINE_INFO, MACHINE_ORDER, PHASE_LABEL, buildCardio, cardioLimits, estimateDistanceKm, estimatePlanKcal,
  fmtSec, kindOfExercise, machineLabel, normalizePlan, planLines, planMinutes, targetHr, type CardioKind,
} from '@/lib/cardio';
import { analyzeEquipment } from '@/lib/generator';
import { fmtN, uid } from '@/lib/util';
import type { CardioIntensity, CardioMachine, CardioPhase, CardioPlan, Profile } from '@/lib/types';

const INTENSITIES: CardioIntensity[] = ['light', 'moderate', 'vigorous', 'high'];

export function CardioIcon({ machine, size = 48, play = false }: { machine: CardioMachine; size?: number; play?: boolean }) {
  return <div className="ex-thumb" style={{ width: size, height: size }}><ExerciseAnimation patternId={MACHINE_INFO[machine].pattern} muscles={['cardio']} className="thumb" autoPlay={play} label={machineLabel(machine)} /></div>;
}

/** Descrizione compatta del piano (riga per riga), usata in schede, anteprime e riepiloghi. */
export function CardioPlanLines({ plan, compact }: { plan: CardioPlan; compact?: boolean }) {
  const lines = planLines(plan);
  const hr = plan.hrMin && plan.hrMax ? `FC obiettivo: ${plan.hrMin}–${plan.hrMax} bpm` : null;
  const dist = estimateDistanceKm(plan);
  return (
    <ul className={`cardio-lines ${compact ? 'compact' : ''}`}>
      {lines.map((l, i) => <li key={i}>{l}</li>)}
      {!compact && dist != null && <li>Distanza stimata: {fmtN(dist, 1)} km</li>}
      {!compact && hr && <li>{hr}</li>}
    </ul>
  );
}

/** Cambia macchina mantenendo durata, tipo di seduta e intensità. */
export function convertPlan(plan: CardioPlan, machine: CardioMachine, exerciseId: string, p: Profile): { exerciseId: string; plan: CardioPlan } {
  const kind: CardioKind = plan.mode === 'intervals' ? (plan.intensity === 'high' ? 'hiit' : 'intervals') : kindOfExercise(exerciseId) === 'incline' ? 'incline' : plan.intensity === 'light' ? 'easy' : 'steady';
  const b = buildCardio(machine, kind, Math.round(planMinutes(plan)), p);
  return { exerciseId: b.exerciseId, plan: { ...b.plan, progression: plan.progression ?? null } };
}

function PhaseEditor({ phase, machine, onChange, onRemove, resMax }: { phase: CardioPhase; machine: CardioMachine; onChange: (p: CardioPhase) => void; onRemove?: () => void; resMax?: number | null }) {
  const info = MACHINE_INFO[machine];
  const set = (x: Partial<CardioPhase>) => onChange({ ...phase, ...x });
  const min = Math.floor(phase.durationSec / 60), sec = phase.durationSec % 60;
  return (
    <div className="phase-edit">
      <div className="row-between" style={{ gap: 8 }}>
        <input className="input" style={{ height: 34, fontWeight: 650 }} value={phase.label ?? ''} placeholder={PHASE_LABEL[phase.kind]} onChange={(e) => set({ label: e.target.value })} aria-label="Nome della fase" maxLength={40} />
        {onRemove && <button className="icon-btn ghost" onClick={onRemove} aria-label="Elimina fase"><Trash2 size={16} /></button>}
      </div>
      <div className="grid-3" style={{ marginTop: 8 }}>
        <div className="field"><label>Min</label><NumberInput value={min} min={0} max={120} ariaLabel="Minuti della fase" onChange={(v) => set({ durationSec: Math.max(0, Math.round(v ?? 0)) * 60 + sec })} /></div>
        <div className="field"><label>Sec</label><NumberInput value={sec} min={0} max={59} ariaLabel="Secondi della fase" onChange={(v) => set({ durationSec: min * 60 + Math.min(59, Math.max(0, Math.round(v ?? 0))) })} /></div>
        <div className="field"><label>Intensità</label>
          <select className="select" value={phase.intensity} onChange={(e) => set({ intensity: e.target.value as CardioIntensity })} aria-label="Intensità della fase">
            {INTENSITIES.map((i) => <option key={i} value={i}>{INTENSITY_INFO[i].label}</option>)}
          </select>
        </div>
        {info.speed && <div className="field"><label>km/h</label><NumberInput value={phase.speedKmh} min={0} max={30} ariaLabel="Velocità della fase" onChange={(v) => set({ speedKmh: v })} /></div>}
        {info.incline && <div className="field"><label>Pendenza %</label><NumberInput value={phase.inclinePct} min={-5} max={40} ariaLabel="Pendenza della fase" onChange={(v) => set({ inclinePct: v })} /></div>}
        {info.resistance && <div className="field"><label>Resist.{resMax ? ` /${resMax}` : ''}</label><NumberInput value={phase.resistance} min={0} max={resMax ?? 100} ariaLabel="Resistenza della fase" onChange={(v) => set({ resistance: v })} /></div>}
        {info.rpm && <div className="field"><label>{machine === 'bike' ? 'RPM' : machine === 'rower' ? 'Colpi/min' : machine === 'jump_rope' ? 'Salti/min' : 'Passi/min'}</label><NumberInput value={phase.rpm} min={0} max={250} ariaLabel="Cadenza della fase" onChange={(v) => set({ rpm: v == null ? null : Math.round(v) })} /></div>}
      </div>
    </div>
  );
}

/** Editor completo del piano: tutti i parametri sono modificabili, anche durante l'allenamento. */
export function CardioPlanEditor({ plan, onChange, profile, exerciseId }: { plan: CardioPlan; onChange: (p: CardioPlan) => void; profile?: Profile; exerciseId: string }) {
  const info = MACHINE_INFO[plan.machine];
  const set = (x: Partial<CardioPlan>) => onChange(normalizePlan({ ...plan, ...x }));
  const resMax = plan.resistanceMax ?? null;
  const kcal = profile?.weightKg ? estimatePlanKcal(plan, profile.weightKg) : null;
  const dist = estimateDistanceKm(plan);

  function setMode(mode: CardioPlan['mode']) {
    if (mode === plan.mode || !profile) return;
    const kind: CardioKind = mode === 'intervals' ? 'intervals' : 'steady';
    const b = buildCardio(plan.machine, kind, Math.max(12, Math.round(planMinutes(plan))), { ...profile, cardioMachines: { ...profile.cardioMachines, [plan.machine]: { ...profile.cardioMachines?.[plan.machine], maxResistance: resMax ?? undefined } } });
    onChange({ ...b.plan, title: plan.title, progression: plan.progression ?? null });
  }
  function setMax(v: number | null) {
    const max = v && v > 0 ? Math.round(v) : null;
    // le resistenze vengono riscalate sulla scala della macchina dell'utente
    const k = max && resMax ? max / resMax : 1;
    const sc = (r?: number | null) => (r == null ? r : Math.max(1, Math.round(r * k)));
    const scPh = (p?: CardioPhase | null) => (p ? { ...p, resistance: sc(p.resistance) } : p);
    onChange({ ...plan, resistanceMax: max, resistance: sc(plan.resistance), warmup: scPh(plan.warmup), cooldown: scPh(plan.cooldown), cycle: plan.cycle?.map((c) => scPh(c)!) });
    if (max && profile) patchProfile({ cardioMachines: { ...(profile.cardioMachines ?? {}), [plan.machine]: { ...(profile.cardioMachines?.[plan.machine] ?? {}), maxResistance: max } } });
  }
  const autoHr = () => { const hr = targetHr(profile?.age, plan.intensity); set({ hrMin: hr?.[0] ?? null, hrMax: hr?.[1] ?? null }); };

  return (
    <div className="stack-sm">
      {info.resistance && (
        <div className="field"><label>Livelli di resistenza della tua macchina</label>
          <NumberInput value={resMax} min={1} max={100} suffix="livelli" ariaLabel="Livello massimo di resistenza della macchina" onChange={setMax} placeholder={String(info.defaultMaxResistance)} />
          <p className="hint">Ogni {machineLabel(plan.machine).toLowerCase()} ha una scala diversa: indica il livello massimo della tua e i valori consigliati verranno adattati.</p>
        </div>
      )}
      {getExercise(exerciseId)?.id !== 'jump_rope' && (
        <Segmented label="Tipo di attività" value={plan.mode} onChange={setMode} options={[{ value: 'steady', label: 'Continua' }, { value: 'intervals', label: 'A intervalli' }]} />
      )}
      {plan.mode === 'steady' ? (
        <div className="grid-2">
          <div className="field"><label>Durata</label><NumberInput value={plan.durationMin} min={1} max={300} suffix="min" ariaLabel="Durata prevista" onChange={(v) => set({ durationMin: Math.max(1, v ?? 1) })} /></div>
          {info.speed && <div className="field"><label>Velocità</label><NumberInput value={plan.speedKmh} min={0} max={30} suffix="km/h" ariaLabel="Velocità consigliata" onChange={(v) => set({ speedKmh: v })} /></div>}
          {info.incline && <div className="field"><label>Pendenza</label><NumberInput value={plan.inclinePct} min={-5} max={40} suffix="%" ariaLabel="Pendenza consigliata" onChange={(v) => set({ inclinePct: v })} /></div>}
          {info.resistance && <div className="field"><label>Resistenza</label><NumberInput value={plan.resistance} min={0} max={resMax ?? 100} suffix={resMax ? `/ ${resMax}` : 'livello'} ariaLabel="Livello di resistenza" onChange={(v) => set({ resistance: v })} /></div>}
          {info.rpm && <div className="field"><label>{info.rpmLabel}</label><NumberInput value={plan.rpm} min={0} max={250} ariaLabel={info.rpmLabel} onChange={(v) => set({ rpm: v == null ? null : Math.round(v) })} /></div>}
        </div>
      ) : (
        <div className="stack-sm">
          <div className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Riscaldamento</div>
          {plan.warmup
            ? <PhaseEditor phase={plan.warmup} machine={plan.machine} resMax={resMax} onChange={(w) => set({ warmup: w })} onRemove={() => set({ warmup: null })} />
            : <button className="btn sm" onClick={() => set({ warmup: { uid: uid('ph_'), kind: 'warmup', label: 'Riscaldamento', durationSec: 300, intensity: 'light' } })}><Plus size={15} /> Aggiungi riscaldamento</button>}
          <div className="row-between"><span className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Ciclo da ripetere</span>
            <div className="row" style={{ gap: 6 }}><span className="small">Ripetizioni</span><Stepper value={plan.repeat ?? 1} min={1} max={30} onChange={(v) => set({ repeat: v })} /></div>
          </div>
          {(plan.cycle ?? []).map((c, i) => (
            <PhaseEditor key={c.uid} phase={c} machine={plan.machine} resMax={resMax} onChange={(np) => set({ cycle: plan.cycle!.map((x, j) => (j === i ? np : x)) })} onRemove={(plan.cycle?.length ?? 0) > 1 ? () => set({ cycle: plan.cycle!.filter((_, j) => j !== i) }) : undefined} />
          ))}
          <button className="btn sm" onClick={() => set({ cycle: [...(plan.cycle ?? []), { uid: uid('ph_'), kind: 'work', label: 'Nuova fase', durationSec: 60, intensity: 'moderate', speedKmh: plan.cycle?.[0]?.speedKmh ?? null, inclinePct: plan.cycle?.[0]?.inclinePct ?? null, resistance: plan.cycle?.[0]?.resistance ?? null, rpm: plan.cycle?.[0]?.rpm ?? null }] })}><Plus size={15} /> Aggiungi fase al ciclo</button>
          <div className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Defaticamento</div>
          {plan.cooldown
            ? <PhaseEditor phase={plan.cooldown} machine={plan.machine} resMax={resMax} onChange={(w) => set({ cooldown: w })} onRemove={() => set({ cooldown: null })} />
            : <button className="btn sm" onClick={() => set({ cooldown: { uid: uid('ph_'), kind: 'cooldown', label: 'Defaticamento', durationSec: 180, intensity: 'light' } })}><Plus size={15} /> Aggiungi defaticamento</button>}
          <div className="small" style={{ fontWeight: 650 }}>Durata totale: {fmtSec(Math.round(planMinutes(plan) * 60))}</div>
        </div>
      )}
      <div className="field"><label>Intensità {plan.mode === 'intervals' ? 'massima' : ''}</label>
        <Segmented label="Intensità" value={plan.intensity} onChange={(v) => set({ intensity: v })} options={INTENSITIES.map((i) => ({ value: i, label: INTENSITY_INFO[i].label }))} />
        <p className="hint">{INTENSITY_INFO[plan.intensity].desc}.</p>
      </div>
      <div className="field"><label><HeartPulse size={13} /> Frequenza cardiaca obiettivo (facoltativa)</label>
        <div className="row" style={{ gap: 8 }}>
          <NumberInput value={plan.hrMin} min={40} max={220} suffix="min" ariaLabel="Frequenza cardiaca minima" onChange={(v) => set({ hrMin: v == null ? null : Math.round(v) })} />
          <NumberInput value={plan.hrMax} min={40} max={220} suffix="max" ariaLabel="Frequenza cardiaca massima" onChange={(v) => set({ hrMax: v == null ? null : Math.round(v) })} />
          {profile?.age ? <button className="btn sm" onClick={autoHr}>Calcola</button> : null}
        </div>
        <p className="hint">Stima basata sull’età (FC massima ≈ 208 − 0,7 × età): è solo indicativa. Con farmaci o patologie cardiache segui le indicazioni del medico.</p>
      </div>
      <div className="row wrap small text-2" style={{ gap: 12 }}>
        {dist != null && <span className="row" style={{ gap: 4 }}><Route size={14} /> ~{fmtN(dist, 1)} km</span>}
        {kcal != null && <span className="row" style={{ gap: 4 }}><Flame size={14} /> ~{kcal} kcal (stima)</span>}
      </div>
    </div>
  );
}

/** Scelta della macchina: le macchine selezionate nel profilo sono in evidenza. */
export function MachinePicker({ open, onClose, onPick, profile, current }: { open: boolean; onClose: () => void; onPick: (m: CardioMachine) => void; profile?: Profile; current?: CardioMachine }) {
  const avail = profile ? analyzeEquipment(profile).cardioMachines : [];
  const list = [...MACHINE_ORDER].sort((a, b) => Number(avail.includes(b)) - Number(avail.includes(a)));
  return (
    <Sheet open={open} onClose={onClose} title="Scegli la macchina">
      <div className="settings-group">
        {list.map((m) => (
          <button key={m} className="list-item" onClick={() => onPick(m)} aria-pressed={current === m}>
            <CardioIcon machine={m} size={42} />
            <span className="grow"><div className="li-title">{machineLabel(m)}</div><div className="li-sub">{avail.includes(m) ? 'Disponibile nella tua attrezzatura' : MACHINE_INFO[m].equipment ? 'Non indicata nella tua attrezzatura' : 'Senza attrezzatura'}</div></span>
            {current === m && <Check size={18} className="accent" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Aggiunta di un'attività cardio a una scheda (o all'allenamento in corso). */
export function AddCardioSheet({ open, onClose, onAdd, profile }: { open: boolean; onClose: () => void; onAdd: (exerciseId: string, plan: CardioPlan) => void; profile?: Profile }) {
  const avail = profile ? analyzeEquipment(profile).cardioMachines : [];
  const [machine, setMachine] = useState<CardioMachine>(avail[0] ?? 'treadmill');
  const [kind, setKind] = useState<CardioKind>('steady');
  const [minutes, setMinutes] = useState(20);
  const lim = profile ? cardioLimits(profile) : null;
  const kinds: CardioKind[] = (['easy', 'steady', 'incline', 'endurance', 'intervals', 'hiit'] as CardioKind[])
    .filter((k) => (k !== 'incline' || machine === 'treadmill') && (k !== 'hiit' || lim?.allowHiit !== false) && ((k !== 'intervals' && k !== 'hiit') || !['outdoor_walk', 'outdoor_run'].includes(machine)));
  const list = [...MACHINE_ORDER].sort((a, b) => Number(avail.includes(b)) - Number(avail.includes(a)));
  const p: Profile = profile ?? ({ level: 'beginner', injuries: [], age: 0 } as unknown as Profile);
  const preview = buildCardio(machine, kinds.includes(kind) ? kind : 'steady', minutes, p);
  return (
    <Sheet open={open} onClose={onClose} title="Aggiungi cardio" wide footer={<button className="btn primary block" onClick={() => { onAdd(preview.exerciseId, preview.plan); onClose(); }}><Plus size={17} /> Aggiungi alla scheda</button>}>
      <div className="stack-sm">
        <div className="field"><label>Macchina o attività</label>
          <div className="option-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
            {list.map((m) => (
              <button key={m} type="button" className={`option ${machine === m ? 'on' : ''}`} style={{ padding: 6, flexDirection: 'column', alignItems: 'center', gap: 2, opacity: avail.length && !avail.includes(m) ? 0.6 : 1 }} onClick={() => setMachine(m)} aria-pressed={machine === m}>
                <CardioIcon machine={m} size={46} play={machine === m} />
                <span className="tiny" style={{ fontWeight: 650, textAlign: 'center' }}>{machineLabel(m)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field"><label>Tipo di seduta</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {kinds.map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{KIND_NAME[k]}</button>)}
          </div>
        </div>
        <div className="field"><label>Tempo a disposizione</label><Stepper value={minutes} min={5} max={120} step={5} onChange={setMinutes} format={(v) => `${v} min`} /></div>
        <div className="cardio-box">
          <div className="row" style={{ gap: 8, marginBottom: 6 }}><Bike size={16} /><b>{getExercise(preview.exerciseId)?.name}</b></div>
          <CardioPlanLines plan={preview.plan} />
          <p className="hint" style={{ marginTop: 6 }}>Dopo l’aggiunta puoi modificare ogni parametro{lim?.beginner ? '. Per i principianti le intensità sono limitate.' : '.'}</p>
        </div>
      </div>
    </Sheet>
  );
}
