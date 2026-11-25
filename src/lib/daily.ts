/**
 * Riepilogo giornaliero: capisce, dai dati reali già salvati, cosa è previsto oggi
 * e cosa manca ancora. Non salva nulla: legge le stesse collezioni usate dalle altre schermate
 * (diario, benessere, misure, sessioni, cardio, programma, piano pasti), quindi si aggiorna
 * da solo a ogni scrittura locale o sincronizzata.
 *
 * Regole (prudenti, per non chiedere cose che non servono):
 * - Allenamento: solo se il programma attivo prevede una scheda oggi.
 * - Pasti: colazione, pranzo e cena ogni giorno; gli spuntini solo se sono nel piano pasti di oggi.
 *   Un pasto il cui orario non è ancora arrivato è "più tardi", non "mancante".
 * - Peso: solo con la pesata settimanale attiva, nel giorno scelto (o finché non la si recupera in settimana).
 * - Sonno, acqua e check-in del benessere: ogni giorno.
 * - Una voce si può saltare per oggi (WellnessDay.dailySkip): esce dal conteggio.
 */
import type { CardioLog, DiaryEntry, MealPlanDay, MealSlot, Measurement, Program, Settings, WellnessDay, WorkoutSession, WorkoutTemplate } from './types';
import { MEAL_LABEL } from './labels';
import { addDays, dayKey, fmtN, weekdayIdx } from './util';

export type DailyKey = 'workout' | 'sleep' | MealSlot | 'water' | 'weight' | 'checkin';
export type DailyStatus = 'done' | 'todo' | 'later';
export type DailyTier = 'core' | 'secondary' | 'optional';
export type DailyKind = 'workout' | 'cardio' | 'sleep' | 'meal' | 'water' | 'weight' | 'checkin';

export interface DailyItem {
  key: DailyKey;
  kind: DailyKind;
  label: string;
  /** Stato breve, già pronto da mostrare ("0,75 di 2 L", "Dalle 12:00", "Registrato"). */
  detail: string;
  status: DailyStatus;
  tier: DailyTier;
  /** Ordine di importanza (più basso = prima). */
  rank: number;
  /** Avanzamento parziale (acqua, check-in). */
  progress?: { value: number; max: number };
  /** Percorso della schermata dove si registra il dato. */
  to: string;
  skipped?: boolean;
}

export interface DailyInput {
  now: Date;
  settings: Settings;
  program?: Program;
  templates: WorkoutTemplate[];
  sessions: WorkoutSession[];
  diary: DiaryEntry[];
  wellness: WellnessDay[];
  measurements: Measurement[];
  cardio: CardioLog[];
  mealPlans: MealPlanDay[];
}

export interface DailySummary {
  date: string;
  /** Voci previste oggi (escluse quelle saltate), in ordine di priorità. */
  items: DailyItem[];
  skipped: DailyItem[];
  done: number;
  total: number;
  /** Voci da fare adesso (non "più tardi"). */
  todo: DailyItem[];
  later: DailyItem[];
  allDone: boolean;
}

/** Ora (in minuti) da cui un pasto si considera "da registrare". */
const MEAL_FROM: Record<MealSlot, number> = {
  breakfast: 5 * 60, snack_am: 10 * 60, lunch: 12 * 60, snack_pm: 16 * 60, dinner: 19 * 60, other: 0,
};
const MAIN_MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const SNACKS: MealSlot[] = ['snack_am', 'snack_pm'];
/** Il sonno della notte si registra dal mattino. */
const SLEEP_FROM = 5 * 60;

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Ultimo giorno di pesata (<= oggi) secondo l'impostazione settimanale. */
export function lastWeighDay(now: Date, weightDay: number): Date {
  const back = (weekdayIdx(now) - weightDay + 7) % 7;
  return addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -back);
}

