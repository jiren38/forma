/**
 * Riepilogo settimanale: allenamenti, alimentazione, sonno, peso e benessere di una settimana
 * (lunedì-domenica), confrontati con la settimana precedente.
 *
 * Non salva nulla: legge le stesse collezioni delle altre schermate, quindi è sempre coerente
 * con Storico, Bilancio calorico, Benessere e Corpo. Regole principali:
 * - Il riepilogo della settimana è "pronto" dalla domenica: prima si guarda quella appena chiusa.
 * - Settimana in corso: il confronto è a parità di giorni (lun-mer contro lun-mer).
 * - Calorie: contano solo i giorni con pasti registrati (un giorno vuoto non vale 0 kcal);
 *   la giornata di oggi entra quando è registrata la cena.
 * - Peso: media delle pesate della settimana contro la media della settimana prima
 *   (o, se manca, l'ultima pesata precedente): meno sensibile alle oscillazioni di un singolo giorno.
 */
import { getExercise } from '@/data/exercises';
import type { CardioLog, DiaryEntry, Measurement, PRRecord, Profile, Program, Settings, WellnessDay, WorkoutSession, WorkoutTemplate } from './types';
import { buildEnergyIndex, type EnergyIndex } from './energy';
import { computeTargets } from './nutrition';
import { cardioEntries } from './cardio';
import { completedSessions, sessionStats } from './stats';
import { addDays, avg, dayKey, fmtN, round, startOfWeek, sum, weekdayIdx } from './util';

export type WeekPhase = 'past' | 'closing' | 'current';

export interface WeekRange {
  start: Date;
  /** lunedì della settimana, YYYY-MM-DD */
  key: string;
  /** giorni già iniziati (1-7): 7 per una settimana conclusa */
  days: number;
  phase: WeekPhase;
  label: string;
}

/** Ora da cui, la domenica, il riepilogo della settimana viene proposto in Home e notificato. */
export const RECAP_HOUR = 18;

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "16 – 22 nov", "28 ott – 3 nov", "29 dic 2025 – 4 gen 2026". */
export function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  const m = (d: Date) => MONTHS[d.getMonth()];
  if (start.getFullYear() !== end.getFullYear()) return `${start.getDate()} ${m(start)} ${start.getFullYear()} – ${end.getDate()} ${m(end)} ${end.getFullYear()}`;
  if (start.getMonth() !== end.getMonth()) return `${start.getDate()} ${m(start)} – ${end.getDate()} ${m(end)}`;
  return `${start.getDate()} – ${end.getDate()} ${m(end)}`;
}

export function weekRange(anyDay: Date, now: Date): WeekRange {
  const start = startOfWeek(anyDay);
  const key = dayKey(start);
  const today = dayKey(now);
  const last = dayKey(addDays(start, 6));
  const phase: WeekPhase = today > last ? 'past' : weekdayIdx(now) === 6 ? 'closing' : 'current';
  const days = phase === 'past' ? 7 : today < key ? 0 : weekdayIdx(now) + 1;
  return { start, key, days, phase, label: weekLabel(start) };
}

/** Settimana da mostrare di default: la domenica quella che si chiude oggi, negli altri giorni quella appena conclusa. */
export function recapWeekStart(now: Date): Date {
  const s = startOfWeek(now);
  return weekdayIdx(now) === 6 ? s : addDays(s, -7);
}

/** Finestra in cui il riepilogo è "nuovo": domenica dalle 18, lunedì e martedì. */
export function recapFresh(now: Date): boolean {
  const wd = weekdayIdx(now);
  return (wd === 6 && now.getHours() >= RECAP_HOUR) || wd === 0 || wd === 1;
}

// ---------------------------------------------------------------------------

export interface WeeklyInput {
  now: Date;
  profile: Profile;
  settings: Settings;
  program?: Program;
  templates: WorkoutTemplate[];
  sessions: WorkoutSession[];
  cardio: CardioLog[];
  diary: DiaryEntry[];
  wellness: WellnessDay[];
  measurements: Measurement[];
  /** già calcolato altrove (stessa logica della pagina Bilancio): evita di ricostruirlo */
  energy?: EnergyIndex;
}

