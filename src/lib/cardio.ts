/**
 * Cardio integrato nelle schede: macchine, piani (continui o a intervalli), stime e progressione.
 *
 * Il cardio vive dentro le schede come una voce della lista esercizi (TemplateExercise.cardio)
 * e dentro le sessioni come ExerciseLog.cardio (piano + timer + valori effettivi): così ordinamento,
 * salvataggio e sincronizzazione tra dispositivi funzionano esattamente come per gli esercizi con i pesi.
 */
import { getExercise, type Exercise } from '@/data/exercises';
import type {
  CardioActual, CardioIntensity, CardioLog, CardioLogState, CardioMachine, CardioPhase, CardioPlan, CardioTimer,
  Equipment, Profile, TemplateExercise, WorkoutSession, WorkoutTemplate,
} from './types';
import { addDays, clamp, dayKey, round, startOfWeek, sum, uid } from './util';

/** Attrezzi che servono esclusivamente all'allenamento cardiovascolare. */
export const CARDIO_EQUIPMENT: Equipment[] = ['treadmill', 'bike', 'elliptical', 'rower', 'jump_rope'];

export type CardioKind = 'easy' | 'steady' | 'incline' | 'intervals' | 'hiit' | 'endurance';

interface MachineInfo {
  label: string;
  equipment: Equipment | null;
  speed: boolean; incline: boolean; resistance: boolean; rpm: boolean;
  rpmLabel: string;
  /** livelli di resistenza ipotizzati se l'utente non ha indicato quelli della sua macchina */
  defaultMaxResistance: number;
  pattern: string;
  ex: Partial<Record<CardioKind, string>> & { steady: string };
}

export const MACHINE_INFO: Record<CardioMachine, MachineInfo> = {
  treadmill: { label: 'Tapis roulant', equipment: 'treadmill', speed: true, incline: true, resistance: false, rpm: false, rpmLabel: '', defaultMaxResistance: 0, pattern: 'run',
    ex: { steady: 'treadmill_walk', easy: 'treadmill_walk', incline: 'treadmill_incline_walk', endurance: 'treadmill_run', intervals: 'treadmill_intervals', hiit: 'treadmill_intervals' } },
  bike: { label: 'Cyclette', equipment: 'bike', speed: false, incline: false, resistance: true, rpm: true, rpmLabel: 'Cadenza (RPM)', defaultMaxResistance: 16, pattern: 'bike',
    ex: { steady: 'bike', easy: 'bike', endurance: 'bike', intervals: 'bike_intervals', hiit: 'hiit_bike' } },
  elliptical: { label: 'Ellittica', equipment: 'elliptical', speed: false, incline: true, resistance: true, rpm: true, rpmLabel: 'Passi al minuto', defaultMaxResistance: 20, pattern: 'elliptical',
    ex: { steady: 'elliptical', easy: 'elliptical', endurance: 'elliptical', intervals: 'elliptical_intervals', hiit: 'elliptical_intervals' } },
  rower: { label: 'Vogatore', equipment: 'rower', speed: false, incline: false, resistance: true, rpm: true, rpmLabel: 'Colpi al minuto', defaultMaxResistance: 10, pattern: 'rower',
    ex: { steady: 'rower', easy: 'rower', endurance: 'rower', intervals: 'rower_intervals', hiit: 'rower_intervals' } },
  jump_rope: { label: 'Corda per saltare', equipment: 'jump_rope', speed: false, incline: false, resistance: false, rpm: true, rpmLabel: 'Salti al minuto', defaultMaxResistance: 0, pattern: 'jump_rope',
    ex: { steady: 'jump_rope' } },
  outdoor_walk: { label: 'Camminata all’aperto', equipment: null, speed: true, incline: false, resistance: false, rpm: false, rpmLabel: '', defaultMaxResistance: 0, pattern: 'walk',
    ex: { steady: 'walk_outdoor' } },
  outdoor_run: { label: 'Corsa all’aperto', equipment: null, speed: true, incline: false, resistance: false, rpm: false, rpmLabel: '', defaultMaxResistance: 0, pattern: 'run',
    ex: { steady: 'run_outdoor' } },
  other: { label: 'Altra macchina cardio', equipment: null, speed: false, incline: false, resistance: true, rpm: false, rpmLabel: '', defaultMaxResistance: 20, pattern: 'step_up',
    ex: { steady: 'stair_climber' } },
};

export const MACHINE_ORDER: CardioMachine[] = ['treadmill', 'bike', 'elliptical', 'rower', 'jump_rope', 'outdoor_walk', 'outdoor_run', 'other'];

export const INTENSITY_INFO: Record<CardioIntensity, { label: string; desc: string; hr: [number, number] }> = {
  light: { label: 'Leggera', desc: 'Respiri con facilità, riesci a parlare normalmente', hr: [0.5, 0.6] },
  moderate: { label: 'Moderata', desc: 'Respiro accelerato, riesci ancora a parlare a frasi', hr: [0.6, 0.7] },
  vigorous: { label: 'Sostenuta', desc: 'Respiro impegnato, parli solo a poche parole', hr: [0.7, 0.8] },
  high: { label: 'Alta', desc: 'Sforzo molto intenso, solo per brevi intervalli', hr: [0.8, 0.9] },
};
const INT_ORDER: CardioIntensity[] = ['light', 'moderate', 'vigorous', 'high'];

