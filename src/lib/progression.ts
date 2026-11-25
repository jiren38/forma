/**
 * Progressione automatica dei carichi.
 *
 * Metodo (prudente, usato comunemente nei programmi di forza e ipertrofia):
 * - doppia progressione: si resta sullo stesso carico aggiungendo ripetizioni finché tutte le serie
 *   arrivano al massimo del range, poi si aumenta del passo minimo dell'attrezzo;
 * - autoregolazione con RIR/RPE: le ripetizioni in riserva dicono quanto era facile la serie
 *   (RIR = 10 − RPE). Con molte ripetizioni in riserva il salto può essere più grande;
 * - due sedute di fila sotto il range → carico ridotto di circa il 10% (scarico mirato);
 * - durante la seduta il carico delle serie successive si adatta alla serie appena fatta,
 *   stimando il massimale con Epley corretto per le ripetizioni in riserva.
 *
 * Tutti i carichi sono in kg; gli arrotondamenti seguono gli incrementi reali dell'attrezzo
 * (dischi, manubri, pacchi pesi) e l'unità scelta dall'utente.
 */
import { getExercise, type Exercise } from '@/data/exercises';
import type { BlockWeek, ExerciseLog, LoadTarget, Profile, SetLog, Units, WorkoutSession } from './types';
import { completedSessions } from './stats';
import { KG_PER_LB, clamp, round } from './util';

// ---------------- Incrementi e arrotondamenti ----------------
const isLower = (e: Exercise) => e.primary.some((m) => ['quads', 'glutes', 'hamstrings'].includes(m));
const isDumbbell = (e: Exercise) => e.equipment.includes('dumbbell') || e.equipment.includes('kettlebell');
const isSmall = (e: Exercise) => e.mechanic === 'isolation' || e.kind === 'cable';

/** Passo minimo di carico (kg) per l'esercizio, nell'unità dell'utente. */
export function loadStep(exerciseId: string, kg: number, units: Units = 'kg'): number {
  const e = getExercise(exerciseId);
  if (units === 'lb') {
    const lb = kg / KG_PER_LB;
    let s = 5;
    if (e && isDumbbell(e)) s = lb >= 20 ? 5 : 2.5;
    else if (e && isSmall(e)) s = lb >= 60 ? 5 : 2.5;
    else if (e && isLower(e) && lb >= 135) s = 10;
    return s * KG_PER_LB;
  }
  if (!e) return 2.5;
  if (isDumbbell(e)) return kg >= 20 ? 2 : 1;
  if (isSmall(e)) return kg >= 30 ? 2.5 : 1.25;
  if (isLower(e) && kg >= 60) return 5;
  return 2.5;
}

/** Griglia di arrotondamento (kg): il carico più vicino realmente impostabile. */
function grid(exerciseId: string, kg: number, units: Units): number {
  const e = getExercise(exerciseId);
  if (units === 'lb') {
    const lb = kg / KG_PER_LB;
    if (e && isDumbbell(e)) return (lb >= 20 ? 5 : 2.5) * KG_PER_LB;
    if (e && isSmall(e)) return (lb >= 60 ? 5 : 2.5) * KG_PER_LB;
    return 5 * KG_PER_LB;
  }
  if (!e) return 2.5;
  if (isDumbbell(e)) return kg >= 20 ? 2 : 1;
  if (isSmall(e)) return kg >= 30 ? 2.5 : 1.25;
  return 2.5;
}

/** Arrotonda un carico al valore impostabile più vicino (in kg). */
export function roundLoad(exerciseId: string, kg: number, units: Units = 'kg', dir: 'near' | 'down' | 'up' = 'near'): number {
  if (!(kg > 0)) return 0;
  const g = grid(exerciseId, kg, units);
  const n = kg / g;
  const k = dir === 'down' ? Math.floor(n + 1e-9) : dir === 'up' ? Math.ceil(n - 1e-9) : Math.round(n);
  const v = Math.max(g, k * g);
  return units === 'lb' ? round(v, 3) : round(v, 2);
}