export type DayStatus = 'done' | 'extra' | 'missed' | 'planned' | 'rest' | 'future';

export interface DayCell {
  key: string;
  idx: number;
  status: DayStatus;
  /** nome della scheda in programma quel giorno */
  planned: string | null;
  sessions: { id: string; name: string }[];
  cardio: number;
}

export interface WeekPR { exerciseId: string; name: string; kind: PRRecord['kind']; value: number; reps?: number; sessionId: string; date: string }

export interface TrainingWeek {
  sessions: number;
  /** attività cardio registrate a parte (pagina Cardio) */
  cardioLogs: number;
  activeDays: number;
  /** giorni con allenamento previsto dal programma attivo (null se non c'è un programma) */
  planned: number | null;
  plannedDone: number;
  /** obiettivo settimanale (impostazioni o profilo) */
  goal: number;
  minutes: number;
  volume: number;
  sets: number;
  cardioMin: number;
  cardioKm: number;
  prs: WeekPR[];
  days: DayCell[];
  missed: DayCell[];
}

export interface NutritionWeek {
  /** giorni considerati (passati, più oggi se la cena è registrata) */
  days: number;
  loggedDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  targetKcal: number;
  targetProtein: number;
  /** giorni entro ±10% dell'obiettivo calorico */
  inTarget: number;
  avgBalance: number | null;
  predictedKg: number | null;
  perDay: (number | null)[];
  todayPending: boolean;
}

export interface SleepWeek {
  nights: number;
  avgH: number | null;
  goalH: number;
  avgQuality: number | null;
  onGoal: number;
  best: { key: string; h: number } | null;
  worst: { key: string; h: number } | null;
  perDay: (number | null)[];
}

export interface WeightWeek {
  count: number;
  avg: number | null;
  first: number | null;
  last: number | null;
  min: number | null;
  max: number | null;
  /** ultima pesata prima della settimana */
  before: number | null;
}

export interface WellbeingWeek {
  waterDays: number;
  avgWaterMl: number | null;
  waterGoal: number;
  waterOnGoal: number;
  energy: number | null;
  stress: number | null;
  mood: number | null;
  checkins: number;
}

export interface WeekStats {
  range: WeekRange;
  training: TrainingWeek;
  nutrition: NutritionWeek;
  sleep: SleepWeek;
  weight: WeightWeek;
  wellbeing: WellbeingWeek;
  hasData: boolean;
}

const mean = (xs: number[]) => (xs.length ? avg(xs) : null);

/**
 * Statistiche di una settimana. `limitDays` limita il calcolo ai primi N giorni
 * (per confrontare una settimana in corso con lo stesso tratto della precedente).
 */