export const KIND_NAME: Record<CardioKind, string> = {
  easy: 'Cardio leggero', steady: 'Cardio moderato', incline: 'Camminata in salita', intervals: 'Intervalli', hiit: 'Intervalli ad alta intensità', endurance: 'Resistenza aerobica',
};

export const PHASE_LABEL: Record<CardioPhase['kind'], string> = { warmup: 'Riscaldamento', work: 'Lavoro', recovery: 'Recupero', cooldown: 'Defaticamento' };

// ---------------------------------------------------------------------------
// Esercizi ⇄ macchine

export function isCardioExercise(e: Exercise | undefined | null): boolean {
  return !!e && e.family === 'cardio_machine';
}
export const isCardioId = (id: string) => isCardioExercise(getExercise(id));
export const isCardioEntry = (te: { exerciseId: string; cardio?: unknown }) => !!te.cardio || isCardioId(te.exerciseId);

export function machineOf(exerciseId: string): CardioMachine {
  const e = getExercise(exerciseId);
  if (!e) return 'other';
  if (exerciseId === 'walk_outdoor') return 'outdoor_walk';
  if (exerciseId === 'run_outdoor') return 'outdoor_run';
  for (const m of MACHINE_ORDER) { const eq = MACHINE_INFO[m].equipment; if (eq && e.equipment.includes(eq)) return m; }
  return 'other';
}

export function kindOfExercise(exerciseId: string): CardioKind {
  if (/hiit/.test(exerciseId)) return 'hiit';
  if (/intervals/.test(exerciseId)) return 'intervals';
  if (/incline/.test(exerciseId)) return 'incline';
  if (exerciseId === 'treadmill_run' || exerciseId === 'run_outdoor') return 'endurance';
  return 'steady';
}

export function machineLabel(m: CardioMachine) { return MACHINE_INFO[m].label; }

// ---------------------------------------------------------------------------
// Limiti di sicurezza in base a livello, età e limitazioni

export interface CardioLimits {
  maxIntensity: CardioIntensity;
  allowRun: boolean;
  allowHiit: boolean;
  lowerLimb: boolean;
  beginner: boolean;
  maxHardPerWeek: number;
}

export function cardioLimits(p: Pick<Profile, 'level' | 'injuries' | 'age'>): CardioLimits {
  const beginner = p.level === 'beginner';
  const injuries = p.injuries ?? [];
  const lowerLimb = injuries.some((z) => z === 'knee' || z === 'ankle' || z === 'hip');
  const senior = (p.age ?? 0) >= 65;
  const limited = injuries.length > 0 || senior;
  let maxIntensity: CardioIntensity = 'high';
  if (beginner || limited) maxIntensity = 'vigorous';
  if (beginner && limited) maxIntensity = 'moderate';
  return {
    maxIntensity,
    allowRun: !lowerLimb && !(beginner && senior),
    allowHiit: !beginner && !limited,
    lowerLimb, beginner,
    maxHardPerWeek: beginner ? 1 : p.level === 'intermediate' ? 2 : 3,
  };
}

export function capIntensity(i: CardioIntensity, max: CardioIntensity): CardioIntensity {
  return INT_ORDER[Math.min(INT_ORDER.indexOf(i), INT_ORDER.indexOf(max))];
}

/** Frequenza cardiaca obiettivo (FCmax stimata con Tanaka: 208 − 0,7 × età). Solo se l'età è nota. */
export function targetHr(age: number | undefined, intensity: CardioIntensity): [number, number] | null {
  if (!age || age < 14 || age > 100) return null;
  const max = 208 - 0.7 * age;
  const [a, b] = INTENSITY_INFO[intensity].hr;
  return [Math.round(max * a), Math.round(max * b)];
}

// ---------------------------------------------------------------------------
// Fasi e durata

export function expandPhases(plan: CardioPlan): CardioPhase[] {
  if (plan.mode !== 'intervals' || !plan.cycle?.length) {
    return [{ uid: 'steady', kind: 'work', label: plan.title || 'Attività continua', durationSec: Math.max(0, Math.round(plan.durationMin * 60)), speedKmh: plan.speedKmh, inclinePct: plan.inclinePct, resistance: plan.resistance, rpm: plan.rpm, intensity: plan.intensity }];
  }
  const out: CardioPhase[] = [];
  if (plan.warmup && plan.warmup.durationSec > 0) out.push(plan.warmup);
  const n = Math.max(1, plan.repeat ?? 1);
  for (let r = 0; r < n; r++) for (const ph of plan.cycle) out.push({ ...ph, uid: `${ph.uid}_${r}`, label: `${ph.label || PHASE_LABEL[ph.kind]} · ${r + 1}/${n}` });
  if (plan.cooldown && plan.cooldown.durationSec > 0) out.push(plan.cooldown);
  return out;
}

