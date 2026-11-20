// Bilancio energetico: calorie assunte (diario) contro calorie consumate (stima).
//
// Consumo giornaliero = metabolismo basale × fattore di stile di vita (NEAT + digestione)
//                     + costo NETTO degli allenamenti registrati.
// Tutti i valori sono stime fatte con metodi riconosciuti, mai misure:
// - Metabolismo basale: Mifflin-St Jeor (1990) o Katch-McArdle se è nota la % di grasso,
//   con il peso registrato più vicino a quel giorno.
// - Stile di vita: fattore PAL del profilo (1,35 / 1,5 / 1,7), che NON include gli allenamenti.
// - Allenamenti: MET del Compendium of Physical Activities (2024) per la parte con i pesi,
//   equazioni metaboliche ACSM o MET per il cardio (vedi lib/cardio.ts).
//   Nel bilancio si somma solo la parte "in più" rispetto al riposo (MET − 1), perché il
//   basale di quelle ore è già contato: così non si conta due volte la stessa energia.

import { getExercise } from '@/data/exercises';
import type { ActivityLevel, CardioLog, DiaryEntry, Measurement, Profile, WorkoutSession } from './types';
import { ACTIVITY_INFO } from './labels';
import { cardioEntries, isCardioExercise, machineOf, metFor } from './cardio';
import { sessionDurationMs } from './stats';
import { addDays, clamp, dayKey, fmtN, fromKey, round, sum } from './util';

/** kcal per kg di variazione di peso (regola empirica, valida solo come ordine di grandezza). */
export const KCAL_PER_KG = 7700;

export type EnergyProfile = Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'> & Partial<Pick<Profile, 'bodyFatPct' | 'activity'>>;

// ---------------------------------------------------------------------------
// Metabolismo basale

export interface Bmr { kcal: number; method: 'mifflin' | 'katch'; weightKg: number; formula: string }

export function bmrFor(p: EnergyProfile, weightKg = p.weightKg): Bmr {
  const w = weightKg > 0 ? weightKg : p.weightKg;
  if (p.bodyFatPct && p.bodyFatPct > 3 && p.bodyFatPct < 60) {
    const lbm = w * (1 - p.bodyFatPct / 100);
    return { kcal: Math.round(370 + 21.6 * lbm), method: 'katch', weightKg: w, formula: `370 + 21,6 × ${fmtN(lbm, 1)} kg di massa magra` };
  }
  const s = p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78;
  return {
    kcal: Math.round(10 * w + 6.25 * p.heightCm - 5 * p.age + s), method: 'mifflin', weightKg: w,
    formula: `10 × ${fmtN(w, 1)} kg + 6,25 × ${p.heightCm} cm − 5 × ${p.age} anni ${s >= 0 ? '+' : '−'} ${Math.abs(s)}`,
  };
}

export const lifestyleFactor = (a?: ActivityLevel) => ACTIVITY_INFO[a ?? 'moderate'].factor;

/** Peso più recente registrato in quel giorno o prima; se non c'è, la prima misura disponibile, poi il profilo. */
export function weightResolver(measurements: Measurement[], fallbackKg: number) {
  const ws = measurements.filter((m) => m.weightKg && m.weightKg > 0).map((m) => ({ date: m.date.slice(0, 10), kg: m.weightKg! })).sort((a, b) => a.date.localeCompare(b.date));
  return (date: string): number => {
    if (!ws.length) return fallbackKg;
    let lo = 0, hi = ws.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (ws[mid].date <= date) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best >= 0 ? ws[best].kg : ws[0].kg;
  };
}

// ---------------------------------------------------------------------------
// Allenamenti

export type StrengthIntensity = 'light' | 'moderate' | 'vigorous';
/** Compendium of Physical Activities 2024: 02054 (3,5), 02052 (5,0), 02050 (6,0); stretching 02101 (2,3). */
export const STRENGTH_MET: Record<StrengthIntensity, number> = { light: 3.5, moderate: 5, vigorous: 6 };
export const STRENGTH_LABEL: Record<StrengthIntensity, string> = {
  light: 'impegno moderato', moderate: 'impegno elevato', vigorous: 'impegno massimo o circuito',
};
export const MOBILITY_MET = 2.3;