export function weekStats(inp: WeeklyInput, anyDay: Date, limitDays?: number, energy?: EnergyIndex): WeekStats {
  const range = weekRange(anyDay, inp.now);
  const today = dayKey(inp.now);
  const n = Math.min(range.days, limitDays ?? 7);
  const keys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(range.start, i)));
  const inKeys = new Set(keys.slice(0, n));
  const inWeek = (k: string) => inKeys.has(k.slice(0, 10));
  const idx = energy ?? inp.energy ?? buildEnergyIndex({ profile: inp.profile, sessions: inp.sessions, cardioLogs: inp.cardio, diary: inp.diary, measurements: inp.measurements }, today);

  // --- Allenamenti ---
  const sessions = completedSessions(inp.sessions).filter((s) => inWeek(dayKey(s.startedAt)));
  const logs = inp.cardio.filter((c) => inWeek(c.date));
  const stats = sessions.map(sessionStats);
  const cardio = cardioEntries(sessions, logs).filter((e) => inWeek(e.date));
  const goal = Math.max(1, inp.settings.weeklyWorkoutGoal ?? inp.profile.daysPerWeek ?? 3);
  const tplName = (id: string | null | undefined) => (id ? inp.templates.find((t) => t.id === id)?.name ?? null : null);
  const days: DayCell[] = keys.map((key, i) => {
    const ss = sessions.filter((s) => dayKey(s.startedAt) === key).map((s) => ({ id: s.id, name: s.name }));
    const cl = logs.filter((c) => c.date === key).length;
    const planned = tplName(inp.program?.schedule[i]);
    const trained = ss.length > 0 || cl > 0;
    const counted = i < n;
    const status: DayStatus = !counted ? (key > today ? 'future' : planned ? 'planned' : 'rest')
      : trained ? (planned ? 'done' : 'extra')
      : planned ? (key < today ? 'missed' : 'planned') : 'rest';
    return { key, idx: i, status, planned, sessions: counted ? ss : [], cardio: counted ? cl : 0 };
  });
  const prs: WeekPR[] = sessions.flatMap((s) => (s.prs ?? []).map((p) => ({ ...p, name: getExercise(p.exerciseId)?.name ?? 'Esercizio', sessionId: s.id, date: s.startedAt })));
  const planned = inp.program ? days.filter((d) => d.planned).length : null;
  const training: TrainingWeek = {
    sessions: sessions.length,
    cardioLogs: logs.length,
    activeDays: days.filter((d) => d.status === 'done' || d.status === 'extra').length,
    planned,
    plannedDone: days.filter((d) => d.status === 'done').length,
    goal,
    minutes: Math.round(sum(stats.map((s) => s.durationMs / 60000)) + sum(logs.map((l) => l.durationMin || 0))),
    volume: Math.round(sum(stats.map((s) => s.volume))),
    sets: sum(stats.map((s) => s.sets)),
    cardioMin: Math.round(sum(cardio.map((c) => c.actualMin))),
    cardioKm: round(sum(cardio.map((c) => c.distanceKm ?? 0)), 1),
    prs,
    days,
    missed: days.filter((d) => d.status === 'missed'),
  };

  // --- Alimentazione ---
  const diaryIn = inp.diary.filter((d) => inWeek(d.date));
  const dinnerToday = diaryIn.some((d) => d.date === today && d.slot === 'dinner');
  const countable = keys.slice(0, n).filter((k) => k < today || (k === today && dinnerToday));
  const targets = computeTargets(inp.profile, inp.settings, inp.program ? inp.program.schedule.filter(Boolean).length : undefined);
  const perKcal = new Map<string, number>(), perProt = new Map<string, number>();
  for (const e of diaryIn) {
    perKcal.set(e.date, (perKcal.get(e.date) ?? 0) + (e.kcal || 0));
    perProt.set(e.date, (perProt.get(e.date) ?? 0) + (e.protein || 0));
  }
  const logged = countable.filter((k) => perKcal.has(k));
  const kcals = logged.map((k) => perKcal.get(k)!);
  const balances = logged.map((k) => perKcal.get(k)! - idx.day(k).out);
  const nutrition: NutritionWeek = {
    days: countable.length,
    loggedDays: logged.length,
    avgKcal: logged.length ? Math.round(avg(kcals)) : null,
    avgProtein: logged.length ? Math.round(avg(logged.map((k) => perProt.get(k) ?? 0))) : null,
    targetKcal: targets.kcal,
    targetProtein: targets.protein,
    inTarget: kcals.filter((k) => Math.abs(k - targets.kcal) <= targets.kcal * 0.1).length,
    avgBalance: balances.length ? Math.round(avg(balances)) : null,
    predictedKg: balances.length ? round(sum(balances) / 7700, 2) : null,
    perDay: keys.map((k) => (countable.includes(k) && perKcal.has(k) ? Math.round(perKcal.get(k)!) : null)),
    todayPending: inKeys.has(today) && !dinnerToday,
  };

  // --- Sonno ---
  const well = inp.wellness.filter((w) => inWeek(w.date));
  const nights = well.filter((w) => (w.sleepHours ?? 0) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const hours = nights.map((w) => w.sleepHours!);
  const goalH = inp.settings.sleepGoalH || 8;
  const byH = [...nights].sort((a, b) => a.sleepHours! - b.sleepHours!);
  const sleep: SleepWeek = {
    nights: nights.length,
    avgH: hours.length ? round(avg(hours), 2) : null,
    goalH,
    avgQuality: mean(nights.map((w) => w.sleepQuality ?? 0).filter((q) => q > 0)),
    onGoal: hours.filter((h) => h >= goalH - 0.25).length,
    best: nights.length > 1 ? { key: byH[byH.length - 1].date, h: byH[byH.length - 1].sleepHours! } : null,
    worst: nights.length > 1 ? { key: byH[0].date, h: byH[0].sleepHours! } : null,
    perDay: keys.map((k) => nights.find((w) => w.date === k)?.sleepHours ?? null),
  };

  // --- Peso ---
  const weighed = inp.measurements.filter((m) => (m.weightKg ?? 0) > 0).map((m) => ({ key: m.date.slice(0, 10), kg: m.weightKg! })).sort((a, b) => a.key.localeCompare(b.key));
  const wIn = weighed.filter((w) => inWeek(w.key));
  const wBefore = weighed.filter((w) => w.key < range.key);
  const weight: WeightWeek = {
    count: wIn.length,
    avg: wIn.length ? round(avg(wIn.map((w) => w.kg)), 2) : null,
    first: wIn[0]?.kg ?? null,
    last: wIn[wIn.length - 1]?.kg ?? null,
    min: wIn.length ? Math.min(...wIn.map((w) => w.kg)) : null,
    max: wIn.length ? Math.max(...wIn.map((w) => w.kg)) : null,
    before: wBefore[wBefore.length - 1]?.kg ?? null,
  };

  // --- Benessere ---
  const waterDays = well.filter((w) => (w.waterMl ?? 0) > 0 && (w.date < today || (w.waterMl ?? 0) >= inp.settings.waterGoalMl));
  const pick = (f: (w: WellnessDay) => number | null | undefined) => {
    const v = mean(well.map(f).filter((x): x is number => x != null && x > 0));
    return v == null ? null : round(v, 1);
  };
  const wellbeing: WellbeingWeek = {
    waterDays: waterDays.length,
    avgWaterMl: waterDays.length ? Math.round(avg(waterDays.map((w) => w.waterMl))) : null,
    waterGoal: inp.settings.waterGoalMl || 2000,
    waterOnGoal: waterDays.filter((w) => w.waterMl >= (inp.settings.waterGoalMl || 2000)).length,
    energy: pick((w) => w.energy),
    stress: pick((w) => w.stress),
    mood: pick((w) => w.mood),
    checkins: well.filter((w) => (w.energy ?? 0) > 0 || (w.stress ?? 0) > 0 || (w.mood ?? 0) > 0).length,
  };

  const hasData = training.sessions + training.cardioLogs + nutrition.loggedDays + sleep.nights + weight.count + wellbeing.waterDays + wellbeing.checkins > 0;
  return { range, training, nutrition, sleep, weight, wellbeing, hasData };
}

