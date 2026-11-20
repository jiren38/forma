/**
 * Generatore di programmi personalizzati.
 * Considera: obiettivo, livello, giorni, durata, attrezzatura, focus muscolari, infortuni, preferenze, storico.
 */
import { EXERCISES, isAvailable, type Exercise, type Movement } from '@/data/exercises';
import type { CardioMachine, Equipment, Goal, MuscleGroup, Program, Profile, TemplateExercise, WorkoutSession, WorkoutTemplate } from './types';
import { EQUIPMENT_LABEL, FULL_GYM, GOAL_INFO } from './labels';
import { uid } from './util';
import { exerciseHistory } from './stats';
import {
  CARDIO_EQUIPMENT, KIND_NAME, MACHINE_INFO, buildCardio, cardioLimits, estimatePlanKcal, isCardioExercise, machineLabel, machineOf, planMinutes,
  templateCardio, templateMinutesExact, type CardioKind,
} from './cardio';

export type SplitKind = 'full_body' | 'upper_lower' | 'ppl' | 'bro_split' | 'ppl_ul' | 'home' | 'conditioning' | 'cardio';

// ---------------------------------------------------------------------------
// Analisi dell'attrezzatura: è un vincolo, non un suggerimento.

export type TrainingMode = 'cardio_only' | 'mixed' | 'strength_only' | 'bodyweight';
export const MODE_LABEL: Record<TrainingMode, string> = {
  cardio_only: 'Solo cardio', mixed: 'Muscolare + cardio', strength_only: 'Solo muscolare', bodyweight: 'Corpo libero',
};

export interface EquipmentAnalysis {
  /** attrezzi selezionati (senza il corpo libero implicito) */
  selected: Equipment[];
  cardioEquipment: Equipment[];
  strengthEquipment: Equipment[];
  /** macchine cardio utilizzabili, comprese le attività all'aperto se l'utente si allena anche fuori */
  cardioMachines: CardioMachine[];
  outdoor: boolean;
  mode: TrainingMode;
}

export function analyzeEquipment(p: Profile): EquipmentAnalysis {
  const sel = new Set<Equipment>(p.equipment ?? []);
  if (p.fullGym || p.location?.includes('commercial_gym')) FULL_GYM.forEach((e) => sel.add(e));
  sel.delete('bodyweight');
  const selected = [...sel];
  const cardioEquipment = CARDIO_EQUIPMENT.filter((e) => sel.has(e));
  const strengthEquipment = selected.filter((e) => !CARDIO_EQUIPMENT.includes(e));
  const outdoor = !!p.location?.includes('outdoor');
  const machines: CardioMachine[] = (['treadmill', 'bike', 'elliptical', 'rower', 'jump_rope'] as CardioMachine[]).filter((m) => sel.has(MACHINE_INFO[m].equipment!));
  if (outdoor) { machines.push('outdoor_walk'); if (cardioLimits(p).allowRun && p.level !== 'beginner') machines.push('outdoor_run'); }
  const hasCardio = cardioEquipment.length > 0;
  const hasStrength = strengthEquipment.length > 0;
  const mode: TrainingMode = hasCardio && !hasStrength ? 'cardio_only' : hasCardio ? 'mixed' : hasStrength ? 'strength_only' : 'bodyweight';
  return { selected, cardioEquipment, strengthEquipment, cardioMachines: machines, outdoor, mode };
}

const CARDIO_GOALS: Goal[] = ['fat_loss', 'endurance', 'fitness', 'recomp', 'maintenance'];

interface Slot { label?: string; movement?: Movement[]; muscles?: MuscleGroup[]; compound?: boolean; kind?: 'main' | 'acc' | 'core' | 'cond' | 'mob' }
interface DayPlan { name: string; slots: Slot[] }

const S = {
  squat: { movement: ['squat'], compound: true, kind: 'main' } as Slot,
  hinge: { movement: ['hinge'], compound: true, kind: 'main' } as Slot,
  lunge: { movement: ['lunge'], kind: 'acc' } as Slot,
  pushH: { movement: ['push_h'], compound: true, kind: 'main' } as Slot,
  pushV: { movement: ['push_v'], muscles: ['front_delts', 'shoulders'], compound: true, kind: 'main' } as Slot,
  pullV: { movement: ['pull_v'], compound: true, kind: 'main' } as Slot,
  pullH: { movement: ['pull_h'], muscles: ['back', 'lats'], compound: true, kind: 'main' } as Slot,
  chestIso: { muscles: ['chest'], compound: false, kind: 'acc' } as Slot,
  sideDelt: { muscles: ['side_delts'], kind: 'acc' } as Slot,
  rearDelt: { muscles: ['rear_delts'], kind: 'acc' } as Slot,
  biceps: { muscles: ['biceps'], compound: false, kind: 'acc' } as Slot,
  triceps: { muscles: ['triceps'], compound: false, kind: 'acc' } as Slot,
  quadIso: { muscles: ['quads'], compound: false, kind: 'acc' } as Slot,
  hamIso: { muscles: ['hamstrings'], compound: false, kind: 'acc' } as Slot,
  glute: { muscles: ['glutes'], kind: 'acc' } as Slot,
  calves: { muscles: ['calves'], kind: 'acc' } as Slot,
  core: { movement: ['core'], kind: 'core' } as Slot,
  cond: { kind: 'cond' } as Slot,
  mob: { kind: 'mob' } as Slot,
};