export interface WorkoutPart { kind: 'strength' | 'mobility' | 'cardio'; label: string; minutes: number; met: number; kcal: number; netKcal: number }

export interface WorkoutEnergy {
  id: string;
  sessionId?: string;
  date: string;
  name: string;
  source: 'session' | 'manual';
  /** minuti considerati attivi (durata reale, limitata se il timer è rimasto acceso) */
  minutes: number;
  elapsedMin: number;
  capped: boolean;
  /** calorie totali dell'attività (lorde, confrontabili con quelle di un orologio sportivo) */
  kcal: number;
  /** calorie in più rispetto a stare a riposo nello stesso tempo: entrano nel bilancio */
  netKcal: number;
  parts: WorkoutPart[];
  intensity?: StrengthIntensity;
  intensityWhy?: string;
}

const kcalOf = (met: number, kg: number, min: number) => met * kg * (min / 60);
const netOf = (met: number, kg: number, min: number) => Math.max(0, met - 1) * kg * (min / 60);

/** Intensità della parte con i pesi: dallo sforzo percepito (RPE/RIR) se presente, altrimenti dai recuperi. */
export function strengthIntensity(s: WorkoutSession): { level: StrengthIntensity; why: string } {
  const sets = s.exercises.filter((e) => !e.cardio).flatMap((e) => e.sets.filter((x) => x.done && x.type !== 'warmup').map((x) => ({ ...x, rest: e.restSec })));
  const rpes = sets.map((x) => (x.rpe != null ? x.rpe : x.rir != null ? 10 - x.rir : null)).filter((x): x is number => x != null && x > 0);
  const hard = sets.filter((x) => x.type === 'failure' || x.type === 'drop').length;
  if (rpes.length >= 3) {
    const r = sum(rpes) / rpes.length;
    if (r >= 8.5) return { level: 'vigorous', why: `sforzo medio RPE ${round(r, 1)}` };
    if (r >= 7) return { level: 'moderate', why: `sforzo medio RPE ${round(r, 1)}` };
    return { level: 'light', why: `sforzo medio RPE ${round(r, 1)}` };
  }
  const rests = sets.map((x) => x.rest).filter((r) => r > 0);
  const avgRest = rests.length ? sum(rests) / rests.length : 90;
  if (sets.length && avgRest <= 45) return { level: 'vigorous', why: `recuperi brevi (${Math.round(avgRest)} s), simile a un circuito` };
  if (sets.length && (hard / sets.length >= 0.3 || avgRest <= 60)) return { level: 'moderate', why: hard ? 'molte serie a cedimento o drop set' : `recuperi brevi (${Math.round(avgRest)} s)` };
  return { level: 'light', why: 'nessuno sforzo percepito registrato: valore prudente' };
}