// ---------------------------------------------------------------------------
// Confronto e sintesi

export type Tone = 'good' | 'bad' | 'neutral';
export interface Delta { value: number; tone: Tone }
export type WeightDirection = 'lose' | 'gain' | 'keep';

export interface Highlight {
  id: string;
  tone: 'good' | 'warn' | 'info';
  icon: 'training' | 'record' | 'sleep' | 'weight' | 'food' | 'water' | 'cardio';
  text: string;
  to?: string;
}

export interface WeeklyRecap {
  cur: WeekStats;
  prev: WeekStats;
  /** il confronto è fatto sugli stessi giorni (settimana in corso) */
  partial: boolean;
  cmp: {
    sessions: Delta | null;
    minutes: Delta | null;
    volume: Delta | null;
    cardioMin: Delta | null;
    kcal: Delta | null;
    protein: Delta | null;
    sleep: Delta | null;
    weight: Delta | null;
    water: Delta | null;
  };
  weightDirection: WeightDirection;
  /** peso obiettivo del profilo (kg) */
  targetKg: number;
  /** variazione di peso usata nel confronto e da dove viene */
  weightRef: 'prev_week' | 'last_before' | null;
  headline: { title: string; sub: string; tone: 'good' | 'ok' | 'low' | 'empty' | 'current' };
  highlights: Highlight[];
}

