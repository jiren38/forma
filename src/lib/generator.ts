/**
 * Generatore di programmi personalizzati.
 * Considera: obiettivo, livello, giorni, durata, attrezzatura, focus muscolari, infortuni, preferenze, storico.
 */
import { EXERCISES, isAvailable, type Exercise, type Movement } from '@/data/exercises';
import type { Equipment, Goal, MuscleGroup, Program, Profile, TemplateExercise, WorkoutSession, WorkoutTemplate } from './types';
import { FULL_GYM, GOAL_INFO } from './labels';
import { uid } from './util';
import { exerciseHistory } from './stats';

export type SplitKind = 'full_body' | 'upper_lower' | 'ppl' | 'bro_split' | 'ppl_ul' | 'home' | 'conditioning';

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
};

export const SPLIT_NAMES: Record<SplitKind, string> = {
  full_body: 'Full Body', upper_lower: 'Upper/Lower', ppl: 'Push/Pull/Legs', bro_split: 'Bro Split',
  ppl_ul: 'Ipertrofia 5 giorni (Upper/Lower + PPL)', home: 'Allenamento a casa', conditioning: 'Dimagrimento e ricondizionamento',
};

export function chooseSplit(p: Profile): SplitKind {
  const d = p.daysPerWeek;
  const homeOnly = p.location?.length && p.location.every((l) => l === 'home' || l === 'outdoor') && !p.fullGym;
  if (p.split === 'full_body') return 'full_body';
  if (p.split === 'upper_lower') return 'upper_lower';
  if (p.split === 'ppl') return 'ppl';
  if (p.split === 'bro_split') return 'bro_split';
  const goals = p.goals ?? [];
  if (homeOnly && (p.equipment?.length ?? 0) < 6) return 'home';
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

export interface GeneratedProgram { program: Program; templates: WorkoutTemplate[]; warnings: string[]; split: SplitKind }

export function generateProgram(p: Profile, sessions: WorkoutSession[] = [], opts: { split?: SplitKind; daysPerWeek?: number; minutes?: number } = {}): GeneratedProgram {
  const split = opts.split ?? chooseSplit(p);
  const days = opts.daysPerWeek ?? p.daysPerWeek;
  const minutes = opts.minutes ?? p.minutesPerSession;
  const eq = availableEquipment(p);
  const history = new Set<string>(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  const plans = SPLITS[split];
  const nEx = exerciseCount(minutes, p.sessionStyle);
  const now = new Date().toISOString();
  const usedWeek = new Map<string, number>();
  const warnings: string[] = [];
  const goals = p.goals?.length ? p.goals : ['fitness' as Goal];

  // numero di sessioni distinte: per split a giorni fissi uso la lunghezza del piano
  const distinct = split === 'full_body' ? Math.min(3, days) : split === 'ppl' && days === 6 ? 3 : Math.min(plans.length, days);
  const templates: WorkoutTemplate[] = [];
  for (let i = 0; i < distinct; i++) {
    const plan = plans[i % plans.length];
    let slots = [...plan.slots];
    // focus muscolari: aggiungi uno slot dedicato se c'è spazio
    for (const m of p.focusMuscles ?? []) {
      if (slots.length >= nEx + 1) break;
      if (plan.slots.some((s) => s.muscles?.includes(m))) slots.splice(2, 0, { muscles: [m], kind: 'acc' });
    }
    // meno allenati: rimuovi slot accessori relativi
    slots = slots.filter((s) => !(s.kind === 'acc' && s.muscles?.every((m) => p.lessMuscles?.includes(m))));
    if (goals.includes('mobility')) slots.push(S.mob);
    if ((goals.includes('fat_loss') || goals.includes('endurance')) && !slots.some((s) => s.kind === 'cond')) slots.push(S.cond);
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
    templates.push({ id: uid('tpl_'), name: plan.name, exercises, source: 'generated', createdAt: now, updatedAt: now, notes: '' });
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
  if (eq.size <= 2) warnings.push('Con poca attrezzatura il programma usa soprattutto esercizi a corpo libero: aggiungendo elastici o manubri potrai progredire più facilmente.');

  const program: Program = {
    id: uid('prg_'),
    name: `${SPLIT_NAMES[split]} · ${days} giorni`,
    description: `Generato il ${new Date().toLocaleDateString('it-IT')} per: ${goals.map((g) => GOAL_INFO[g].label.toLowerCase()).join(', ')}. Sessioni da circa ${minutes} minuti.`,
    schedule, active: true, source: 'generated', createdAt: now,
    meta: { split, goal: goals[0], level: p.level },
  };
  templates.forEach((t) => { t.programId = program.id; });
  return { program, templates, warnings, split };
}

/** Sostituti per un esercizio della scheda, filtrati per attrezzatura e infortuni. */
export function substitutes(exerciseId: string, p: Profile): Exercise[] {
  const ex = EXERCISES.find((e) => e.id === exerciseId);
  if (!ex) return [];
  const eq = availableEquipment(p);
  return EXERCISES.filter((e) => e.id !== ex.id && e.kind !== 'mobility' && isAvailable(e, eq) && e.primary[0] === ex.primary[0])
    .map((e) => ({ e, s: (e.movement === ex.movement ? 3 : 0) + (e.family === ex.family ? 1 : 0) - e.stress.filter((z) => p.injuries?.includes(z)).length * 4 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.e);
}
