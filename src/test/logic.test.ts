import { describe, expect, it, beforeAll } from 'vitest';
import { generateProgram, substitutes, availableEquipment, pickDays } from '@/lib/generator';
import { e1rm, detectPRs, sessionStats, exerciseHistory, personalRecords, weeklyCounts } from '@/lib/stats';
import { computeTargets, macrosFor, totals } from '@/lib/nutrition';
import { progressionAdvice, readiness, earnedBadges } from '@/lib/insights';
import { localCoachReply } from '@/lib/coach-local';
import { EXERCISES, getExercise, isAvailable } from '@/data/exercises';
import { FOODS } from '@/data/foods';
import { PATTERN_MAP } from '@/features/exercises/anim/patterns';
import { store } from '@/db/store';
import { startSession, saveSession, finishSession, recoverBackup, activeSession } from '@/features/workouts/session';
import { defaultProfile } from '@/features/onboarding/fields';
import { DEFAULT_SETTINGS } from '@/app/data';
import type { Profile, WorkoutSession, WorkoutTemplate } from '@/lib/types';
import { toDisplayWeight, fromDisplayWeight } from '@/lib/util';

const profile = (p: Partial<Profile> = {}): Profile => ({
  ...defaultProfile(), name: 'Test', age: 30, sex: 'male', heightCm: 180, weightKg: 80, targetWeightKg: 75, level: 'intermediate',
  goals: ['hypertrophy'], daysPerWeek: 4, minutesPerSession: 60, fullGym: true, location: ['commercial_gym'], ...p,
});

function session(id: string, date: string, exId: string, sets: [number, number][]): WorkoutSession {
  return {
    id, name: 'S', startedAt: `${date}T10:00:00.000Z`, endedAt: `${date}T11:00:00.000Z`, pausedMs: 0, status: 'completed',
    exercises: [{ uid: `el_${id}`, exerciseId: exId, restSec: 90, repMin: 8, repMax: 12, sets: sets.map(([w, r], i) => ({ uid: `${id}_${i}`, weight: w, reps: r, done: true })) }],
  };
}

describe('dati', () => {
  it('ogni esercizio ha un\'animazione, contenuti e id unici', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) { expect(PATTERN_MAP[e.pattern], e.id).toBeTruthy(); expect(e.primary.length, e.id).toBeGreaterThan(0); }
  });
  it('alimenti con valori plausibili', () => {
    expect(FOODS.length).toBeGreaterThan(150);
    for (const f of FOODS) {
      expect(f.protein + f.carbs + f.fat, f.name).toBeLessThanOrEqual(101);
      const k = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      if (/vino|birra|spritz|liquore|amaro|grappa|alcol/i.test(f.name)) continue; // l'alcol apporta 7 kcal/g
      expect(Math.abs(k - f.kcal), f.name).toBeLessThan(Math.max(60, f.kcal * 0.3));
    }
  });
});

describe('generatore di programmi', () => {
  it('rispetta giorni e attrezzatura (casa con manubri)', () => {
    const p = profile({ fullGym: false, location: ['home'], equipment: ['dumbbell', 'flat_bench'], daysPerWeek: 3 });
    const g = generateProgram(p);
    expect(g.program.schedule.filter(Boolean)).toHaveLength(3);
    const eq = availableEquipment(p);
    for (const t of g.templates) {
      expect(t.exercises.length).toBeGreaterThanOrEqual(3);
      for (const te of t.exercises) expect(isAvailable(getExercise(te.exerciseId)!, eq as Set<string>), te.exerciseId).toBe(true);
    }
  });
  it('4 giorni in palestra → upper/lower; segnala infortuni', () => {
    const g = generateProgram(profile({ injuries: ['knee'] }));
    expect(g.split).toBe('upper_lower');
    expect(g.warnings.length).toBeGreaterThan(0);
  });
  it('giorni preferiti rispettati', () => {
    expect(pickDays(3, [1, 3, 5])).toEqual([1, 3, 5]);
    expect(pickDays(2, [])).toHaveLength(2);
  });
  it('sostituti allenano lo stesso muscolo', () => {
    const subs = substitutes('bench_press_bb', profile());
    expect(subs.length).toBeGreaterThan(2);
    for (const s of subs) expect(s.primary[0]).toBe(getExercise('bench_press_bb')!.primary[0]);
  });
});

describe('statistiche e record', () => {
  const ex = 'bench_press_bb';
  const s1 = session('a', '2026-10-01', ex, [[60, 10], [60, 10]]);
  const s2 = session('b', '2026-10-08', ex, [[65, 8], [65, 8]]);
  it('Epley e1RM', () => { expect(e1rm(100, 1)).toBe(100); expect(Math.round(e1rm(100, 10))).toBe(133); });
  it('nessun PR alla prima esecuzione, PR di carico alla seconda', () => {
    expect(detectPRs([s1], s1)).toHaveLength(0);
    const prs = detectPRs([s1, s2], s2);
    expect(prs[0]).toMatchObject({ kind: 'weight', value: 65, reps: 8 });
  });
  it('volume e storico', () => {
    expect(sessionStats(s1).volume).toBe(1200);
    const h = exerciseHistory([s2, s1], ex);
    expect(h.map((x) => x.bestWeight)).toEqual([60, 65]);
    expect(personalRecords([s1, s2], ex).weight?.value).toBe(65);
    expect(weeklyCounts([s1, s2], 12)).toHaveLength(12);
  });
  it('progressione suggerita solo a range completato', () => {
    const tpl: WorkoutTemplate = { id: 't', name: 'T', source: 'manual', createdAt: '', updatedAt: '', exercises: [{ uid: 'u', exerciseId: ex, sets: 2, repMin: 8, repMax: 10, restSec: 90 }] };
    const adv = progressionAdvice([tpl], [s1], profile());
    expect(adv[0]?.kind).toBe('increase');
    expect(adv[0]?.patch?.targetWeight).toBe(62.5);
    expect(progressionAdvice([tpl], [s2], profile())).toHaveLength(0);
  });
});

