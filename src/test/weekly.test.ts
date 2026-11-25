import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/data';
import { fmtHours, fmtMinutesDelta, recapFresh, recapWeekStart, weekLabel, weekRange, weekStats, weeklyRecap, weeklyTrend, type WeeklyInput } from '@/lib/weekly';
import type { DiaryEntry, Measurement, Profile, Program, WellnessDay, WorkoutSession, WorkoutTemplate } from '@/lib/types';
import { dayKey } from '@/lib/util';

// Settimana 16-22 novembre 2026 (lunedì-domenica) e settimana prima 9-15 novembre.
const d = (day: number, h = 10, month = 10) => new Date(2026, month, day, h);
const k = (day: number) => dayKey(d(day));

const profile = {
  name: 'Test', age: 30, sex: 'male', heightCm: 180, weightKg: 80, targetWeightKg: 76, level: 'intermediate', goals: ['fat_loss'],
  daysPerWeek: 3, minutesPerSession: 60, preferredDays: [0, 2, 4], sessionStyle: 'long', split: 'full_body', injuries: [], injuryNotes: '',
  focusMuscles: [], lessMuscles: [], exercisePrefs: { preferFree: true, preferMachines: false, avoidIds: [] }, activity: 'moderate',
  location: ['commercial_gym'], equipment: [], fullGym: true, diet: { pattern: 'omnivore', allergies: '', mealsPerDay: 3 },
} as Profile;

const tpl = (id: string, name: string): WorkoutTemplate => ({ id, name, exercises: [], source: 'manual', createdAt: '', updatedAt: '' });
const templates = [tpl('a', 'Full A'), tpl('b', 'Full B'), tpl('c', 'Full C')];
// lunedì A, mercoledì B, venerdì C
const program: Program = { id: 'p', name: 'Full body', schedule: ['a', null, 'b', null, 'c', null, null], active: true, source: 'manual', createdAt: '' };

function session(day: number, name: string, opts: { volume?: number; prs?: number; month?: number } = {}): WorkoutSession {
  const start = d(day, 18, opts.month);
  const reps = 10, weight = (opts.volume ?? 1000) / reps;
  return {
    id: `s${day}${name}`, name, startedAt: start.toISOString(), endedAt: new Date(+start + 60 * 60e3).toISOString(), pausedMs: 0, status: 'completed',
    exercises: [{ uid: 'x', exerciseId: 'bench_press_bb', restSec: 90, repMin: 8, repMax: 10, sets: [{ uid: '1', weight, reps, done: true }] }],
    prs: Array.from({ length: opts.prs ?? 0 }, () => ({ exerciseId: 'bench_press_bb', kind: 'weight' as const, value: weight, reps, date: start.toISOString(), sessionId: `s${day}${name}` })),
  };
}
const food = (day: number, kcal: number, slot: DiaryEntry['slot'] = 'lunch', protein = 40): DiaryEntry => ({ id: `f${day}${slot}${kcal}`, date: k(day), slot, name: 'Cibo', grams: 100, kcal, protein, carbs: 0, fat: 0, createdAt: '' });
const night = (day: number, h: number, q?: number): WellnessDay => ({ id: k(day), date: k(day), sleepHours: h, sleepQuality: q ?? null, waterMl: 0 });
const weigh = (day: number, kg: number): Measurement => ({ id: `m${day}`, date: k(day), weightKg: kg });

function input(over: Partial<WeeklyInput> = {}): WeeklyInput {
  return { now: d(23, 9), profile, settings: { ...DEFAULT_SETTINGS }, program, templates, sessions: [], cardio: [], diary: [], wellness: [], measurements: [], ...over };
}

describe('settimana del riepilogo', () => {
  it('la domenica il riepilogo è quello della settimana che si chiude, negli altri giorni della precedente', () => {
    expect(dayKey(recapWeekStart(d(22, 19)))).toBe('2026-11-16'); // domenica
    expect(dayKey(recapWeekStart(d(23, 9)))).toBe('2026-11-16'); // lunedì dopo
    expect(dayKey(recapWeekStart(d(25, 9)))).toBe('2026-11-16'); // mercoledì
    expect(dayKey(recapWeekStart(d(21, 9)))).toBe('2026-11-09'); // sabato: la settimana non è finita
  });

  it('è "nuovo" dalla domenica alle 18 fino a martedì', () => {
    expect(recapFresh(d(22, 17))).toBe(false);
    expect(recapFresh(d(22, 18))).toBe(true);
    expect(recapFresh(d(23, 9))).toBe(true);
    expect(recapFresh(d(24, 23))).toBe(true);
    expect(recapFresh(d(25, 9))).toBe(false);
  });

  it('fase e giorni contati', () => {
    expect(weekRange(d(18), d(25))).toMatchObject({ key: '2026-11-16', phase: 'past', days: 7 });
    expect(weekRange(d(18), d(22, 20))).toMatchObject({ phase: 'closing', days: 7 });
    expect(weekRange(d(25), d(25))).toMatchObject({ key: '2026-11-23', phase: 'current', days: 3 });
  });

  it('etichette leggibili, anche a cavallo di mese e anno', () => {
    expect(weekLabel(d(16))).toBe('16 – 22 nov');
    expect(weekLabel(new Date(2026, 9, 26))).toBe('26 ott – 1 nov');
    expect(weekLabel(new Date(2025, 11, 29))).toBe('29 dic 2025 – 4 gen 2026');
  });
});