const SPLITS: Record<SplitKind, DayPlan[]> = {
  full_body: [
    { name: 'Full Body A', slots: [S.squat, S.pushH, S.pullV, S.hinge, S.sideDelt, S.core, S.biceps, S.triceps] },
    { name: 'Full Body B', slots: [S.hinge, S.pushV, S.pullH, S.lunge, S.chestIso, S.core, S.triceps, S.calves] },
    { name: 'Full Body C', slots: [S.squat, S.pullH, S.pushH, S.glute, S.rearDelt, S.core, S.biceps, S.hamIso] },
  ],
  upper_lower: [
    { name: 'Upper A', slots: [S.pushH, S.pullH, S.pushV, S.pullV, S.sideDelt, S.biceps, S.triceps] },
    { name: 'Lower A', slots: [S.squat, S.hinge, S.lunge, S.hamIso, S.calves, S.core] },
    { name: 'Upper B', slots: [S.pullV, S.pushH, S.pullH, S.chestIso, S.rearDelt, S.triceps, S.biceps] },
    { name: 'Lower B', slots: [S.hinge, S.squat, S.glute, S.quadIso, S.calves, S.core] },
  ],
  ppl: [
    { name: 'Push', slots: [S.pushH, S.pushV, S.chestIso, S.sideDelt, S.triceps, S.triceps] },
    { name: 'Pull', slots: [S.pullV, S.pullH, S.pullH, S.rearDelt, S.biceps, S.biceps] },
    { name: 'Legs', slots: [S.squat, S.hinge, S.lunge, S.quadIso, S.hamIso, S.calves, S.core] },
  ],
  ppl_ul: [
    { name: 'Upper', slots: [S.pushH, S.pullH, S.pushV, S.pullV, S.biceps, S.triceps] },
    { name: 'Lower', slots: [S.squat, S.hinge, S.lunge, S.calves, S.core] },
    { name: 'Push', slots: [S.pushH, S.pushV, S.chestIso, S.sideDelt, S.triceps] },
    { name: 'Pull', slots: [S.pullV, S.pullH, S.rearDelt, S.biceps, S.biceps] },
    { name: 'Legs', slots: [S.hinge, S.squat, S.quadIso, S.hamIso, S.glute, S.calves] },
  ],
  bro_split: [
    { name: 'Petto', slots: [S.pushH, S.pushH, S.chestIso, S.chestIso, S.triceps] },
    { name: 'Schiena', slots: [S.pullV, S.pullH, S.pullH, S.pullV, S.rearDelt] },
    { name: 'Gambe', slots: [S.squat, S.hinge, S.lunge, S.quadIso, S.hamIso, S.calves] },
    { name: 'Spalle', slots: [S.pushV, S.sideDelt, S.sideDelt, S.rearDelt, S.core] },
    { name: 'Braccia', slots: [S.biceps, S.triceps, S.biceps, S.triceps, S.core] },
  ],
  home: [
    { name: 'Casa A', slots: [S.squat, S.pushH, S.pullH, S.glute, S.core, S.cond] },
    { name: 'Casa B', slots: [S.lunge, S.pushV, S.pullV, S.hinge, S.core, S.cond] },
  ],
  conditioning: [
    { name: 'Ricondizionamento A', slots: [S.squat, S.pushH, S.pullH, S.lunge, S.core, S.cond] },
    { name: 'Ricondizionamento B', slots: [S.hinge, S.pushV, S.pullV, S.glute, S.core, S.cond] },
  ],
  cardio: [],
};

export const SPLIT_NAMES: Record<SplitKind, string> = {
  full_body: 'Full Body', upper_lower: 'Upper/Lower', ppl: 'Push/Pull/Legs', bro_split: 'Bro Split',
  ppl_ul: 'Ipertrofia 5 giorni (Upper/Lower + PPL)', home: 'Allenamento a casa', conditioning: 'Dimagrimento e ricondizionamento',
  cardio: 'Programma cardio',
};

export function chooseSplit(p: Profile): SplitKind {
  const d = p.daysPerWeek;
  const homeOnly = p.location?.length && p.location.every((l) => l === 'home' || l === 'outdoor') && !p.fullGym;
  // con la sola attrezzatura cardio non esiste uno split muscolare possibile
  if (analyzeEquipment(p).mode === 'cardio_only') return 'cardio';
  if (p.split === 'full_body') return 'full_body';
  if (p.split === 'upper_lower') return 'upper_lower';
  if (p.split === 'ppl') return 'ppl';
  if (p.split === 'bro_split') return 'bro_split';
  const goals = p.goals ?? [];
  // le macchine cardio non contano come attrezzatura per i pesi
  if (homeOnly && (p.equipment ?? []).filter((e) => !CARDIO_EQUIPMENT.includes(e)).length < 6) return 'home';
  if ((goals.includes('fat_loss') || goals.includes('fitness') || goals.includes('endurance')) && d <= 3 && !goals.includes('hypertrophy')) return 'conditioning';
  if (d <= 3) return p.level === 'advanced' && d === 3 && goals.includes('hypertrophy') ? 'ppl' : 'full_body';
  if (d === 4) return 'upper_lower';
  if (d === 5) return goals.includes('hypertrophy') && p.level !== 'beginner' ? 'ppl_ul' : 'upper_lower';
  return 'ppl';
}

interface Prescription { sets: number; repMin: number; repMax: number; restSec: number }

export function prescription(goals: Goal[], level: Profile['level'], compound: boolean, style: Profile['sessionStyle']): Prescription {
  let p: Prescription;
  const g = goals[0] ?? 'fitness';
  if (goals.includes('strength') && compound) p = { sets: 4, repMin: 3, repMax: 6, restSec: 180 };
  else if (goals.includes('hypertrophy') || g === 'recomp') p = compound ? { sets: 3, repMin: 6, repMax: 10, restSec: 120 } : { sets: 3, repMin: 10, repMax: 15, restSec: 75 };
  else if (goals.includes('endurance')) p = { sets: 3, repMin: 12, repMax: 20, restSec: 45 };
  else if (goals.includes('fat_loss')) p = compound ? { sets: 3, repMin: 8, repMax: 12, restSec: 75 } : { sets: 3, repMin: 12, repMax: 15, restSec: 45 };
  else p = compound ? { sets: 3, repMin: 8, repMax: 12, restSec: 90 } : { sets: 3, repMin: 10, repMax: 15, restSec: 60 };
  if (level === 'beginner') p.sets = Math.max(2, p.sets - (compound ? 0 : 1));
  if (level === 'advanced' && compound) p.sets += 1;
  if (style === 'short_intense') p.restSec = Math.max(30, Math.round(p.restSec * 0.7));
  return p;
}