export const planDurationSec = (plan: CardioPlan) => sum(expandPhases(plan).map((p) => p.durationSec));
export const planMinutes = (plan: CardioPlan) => planDurationSec(plan) / 60;

/** Allinea durationMin alla somma delle fasi (per i piani a intervalli). */
export function normalizePlan(plan: CardioPlan): CardioPlan {
  if (plan.mode !== 'intervals') return plan;
  return { ...plan, durationMin: round(planDurationSec(plan) / 60, 1) };
}

export interface PhasePosition { index: number; phase: CardioPhase; phaseElapsed: number; phaseRemaining: number; finished: boolean; total: number }
export function phaseAt(phases: CardioPhase[], elapsedSec: number): PhasePosition {
  const total = sum(phases.map((p) => p.durationSec));
  let t = 0;
  for (let i = 0; i < phases.length; i++) {
    const d = phases[i].durationSec;
    if (elapsedSec < t + d) return { index: i, phase: phases[i], phaseElapsed: elapsedSec - t, phaseRemaining: t + d - elapsedSec, finished: false, total };
    t += d;
  }
  const last = phases[phases.length - 1];
  return { index: Math.max(0, phases.length - 1), phase: last, phaseElapsed: last?.durationSec ?? 0, phaseRemaining: 0, finished: true, total };
}

/** Media pesata sul tempo di un parametro delle fasi (es. velocità media prevista). */
export function weightedAvg(phases: CardioPhase[], key: 'speedKmh' | 'inclinePct' | 'resistance' | 'rpm'): number | null {
  const valid = phases.filter((p) => p[key] != null && p.durationSec > 0);
  const t = sum(valid.map((p) => p.durationSec));
  if (!t) return null;
  return round(sum(valid.map((p) => (p[key] as number) * p.durationSec)) / t, 1);
}

/** Distanza stimata in km (solo per attività in cui la velocità è nota). */
export function estimateDistanceKm(plan: CardioPlan): number | null {
  if (!MACHINE_INFO[plan.machine].speed) return null;
  const phases = expandPhases(plan);
  if (phases.some((p) => p.speedKmh == null)) return null;
  return round(sum(phases.map((p) => (p.speedKmh! * p.durationSec) / 3600)), 2);
}

// ---------------------------------------------------------------------------
// Calorie (stima): equazioni ACSM per camminata/corsa con pendenza, MET medi per le altre macchine

const MET: Record<CardioMachine, Record<CardioIntensity, number>> = {
  treadmill: { light: 3, moderate: 4.5, vigorous: 7, high: 10 },
  outdoor_walk: { light: 3, moderate: 3.8, vigorous: 5, high: 6 },
  outdoor_run: { light: 6, moderate: 8.3, vigorous: 10, high: 12 },
  bike: { light: 3.5, moderate: 6.8, vigorous: 8.8, high: 11 },
  elliptical: { light: 4, moderate: 5, vigorous: 7, high: 9 },
  rower: { light: 4.8, moderate: 7, vigorous: 8.5, high: 12 },
  jump_rope: { light: 8.8, moderate: 11.8, vigorous: 12.3, high: 12.3 },
  other: { light: 3.5, moderate: 5, vigorous: 7, high: 8 },
};

export function metFor(machine: CardioMachine, intensity: CardioIntensity, speedKmh?: number | null, inclinePct?: number | null): number {
  if (MACHINE_INFO[machine].speed && speedKmh && speedKmh > 0) {
    const v = (speedKmh * 1000) / 60; // m/min
    const g = Math.max(0, inclinePct ?? 0) / 100;
    const vo2 = speedKmh < 7.5 ? 0.1 * v + 1.8 * v * g + 3.5 : 0.2 * v + 0.9 * v * g + 3.5;
    return clamp(vo2 / 3.5, 2, 18);
  }
  return MET[machine][intensity];
}

export function estimateKcal(machine: CardioMachine, phases: Pick<CardioPhase, 'durationSec' | 'intensity' | 'speedKmh' | 'inclinePct'>[], weightKg: number): number | null {
  if (!weightKg || weightKg <= 0) return null;
  return Math.round(sum(phases.map((p) => metFor(machine, p.intensity, p.speedKmh, p.inclinePct) * weightKg * (p.durationSec / 3600))));
}

export const estimatePlanKcal = (plan: CardioPlan, weightKg: number) => estimateKcal(plan.machine, expandPhases(plan), weightKg);