// ---------------- Sforzo ----------------
/** Ripetizioni in riserva della serie (da RIR oppure da RPE), null se non registrate. */
export function setRir(s: Pick<SetLog, 'rir' | 'rpe'>): number | null {
  if (s.rir != null && !Number.isNaN(s.rir)) return clamp(s.rir, 0, 10);
  if (s.rpe != null && s.rpe > 0) return clamp(10 - s.rpe, 0, 10);
  return null;
}

/** Massimale stimato tenendo conto delle ripetizioni in riserva (Epley su ripetizioni + RIR). */
export function e1rmRir(weight: number, reps: number, rir: number | null): number {
  if (!weight || !reps) return 0;
  const r = Math.min(reps + (rir ?? 0), 15);
  return r <= 1 ? weight : weight * (1 + r / 30);
}

/** Carico per fare `reps` ripetizioni lasciandone `rir` in riserva, dato un massimale stimato. */
export function weightFor(oneRm: number, reps: number, rir: number): number {
  const r = Math.min(reps + rir, 15);
  return r <= 1 ? oneRm : oneRm / (1 + r / 30);
}

/** RIR obiettivo di base, se il programma non ne indica uno. */
export function defaultRir(p?: Pick<Profile, 'level' | 'goals'> | null): number {
  if (!p) return 2;
  if (p.level === 'beginner') return 3;
  if (p.goals?.includes('strength') || p.goals?.includes('hypertrophy')) return 2;
  return 2;
}

const working = (ex: Pick<ExerciseLog, 'sets'>) => ex.sets.filter((s) => s.done && s.type !== 'warmup' && s.type !== 'drop');

interface PastLog { log: ExerciseLog; session: WorkoutSession }

/** Esecuzioni passate dell'esercizio, dalla più recente, escluse le settimane di scarico. */
export function pastLogs(sessions: WorkoutSession[], exerciseId: string, excludeId?: string): PastLog[] {
  const out: PastLog[] = [];
  const done = completedSessions(sessions).filter((s) => s.id !== excludeId).reverse();
  for (const s of done) {
    for (const log of s.exercises) if (log.exerciseId === exerciseId && !log.cardio && working(log).length) { out.push({ log, session: s }); break; }
  }
  const normal = out.filter((x) => x.session.block?.kind !== 'deload');
  return normal.length ? normal : out;
}

export interface PlanInput {
  exerciseId: string;
  sessions: WorkoutSession[];
  /** range della scheda (prima di eventuali spostamenti della settimana) */
  repMin: number;
  repMax: number;
  units?: Units;
  profile?: Pick<Profile, 'level' | 'goals'> | null;
  /** settimana del programma a più settimane */
  week?: BlockWeek | null;
  /** carico di partenza indicato nella scheda (usato se non c'è storico) */
  templateWeight?: number | null;
  excludeSessionId?: string;
}

/** Range della seduta: le settimane di intensificazione spostano le ripetizioni dei multiarticolari. */
export function weekRange(exerciseId: string, repMin: number, repMax: number, week?: BlockWeek | null) {
  const e = getExercise(exerciseId);
  if (!week || !week.repShift || e?.tracking !== 'weight_reps' || e.mechanic !== 'compound') return { repMin, repMax };
  const lo = Math.max(2, repMin + week.repShift);
  const hi = Math.max(lo, repMax + week.repShift);
  return { repMin: lo, repMax: hi };
}

const pl = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Obiettivo della prossima seduta per un esercizio: carico, range di ripetizioni e RIR,
 * con la spiegazione da mostrare all'utente.
 */