export function availableEquipment(p: Profile): Set<Equipment> {
  const s = new Set<Equipment>(p.fullGym ? FULL_GYM : p.equipment ?? []);
  s.add('bodyweight');
  if (p.location?.includes('commercial_gym')) FULL_GYM.forEach((e) => s.add(e));
  return s;
}

function slotCandidates(slot: Slot, p: Profile, eq: Set<Equipment>): Exercise[] {
  return EXERCISES.filter((e) => {
    if (!isAvailable(e, eq)) return false;
    if (p.exercisePrefs?.avoidIds?.includes(e.id)) return false;
    if (slot.kind === 'cond') return e.family === 'conditioning' || e.family === 'plyo';
    if (slot.kind === 'mob') return e.kind === 'mobility';
    if (e.kind === 'mobility' || e.kind === 'cardio') return false;
    if (slot.movement && !slot.movement.includes(e.movement)) return false;
    if (slot.muscles && !slot.muscles.some((m) => e.primary.includes(m))) return false;
    if (slot.compound === false && e.mechanic !== 'isolation' && !(slot.muscles?.includes('glutes'))) {
      // per isolamenti accettiamo comunque esercizi a corpo libero mirati se mancano alternative
      return false;
    }
    if (slot.compound && e.mechanic === 'isolation') return false;
    return true;
  });
}

function scoreExercise(e: Exercise, p: Profile, history: Set<string>): number {
  let s = 0;
  const diffMax = p.level === 'beginner' ? 1 : p.level === 'intermediate' ? 2 : 3;
  if (e.difficulty > diffMax) s -= 6 * (e.difficulty - diffMax);
  if (p.level === 'beginner' && (e.kind === 'machine' || e.kind === 'cable')) s += 2;
  if (p.level !== 'beginner' && e.kind === 'free') s += 2;
  if (p.exercisePrefs?.preferFree && e.kind === 'free') s += 3;
  if (p.exercisePrefs?.preferMachines && (e.kind === 'machine' || e.kind === 'cable')) s += 3;
  const stressHits = e.stress.filter((z) => p.injuries?.includes(z)).length;
  s -= stressHits * 8;
  if (history.has(e.id)) s += 3; // esercizi già conosciuti
  if (p.focusMuscles?.some((m) => e.primary.includes(m))) s += 2;
  if (e.unilateral) s -= 0.5;
  // preferenza per i "grandi classici" dove disponibili
  const staples = ['back_squat', 'bench_press_bb', 'deadlift', 'rdl_bb', 'pull_up', 'lat_pulldown', 'seated_cable_row', 'ohp_bb', 'seated_db_press', 'leg_press', 'hip_thrust_bb', 'goblet_squat', 'push_up', 'db_row', 'incline_press_db', 'lateral_raise_db', 'rope_pushdown', 'db_curl', 'lying_leg_curl', 'leg_extension', 'plank', 'standing_calf_raise', 'bench_press_db', 'inverted_row', 'bw_squat', 'glute_bridge', 'reverse_lunge'];
  if (staples.includes(e.id)) s += 2.5;
  return s;
}

function exerciseCount(minutes: number, style: Profile['sessionStyle']) {
  const per = style === 'short_intense' ? 7 : 9;
  return Math.max(2, Math.min(9, Math.floor((minutes - 5) / per)));
}