export function estimateActualKcal(machine: CardioMachine, a: Pick<CardioActual, 'durationSec' | 'speedKmh' | 'inclinePct' | 'intensity'>, plan: CardioPlan, weightKg: number) {
  // se l'utente ha seguito gli intervalli senza cambiare velocità, uso le fasi previste scalate sul tempo reale
  const planned = planDurationSec(plan);
  if (plan.mode === 'intervals' && planned > 0 && a.speedKmh == null) {
    const k = estimatePlanKcal(plan, weightKg);
    return k == null ? null : Math.round(k * (a.durationSec / planned));
  }
  return estimateKcal(machine, [{ durationSec: a.durationSec, intensity: a.intensity ?? plan.intensity, speedKmh: a.speedKmh, inclinePct: a.inclinePct }], weightKg);
}

// ---------------------------------------------------------------------------
// Costruzione dei piani

type PlanProfile = Pick<Profile, 'level' | 'injuries' | 'age'> & Partial<Pick<Profile, 'cardioMachines' | 'goals'>>;

const ph = (kind: CardioPhase['kind'], durationSec: number, p: Partial<CardioPhase> & { intensity: CardioIntensity }): CardioPhase =>
  ({ uid: uid('ph_'), kind, durationSec, speedKmh: null, inclinePct: null, resistance: null, rpm: null, ...p });

export function maxResistanceFor(machine: CardioMachine, p?: Partial<Pick<Profile, 'cardioMachines'>>): number {
  return p?.cardioMachines?.[machine]?.maxResistance || MACHINE_INFO[machine].defaultMaxResistance;
}

/** Valori consigliati per macchina e intensità, adattati al livello. */
export function settingsFor(machine: CardioMachine, intensity: CardioIntensity, p: PlanProfile, opts: { run?: boolean; incline?: number } = {}) {
  const lv = p.level;
  const lim = cardioLimits(p);
  const out: Pick<CardioPhase, 'speedKmh' | 'inclinePct' | 'resistance' | 'rpm'> = { speedKmh: null, inclinePct: null, resistance: null, rpm: null };
  if (machine === 'treadmill' || machine === 'outdoor_walk' || machine === 'outdoor_run') {
    const walk = { light: lv === 'beginner' ? 4 : 4.5, moderate: lv === 'beginner' ? 5 : 5.5, vigorous: lv === 'beginner' ? 5.8 : 6.3, high: 6.5 }[intensity];
    const run = { light: 7, moderate: lv === 'advanced' ? 9.5 : 8, vigorous: lv === 'advanced' ? 11 : lv === 'intermediate' ? 9 : 7.5, high: lv === 'advanced' ? 13 : 10.5 }[intensity];
    const running = (opts.run || machine === 'outdoor_run') && lim.allowRun;
    out.speedKmh = running ? run : walk;
    if (machine === 'treadmill') out.inclinePct = opts.incline ?? (running ? 1 : intensity === 'light' ? 1 : intensity === 'moderate' ? (lv === 'beginner' ? 3 : 5) : lv === 'beginner' ? 4 : 7);
  } else if (MACHINE_INFO[machine].resistance) {
    const max = maxResistanceFor(machine, p);
    const frac = { light: 0.2, moderate: 0.33, vigorous: 0.5, high: 0.7 }[intensity];
    out.resistance = clamp(Math.round(max * frac), 1, max);
    if (machine === 'elliptical') out.inclinePct = null;
  }
  if (machine === 'bike') out.rpm = { light: 60, moderate: 70, vigorous: 80, high: 90 }[intensity];
  if (machine === 'elliptical') out.rpm = { light: 110, moderate: 125, vigorous: 140, high: 150 }[intensity];
  if (machine === 'rower') out.rpm = { light: 20, moderate: 24, vigorous: 27, high: 30 }[intensity];
  if (machine === 'jump_rope') out.rpm = { light: 80, moderate: 100, vigorous: 120, high: 130 }[intensity];
  return out;
}

export interface BuiltCardio { exerciseId: string; plan: CardioPlan }

/**
 * Crea un'attività cardio coerente con macchina, tipo, tempo disponibile e livello.
 * Non propone mai intensità oltre i limiti dell'utente (principianti, limitazioni, età).
 */