/** Stima delle calorie di una sessione completata. */
export function sessionEnergy(s: WorkoutSession, weightKg: number): WorkoutEnergy {
  const elapsedMin = sessionDurationMs(s) / 60000;
  const parts: WorkoutPart[] = [];

  // cardio con timer: la stima è già fatta in lib/cardio sui dati reali (velocità, pendenza, intensità)
  let cardioMin = 0;
  for (const e of s.exercises) {
    const c = e.cardio;
    if (!c?.done || !c.actual) continue;
    const min = c.actual.durationSec / 60;
    if (min <= 0) continue;
    cardioMin += min;
    const met = c.actual.kcal != null && weightKg > 0 ? c.actual.kcal / (weightKg * (min / 60)) : metFor(c.plan.machine, c.actual.intensity ?? c.plan.intensity, c.actual.speedKmh, c.actual.inclinePct);
    parts.push({ kind: 'cardio', label: getExercise(e.exerciseId)?.name ?? 'Cardio', minutes: min, met, kcal: kcalOf(met, weightKg, min), netKcal: netOf(met, weightKg, min) });
  }

  // serie svolte: pesi, mobilità e vecchio cardio a serie
  const groups = { strength: 0, mobility: 0, cardio: 0 };
  let plausibleSec = 0, exercisesWithSets = 0;
  const legacyCardio: string[] = [];
  for (const e of s.exercises) {
    if (e.cardio) continue;
    const done = e.sets.filter((x) => x.done);
    if (!done.length) continue;
    exercisesWithSets++;
    const ex = getExercise(e.exerciseId);
    const g = ex && isCardioExercise(ex) ? 'cardio' : ex?.kind === 'mobility' ? 'mobility' : 'strength';
    groups[g] += done.length;
    if (g === 'cardio') legacyCardio.push(e.exerciseId);
    plausibleSec += done.length * (45 + clamp(e.restSec || 90, 30, 300));
  }
  const setCount = groups.strength + groups.mobility + groups.cardio;
  // tempo per la parte a serie: durata reale meno il cardio, ma mai oltre un massimo plausibile
  // (se ci si dimentica di chiudere la sessione, non si contano ore di "allenamento")
  const cap = (plausibleSec / 60) * 1.5 + exercisesWithSets * 3 + 10;
  const rawSetMin = Math.max(0, elapsedMin - cardioMin);
  const setMin = setCount ? Math.min(rawSetMin || cap, cap) : 0;
  const capped = setCount > 0 && rawSetMin > cap;
  const si = strengthIntensity(s);
  if (setCount && setMin > 0) {
    const share = (n: number) => (setMin * n) / setCount;
    if (groups.strength) { const m = share(groups.strength), met = STRENGTH_MET[si.level]; parts.push({ kind: 'strength', label: `Pesi, ${STRENGTH_LABEL[si.level]}`, minutes: m, met, kcal: kcalOf(met, weightKg, m), netKcal: netOf(met, weightKg, m) }); }
    if (groups.mobility) { const m = share(groups.mobility); parts.push({ kind: 'mobility', label: 'Mobilità e stretching', minutes: m, met: MOBILITY_MET, kcal: kcalOf(MOBILITY_MET, weightKg, m), netKcal: netOf(MOBILITY_MET, weightKg, m) }); }
    if (groups.cardio) { const m = share(groups.cardio), met = metFor(machineOf(legacyCardio[0]), 'moderate'); parts.push({ kind: 'cardio', label: 'Cardio a serie', minutes: m, met, kcal: kcalOf(met, weightKg, m), netKcal: netOf(met, weightKg, m) }); }
  }

  const minutes = sum(parts.map((p) => p.minutes));
  return {
    id: s.id, sessionId: s.id, date: dayKey(s.startedAt), name: s.name, source: 'session',
    minutes: round(minutes, 1), elapsedMin: round(elapsedMin, 1), capped,
    kcal: Math.round(sum(parts.map((p) => p.kcal))), netKcal: Math.round(sum(parts.map((p) => p.netKcal))),
    parts: parts.map((p) => ({ ...p, minutes: round(p.minutes, 1), met: round(p.met, 1), kcal: Math.round(p.kcal), netKcal: Math.round(p.netKcal) })),
    intensity: groups.strength ? si.level : undefined, intensityWhy: groups.strength ? si.why : undefined,
  };
}

/** Attività cardio registrate a parte (pagina Cardio). Se l'utente ha scritto le kcal le usiamo, altrimenti MET. */
export function manualCardioEnergy(logs: CardioLog[], weightOn: (d: string) => number): WorkoutEnergy[] {
  return cardioEntries([], logs).map((e) => {
    const kg = weightOn(e.date), min = e.actualMin;
    const met = e.kcal != null && e.kcal > 0 && kg > 0 && min > 0 ? e.kcal / (kg * (min / 60)) : metFor(e.machine, 'moderate', e.speedKmh, null);
    const kcal = Math.round(e.kcal != null && e.kcal > 0 ? e.kcal : kcalOf(met, kg, min));
    const net = Math.round(netOf(met, kg, min));
    return {
      id: e.id, date: e.date, name: e.label, source: 'manual' as const, minutes: min, elapsedMin: min, capped: false, kcal, netKcal: net,
      parts: [{ kind: 'cardio' as const, label: e.label, minutes: min, met: round(met, 1), kcal, netKcal: net }],
    };
  });
}

// ---------------------------------------------------------------------------
// Giornate