describe('allenamenti della settimana', () => {
  it('conta le sessioni concluse e confronta con il programma giorno per giorno', () => {
    const sessions = [session(16, 'Full A', { prs: 1 }), session(18, 'Full B'), session(21, 'Extra'), { ...session(20, 'Full C'), status: 'discarded' as const }];
    const t = weekStats(input({ sessions }), d(16)).training;
    expect(t.sessions).toBe(3);
    expect(t.planned).toBe(3);
    expect(t.plannedDone).toBe(2);
    expect(t.missed.map((m) => m.key)).toEqual(['2026-11-20']);
    expect(t.days.map((x) => x.status)).toEqual(['done', 'rest', 'done', 'rest', 'missed', 'extra', 'rest']);
    expect(t.prs).toHaveLength(1);
    expect(t.prs[0].name).toBe('Panca piana con bilanciere');
    expect(t.volume).toBe(3000);
    expect(t.minutes).toBe(180);
  });

  it('un giorno in programma di oggi non è "saltato" finché non passa', () => {
    const t = weekStats(input({ now: d(25, 9), sessions: [session(23, 'Full A')] }), d(25)).training;
    expect(t.days.slice(0, 3).map((x) => x.status)).toEqual(['done', 'rest', 'planned']);
    expect(t.days[4].status).toBe('future');
    expect(t.missed).toHaveLength(0);
  });

  it('le attività cardio registrate a parte rendono attivo il giorno', () => {
    const t = weekStats(input({ cardio: [{ id: 'c', date: k(17), type: 'run', durationMin: 30, distanceKm: 5, createdAt: '' }] }), d(16)).training;
    expect(t.cardioLogs).toBe(1);
    expect(t.cardioMin).toBe(30);
    expect(t.cardioKm).toBe(5);
    expect(t.days[1].status).toBe('extra');
  });
});

describe('alimentazione, sonno e peso', () => {
  it('le calorie sono la media dei soli giorni registrati', () => {
    const diary = [food(16, 2000), food(16, 400, 'dinner'), food(17, 1800), food(19, 2200)];
    const n = weekStats(input({ diary }), d(16)).nutrition;
    expect(n.loggedDays).toBe(3);
    expect(n.avgKcal).toBe(2133);
    expect(n.perDay[0]).toBe(2400);
    expect(n.perDay[1]).toBe(1800);
    expect(n.perDay[2]).toBeNull();
    expect(n.avgBalance).not.toBeNull();
  });

  it('oggi conta solo quando la cena è registrata', () => {
    const now = d(22, 20);
    const lunchOnly = weekStats(input({ now, diary: [food(21, 2000), food(22, 900)] }), d(16)).nutrition;
    expect(lunchOnly.loggedDays).toBe(1);
    expect(lunchOnly.todayPending).toBe(true);
    const withDinner = weekStats(input({ now, diary: [food(21, 2000), food(22, 900), food(22, 800, 'dinner')] }), d(16)).nutrition;
    expect(withDinner.loggedDays).toBe(2);
    expect(withDinner.todayPending).toBe(false);
  });

  it('sonno: media, notte migliore e peggiore', () => {
    const s = weekStats(input({ wellness: [night(16, 7, 4), night(17, 6), night(18, 8.5, 5)] }), d(16)).sleep;
    expect(s.nights).toBe(3);
    expect(s.avgH).toBeCloseTo(7.17, 2);
    expect(s.best).toEqual({ key: '2026-11-18', h: 8.5 });
    expect(s.worst).toEqual({ key: '2026-11-17', h: 6 });
    expect(s.avgQuality).toBe(4.5);
  });

  it('peso: media della settimana confrontata con quella prima, nella direzione dell’obiettivo', () => {
    const measurements = [weigh(9, 81), weigh(13, 80.6), weigh(16, 80.2), weigh(20, 79.8)];
    const r = weeklyRecap(input({ measurements }), d(16));
    expect(r.cur.weight.avg).toBe(80);
    expect(r.weightRef).toBe('prev_week');
    expect(r.cmp.weight!.value).toBeCloseTo(-0.8, 2);
    expect(r.weightDirection).toBe('lose');
    expect(r.cmp.weight!.tone).toBe('good');
    expect(r.highlights.find((h) => h.id === 'weight')!.text).toContain('nella direzione del tuo obiettivo');
  });

  it('peso senza pesate la settimana prima: si usa l’ultima pesata precedente', () => {
    const r = weeklyRecap(input({ measurements: [weigh(2, 79), weigh(18, 79.5)] }), d(16));
    expect(r.weightRef).toBe('last_before');
    expect(r.cmp.weight!.value).toBeCloseTo(0.5, 2);
    expect(r.cmp.weight!.tone).toBe('bad');
  });
});