export function buildCardio(machine: CardioMachine, kindIn: CardioKind, minutesIn: number, p: PlanProfile): BuiltCardio {
  const lim = cardioLimits(p);
  let kind = kindIn;
  const minutes = Math.max(5, Math.round(minutesIn));
  if (kind === 'hiit' && !lim.allowHiit) kind = 'intervals';
  if ((kind === 'intervals' || kind === 'hiit') && minutes < 12) kind = 'steady';
  if (kind === 'incline' && machine !== 'treadmill') kind = 'steady';
  if (machine === 'jump_rope' && kind !== 'intervals') kind = 'intervals';
  if ((machine === 'outdoor_walk' || machine === 'outdoor_run') && (kind === 'intervals' || kind === 'hiit')) kind = 'steady';
  if (machine === 'outdoor_run' && !lim.allowRun) machine = 'outdoor_walk';
  const cap = (i: CardioIntensity) => capIntensity(i, lim.maxIntensity);
  const age = p.age;
  const maxRes = MACHINE_INFO[machine].resistance ? maxResistanceFor(machine, p) : null;
  const base = (intensity: CardioIntensity, opts?: { run?: boolean; incline?: number }) => settingsFor(machine, intensity, p, opts);

  if (kind === 'intervals' || kind === 'hiit') {
    const hiit = kind === 'hiit';
    const warmSec = machine === 'jump_rope' ? 120 : hiit || machine !== 'treadmill' ? 300 : 180;
    const coolSec = machine === 'jump_rope' ? 120 : hiit ? 300 : 180;
    const runOk = lim.allowRun && !lim.beginner && machine === 'treadmill';
    let workI: CardioIntensity = hiit ? 'high' : lim.beginner ? 'moderate' : 'vigorous';
    workI = cap(workI);
    const recI: CardioIntensity = hiit || lim.beginner ? 'light' : 'moderate';
    let work: CardioPhase, rec: CardioPhase;
    if (machine === 'treadmill') {
      const wk = runOk ? base(workI, { run: true }) : { ...base(workI), inclinePct: lim.beginner ? 3 : 6 };
      if (!runOk) wk.speedKmh = lim.beginner ? 5.8 : 6.3;
      work = ph('work', hiit ? 30 : 60, { intensity: workI, label: runOk ? 'Corsa' : 'Camminata veloce in salita', ...wk });
      rec = ph('recovery', hiit ? 90 : 120, { intensity: recI, label: 'Camminata veloce', ...base(recI), speedKmh: recI === 'light' ? (lim.beginner ? 4.5 : 5) : 6, inclinePct: 1 });
    } else if (machine === 'jump_rope') {
      work = ph('work', lim.beginner ? 30 : 60, { intensity: cap('vigorous'), label: 'Salti', ...base(cap('vigorous')) });
      rec = ph('recovery', lim.beginner ? 60 : 60, { intensity: 'light', label: 'Recupero camminando sul posto', rpm: null });
    } else {
      work = ph('work', hiit ? 30 : 60, { intensity: workI, label: hiit ? 'Sprint' : 'Tratto intenso', ...base(workI) });
      rec = ph('recovery', hiit ? 90 : 120, { intensity: recI, label: 'Recupero attivo', ...base(recI) });
    }
    const warmup = ph('warmup', warmSec, { intensity: 'light', label: 'Riscaldamento', ...base('light'), ...(machine === 'treadmill' ? { speedKmh: 4, inclinePct: 1 } : {}) });
    const cooldown = ph('cooldown', coolSec, { intensity: 'light', label: 'Defaticamento', ...base('light'), ...(machine === 'treadmill' ? { speedKmh: 4, inclinePct: 0 } : {}) });
    const cycleSec = work.durationSec + rec.durationSec;
    const maxRep = lim.beginner ? 5 : hiit ? 12 : 10;
    const repeat = clamp(Math.floor((minutes * 60 - warmSec - coolSec) / cycleSec), 2, maxRep);
    // ordine come nell'esempio: prima il recupero attivo, poi il tratto intenso
    const plan: CardioPlan = normalizePlan({
      machine, mode: 'intervals', title: `${machineLabel(machine)} · ${hiit ? 'HIIT' : 'intervalli'}`, durationMin: 0,
      intensity: workI, resistanceMax: maxRes, warmup, cycle: [rec, work], repeat, cooldown,
      speedKmh: null, inclinePct: null, resistance: null, rpm: null,
    });
    const hr = targetHr(age, workI);
    plan.hrMin = hr?.[0] ?? null; plan.hrMax = hr?.[1] ?? null;
    plan.progression = lim.beginner && plan.durationMin + 3 <= minutes ? { stepMin: 3, capMin: minutes } : null;
    return { exerciseId: MACHINE_INFO[machine].ex[kind] ?? MACHINE_INFO[machine].ex.steady, plan };
  }

  const intensity = cap(kind === 'easy' ? 'light' : kind === 'endurance' ? 'moderate' : kind === 'incline' ? (lim.beginner ? 'moderate' : 'vigorous') : 'moderate');
  const run = kind === 'endurance' && machine === 'treadmill' && lim.allowRun && !lim.beginner;
  const vals = kind === 'incline'
    ? { ...base(intensity), speedKmh: lim.beginner ? 5 : 5.5, inclinePct: lim.beginner ? 4 : p.level === 'advanced' ? 10 : 7 }
    : base(intensity, { run });
  const hr = targetHr(age, intensity);
  let exerciseId = MACHINE_INFO[machine].ex[kind] ?? MACHINE_INFO[machine].ex.steady;
  if (machine === 'treadmill' && kind !== 'endurance') exerciseId = kind === 'incline' || (vals.inclinePct ?? 0) >= 6 ? 'treadmill_incline_walk' : 'treadmill_walk';
  if (machine === 'treadmill' && kind === 'endurance' && !run) exerciseId = 'treadmill_walk';
  const title = `${machineLabel(machine)} · ${kind === 'incline' ? 'camminata in salita' : run ? 'corsa' : machine === 'treadmill' ? 'camminata' : INTENSITY_INFO[intensity].label.toLowerCase()}`;
  return {
    exerciseId,
    plan: { machine, mode: 'steady', title, durationMin: minutes, intensity, resistanceMax: maxRes, hrMin: hr?.[0] ?? null, hrMax: hr?.[1] ?? null, ...vals, progression: null },
  };
}