export function pickDays(daysPerWeek: number, preferred: number[]): number[] {
  const n = Math.max(1, Math.min(7, daysPerWeek));
  const pref = Array.from(new Set(preferred)).filter((d) => d >= 0 && d < 7).sort();
  if (pref.length >= n) return pref.slice(0, n);
  const patterns: Record<number, number[]> = { 1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  const base = new Set(pref);
  for (const d of patterns[n]) { if (base.size >= n) break; base.add(d); }
  for (let d = 0; base.size < n && d < 7; d++) base.add(d);
  return [...base].sort();
}

export interface GeneratedProgram {
  program: Program; templates: WorkoutTemplate[]; warnings: string[]; split: SplitKind;
  /** informazioni sulle scelte fatte (non avvisi) */
  notes: string[];
  analysis: EquipmentAnalysis;
  mode: TrainingMode;
  /** cardio previsto in una settimana tipo, confrontato con l'obiettivo consigliato */
  cardioWeek: CardioWeek;
}
export interface CardioWeek {
  minutes: number; sessions: number; kcal: number | null; target: { start: number; goal: number }; weightLoss: boolean;
  /** minuti settimanali a fine progressione automatica (uguale a minutes se non c'è progressione) */
  progressed: number;
  /** minuti medi di cardio per seduta e massimo consentito dal tempo della seduta */
  perSession: number; maxPerSession: number;
}
export interface GenerateOptions {
  split?: SplitKind; daysPerWeek?: number; minutes?: number; variant?: number;
  /** scelte dell'utente in Genera programma: sedute con cardio e minuti di cardio per seduta */
  cardioDays?: number; cardioMinutes?: number;
  /** se le schede ripetute non permettono il numero esatto di sedute con cardio: arrotonda per eccesso (default) o per difetto */
  cardioDaysRound?: 'up' | 'down';
}

const round5 = (n: number) => Math.round(n / 5) * 5;
const isLowerDay = (name: string) => /lower|legs|gambe/i.test(name);
const HARD: CardioKind[] = ['intervals', 'hiit'];

/** Dimagrimento: obiettivo esplicito oppure peso obiettivo più basso di almeno 1 kg rispetto al peso attuale. */
export function wantsWeightLoss(p: Pick<Profile, 'goals' | 'weightKg' | 'targetWeightKg'>): boolean {
  if (p.goals?.includes('fat_loss')) return true;
  return !!(p.weightKg > 0 && p.targetWeightKg > 0 && p.targetWeightKg <= p.weightKg - 1);
}

/**
 * Minuti di cardio settimanali consigliati.
 * Riferimenti: OMS 2020, 150–300 min/settimana di attività aerobica moderata per gli adulti;
 * ACSM (Donnelly et al., 2009), oltre 150 min per una perdita di peso modesta e circa 225–420 min per una perdita più marcata.
 * "start" è il punto di partenza del programma, "goal" il livello a cui arrivare con la progressione.
 */
export function weeklyCardioTarget(goals: Goal[], level: Profile['level'], weightLoss: boolean): { start: number; goal: number } {
  if (weightLoss) return level === 'beginner' ? { start: 100, goal: 200 } : level === 'intermediate' ? { start: 150, goal: 250 } : { start: 180, goal: 300 };
  if (goals.includes('endurance')) return { start: 150, goal: 250 };
  if (goals.some((g) => g === 'fitness' || g === 'recomp' || g === 'maintenance' || g === 'mobility')) return { start: 90, goal: 150 };
  return { start: 40, goal: 90 };
}

/** Massimo di cardio in una seduta mista per il dimagrimento: metà del tempo, così resta spazio per i pesi che preservano il muscolo. */
export function maxCardioPerSession(minutes: number): number {
  return Math.max(10, Math.min(45, Math.floor((minutes * 0.5) / 5) * 5));
}
/** Limite per la scelta manuale: restano sempre almeno 20 minuti per i pesi. */
export function userCardioLimit(minutes: number): number {
  return Math.max(10, Math.floor((minutes - 20) / 5) * 5);
}

/** Quanti giorni della settimana includono cardio: dipende dall'obiettivo, mai automaticamente tutti. */
export function cardioDaysTarget(goals: Goal[], days: number): number {
  if (goals.includes('fat_loss') || goals.includes('endurance')) return Math.min(days, Math.max(1, Math.ceil((days * 2) / 3)));
  if (goals.some((g) => g === 'fitness' || g === 'recomp' || g === 'maintenance' || g === 'mobility')) return Math.max(1, Math.ceil(days / 2));
  return days >= 4 ? 2 : 1; // massa e forza: poco cardio, leggero, per non interferire con il recupero
}

/** Minuti di cardio in una seduta mista, ricavati dal tempo totale disponibile. */
export function cardioMinutesFor(goals: Goal[], minutes: number): number {
  const share = goals.includes('fat_loss') || goals.includes('endurance') ? 0.35 : goals.some((g) => CARDIO_GOALS.includes(g)) ? 0.25 : 0.2;
  const cap = goals.includes('endurance') ? 40 : 30;
  const m = Math.max(10, Math.min(cap, round5(minutes * share)));
  return Math.max(5, Math.min(m, minutes - 10));
}

function mixedKinds(goals: Goal[], beginner: boolean): CardioKind[] {
  if (goals.includes('fat_loss')) return beginner ? ['incline', 'steady', 'incline'] : ['intervals', 'incline', 'incline'];
  if (goals.includes('endurance')) return ['intervals', 'endurance', 'steady'];
  if (goals.includes('hypertrophy') || goals.includes('strength')) return ['incline', 'steady'];
  return ['steady', 'intervals', 'incline'];
}

function cardioOnlySequence(goals: Goal[], beginner: boolean): CardioKind[] {
  if (beginner) return ['steady', 'intervals', 'steady', 'endurance', 'easy', 'steady', 'easy'];
  if (goals.includes('fat_loss')) return ['intervals', 'incline', 'steady', 'hiit', 'endurance', 'easy', 'steady'];
  if (goals.includes('endurance')) return ['endurance', 'intervals', 'steady', 'hiit', 'endurance', 'easy', 'intervals'];
  return ['steady', 'intervals', 'endurance', 'incline', 'steady', 'easy', 'intervals'];
}

/** Sceglie la macchina: rotazione tra quelle disponibili, la salita solo dove esiste il tapis roulant. */
function pickMachine(machines: CardioMachine[], kind: CardioKind, k: number): CardioMachine {
  const indoor = machines.filter((m) => m !== 'outdoor_walk' && m !== 'outdoor_run');
  const pool = indoor.length ? indoor : machines;
  if (kind === 'incline' && pool.includes('treadmill')) return 'treadmill';
  if (HARD.includes(kind)) { const ok = pool.filter((m) => m !== 'jump_rope' || pool.length === 1); return ok[k % ok.length]; }
  return pool[k % pool.length];
}

/**
 * Riduce una scheda finché la durata stimata non supera i minuti disponibili:
 * prima gli accessori, poi le serie, poi (solo se serve) il cardio.
 */
export function fitToBudget(t: WorkoutTemplate, minutes: number): WorkoutTemplate {
  const ex = t.exercises.map((e) => ({ ...e }));
  const total = () => templateMinutesExact({ exercises: ex });
  let guard = 0;
  while (total() > minutes + 1e-9 && guard++ < 200) {
    const strength = ex.filter((e) => !e.cardio);
    if (strength.length > 3) { ex.splice(ex.lastIndexOf(strength[strength.length - 1]), 1); continue; }
    const most = strength.filter((e) => e.sets > 2).sort((a, b) => b.sets - a.sets)[0];
    if (most) { most.sets -= 1; continue; }
    if (strength.length > 2) { ex.splice(ex.lastIndexOf(strength[strength.length - 1]), 1); continue; }
    const c = ex.find((e) => e.cardio && (e.cardio.mode === 'intervals' ? (e.cardio.repeat ?? 1) > 2 : e.cardio.durationMin > 10));
    if (c?.cardio) {
      const pl = c.cardio;
      c.cardio = pl.mode === 'intervals'
        ? { ...pl, repeat: (pl.repeat ?? 2) - 1, durationMin: Math.round((planMinutes({ ...pl, repeat: (pl.repeat ?? 2) - 1 })) * 10) / 10 }
        : { ...pl, durationMin: Math.max(10, pl.durationMin - 5) };
      if (c.cardio.progression) c.cardio.progression = { ...c.cardio.progression, capMin: Math.min(c.cardio.progression.capMin, minutes) };
      c.repMin = c.repMax = Math.round(planMinutes(c.cardio));
      continue;
    }
    if (strength.length > 1) { ex.splice(ex.lastIndexOf(strength[strength.length - 1]), 1); continue; }
    break;
  }
  return { ...t, exercises: ex };
}

export function generateProgram(p: Profile, sessions: WorkoutSession[] = [], opts: GenerateOptions = {}): GeneratedProgram {
  const analysis = analyzeEquipment(p);
  const days = opts.daysPerWeek ?? p.daysPerWeek;
  const minutes = opts.minutes ?? p.minutesPerSession;
  const goals: Goal[] = p.goals?.length ? p.goals : ['fitness'];
  const weightLoss = wantsWeightLoss(p);
  // per le scelte sul cardio il dimagrimento conta anche se è indicato solo dal peso obiettivo
  const cardioGoals: Goal[] = weightLoss && !goals.includes('fat_loss') ? [...goals, 'fat_loss'] : goals;
  // Caso A: sola attrezzatura cardio → programma esclusivamente cardiovascolare (anche se lo split scelto era muscolare)
  if (analysis.mode === 'cardio_only' || (opts.split === 'cardio' && analysis.cardioMachines.length > 0)) {
    return generateCardioProgram(p, analysis, { days, minutes, goals: cardioGoals, variant: opts.variant ?? 0, weightLoss });
  }
  const split: SplitKind = opts.split && opts.split !== 'cardio' ? opts.split : chooseSplit(p) === 'cardio' ? 'full_body' : chooseSplit(p);
  const eq = availableEquipment(p);
  const history = new Set<string>(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  const plans = SPLITS[split];
  const now = new Date().toISOString();
  const usedWeek = new Map<string, number>();
  const warnings: string[] = [];
  const notes: string[] = [];
  const lim = cardioLimits(p);
  const variant = opts.variant ?? 0;

  // numero di sessioni distinte: per split a giorni fissi uso la lunghezza del piano
  const distinct = split === 'full_body' ? Math.min(3, days) : split === 'ppl' && days === 6 ? 3 : Math.min(plans.length, days);

  // Caso B: macchine cardio disponibili → il cardio è parte della scheda, distribuito sui giorni in base all'obiettivo.
  // Caso C: senza macchine cardio il cardio entra solo come attività all'aperto, se l'utente si allena anche fuori.
  const cardioGoal = cardioGoals.some((g) => CARDIO_GOALS.includes(g));
  const target = weeklyCardioTarget(cardioGoals, p.level, weightLoss);
  const userMin = opts.cardioMinutes ? Math.max(5, Math.min(userCardioLimit(minutes), round5(opts.cardioMinutes))) : null;
  const maxPer = userMin ?? (weightLoss ? maxCardioPerSession(minutes) : cardioMinutesFor(cardioGoals, minutes));
  const cardioMachines = analysis.mode === 'mixed' ? analysis.cardioMachines
    : analysis.outdoor && cardioGoal ? analysis.cardioMachines : [];
  const occurrences = Array(distinct).fill(0);
  for (let i = 0; i < days; i++) occurrences[i % Math.max(1, distinct)]++;
  const withCardio = new Set<number>();
  if (cardioMachines.length && distinct > 0) {
    // dimagrimento: tanti giorni quanti servono per avvicinarsi ai minuti settimanali consigliati (almeno 2 su 3)
    const userDays = opts.cardioDays != null ? Math.max(1, Math.min(days, opts.cardioDays)) : null;
    const daysTarget = userDays ?? (weightLoss
      ? Math.min(days, Math.max(cardioDaysTarget(cardioGoals, days), Math.ceil(target.start / maxPer)))
      : cardioDaysTarget(cardioGoals, days));
    // le schede si ripetono nella settimana: per il dimagrimento meglio un giorno di cardio in più che uno in meno
    const roundUp = userDays != null ? opts.cardioDaysRound !== 'down' : weightLoss;
    const strengthFocus = !cardioGoals.some((g) => g === 'fat_loss' || g === 'endurance');
    const order = Array.from({ length: distinct }, (_, i) => i)
      .sort((a, b) => (strengthFocus ? Number(isLowerDay(plans[a % plans.length].name)) - Number(isLowerDay(plans[b % plans.length].name)) : 0) || (a % 2) - (b % 2) || a - b);
    let count = 0;
    for (const i of order) {
      if (count >= daysTarget) break;
      if (count + occurrences[i] > daysTarget && count > 0 && !roundUp) continue;
      withCardio.add(i); count += occurrences[i];
    }
  }
  const kinds = mixedKinds(cardioGoals, lim.beginner);
  let hardDays = 0, k = variant;
  const cardioDayCount = [...withCardio].reduce((a, i) => a + occurrences[i], 0);
  // minuti per seduta: per il dimagrimento si ripartisce l'obiettivo settimanale sui giorni con cardio
  const perSession = userMin ?? (weightLoss && cardioDayCount
    ? Math.max(10, Math.min(maxPer, Math.ceil(target.start / cardioDayCount / 5) * 5))
    : maxPer);
  // con la progressione il cardio cresce verso il livello "goal" delle linee guida, sempre dentro metà seduta
  const progressCap = weightLoss && cardioDayCount ? Math.min(maxPer, Math.max(perSession, Math.ceil(target.goal / cardioDayCount / 5) * 5)) : perSession;

  const templates: WorkoutTemplate[] = [];
  for (let i = 0; i < distinct; i++) {
    const plan = plans[i % plans.length];
    // cardio della seduta (deciso prima: il tempo rimanente va ai pesi)
    let cardio: TemplateExercise | null = null;
    if (withCardio.has(i)) {
      // i principianti partono più bassi e salgono con la progressione automatica
      const cmin = userMin ?? (lim.beginner && weightLoss ? Math.min(perSession, 30) : perSession);
      let kind = kinds[k % kinds.length];
      if (HARD.includes(kind) && (isLowerDay(plan.name) || hardDays + occurrences[i] > lim.maxHardPerWeek)) kind = 'steady';
      const machine = pickMachine(cardioMachines, kind, k);
      const built = buildCardio(machine, kind, cmin, p);
      if (built.plan.mode === 'intervals') hardDays += occurrences[i];
      if (userMin) built.plan.progression = null;
      else if (weightLoss && built.plan.mode === 'steady' && built.plan.durationMin < progressCap) built.plan.progression = { stepMin: 5, capMin: progressCap };
      cardio = templateCardio(built.exerciseId, built.plan, 'Dopo la parte muscolare');
      k++;
    }
    const strengthMinutes = minutes - (cardio?.cardio ? planMinutes(cardio.cardio) : 0);
    // abbondo con gli slot: fitToBudget toglie poi gli accessori in eccesso rispetto al tempo reale stimato
    const nEx = Math.max(exerciseCount(strengthMinutes, p.sessionStyle), Math.min(9, Math.floor(strengthMinutes / 5.5)));
    let slots = [...plan.slots];
    // focus muscolari: aggiungi uno slot dedicato se c'è spazio
    for (const m of p.focusMuscles ?? []) {
      if (slots.length >= nEx + 1) break;
      if (plan.slots.some((s) => s.muscles?.includes(m))) slots.splice(2, 0, { muscles: [m], kind: 'acc' });
    }
    // meno allenati: rimuovi slot accessori relativi
    slots = slots.filter((s) => !(s.kind === 'acc' && s.muscles?.every((m) => p.lessMuscles?.includes(m))));
    if (goals.includes('mobility')) slots.push(S.mob);
    // il condizionamento a corpo libero serve solo se nella seduta non c'è già il cardio
    if (!cardio && (cardioGoals.includes('fat_loss') || goals.includes('endurance')) && !slots.some((s) => s.kind === 'cond')) slots.push(S.cond);
    if (cardio) slots = slots.filter((s) => s.kind !== 'cond');
    // limita in base al tempo mantenendo i fondamentali
    const mains = slots.filter((s) => s.kind === 'main');
    const others = slots.filter((s) => s.kind !== 'main');
    slots = [...mains, ...others].slice(0, Math.max(nEx, Math.min(mains.length, nEx)));
    const exercises: TemplateExercise[] = [];
    const usedHere = new Set<string>();
    for (const slot of slots) {
      let cands = slotCandidates(slot, p, eq).filter((e) => !usedHere.has(e.id));
      if (!cands.length && slot.compound === false) cands = slotCandidates({ ...slot, compound: undefined }, p, eq).filter((e) => !usedHere.has(e.id));
      if (!cands.length) continue;
      const scored = cands.map((e) => ({ e, s: scoreExercise(e, p, history) - (usedWeek.get(e.id) ?? 0) * 2.5 + ((e.id.length * 7 + i * 13) % 5) * 0.05 }))
        .sort((a, b) => b.s - a.s);
      const best = scored[0].e;
      usedHere.add(best.id);
      usedWeek.set(best.id, (usedWeek.get(best.id) ?? 0) + 1);
      const compound = best.mechanic === 'compound' && slot.kind !== 'core';
      let pr = prescription(goals, p.level, compound, p.sessionStyle);
      if (slot.kind === 'core') pr = { sets: p.level === 'beginner' ? 2 : 3, repMin: best.tracking === 'time' ? 30 : 10, repMax: best.tracking === 'time' ? 45 : 15, restSec: 60 };
      if (slot.kind === 'cond') pr = { sets: 3, repMin: best.tracking === 'time' ? 30 : 10, repMax: best.tracking === 'time' ? 45 : 15, restSec: 45 };
      if (slot.kind === 'mob') pr = { sets: 2, repMin: 30, repMax: 40, restSec: 20 };
      if (p.focusMuscles?.some((m) => best.primary.includes(m))) pr.sets += 1;
      if (p.lessMuscles?.some((m) => best.primary.includes(m))) pr.sets = Math.max(2, pr.sets - 1);
      const hist = exerciseHistory(sessions, best.id);
      const last = hist[hist.length - 1];
      exercises.push({ uid: uid('te_'), exerciseId: best.id, ...pr, targetWeight: last?.bestWeight || null, notes: '' });
    }
    if (cardio) exercises.push(cardio);
    const t: WorkoutTemplate = { id: uid('tpl_'), name: cardio ? `${plan.name} + Cardio` : plan.name, exercises, source: 'generated', createdAt: now, updatedAt: now, notes: '' };
    templates.push(capProgression(fitToBudget(t, minutes), minutes));
  }

  // calendario settimanale
  const dayIdx = pickDays(days, p.preferredDays ?? []);
  const schedule: (string | null)[] = Array(7).fill(null);
  dayIdx.forEach((d, i) => { schedule[d] = templates[i % templates.length]?.id ?? null; });

  // avvisi su infortuni: segnalazione, non diagnosi
  if (p.injuries?.length) {
    warnings.push('Hai indicato fastidi o limitazioni: abbiamo ridotto gli esercizi che sollecitano quelle zone. In caso di dolore interrompi l’esercizio e rivolgiti a un medico o a un fisioterapista.');
    const risky = templates.flatMap((t) => t.exercises).map((te) => EXERCISES.find((e) => e.id === te.exerciseId)!).filter((e) => e && e.stress.some((z) => p.injuries.includes(z)));
    if (risky.length) warnings.push(`Esercizi da valutare con prudenza: ${Array.from(new Set(risky.map((e) => e.name))).join(', ')}.`);
  }
  if (analysis.mode === 'bodyweight') warnings.push('Con poca attrezzatura il programma usa soprattutto esercizi a corpo libero: aggiungendo elastici o manubri potrai progredire più facilmente.');
  const cardioDays = dayIdx.filter((_, i) => templates[i % templates.length]?.exercises.some((e) => e.cardio)).length;
  const cardioWeek = weekOf(dayIdx.map((_, i) => templates[i % templates.length]), p, target, weightLoss, cardioMachines.length ? userCardioLimit(minutes) : 0);
  if (weightLoss && !goals.includes('fat_loss')) notes.push(`Il tuo peso obiettivo (${p.targetWeightKg} kg) è più basso di quello attuale (${p.weightKg} kg): il cardio è impostato per il dimagrimento.`);
  if (cardioDays) {
    const used = Array.from(new Set(templates.flatMap((t) => t.exercises.filter((e) => e.cardio).map((e) => machineLabel(e.cardio!.machine)))));
    notes.push(`Cardio inserito in ${cardioDays} ${cardioDays === 1 ? 'giorno' : 'giorni'} su ${days} (${used.join(', ')}), alla fine della seduta e senza superare i ${minutes} minuti disponibili.`);
    notes.push(...shortfallNotes(cardioWeek, cardioDays, days, minutes, weightLoss, false));
  } else if (analysis.mode === 'strength_only' && cardioGoal) {
    notes.push('Non hai selezionato macchine cardio, quindi la scheda non ne prevede. Se ti va, nei giorni di riposo puoi aggiungere camminate a passo svelto: indica “all’aperto” tra i luoghi di allenamento per inserirle nel programma.');
  }

  const program: Program = {
    id: uid('prg_'),
    name: `${SPLIT_NAMES[split]}${cardioDays ? ' + cardio' : ''} · ${days} giorni`,
    description: `Generato il ${new Date().toLocaleDateString('it-IT')} per: ${goals.map((g) => GOAL_INFO[g].label.toLowerCase()).join(', ')}. Sessioni da circa ${minutes} minuti.`,
    schedule, active: true, source: 'generated', createdAt: now,
    meta: { split, goal: goals[0], level: p.level, mode: cardioDays ? 'mixed' : analysis.mode },
  };
  templates.forEach((t) => { t.programId = program.id; });
  return { program, templates, warnings, notes, split, analysis, mode: cardioDays ? 'mixed' : analysis.mode, cardioWeek };
}

/** La progressione del cardio non deve mai far superare alla seduta i minuti disponibili. */
function capProgression(t: WorkoutTemplate, minutes: number): WorkoutTemplate {
  const spare = minutes - templateMinutesExact(t);
  return { ...t, exercises: t.exercises.map((e) => {
    if (!e.cardio?.progression) return e;
    const cap = Math.min(e.cardio.progression.capMin, Math.floor(planMinutes(e.cardio) + spare));
    return { ...e, cardio: { ...e.cardio, progression: cap > planMinutes(e.cardio) + 0.5 ? { ...e.cardio.progression, capMin: cap } : null } };
  }) };
}

/** Minuti e calorie (stima) di cardio in una settimana tipo del programma. */
function weekOf(dayTemplates: (WorkoutTemplate | undefined)[], p: Profile, target: { start: number; goal: number }, weightLoss: boolean, maxPerSession: number): CardioWeek {
  const plans = dayTemplates.flatMap((t) => t?.exercises.filter((e) => e.cardio).map((e) => e.cardio!) ?? []);
  const minutes = Math.round(plans.reduce((a, c) => a + planMinutes(c), 0));
  const progressed = Math.round(plans.reduce((a, c) => a + Math.max(planMinutes(c), c.progression?.capMin ?? 0), 0));
  const kcals = plans.map((c) => estimatePlanKcal(c, p.weightKg));
  const sessions = dayTemplates.filter((t) => t?.exercises.some((e) => e.cardio)).length;
  return {
    minutes, progressed, sessions, target, weightLoss, maxPerSession,
    perSession: sessions ? Math.round(minutes / sessions) : 0,
    kcal: kcals.some((x) => x == null) || !plans.length ? null : kcals.reduce<number>((a, b) => a + (b ?? 0), 0),
  };
}

/**
 * Note sul cardio settimanale per il dimagrimento, coerenti con quello che l'utente può fare:
 * prima la progressione automatica, poi i minuti per seduta (se la seduta ha spazio), solo alla fine sedute più lunghe o più giorni.
 */
function shortfallNotes(w: CardioWeek, cardioDays: number, days: number, minutes: number, weightLoss: boolean, cardioOnly: boolean): string[] {
  if (!weightLoss || !cardioDays) return [];
  const out: string[] = [];
  if (w.minutes >= w.target.start) {
    out.push(`Circa ${w.minutes} minuti di cardio a settimana, in linea con le indicazioni per il dimagrimento (linee guida OMS e ACSM: almeno ${w.target.start})${w.progressed > w.minutes + 4 ? `. Quando completi il cardio la durata sale da sola di 5 minuti a seduta, fino a circa ${w.progressed} minuti a settimana` : ''}.`);
  } else if (w.progressed >= w.target.start) {
    out.push(`Si parte da ${w.minutes} minuti a settimana per abituarti, poi la durata sale da sola di 5 minuti a seduta quando completi il cardio, fino a circa ${w.progressed} minuti a settimana.`);
  } else {
    const needPer = Math.ceil(w.target.start / cardioDays / 5) * 5;
    if (!cardioOnly && needPer <= w.maxPerSession) {
      out.push(`Così arrivi a ${w.progressed} minuti di cardio a settimana, sotto i ${w.target.start} consigliati. Le tue sedute da ${minutes} minuti hanno spazio: alza il cardio a ${needPer} minuti per seduta qui sopra (i pesi si adattano al tempo che resta).`);
    } else if (cardioDays < days) {
      out.push(`Così arrivi a ${w.progressed} minuti di cardio a settimana, sotto i ${w.target.start} consigliati. Per avvicinarti aumenta le sedute con cardio qui sopra, fino a ${days}.`);
    } else {
      const longer = cardioOnly ? needPer : needPer + 20;
      out.push(`Così arrivi a ${w.progressed} minuti di cardio a settimana, sotto i ${w.target.start} consigliati. Con ${days} sedute servirebbero circa ${needPer} minuti di cardio ciascuna, cioè sedute da almeno ${longer} minuti, oppure un giorno di allenamento in più.`);
    }
  }
  out.push('Il risultato sulla bilancia dipende soprattutto dall’alimentazione: un deficit moderato (circa 300–500 kcal al giorno) insieme al cardio e ai pesi è la combinazione più efficace.');
  return out;
}

/** Programma esclusivamente cardiovascolare (Caso A), costruito su obiettivo, livello, giorni e tempo. */
function generateCardioProgram(p: Profile, analysis: EquipmentAnalysis, o: { days: number; minutes: number; goals: Goal[]; variant: number; weightLoss: boolean }): GeneratedProgram {
  const { days, minutes, goals, variant, weightLoss } = o;
  const lim = cardioLimits(p);
  const machines = analysis.cardioMachines;
  const now = new Date().toISOString();
  const warnings: string[] = [];
  const notes: string[] = [];
  // tipologie per giorno, con al massimo N sedute intense a settimana e mai due di fila
  const base = cardioOnlySequence(goals, lim.beginner);
  const seq: CardioKind[] = [];
  let hard = 0;
  for (let i = 0; i < days; i++) {
    let kind = base[(i + (variant % 2)) % base.length];
    if (HARD.includes(kind) && (hard >= lim.maxHardPerWeek || HARD.includes(seq[i - 1]))) kind = 'steady';
    if (HARD.includes(kind)) hard++;
    seq.push(kind);
  }
  const templates: WorkoutTemplate[] = [];
  const byKey = new Map<string, WorkoutTemplate>();
  const dayTemplates: WorkoutTemplate[] = [];
  seq.forEach((kind, i) => {
    const machine = pickMachine(machines, kind, i + variant);
    // principianti: si parte da sedute brevi e si cresce di qualche minuto alla volta fino al tempo disponibile
    const start = lim.beginner ? Math.min(minutes, kind === 'endurance' ? 25 : 20) : minutes;
    const parts: { machine: CardioMachine; minutes: number }[] = [];
    const second = machines.find((m) => m !== machine && m !== 'jump_rope' && m !== 'outdoor_run');
    if (!lim.beginner && second && start >= 40 && !HARD.includes(kind)) {
      const a = round5(start * 0.6);
      parts.push({ machine, minutes: a }, { machine: second, minutes: start - a });
    } else parts.push({ machine, minutes: start });
    const key = `${kind}|${parts.map((x) => `${x.machine}:${x.minutes}`).join(',')}`;
    let t = byKey.get(key);
    if (!t) {
      const exercises = parts.map((x) => {
        const b = buildCardio(x.machine, kind, x.minutes, p);
        if (lim.beginner && b.plan.mode === 'steady' && b.plan.durationMin < minutes) b.plan.progression = { stepMin: kind === 'endurance' ? 3 : 2, capMin: minutes };
        return templateCardio(b.exerciseId, b.plan);
      });
      t = fitToBudget({ id: uid('tpl_'), name: `${KIND_NAME[kind]} · ${parts.map((x) => machineLabel(x.machine)).join(' + ')}`, exercises, source: 'generated', createdAt: now, updatedAt: now, notes: '' }, minutes);
      byKey.set(key, t);
      templates.push(t);
    }
    dayTemplates.push(t);
  });

  const dayIdx = pickDays(days, p.preferredDays ?? []);
  const schedule: (string | null)[] = Array(7).fill(null);
  dayIdx.forEach((d, i) => { schedule[d] = dayTemplates[i]?.id ?? null; });

  const eqNames = analysis.cardioEquipment.map((e) => EQUIPMENT_LABEL[e].toLowerCase()).join(', ');
  notes.push(`Hai indicato solo attrezzatura cardio (${eqNames}): il programma è esclusivamente cardiovascolare, senza esercizi a corpo libero o con i pesi.`);
  if (goals.includes('hypertrophy') || goals.includes('strength')) warnings.push('Per aumentare massa o forza servono esercizi con sovraccarico: aggiungendo anche solo manubri o elastici all’attrezzatura, il programma includerà la parte muscolare.');
  if (lim.beginner) notes.push(`Programma progressivo per principianti: si parte da sedute brevi a intensità moderata e la durata cresce automaticamente quando completi le sessioni come previsto, fino a ${minutes} minuti.`);
  if (lim.lowerLimb) notes.push('Per le limitazioni indicate a ginocchio, anca o caviglia abbiamo evitato la corsa: le fasi intense sono camminate veloci o in salita.');
  if (p.injuries?.length) warnings.push('Hai indicato fastidi o limitazioni: abbiamo limitato l’intensità. In caso di dolore, vertigini o affanno eccessivo interrompi e rivolgiti a un medico.');

  const program: Program = {
    id: uid('prg_'), name: `${SPLIT_NAMES.cardio} · ${days} giorni`,
    description: `Generato il ${new Date().toLocaleDateString('it-IT')} per: ${goals.map((g) => GOAL_INFO[g].label.toLowerCase()).join(', ')}. Sedute fino a ${minutes} minuti con ${machines.map(machineLabel).join(', ').toLowerCase()}.`,
    schedule, active: true, source: 'generated', createdAt: now, meta: { split: 'cardio', goal: goals[0], level: p.level, mode: 'cardio_only' },
  };
  templates.forEach((t) => { t.programId = program.id; });
  const cardioWeek = weekOf(dayTemplates, p, weeklyCardioTarget(goals, p.level, weightLoss), weightLoss, minutes);
  if (weightLoss && !p.goals?.includes('fat_loss')) notes.push(`Il tuo peso obiettivo (${p.targetWeightKg} kg) è più basso di quello attuale (${p.weightKg} kg): il programma è impostato per il dimagrimento.`);
  notes.push(...shortfallNotes(cardioWeek, days, days, minutes, weightLoss, true));
  return { program, templates, warnings, notes, split: 'cardio', analysis, mode: 'cardio_only', cardioWeek };
}

/** Sostituti per un esercizio della scheda, filtrati per attrezzatura e infortuni. */
export function substitutes(exerciseId: string, p: Profile): Exercise[] {
  const ex = EXERCISES.find((e) => e.id === exerciseId);
  if (!ex) return [];
  const an = analyzeEquipment(p);
  if (isCardioExercise(ex) || an.mode === 'cardio_only') {
    // cardio: solo attività con le macchine disponibili (cambiare macchina)
    return EXERCISES.filter((e) => e.id !== ex.id && isCardioExercise(e) && an.cardioMachines.includes(machineOf(e.id)))
      .sort((a, b) => Number(machineOf(b.id) === machineOf(ex.id)) - Number(machineOf(a.id) === machineOf(ex.id)));
  }
  const eq = availableEquipment(p);
  return EXERCISES.filter((e) => e.id !== ex.id && e.kind !== 'mobility' && isAvailable(e, eq) && e.primary[0] === ex.primary[0])
    .map((e) => ({ e, s: (e.movement === ex.movement ? 3 : 0) + (e.family === ex.family ? 1 : 0) - e.stress.filter((z) => p.injuries?.includes(z)).length * 4 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.e);
}