describe('nutrizione', () => {
  it('stime coerenti e override', () => {
    const t = computeTargets(profile({ goals: ['fat_loss'] }), DEFAULT_SETTINGS, 4);
    expect(t.bmr).toBe(Math.round(10 * 80 + 6.25 * 180 - 5 * 30 + 5));
    expect(t.kcal).toBeLessThan(t.tdee);
    expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal)).toBeLessThan(20);
    const o = computeTargets(profile(), { ...DEFAULT_SETTINGS, nutritionOverride: { kcal: 2000, protein: 150, carbs: 200, fat: 66 } });
    expect(o).toMatchObject({ kcal: 2000, overridden: true });
  });
  it('macro per quantità e totali', () => {
    const m = macrosFor({ kcal: 350, protein: 12, carbs: 70, fat: 2 }, 80);
    expect(m.kcal).toBe(280);
    expect(totals([m, m]).kcal).toBe(560);
  });
  it('unità kg/lb reversibili', () => { expect(fromDisplayWeight(toDisplayWeight(100, 'lb'), 'lb')!).toBeCloseTo(100, 0); });
});

describe('recupero, badge, coach locale', () => {
  it('readiness richiede dati', () => {
    expect(readiness(undefined, []).score).toBeNull();
    expect(readiness({ id: 'x', date: 'x', waterMl: 0, sleepHours: 4, energy: 1, stress: 5 }, []).tone).toBe('low');
  });
  it('badge primo allenamento', () => {
    const b = earnedBadges({ sessions: [session('a', '2026-10-01', 'bench_press_bb', [[60, 10]])], diary: [], measurements: [], cardio: [], wellness: [], prCount: 0, weekStreak: 0 }, []);
    expect(b.map((x) => x.id)).toContain('first_workout');
  });
  it('coach locale risponde dai dati e propone senza applicare', () => {
    const tpl: WorkoutTemplate = { id: 't', name: 'Petto', source: 'manual', createdAt: '', updatedAt: '', exercises: [{ uid: 'u', exerciseId: 'bench_press_bb', sets: 2, repMin: 8, repMax: 10, restSec: 90 }] };
    const data = { profile: profile(), settings: DEFAULT_SETTINGS, program: { id: 'p', name: 'P', schedule: ['t', null, null, null, null, null, null], active: true, source: 'manual' as const, createdAt: '' }, templates: [tpl], sessions: [session('a', '2026-10-01', 'bench_press_bb', [[60, 10], [60, 10]])], diary: [], wellness: [], measurements: [], cardio: [] };
    const r = localCoachReply('Posso aumentare i carichi?', data);
    expect(r.suggestions[0]?.action?.patch.targetWeight).toBe(62.5);
    expect(tpl.exercises[0].targetWeight).toBeUndefined();
    const alt = localCoachReply('alternative alla panca piana con bilanciere', data);
    expect(alt.text).toMatch(/Alternative/);
  });
});

describe('store e sessione live', () => {
  beforeAll(async () => { await store.open('test'); });
  it('salvataggio continuo, backup e chiusura con PR', async () => {
    const tpl: WorkoutTemplate = { id: 'tpl1', name: 'Petto', source: 'manual', createdAt: '', updatedAt: '', exercises: [{ uid: 'u1', exerciseId: 'bench_press_bb', sets: 2, repMin: 8, repMax: 12, restSec: 90 }] };
    await store.put('sessions', 'old', session('old', '2026-01-01', 'bench_press_bb', [[50, 10]]));
    const s = await startSession(tpl);
    expect(activeSession()?.id).toBe(s.id);
    expect(recoverBackup()?.id).toBe(s.id);
    s.exercises[0].sets = s.exercises[0].sets.map((x) => ({ ...x, weight: 55, reps: 10, done: true }));
    s.exercises[0].sets.push({ uid: 'empty', weight: null, reps: null, done: false });
    await saveSession(s);
    const ended = await finishSession(store.get<WorkoutSession>('sessions', s.id)!);
    expect(ended.status).toBe('completed');
    expect(ended.exercises[0].sets).toHaveLength(2);
    expect(ended.prs?.[0]).toMatchObject({ kind: 'weight', value: 55 });
    expect(recoverBackup()).toBeNull();
    expect(store.list('notifications').length).toBeGreaterThan(0);
    // riapertura: i dati persistono in IndexedDB
    store.close(); await store.open('test');
    expect(store.get<WorkoutSession>('sessions', s.id)?.status).toBe('completed');
    expect((await store.dirtyRows()).length).toBeGreaterThan(0);
  });
  it('importazione non sovrascrive dati più recenti', async () => {
    await store.put('foods', 'f1', { id: 'f1', name: 'Nuovo', kcal: 1, protein: 0, carbs: 0, fat: 0 });
    const n = await store.importRows([{ collection: 'foods', id: 'f1', data: { name: 'Vecchio' }, updatedAt: '2000-01-01T00:00:00Z' }, { collection: 'foods', id: 'f2', data: { name: 'Altro' }, updatedAt: '2000-01-01T00:00:00Z' }]);
    expect(n).toBe(1);
    expect(store.get<any>('foods', 'f1').name).toBe('Nuovo');
  });
});