/** Piano di partenza quando l'utente aggiunge a mano un esercizio cardio dalla libreria. */
export function defaultPlanFor(exerciseId: string, p: PlanProfile, minutes = 20): CardioPlan {
  const machine = machineOf(exerciseId);
  const kind = kindOfExercise(exerciseId);
  const built = buildCardio(machine, kind, minutes, p);
  return built.plan;
}

/** Converte un vecchio esercizio cardio (serie = minuti) nel nuovo formato. */
export function planFromLegacy(te: Pick<TemplateExercise, 'exerciseId' | 'sets' | 'repMin' | 'repMax'>, p: PlanProfile): CardioPlan {
  const minutes = te.repMax > 0 ? te.repMax * Math.max(1, te.sets) : 20;
  return defaultPlanFor(te.exerciseId, p, clamp(minutes, 5, 180));
}

export function templateCardio(exerciseId: string, plan: CardioPlan, notes = ''): TemplateExercise {
  const min = Math.round(planMinutes(plan));
  return { uid: uid('te_'), exerciseId, sets: 1, repMin: min, repMax: min, restSec: 0, targetWeight: null, notes, cardio: plan };
}

export const newTimer = (): CardioTimer => ({ running: false, startedAt: null, accumulatedMs: 0 });
export const logStateFor = (plan: CardioPlan): CardioLogState => ({ plan: JSON.parse(JSON.stringify(plan)), timer: newTimer(), actual: null, done: false });

export function timerElapsedMs(t: CardioTimer | undefined | null, now = Date.now()) {
  if (!t) return 0;
  return t.accumulatedMs + (t.running && t.startedAt ? Math.max(0, now - t.startedAt) : 0);
}
export const startTimer = (t: CardioTimer, now = Date.now()): CardioTimer => (t.running ? t : { running: true, startedAt: now, accumulatedMs: t.accumulatedMs });
export const pauseTimer = (t: CardioTimer, now = Date.now()): CardioTimer => (!t.running ? t : { running: false, startedAt: null, accumulatedMs: timerElapsedMs(t, now) });

/** Valori effettivi proposti al termine: tempo reale + parametri previsti (modificabili dall'utente). */
export function actualFromPlan(plan: CardioPlan, elapsedSec: number, weightKg: number): CardioActual {
  const phases = expandPhases(plan);
  const planned = sum(phases.map((p) => p.durationSec));
  const durationSec = Math.round(elapsedSec > 0 ? elapsedSec : planned);
  // fasi effettivamente coperte dal tempo svolto
  let left = durationSec; const covered: CardioPhase[] = [];
  for (const p of phases) { if (left <= 0) break; const d = Math.min(p.durationSec, left); covered.push({ ...p, durationSec: d }); left -= d; }
  if (left > 0 && phases.length) covered.push({ ...phases[phases.length - 1], durationSec: left });
  const speed = weightedAvg(covered, 'speedKmh');
  const distanceKm = MACHINE_INFO[plan.machine].speed && speed != null ? round(sum(covered.map((p) => ((p.speedKmh ?? speed) * p.durationSec) / 3600)), 2) : null;
  return {
    durationSec, distanceKm, speedKmh: speed, inclinePct: weightedAvg(covered, 'inclinePct'), resistance: weightedAvg(covered, 'resistance'), rpm: weightedAvg(covered, 'rpm'),
    avgHr: null, kcal: estimateKcal(plan.machine, covered, weightKg), intensity: plan.intensity, completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Testi

const n1 = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });
export function phaseParams(p: Pick<CardioPhase, 'speedKmh' | 'inclinePct' | 'resistance' | 'rpm'>, machine: CardioMachine, resMax?: number | null): string[] {
  const out: string[] = [];
  const info = MACHINE_INFO[machine];
  if (p.speedKmh != null && info.speed) out.push(`${n1(p.speedKmh)} km/h`);
  if (p.inclinePct != null && info.incline) out.push(`pendenza ${n1(p.inclinePct)}%`);
  if (p.resistance != null && info.resistance) out.push(`resistenza ${n1(p.resistance)}${resMax ? `/${resMax}` : ''}`);
  if (p.rpm != null && info.rpm) out.push(`${Math.round(p.rpm)} ${machine === 'bike' ? 'RPM' : machine === 'rower' ? 'colpi/min' : machine === 'jump_rope' ? 'salti/min' : 'passi/min'}`);
  return out;
}

export function planSummary(plan: CardioPlan): string {
  const min = Math.round(planMinutes(plan));
  if (plan.mode === 'intervals') return `${min} min · intervalli ${plan.repeat ?? 1}× (${(plan.cycle ?? []).map((c) => `${fmtSec(c.durationSec)} ${INTENSITY_INFO[c.intensity].label.toLowerCase()}`).join(' + ')})`;
  return [`${min} min`, ...phaseParams(plan, plan.machine, plan.resistanceMax), INTENSITY_INFO[plan.intensity].label.toLowerCase()].join(' · ');
}