export function planNextLoad(i: PlanInput): LoadTarget {
  const e = getExercise(i.exerciseId);
  const units = i.units ?? 'kg';
  const rir = i.week?.rir ?? defaultRir(i.profile);
  const { repMin, repMax } = weekRange(i.exerciseId, i.repMin, i.repMax, i.week);
  const past = pastLogs(i.sessions, i.exerciseId, i.excludeSessionId);
  const deload = i.week?.kind === 'deload';
  const loadF = i.week?.load ?? 1;
  const track = e?.tracking ?? 'weight_reps';

  // ---- esercizi senza carico: ripetizioni o secondi ----
  if (track !== 'weight_reps') {
    const unit = track === 'time' ? 's' : 'rip.';
    const last = past[0];
    if (!last) return { kind: 'start', weight: null, repMin, repMax, rir, reason: `Prima volta: esegui ${repMin}–${repMax} ${unit} con una tecnica pulita, lasciando ${rir} ${track === 'time' ? 'secondi' : pl(rir, 'ripetizione', 'ripetizioni')} di margine.` };
    const reps = working(last.log).map((s) => s.reps ?? 0);
    const min = Math.min(...reps);
    const step = track === 'time' ? 5 : 1;
    if (deload) return { kind: 'deload', weight: null, repMin, repMax, rir, prevReps: reps, reason: 'Settimana di scarico: stesse ripetizioni dell’ultima volta senza forzare, con qualche serie in meno.' };
    if (min >= repMax) return { kind: 'increase', weight: null, repMin, repMax, rir, prevReps: reps, reason: `L’ultima volta hai completato il massimo del range (${repMax} ${unit}) in tutte le serie: prova una variante più difficile${track === 'reps' ? ' o aggiungi un piccolo sovraccarico' : ''}.` };
    const aim = Math.min(repMax, Math.max(repMin, min + step));
    return { kind: 'reps', weight: null, repMin, repMax, rir, prevReps: reps, aimReps: aim, reason: `Punta a ${aim} ${unit} in ogni serie (l’ultima volta il minimo era ${min}).` };
  }

  // ---- prima volta ----
  if (!past.length) {
    if (i.templateWeight) {
      const w = roundLoad(i.exerciseId, i.templateWeight * loadF, units);
      return { kind: 'start', weight: w, repMin, repMax, rir, reason: `Carico di partenza indicato nella scheda. Se arrivi a ${repMax} ripetizioni con più di ${rir} in riserva, aumenta già dalla serie successiva.` };
    }
    return { kind: 'start', weight: null, repMin, repMax, rir, reason: `Prima volta: scegli un carico con cui completi ${repMin}–${repMax} ripetizioni lasciandone circa ${rir} in riserva. Dalla prossima seduta il carico viene proposto in automatico.` };
  }

  const last = past[0];
  const sets = working(last.log);
  const topW = Math.max(...sets.map((s) => s.weight ?? 0));
  const work = sets.filter((s) => (s.weight ?? 0) >= topW * 0.97);
  const reps = work.map((s) => s.reps ?? 0);
  const rirs = work.map(setRir);
  const known = rirs.filter((x): x is number => x != null);
  const minRir = known.length ? Math.min(...known) : null;
  const lastMin = last.log.repMin || repMin, lastMax = last.log.repMax || repMax;
  const step = loadStep(i.exerciseId, topW, units);
  const base = { repMin, repMax, rir, prevWeight: topW, prevReps: reps };
  const best1 = Math.max(...work.map((s) => e1rmRir(s.weight ?? 0, s.reps ?? 0, setRir(s) ?? 1)));

  // carico a zero (es. solo bilanciere non registrato): nessuna proposta numerica
  if (topW <= 0) return { kind: 'hold', weight: null, ...base, reason: 'Registra il carico usato per ricevere la proposta automatica.' };

  // ---- settimana di scarico ----
  if (deload) {
    const w = roundLoad(i.exerciseId, topW * loadF, units);
    return { kind: 'deload', weight: w, ...base, reason: `Settimana di scarico: ${Math.round((1 - loadF) * 100)}% di carico in meno (${fmt(w, units)}) e meno serie, lasciando ${rir} ripetizioni in riserva. Serve a recuperare e ripartire più forte.` };
  }

  // ---- range diverso da quello dell'ultima volta (es. intensificazione): conversione dal massimale ----
  if (repMin !== lastMin || repMax !== lastMax) {
    const raw = weightFor(best1, repMin, rir) * loadF;
    const w = roundLoad(i.exerciseId, clamp(raw, topW * 0.7, topW * 1.25), units);
    return { kind: 'convert', weight: w, ...base, reason: `Questa settimana il range è ${repMin}–${repMax} ripetizioni: dal tuo massimale stimato (${fmt(best1, units)}) il carico adatto è ${fmt(w, units)} con circa ${rir} ripetizioni in riserva.` };
  }

  const allTop = reps.every((r) => r >= repMax);
  const toFailure = minRir === 0 || sets.some((s) => s.type === 'failure');
  const missed = reps.filter((r) => r < repMin).length >= Math.ceil(reps.length / 2);

  // ---- stallo: stessa situazione per 3 sedute ----
  const prevTop = past.slice(1, 3).map((p) => ({ w: Math.max(...working(p.log).map((s) => s.weight ?? 0)), r: working(p.log).reduce((a, s) => a + (s.reps ?? 0), 0) }));
  const totalNow = sets.reduce((a, s) => a + (s.reps ?? 0), 0);
  const stalled = prevTop.length === 2 && prevTop.every((p) => p.w >= topW - 0.01 && p.r >= totalNow);

  if (allTop && !toFailure) {
    // con molte ripetizioni in riserva (≥ obiettivo + 2) il salto è doppio
    const easy = minRir != null && minRir >= rir + 2;
    const raw = topW + step * (easy ? 2 : 1);
    const w = roundLoad(i.exerciseId, raw, units, 'up');
    const why = easy ? ` con ${minRir} ripetizioni in riserva` : minRir != null ? ` con ${minRir} in riserva` : '';
    return { kind: 'increase', weight: w, ...base, reason: `L’ultima volta hai completato ${work.length} ${pl(work.length, 'serie', 'serie')} da ${repMax}+ ripetizioni a ${fmt(topW, units)}${why}: si sale a ${fmt(w, units)} ripartendo da ${repMin} ripetizioni.` };
  }
  if (missed) {
    const prev = past[1] ? working(past[1].log) : [];
    const missedBefore = prev.length > 0 && prev.filter((s) => (s.reps ?? 0) < (past[1].log.repMin || repMin)).length >= Math.ceil(prev.length / 2);
    if (missedBefore) {
      const w = roundLoad(i.exerciseId, topW * 0.9, units);
      return { kind: 'decrease', weight: w, ...base, stalled: true, reason: `Due sedute di fila sotto le ${repMin} ripetizioni: carico ridotto del 10% (${fmt(w, units)}) per ritrovare tecnica e ripetizioni, poi si risale.` };
    }
    return { kind: 'hold', weight: roundLoad(i.exerciseId, topW, units), ...base, reason: `L’ultima volta sei rimasto sotto le ${repMin} ripetizioni: stesso carico per consolidarlo. Se succede di nuovo, il carico scenderà del 10%.` };
  }
  if (allTop && toFailure) {
    return { kind: 'hold', weight: roundLoad(i.exerciseId, topW, units), ...base, reason: `Hai raggiunto ${repMax} ripetizioni ma arrivando al cedimento: stesso carico finché non lo completi con almeno 1 ripetizione in riserva.` };
  }
  const minReps = Math.min(...reps);
  const aim = Math.min(repMax, minReps + 1);
  return {
    kind: stalled ? 'hold' : 'reps', weight: roundLoad(i.exerciseId, topW, units), ...base, aimReps: aim, stalled: stalled || undefined,
    reason: stalled
      ? `Tre sedute senza miglioramenti a ${fmt(topW, units)}: punta a ${aim} ripetizioni curando sonno e recupero. Se resti fermo, valuta una settimana di scarico.`
      : `Stesso carico (${fmt(topW, units)}): punta a ${aim} ripetizioni in ogni serie. Quando le completi tutte a ${repMax}, il carico sale.`,
  };
}