export interface DayEnergy {
  date: string;
  weightKg: number;
  bmr: number;
  /** stile di vita (passi, lavoro, digestione): basale × (fattore − 1) */
  lifestyle: number;
  workouts: WorkoutEnergy[];
  exerciseKcal: number;
  exerciseNet: number;
  /** consumo totale stimato della giornata */
  out: number;
  /** calorie del diario; null se quel giorno non è stato registrato nulla */
  intake: number | null;
  entries: number;
  balance: number | null;
  isToday: boolean;
}

export interface EnergyInput {
  profile: EnergyProfile;
  sessions: WorkoutSession[];
  cardioLogs: CardioLog[];
  diary: Pick<DiaryEntry, 'date' | 'kcal'>[];
  measurements: Measurement[];
}

export function buildEnergyIndex(inp: EnergyInput, today = dayKey()) {
  const weightOn = weightResolver(inp.measurements, inp.profile.weightKg);
  const factor = lifestyleFactor(inp.profile.activity);
  const byDayW = new Map<string, WorkoutEnergy[]>();
  const push = (w: WorkoutEnergy) => { const a = byDayW.get(w.date); if (a) a.push(w); else byDayW.set(w.date, [w]); };
  for (const s of inp.sessions) if (s.status === 'completed' && s.endedAt) push(sessionEnergy(s, weightOn(dayKey(s.startedAt))));
  for (const w of manualCardioEnergy(inp.cardioLogs, weightOn)) push(w);
  const intake = new Map<string, { kcal: number; n: number }>();
  for (const e of inp.diary) { const x = intake.get(e.date) ?? { kcal: 0, n: 0 }; x.kcal += e.kcal || 0; x.n++; intake.set(e.date, x); }

  const cache = new Map<string, DayEnergy>();
  function day(date: string): DayEnergy {
    const c = cache.get(date); if (c) return c;
    const kg = weightOn(date);
    const bmr = bmrFor(inp.profile, kg).kcal;
    const lifestyle = Math.round(bmr * (factor - 1));
    const workouts = (byDayW.get(date) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const exerciseKcal = sum(workouts.map((w) => w.kcal)), exerciseNet = sum(workouts.map((w) => w.netKcal));
    const out = bmr + lifestyle + exerciseNet;
    const it = intake.get(date);
    const d: DayEnergy = {
      date, weightKg: kg, bmr, lifestyle, workouts, exerciseKcal, exerciseNet, out,
      intake: it ? Math.round(it.kcal) : null, entries: it?.n ?? 0, balance: it ? Math.round(it.kcal) - out : null, isToday: date === today,
    };
    cache.set(date, d);
    return d;
  }
  const allDates = [...byDayW.keys(), ...intake.keys()].sort();
  return { day, factor, weightOn, firstDate: allDates[0] ?? today, today };
}
export type EnergyIndex = ReturnType<typeof buildEnergyIndex>;

export function daysInRange(idx: EnergyIndex, from: Date, toExcl: Date): DayEnergy[] {
  const out: DayEnergy[] = [];
  for (let d = new Date(from); d < toExcl; d = addDays(d, 1)) {
    const k = dayKey(d);
    if (k > idx.today) break;
    out.push(idx.day(k));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Periodi (settimana, mese, anno)

export interface PeriodEnergy {
  days: number;
  loggedDays: number;
  intake: number;
  /** consumo nei soli giorni con pasti registrati (per un bilancio onesto) */
  outLogged: number;
  balance: number | null;
  avgIntake: number | null;
  avgOut: number;
  avgBalance: number | null;
  exerciseKcal: number;
  exerciseNet: number;
  workouts: number;
  workoutMinutes: number;
  /** variazione di peso teorica dal bilancio (kg) */
  predictedKg: number | null;
}

export function summarize(days: DayEnergy[]): PeriodEnergy {
  // la giornata in corso non entra nel bilancio del periodo: i pasti non sono ancora finiti
  const logged = days.filter((d) => d.intake != null && !d.isToday);
  const intake = sum(logged.map((d) => d.intake!));
  const outLogged = sum(logged.map((d) => d.out));
  const balance = logged.length ? intake - outLogged : null;
  const ws = days.flatMap((d) => d.workouts);
  return {
    days: days.length, loggedDays: logged.length, intake, outLogged, balance,
    avgIntake: logged.length ? Math.round(intake / logged.length) : null,
    avgOut: days.length ? Math.round(sum(days.map((d) => d.out)) / days.length) : 0,
    avgBalance: balance != null ? Math.round(balance / logged.length) : null,
    exerciseKcal: sum(ws.map((w) => w.kcal)), exerciseNet: sum(ws.map((w) => w.netKcal)),
    workouts: ws.length, workoutMinutes: Math.round(sum(ws.map((w) => w.minutes))),
    predictedKg: balance != null ? round(balance / KCAL_PER_KG, 2) : null,
  };
}

// ---------------------------------------------------------------------------
// Verifica con la bilancia (approccio "adattivo"): se il peso reale si muove diversamente
// da quanto previsto, il consumo reale è probabilmente diverso dalla stima.

export interface ScaleCheck {
  ok: boolean;
  reason?: string;
  days: number;
  loggedDays: number;
  weighIns: number;
  kgChange: number;
  /** consumo medio ricavato da peso reale + calorie assunte */
  observedOut: number;
  modelOut: number;
  diff: number;
}

export function scaleCheck(idx: EnergyIndex, measurements: Measurement[], windowDays = 28): ScaleCheck {
  const end = fromKey(idx.today);
  const start = addDays(end, -windowDays);
  const days = daysInRange(idx, start, end); // esclude oggi
  const logged = days.filter((d) => d.intake != null);
  const a = dayKey(start), b = idx.today;
  const ws = measurements.filter((m) => m.weightKg && m.date.slice(0, 10) >= a && m.date.slice(0, 10) < b).map((m) => ({ t: (fromKey(m.date.slice(0, 10)).getTime() - start.getTime()) / 86400000, kg: m.weightKg! }));
  const base: ScaleCheck = { ok: false, days: days.length, loggedDays: logged.length, weighIns: ws.length, kgChange: 0, observedOut: 0, modelOut: 0, diff: 0 };
  const span = ws.length ? Math.max(...ws.map((w) => w.t)) - Math.min(...ws.map((w) => w.t)) : 0;
  if (ws.length < 3 || span < 14) return { ...base, reason: `Servono almeno 3 pesate distribuite su 2 settimane (ora ${ws.length}).` };
  if (logged.length < Math.ceil(windowDays * 0.8)) return { ...base, reason: `Servono i pasti registrati in almeno ${Math.ceil(windowDays * 0.8)} giorni su ${windowDays} (ora ${logged.length}).` };
  // pendenza del peso con i minimi quadrati: meno sensibile alle oscillazioni di acqua e glicogeno
  const mt = sum(ws.map((w) => w.t)) / ws.length, mk = sum(ws.map((w) => w.kg)) / ws.length;
  const slope = sum(ws.map((w) => (w.t - mt) * (w.kg - mk))) / sum(ws.map((w) => (w.t - mt) ** 2)); // kg al giorno
  const avgIntake = sum(logged.map((d) => d.intake!)) / logged.length;
  const observedOut = Math.round(avgIntake - slope * KCAL_PER_KG);
  const modelOut = Math.round(sum(logged.map((d) => d.out)) / logged.length);
  return { ...base, ok: true, kgChange: round(slope * windowDays, 2), observedOut, modelOut, diff: observedOut - modelOut };
}

/** Descrizione testuale del bilancio, neutra: deficit e surplus non sono "buoni" o "cattivi" di per sé. */
export function balanceLabel(b: number) {
  if (Math.abs(b) < 100) return 'In pari';
  return b < 0 ? 'Deficit' : 'Surplus';
}

/** Per la giornata in corso: consumo di base maturato fino a ora + allenamenti già fatti. */
export function outSoFar(d: DayEnergy, now = new Date()): number {
  if (!d.isToday) return d.out;
  const frac = (now.getHours() * 60 + now.getMinutes()) / 1440;
  return Math.round((d.bmr + d.lifestyle) * frac + d.exerciseNet);
}