export function fmtSec(sec: number) {
  if (sec % 60 === 0) return `${sec / 60} min`;
  if (sec < 60) return `${sec} s`;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min`;
}

/** Righe descrittive di un piano (per schede, anteprime e riepiloghi). */
export function planLines(plan: CardioPlan): string[] {
  if (plan.mode !== 'intervals') {
    const out = [`Durata: ${Math.round(plan.durationMin)} minuti`];
    const info = MACHINE_INFO[plan.machine];
    if (info.speed && plan.speedKmh != null) out.push(`Velocità: ${n1(plan.speedKmh)} km/h`);
    if (info.incline && plan.inclinePct != null) out.push(`Pendenza: ${n1(plan.inclinePct)}%`);
    if (info.resistance && plan.resistance != null) out.push(`Resistenza: livello ${n1(plan.resistance)}${plan.resistanceMax ? ` su ${plan.resistanceMax}` : ''}`);
    if (info.rpm && plan.rpm != null) out.push(`${info.rpmLabel}: ${Math.round(plan.rpm)}`);
    out.push(`Intensità: ${INTENSITY_INFO[plan.intensity].label.toLowerCase()}`);
    return out;
  }
  const lines: string[] = [];
  const d = (p: CardioPhase) => [fmtSec(p.durationSec), p.label?.toLowerCase(), ...phaseParams(p, plan.machine, plan.resistanceMax)].filter(Boolean).join(' · ');
  if (plan.warmup) lines.push(`${d(plan.warmup)}`);
  for (const c of plan.cycle ?? []) lines.push(d(c));
  lines.push(`Ripeti il ciclo ${plan.repeat ?? 1} volte`);
  if (plan.cooldown) lines.push(`${d(plan.cooldown)}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Tempo della scheda

/** Durata stimata di una scheda in minuti: serie × (recupero + 40 s) + durata prevista del cardio. */
export function templateMinutesExact(t: Pick<WorkoutTemplate, 'exercises'>): number {
  let sec = 0;
  for (const e of t.exercises) sec += e.cardio ? planDurationSec(e.cardio) : e.sets * (e.restSec + 40);
  return sec / 60;
}
export const cardioMinutesOf = (t: Pick<WorkoutTemplate, 'exercises'>) => sum(t.exercises.filter((e) => e.cardio).map((e) => planMinutes(e.cardio!)));

// ---------------------------------------------------------------------------
// Statistiche e storico

export function sessionCardio(s: WorkoutSession) {
  return s.exercises.filter((e) => e.cardio && e.cardio.done && e.cardio.actual);
}

export function sessionCardioStats(s: WorkoutSession) {
  const logs = sessionCardio(s);
  const acts = logs.map((l) => l.cardio!.actual!);
  const minutes = sum(acts.map((a) => a.durationSec)) / 60;
  const plannedMin = sum(logs.map((l) => planMinutes(l.cardio!.plan)));
  const withDist = acts.filter((a) => a.distanceKm != null && a.distanceKm > 0);
  const distanceKm = withDist.length ? round(sum(withDist.map((a) => a.distanceKm!)), 2) : null;
  const sp = acts.filter((a) => a.speedKmh != null && a.speedKmh > 0);
  const spT = sum(sp.map((a) => a.durationSec));
  const avgSpeedKmh = spT ? round(sum(sp.map((a) => a.speedKmh! * a.durationSec)) / spT, 1) : null;
  const kc = acts.filter((a) => a.kcal != null);
  return { activities: logs.length, minutes, plannedMin, distanceKm, avgSpeedKmh, kcal: kc.length ? sum(kc.map((a) => a.kcal!)) : null };
}

export interface CardioEntry {
  id: string; date: string; machine: CardioMachine; exerciseId?: string; label: string;
  plannedMin: number | null; actualMin: number; distanceKm: number | null; speedKmh: number | null; inclinePct: number | null;
  resistance: number | null; resistanceMax: number | null; kcal: number | null; sessionId?: string; source: 'session' | 'manual';
}

const LOG_MACHINE: Record<CardioLog['type'], CardioMachine> = { walk: 'outdoor_walk', run: 'outdoor_run', treadmill: 'treadmill', bike: 'bike', elliptical: 'elliptical', rower: 'rower', swim: 'other', other: 'other' };

/** Tutte le attività cardio: quelle svolte nelle sessioni di allenamento e quelle registrate a parte. */
export function cardioEntries(sessions: WorkoutSession[], logs: CardioLog[] = []): CardioEntry[] {
  const out: CardioEntry[] = [];
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    for (const l of sessionCardio(s)) {
      const a = l.cardio!.actual!, plan = l.cardio!.plan;
      out.push({
        id: `${s.id}_${l.uid}`, date: dayKey(a.completedAt || s.startedAt), machine: plan.machine, exerciseId: l.exerciseId,
        label: getExercise(l.exerciseId)?.name ?? machineLabel(plan.machine), plannedMin: round(planMinutes(plan), 1), actualMin: round(a.durationSec / 60, 1),
        distanceKm: a.distanceKm ?? null, speedKmh: a.speedKmh ?? null, inclinePct: a.inclinePct ?? null, resistance: a.resistance ?? null,
        resistanceMax: plan.resistanceMax ?? null, kcal: a.kcal ?? null, sessionId: s.id, source: 'session',
      });
    }
  }
  for (const l of logs) {
    out.push({
      id: l.id, date: l.date, machine: LOG_MACHINE[l.type] ?? 'other', label: l.label || machineLabel(LOG_MACHINE[l.type] ?? 'other'), plannedMin: null,
      actualMin: l.durationMin, distanceKm: l.distanceKm ?? null, speedKmh: l.avgSpeedKmh ?? null, inclinePct: null, resistance: null, resistanceMax: null,
      kcal: l.kcal ?? null, source: 'manual',
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function cardioWeekly(entries: CardioEntry[], weeks = 12) {
  const start = startOfWeek();
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(start, -7 * (weeks - 1 - i)), we = addDays(ws, 7);
    const a = dayKey(ws), b = dayKey(we);
    const inW = entries.filter((e) => e.date >= a && e.date < b);
    const planned = inW.filter((e) => e.plannedMin != null);
    return {
      label: `${ws.getDate()}/${ws.getMonth() + 1}`, minutes: sum(inW.map((e) => e.actualMin)), sessions: inW.length,
      distanceKm: sum(inW.map((e) => e.distanceKm ?? 0)), plannedMin: sum(planned.map((e) => e.plannedMin!)), doneOfPlanned: sum(planned.map((e) => e.actualMin)),
    };
  });
}

export function cardioMonthly(entries: CardioEntry[], months = 6) {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const m = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const n = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const a = dayKey(m), b = dayKey(n);
    const inM = entries.filter((e) => e.date >= a && e.date < b);
    return { label: m.toLocaleDateString('it-IT', { month: 'short' }), minutes: sum(inM.map((e) => e.actualMin)), sessions: inM.length, distanceKm: sum(inM.map((e) => e.distanceKm ?? 0)) };
  });
}