const DAY_NAME = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

function list(xs: string[]) {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
}

export const signedN = (n: number, d = 0) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmtN(Math.abs(n), d)}`;

/** Ore in forma leggibile: 7,5 → "7 h 30 min". */
export function fmtHours(h: number) {
  const m = Math.round(h * 60);
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh} h ${String(mm).padStart(2, '0')} min` : `${hh} h`;
}
/** Differenza in minuti: +35 min, −1 h 10 min. */
export function fmtMinutesDelta(hDelta: number) {
  const m = Math.round(Math.abs(hDelta) * 60);
  const s = hDelta > 0 ? '+' : hDelta < 0 ? '−' : '±';
  return m >= 60 ? `${s}${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${s}${m} min`;
}

export function weeklyRecap(inp: WeeklyInput, anyDay: Date): WeeklyRecap {
  const energy = inp.energy ?? buildEnergyIndex({ profile: inp.profile, sessions: inp.sessions, cardioLogs: inp.cardio, diary: inp.diary, measurements: inp.measurements }, dayKey(inp.now));
  const cur = weekStats(inp, anyDay, undefined, energy);
  const partial = cur.range.days < 7;
  const prev = weekStats(inp, addDays(cur.range.start, -7), partial ? cur.range.days : undefined, energy);
  const T = cur.training, P = prev.training;

  const d = (a: number | null, b: number | null, toneOf: (diff: number) => Tone): Delta | null => (a == null || b == null ? null : { value: a - b, tone: toneOf(a - b) });
  const upGood = (eps: number) => (x: number) => (x > eps ? 'good' : x < -eps ? 'bad' : 'neutral') as Tone;
  const prevTrained = P.sessions + P.cardioLogs > 0;

  // peso: direzione dall'obiettivo rispetto all'ultimo peso noto
  const latest = cur.weight.last ?? cur.weight.before ?? inp.profile.weightKg;
  const target = inp.profile.targetWeightKg;
  const weightDirection: WeightDirection = !target || Math.abs(target - latest) <= 0.5 ? 'keep' : target < latest ? 'lose' : 'gain';
  const weightRef = cur.weight.avg == null ? null : prev.weight.avg != null ? 'prev_week' : cur.weight.before != null ? 'last_before' : null;
  const refKg = weightRef === 'prev_week' ? prev.weight.avg : weightRef === 'last_before' ? cur.weight.before : null;
  const weightTone = (x: number): Tone => {
    if (weightDirection === 'keep') return Math.abs(x) <= 0.3 ? 'good' : 'neutral';
    if (Math.abs(x) < 0.05) return 'neutral';
    return (weightDirection === 'lose') === x < 0 ? 'good' : 'bad';
  };

  const kcalTone = (x: number): Tone => {
    const t = cur.nutrition.targetKcal;
    const a = Math.abs((cur.nutrition.avgKcal ?? 0) - t), b = Math.abs((cur.nutrition.avgKcal ?? 0) - x - t);
    return a < b - 50 ? 'good' : a > b + 50 ? 'bad' : 'neutral';
  };
  const sleepTone = (x: number): Tone => {
    if (x >= 0.25) return (prev.sleep.avgH ?? 0) >= cur.sleep.goalH + 1 ? 'neutral' : 'good';
    if (x <= -0.25) return (cur.sleep.avgH ?? 0) >= cur.sleep.goalH ? 'neutral' : 'bad';
    return 'neutral';
  };

  const cmp: WeeklyRecap['cmp'] = {
    sessions: prevTrained || T.sessions ? d(T.sessions, P.sessions, (x) => (x > 0 ? 'good' : x < 0 && T.sessions < Math.min(T.goal, T.planned ?? T.goal) ? 'bad' : 'neutral')) : null,
    minutes: prevTrained ? d(T.minutes, P.minutes, upGood(10)) : null,
    volume: P.volume > 0 && T.volume > 0 ? d(T.volume, P.volume, upGood(P.volume * 0.03)) : null,
    cardioMin: P.cardioMin > 0 || T.cardioMin > 0 ? d(T.cardioMin, P.cardioMin, upGood(5)) : null,
    kcal: d(cur.nutrition.avgKcal, prev.nutrition.avgKcal, kcalTone),
    protein: d(cur.nutrition.avgProtein, prev.nutrition.avgProtein, (x) => {
      const t = cur.nutrition.targetProtein, a = cur.nutrition.avgProtein ?? 0;
      return a < t && x > 5 ? 'good' : a < t * 0.9 && x < -5 ? 'bad' : 'neutral';
    }),
    sleep: d(cur.sleep.avgH, prev.sleep.avgH, sleepTone),
    weight: refKg != null && cur.weight.avg != null ? { value: round(cur.weight.avg - refKg, 2), tone: weightTone(cur.weight.avg - refKg) } : null,
    water: d(cur.wellbeing.avgWaterMl, prev.wellbeing.avgWaterMl, upGood(100)),
  };

  // --- Punti salienti ---
  const H: Highlight[] = [];
  const past = cur.range.phase === 'past';
  if (T.planned != null && T.planned > 0) {
    const missed = T.missed.map((m) => `${DAY_NAME[m.idx]}${m.planned ? ` (${m.planned})` : ''}`);
    const left = T.days.filter((x) => x.planned && (x.status === 'planned' || x.status === 'future')).length;
    const extra = T.days.filter((x) => x.status === 'extra').length;
    const plus = extra ? `, più ${extra === 1 ? 'un giorno extra' : `${extra} giorni extra`}` : '';
    if (T.plannedDone >= T.planned) H.push({ id: 'plan', tone: 'good', icon: 'training', text: T.planned === 1 ? `Hai fatto l’allenamento in programma${plus}.` : `Hai fatto tutti i ${T.planned} allenamenti in programma${plus}.`, to: '/history' });
    else if (missed.length) H.push({ id: 'plan', tone: 'warn', icon: 'training', text: `${T.plannedDone} allenamenti su ${T.planned} in programma: ${missed.length === 1 ? 'è saltato' : 'sono saltati'} ${list(missed)}.`, to: '/history' });
    else if (left) H.push({ id: 'plan', tone: 'info', icon: 'training', text: `${T.plannedDone} su ${T.planned} allenamenti in programma, ${left === 1 ? 'ne manca ancora 1' : `ne mancano ancora ${left}`} questa settimana.`, to: '/workouts' });
  } else if (T.sessions + T.cardioLogs > 0 || past) {
    const done = T.sessions;
    if (done >= T.goal) H.push({ id: 'plan', tone: 'good', icon: 'training', text: `Obiettivo settimanale raggiunto: ${done} allenamenti su ${T.goal}.`, to: '/history' });
    else if (past || cur.range.phase === 'closing') H.push({ id: 'plan', tone: done ? 'info' : 'warn', icon: 'training', text: done ? `${done} ${done === 1 ? 'allenamento' : 'allenamenti'} su un obiettivo di ${T.goal}.` : `Nessun allenamento registrato, l’obiettivo era ${T.goal}.`, to: '/workouts' });
  }
  if (T.prs.length) {
    const top = T.prs.slice(0, 2).map((p) => p.name);
    H.push({ id: 'pr', tone: 'good', icon: 'record', text: T.prs.length === 1 ? `Nuovo record personale: ${top[0]}.` : `${T.prs.length} nuovi record personali, tra cui ${list(top)}.`, to: '/progress?tab=records' });
  }
  if (cmp.cardioMin && T.cardioMin >= 20 && cmp.cardioMin.value >= 15) {
    H.push({ id: 'cardio', tone: 'good', icon: 'cardio', text: P.cardioMin > 0 ? `${fmtN(T.cardioMin)} minuti di cardio, ${fmtN(cmp.cardioMin.value)} in più della settimana prima.` : `${fmtN(T.cardioMin)} minuti di cardio, nessuno la settimana prima.`, to: '/progress?tab=cardio' });
  }
  const S = cur.sleep;
  if (S.avgH != null) {
    if (cmp.sleep && Math.abs(cmp.sleep.value) >= 0.25 && cmp.sleep.tone !== 'neutral') {
      H.push({ id: 'sleep', tone: cmp.sleep.tone === 'good' ? 'good' : 'warn', icon: 'sleep', text: `Hai dormito in media ${fmtMinutesDelta(cmp.sleep.value).replace(/^[+−]/, '')} ${cmp.sleep.value > 0 ? 'in più' : 'in meno'} a notte rispetto alla settimana prima.`, to: '/wellness' });
    } else if (S.avgH < S.goalH - 1) {
      H.push({ id: 'sleep', tone: 'warn', icon: 'sleep', text: `Media di ${fmtHours(S.avgH)} a notte, sotto il tuo obiettivo di ${fmtN(S.goalH, 1)} h.`, to: '/wellness' });
    } else if (S.avgH >= S.goalH - 0.25 && S.nights >= 3) {
      H.push({ id: 'sleep', tone: 'good', icon: 'sleep', text: `Sonno in linea con l’obiettivo: ${fmtHours(S.avgH)} a notte in media.`, to: '/wellness' });
    }
  }
  if (cmp.weight && Math.abs(cmp.weight.value) >= 0.1) {
    const v = `${signedN(cmp.weight.value, 1)} kg`;
    const why = weightRef === 'prev_week' ? 'rispetto alla settimana prima' : 'rispetto all’ultima pesata';
    const dir = cmp.weight.tone === 'good' && weightDirection !== 'keep' ? ', nella direzione del tuo obiettivo' : cmp.weight.tone === 'bad' ? ', in direzione opposta al tuo obiettivo' : '';
    H.push({ id: 'weight', tone: cmp.weight.tone === 'good' ? 'good' : cmp.weight.tone === 'bad' ? 'warn' : 'info', icon: 'weight', text: `Peso medio ${v} ${why}${dir}.`, to: '/body' });
  }
  const N = cur.nutrition;
  if (N.days >= 3 && N.loggedDays < Math.ceil(N.days / 2)) {
    H.push({ id: 'food', tone: 'warn', icon: 'food', text: N.loggedDays ? `Pasti registrati solo in ${N.loggedDays} giorni su ${N.days}: calorie e bilancio sono poco affidabili.` : 'Nessun pasto registrato: senza diario non si possono calcolare calorie e bilancio.', to: '/nutrition' });
  } else if (N.avgKcal != null && N.loggedDays >= 2) {
    if (N.inTarget >= Math.ceil(N.loggedDays * 0.7)) H.push({ id: 'food', tone: 'good', icon: 'food', text: `Calorie vicine all’obiettivo in ${N.inTarget} giorni su ${N.loggedDays} registrati.`, to: `/energy?p=week&d=${cur.range.key}` });
    else {
      const diff = N.avgKcal - N.targetKcal;
      H.push({ id: 'food', tone: 'info', icon: 'food', text: `In media ${fmtN(N.avgKcal)} kcal al giorno, ${fmtN(Math.abs(diff))} ${diff > 0 ? 'sopra' : 'sotto'} il tuo obiettivo di ${fmtN(N.targetKcal)}.`, to: `/energy?p=week&d=${cur.range.key}` });
    }
  }

  // --- Titolo ---
  const parts: string[] = [];
  if (T.sessions) parts.push(`${T.sessions} ${T.sessions === 1 ? 'allenamento' : 'allenamenti'}`);
  else if (T.cardioLogs) parts.push(`${T.cardioLogs} attività cardio`);
  if (N.avgKcal != null) parts.push(`${fmtN(N.avgKcal)} kcal al giorno`);
  if (S.avgH != null) parts.push(`${fmtN(S.avgH, 1)} h di sonno a notte`);
  if (cmp.weight) parts.push(`peso ${signedN(cmp.weight.value, 1)} kg`);
  else if (cur.weight.avg != null) parts.push(`peso ${fmtN(cur.weight.avg, 1)} kg`);
  const sub = parts.length ? `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.` : '';
  let headline: WeeklyRecap['headline'];
  if (!cur.hasData) headline = { title: cur.range.phase === 'past' ? 'Settimana senza registrazioni' : 'Ancora nessun dato', sub: 'Registra allenamenti, pasti, sonno e peso: il riepilogo si costruisce da solo.', tone: 'empty' };
  else if (cur.range.phase === 'current') headline = { title: 'Settimana in corso', sub: sub || 'I dati si aggiornano a ogni registrazione.', tone: 'current' };
  else {
    const ratio = T.planned ? T.plannedDone / T.planned : T.sessions / T.goal;
    const title = ratio >= 1 ? 'Obiettivo allenamenti raggiunto' : ratio >= 0.75 ? 'Settimana solida' : ratio >= 0.4 ? 'Settimana a metà' : ratio > 0 ? 'Settimana leggera' : 'Settimana di pausa';
    headline = { title, sub, tone: ratio >= 0.75 ? 'good' : ratio >= 0.4 ? 'ok' : 'low' };
  }

  return { cur, prev, partial, cmp, weightDirection, targetKg: target || 0, weightRef, headline, highlights: cur.hasData ? H.slice(0, 5) : [] };
}