describe('confronto e sintesi', () => {
  it('settimana completa: titolo, confronti e punti salienti', () => {
    const sessions = [session(9, 'Full A'), session(11, 'Full B'), session(16, 'Full A', { prs: 2 }), session(18, 'Full B'), session(20, 'Full C')];
    const wellness = [night(9, 6), night(10, 6), night(16, 7.5), night(17, 7.5)];
    const r = weeklyRecap(input({ sessions, wellness }), d(16));
    expect(r.partial).toBe(false);
    expect(r.headline.title).toBe('Obiettivo allenamenti raggiunto');
    expect(r.cmp.sessions).toEqual({ value: 1, tone: 'good' });
    expect(r.cmp.sleep!.value).toBeCloseTo(1.5);
    expect(r.cmp.sleep!.tone).toBe('good');
    const ids = r.highlights.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(['plan', 'pr', 'sleep']));
    expect(r.highlights.find((h) => h.id === 'plan')!.text).toBe('Hai fatto tutti i 3 allenamenti in programma.');
    expect(r.highlights.find((h) => h.id === 'sleep')!.text).toContain('1 h 30 min in più');
  });

  it('allenamenti saltati: sono indicati per giorno e scheda', () => {
    const r = weeklyRecap(input({ sessions: [session(16, 'Full A')] }), d(16));
    expect(r.headline.title).toBe('Settimana leggera');
    expect(r.highlights[0].text).toBe('1 allenamenti su 3 in programma: sono saltati mercoledì (Full B) e venerdì (Full C).');
  });

  it('settimana in corso: confronto a parità di giorni', () => {
    // mercoledì 25: lun-mer di questa settimana contro lun-mer della precedente
    const sessions = [session(16, 'Full A'), session(18, 'Full B'), session(20, 'Full C'), session(23, 'Full A')];
    const r = weeklyRecap(input({ now: d(25, 9), sessions }), d(25));
    expect(r.partial).toBe(true);
    expect(r.prev.training.sessions).toBe(2);
    expect(r.cmp.sessions!.value).toBe(-1);
    expect(r.headline.title).toBe('Settimana in corso');
  });

  it('senza dati non inventa nulla', () => {
    const r = weeklyRecap(input(), d(16));
    expect(r.cur.hasData).toBe(false);
    expect(r.headline.tone).toBe('empty');
    expect(r.cmp.kcal).toBeNull();
    expect(r.cmp.sleep).toBeNull();
    expect(r.cmp.weight).toBeNull();
  });

  it('diario quasi vuoto: avvisa che le calorie sono poco affidabili', () => {
    const r = weeklyRecap(input({ diary: [food(16, 2000)] }), d(16));
    expect(r.highlights.find((h) => h.id === 'food')!.tone).toBe('warn');
  });

  it('andamento: una voce per settimana, mai oltre la settimana in corso', () => {
    const tr = weeklyTrend(input({ now: d(25, 9), sessions: [session(16, 'A'), session(23, 'B')] }), d(30), 4);
    expect(tr.map((w) => w.key)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(tr[2].sessions).toBe(1);
    expect(tr[3].current).toBe(true);
  });
});

describe('formati', () => {
  it('ore e minuti', () => {
    expect(fmtHours(7.5)).toBe('7 h 30 min');
    expect(fmtHours(8)).toBe('8 h');
    expect(fmtMinutesDelta(0.5)).toBe('+30 min');
    expect(fmtMinutesDelta(-1.25)).toBe('−1 h 15 min');
  });
});

describe('settimana in corso: allenamenti che mancano', () => {
  it('conta anche i giorni in programma non ancora arrivati', () => {
    const r = weeklyRecap(input({ now: d(25, 20), sessions: [session(23, 'Full A'), session(25, 'Full B')] }), d(25));
    expect(r.highlights[0].text).toBe('2 su 3 allenamenti in programma, ne manca ancora 1 questa settimana.');
  });
});