function fmt(kg: number, units: Units) {
  const v = units === 'lb' ? round(kg / KG_PER_LB, 1) : round(kg, 2);
  return `${v.toLocaleString('it-IT', { maximumFractionDigits: 2 })} ${units}`;
}

// ---------------- Adattamento serie per serie ----------------
export interface NextSetAdvice {
  weight: number;
  change: 'up' | 'down' | 'same';
  reason: string;
}

/**
 * Dopo una serie completata propone il carico delle serie successive.
 * Usa le ripetizioni fatte e, se registrate, quelle in riserva (RIR/RPE).
 */
export function adviseNextSet(i: { exerciseId: string; done: SetLog; repMin: number; repMax: number; rir: number; units?: Units }): NextSetAdvice | null {
  const e = getExercise(i.exerciseId);
  if (e?.tracking !== 'weight_reps') return null;
  const w = i.done.weight ?? 0, r = i.done.reps ?? 0;
  if (w <= 0 || r <= 0 || i.done.type === 'warmup' || i.done.type === 'drop') return null;
  const units = i.units ?? 'kg';
  const step = loadStep(i.exerciseId, w, units);
  const rr = setRir(i.done);
  const same = (reason: string): NextSetAdvice => ({ weight: w, change: 'same', reason });

  if (rr == null) {
    // senza indicazione di fatica: solo regole sul range
    if (r >= i.repMax + 2) { const nw = roundLoad(i.exerciseId, w + step, units, 'up'); return { weight: nw, change: 'up', reason: `${r} ripetizioni, oltre il range (${i.repMin}–${i.repMax}): prova ${fmt(nw, units)}.` }; }
    if (r < i.repMin - 1) {
      const nw = roundLoad(i.exerciseId, Math.min(w - step, weightFor(e1rmRir(w, r, 0), i.repMin, 1)), units, 'down');
      return { weight: nw, change: 'down', reason: `${r} ripetizioni, sotto il range: scendi a ${fmt(nw, units)} per restare tra ${i.repMin} e ${i.repMax}.` };
    }
    return same(`Nel range: resta a ${fmt(w, units)}.`);
  }

  const oneRm = e1rmRir(w, r, rr);
  const aim = clamp(r, i.repMin, i.repMax);
  const diff = rr - i.rir; // > 0: più facile del previsto
  const inRange = r >= i.repMin && r <= i.repMax;
  if (inRange && Math.abs(diff) <= 1) return same(diff === 0 ? `Sforzo in linea con l’obiettivo (${i.rir} in riserva): resta a ${fmt(w, units)}.` : `Resta a ${fmt(w, units)}.`);
  const nw = clamp(weightFor(oneRm, aim, i.rir), w * 0.85, w * 1.1);
  let rounded = roundLoad(i.exerciseId, nw, units);
  // se l'arrotondamento annulla la correzione ma lo scarto di sforzo è netto, almeno un passo
  if (Math.abs(rounded - w) < 0.01) {
    if (diff >= 2 || r > i.repMax) rounded = roundLoad(i.exerciseId, w + step, units, 'up');
    else if (diff <= -2 || r < i.repMin) rounded = roundLoad(i.exerciseId, w - step, units, 'down');
    else return same(`Resta a ${fmt(w, units)}.`);
  }
  if (rounded > w) return { weight: rounded, change: 'up', reason: `${r} ripetizioni con ${rr} in riserva: era leggera, prova ${fmt(rounded, units)} (obiettivo ${i.rir} in riserva).` };
  return { weight: rounded, change: 'down', reason: `${r} ripetizioni con ${rr} in riserva: era pesante, scendi a ${fmt(rounded, units)} per arrivare a ${aim} ripetizioni.` };
}

/** Testo breve del cambiamento rispetto all'ultima volta: "+2,5 kg", "+1 rip.", "−10%". */
export function targetDelta(t: LoadTarget, units: Units): string | null {
  if (t.kind === 'deload') return 'scarico';
  if (t.weight != null && t.prevWeight != null && Math.abs(t.weight - t.prevWeight) > 0.01) {
    const d = t.weight - t.prevWeight;
    const v = units === 'lb' ? round(Math.abs(d) / KG_PER_LB, 1) : round(Math.abs(d), 2);
    return `${d > 0 ? '+' : '−'}${v.toLocaleString('it-IT')} ${units}`;
  }
  if (t.kind === 'reps' && t.aimReps) return 'stesso carico, +1 rip.';
  if (t.kind === 'hold') return 'consolida';
  return null;
}