export function dailySummary(inp: DailyInput): DailySummary {
  const { now, settings } = inp;
  const today = dayKey(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const w = inp.wellness.find((x) => x.date === today);
  const skip = new Set(w?.dailySkip ?? []);
  const items: DailyItem[] = [];

  // --- Allenamento (solo se in programma oggi) ---
  const tid = inp.program?.schedule[weekdayIdx(now)];
  const tpl = tid ? inp.templates.find((t) => t.id === tid) : undefined;
  if (tpl) {
    const cardioOnly = tpl.exercises.length > 0 && tpl.exercises.every((e) => !!e.cardio);
    const doneToday = inp.sessions.some((s) => s.status === 'completed' && !!s.endedAt && dayKey(s.startedAt) === today);
    const cardioToday = cardioOnly && inp.cardio.some((c) => c.date === today);
    const active = inp.sessions.find((s) => s.status === 'active');
    const done = doneToday || cardioToday;
    items.push({
      key: 'workout', kind: cardioOnly ? 'cardio' : 'workout',
      label: cardioOnly ? 'Cardio' : 'Allenamento',
      detail: done ? 'Completato' : active ? `In corso · ${active.name}` : tpl.name,
      status: done ? 'done' : 'todo', tier: 'core', rank: 1,
      to: active ? '/workout/live' : `start:${tpl.id}`,
    });
  }

  // --- Sonno della notte scorsa ---
  const slept = (w?.sleepHours ?? 0) > 0;
  items.push({
    key: 'sleep', kind: 'sleep', label: 'Sonno',
    detail: slept ? `${fmtN(w!.sleepHours!, 2)} h` : minutes < SLEEP_FROM ? 'Dal mattino' : 'Notte scorsa',
    status: slept ? 'done' : minutes < SLEEP_FROM ? 'later' : 'todo', tier: 'core', rank: 2,
    to: '/wellness?focus=sleep',
  });

  // --- Pasti ---
  const plan = inp.mealPlans.find((p) => p.date === today);
  const plannedSnacks = SNACKS.filter((s) => plan?.items.some((i) => i.slot === s));
  const slots = [...MAIN_MEALS, ...plannedSnacks].sort((a, b) => MEAL_FROM[a] - MEAL_FROM[b]);
  const todayDiary = inp.diary.filter((d) => d.date === today);
  for (const slot of slots) {
    const entries = todayDiary.filter((d) => d.slot === slot);
    const kcal = entries.reduce((a, e) => a + (e.kcal || 0), 0);
    const from = MEAL_FROM[slot];
    const status: DailyStatus = entries.length ? 'done' : minutes >= from ? 'todo' : 'later';
    items.push({
      key: slot, kind: 'meal', label: MEAL_LABEL[slot],
      detail: entries.length ? `${fmtN(kcal)} kcal` : status === 'later' ? `Dalle ${hhmm(from)}` : 'Da registrare',
      status, tier: MAIN_MEALS.includes(slot) ? 'core' : 'secondary', rank: 3 + slots.indexOf(slot) * 0.1,
      to: `/nutrition/add?slot=${slot}&date=${today}`,
    });
  }

  // --- Acqua ---
  const water = w?.waterMl ?? 0;
  const goal = Math.max(1, settings.waterGoalMl || 2000);
  items.push({
    key: 'water', kind: 'water', label: 'Acqua',
    detail: `${fmtN(water / 1000, 2)} di ${fmtN(goal / 1000, 1)} L`,
    status: water >= goal ? 'done' : 'todo', tier: 'secondary', rank: 4,
    progress: { value: water, max: goal }, to: '/wellness?focus=water',
  });

  // --- Peso (frequenza impostata dall'utente) ---
  if (settings.notifications?.weight) {
    const L = lastWeighDay(now, settings.notifications.weightDay ?? 0);
    const Lk = dayKey(L);
    const weighed = inp.measurements.filter((m) => m.weightKg);
    const before = weighed.some((m) => m.date >= Lk && m.date < today);
    if (!before) {
      const doneToday = weighed.some((m) => m.date === today);
      const late = Lk !== today;
      items.push({
        key: 'weight', kind: 'weight', label: 'Peso',
        detail: doneToday ? 'Registrato' : late ? `Pesata di ${L.toLocaleDateString('it-IT', { weekday: 'long' })}` : 'Pesata settimanale',
        status: doneToday ? 'done' : 'todo', tier: 'secondary', rank: 5, to: '/body?new=1',
      });
    }
  }

  // --- Check-in del benessere (energia, stress, umore) ---
  const checks = [w?.energy, w?.stress, w?.mood].filter((v) => v != null && v > 0).length;
  items.push({
    key: 'checkin', kind: 'checkin', label: 'Come ti senti',
    detail: checks === 3 ? 'Check-in fatto' : checks ? `${checks} di 3 indicatori` : 'Energia, stress, umore',
    status: checks === 3 ? 'done' : 'todo', tier: 'optional', rank: 6,
    progress: { value: checks, max: 3 }, to: '/wellness?focus=checkin',
  });

  const ord = (s: DailyStatus) => (s === 'todo' ? 0 : s === 'later' ? 1 : 2);
  const sorted = items.sort((a, b) => ord(a.status) - ord(b.status) || a.rank - b.rank);
  const active = sorted.filter((i) => !(skip.has(i.key) && i.status !== 'done'));
  const skipped = sorted.filter((i) => skip.has(i.key) && i.status !== 'done').map((i) => ({ ...i, skipped: true }));
  const done = active.filter((i) => i.status === 'done').length;
  return {
    date: today, items: active, skipped, done, total: active.length,
    todo: active.filter((i) => i.status === 'todo'), later: active.filter((i) => i.status === 'later'),
    allDone: active.length > 0 && done === active.length,
  };
}

/** Frase di stato che cambia con l'andamento della giornata. */
export function dailyHeadline(s: DailySummary, now: Date): { title: string; sub: string } {
  const h = now.getHours();
  const names = (xs: DailyItem[]) => {
    const n = xs.map((x) => (x.key === 'checkin' ? 'check-in' : x.label.toLowerCase()));
    if (n.length <= 3) return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
    return `${n.slice(0, 2).join(', ')} e altre ${n.length - 2} voci`;
  };
  if (!s.total) return { title: 'Niente da registrare', sub: 'Oggi non è previsto nulla.' };
  if (s.allDone) return { title: 'Tutto registrato', sub: 'Hai inserito tutto ciò che era previsto per oggi.' };
  if (!s.todo.length) return { title: 'Sei in pari', sub: `Più tardi: ${names(s.later)}.` };
  const verb = s.todo.length === 1 ? 'Manca' : 'Mancano';
  if (s.done === 0) return { title: h < 12 ? 'Inizia la giornata' : 'Da registrare oggi', sub: `${verb} ${names(s.todo)}.` };
  return { title: `${s.done} di ${s.total} completate`, sub: `${verb} ancora ${names(s.todo)}.` };
}