// ---------------------------------------------------------------------------
// Andamento delle ultime settimane

export interface TrendWeek { key: string; label: string; sessions: number; minutes: number; avgKcal: number | null; avgSleep: number | null; avgWeight: number | null; current: boolean }

export function weeklyTrend(inp: WeeklyInput, lastStart: Date, weeks = 8): TrendWeek[] {
  const energy = inp.energy ?? buildEnergyIndex({ profile: inp.profile, sessions: inp.sessions, cardioLogs: inp.cardio, diary: inp.diary, measurements: inp.measurements }, dayKey(inp.now));
  const out: TrendWeek[] = [];
  const end = dayKey(startOfWeek(lastStart)) > dayKey(startOfWeek(inp.now)) ? startOfWeek(inp.now) : startOfWeek(lastStart);
  for (let i = weeks - 1; i >= 0; i--) {
    const s = addDays(end, -7 * i);
    const w = weekStats(inp, s, undefined, energy);
    out.push({
      key: w.range.key, label: `${s.getDate()}/${s.getMonth() + 1}`, sessions: w.training.sessions, minutes: w.training.minutes,
      avgKcal: w.nutrition.avgKcal, avgSleep: w.sleep.avgH, avgWeight: w.weight.avg, current: w.range.phase !== 'past',
    });
  }
  return out;
}

/** Testo breve per la notifica della domenica. */
export function recapNotificationBody(r: WeeklyRecap): string {
  const T = r.cur.training;
  const bits: string[] = [];
  bits.push(T.planned ? `${T.plannedDone}/${T.planned} allenamenti` : `${T.sessions} allenamenti`);
  if (T.prs.length) bits.push(`${T.prs.length} record`);
  if (r.cur.nutrition.avgKcal != null) bits.push(`${fmtN(r.cur.nutrition.avgKcal)} kcal/giorno`);
  if (r.cur.sleep.avgH != null) bits.push(`${fmtN(r.cur.sleep.avgH, 1)} h di sonno`);
  if (r.cmp.weight) bits.push(`peso ${signedN(r.cmp.weight.value, 1)} kg`);
  return `${bits.join(' · ')}. Tocca per il confronto con la settimana prima.`;
}