// ---------------------------------------------------------------------------
// Progressione automatica (es. programmi per principianti)

function completionRatio(l: { cardio?: CardioLogState | null }) {
  const c = l.cardio;
  if (!c?.done || !c.actual) return 0;
  const p = planDurationSec(c.plan);
  return p ? c.actual.durationSec / p : 0;
}

/**
 * Se le ultime due sessioni della scheda hanno completato il cardio come previsto (≥ 95% del tempo),
 * aumenta la durata (o un ciclo di intervalli) fino al tetto definito, senza superare il tempo disponibile.
 */
export function progressTemplateCardio(t: WorkoutTemplate, sessions: WorkoutSession[]): { template: WorkoutTemplate; changes: string[] } | null {
  const done = sessions.filter((s) => s.status === 'completed' && s.templateId === t.id).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const changes: string[] = [];
  const exercises = t.exercises.map((te) => {
    const plan = te.cardio;
    if (!plan?.progression) return te;
    const recent = done.map((s) => s.exercises.find((x) => x.exerciseId === te.exerciseId && x.cardio)).filter(Boolean).slice(-2) as { cardio?: CardioLogState | null }[];
    if (recent.length < 2 || recent.some((r) => completionRatio(r) < 0.95)) return te;
    // evita di progredire due volte sugli stessi risultati: entrambe le sessioni devono riferirsi al piano attuale
    const curSec = planDurationSec(plan);
    if (recent.some((r) => Math.abs(planDurationSec(r.cardio!.plan) - curSec) > 1)) return te;
    const { stepMin, capMin } = plan.progression;
    let next: CardioPlan | null = null;
    if (plan.mode === 'intervals' && plan.cycle?.length) {
      const cyc = sum(plan.cycle.map((c) => c.durationSec)) / 60;
      if (planMinutes(plan) + cyc <= capMin + 0.01) next = normalizePlan({ ...plan, repeat: (plan.repeat ?? 1) + 1 });
    } else if (plan.durationMin < capMin) {
      next = { ...plan, durationMin: Math.min(capMin, plan.durationMin + stepMin) };
    }
    if (!next) return te;
    if (planMinutes(next) >= capMin - 0.01) next.progression = null;
    changes.push(`${getExercise(te.exerciseId)?.name ?? machineLabel(plan.machine)}: ${Math.round(planMinutes(plan))} → ${Math.round(planMinutes(next))} min`);
    return { ...te, cardio: next, repMin: Math.round(planMinutes(next)), repMax: Math.round(planMinutes(next)) };
  });
  if (!changes.length) return null;
  return { template: { ...t, exercises }, changes };
}
