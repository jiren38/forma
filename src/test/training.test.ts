import { beforeAll, describe, expect, it } from 'vitest';
import { adviseNextSet, e1rmRir, loadStep, planNextLoad, roundLoad, setRir, weightFor } from '@/lib/progression';
import { liveSetRecords, mainHit, recordBook, recordTimeline, sessionRecords } from '@/lib/records';
import { BLOCK_MODELS, activeWeek, blockPosition, createBlock, fatigueSignals, recommendedModel, repeatCurrentWeek, toggleDeloadNow, weekCardio, weekPrescription, weekSets } from '@/lib/periodization';
import { store } from '@/db/store';
import { finishSession, saveSession, startSession } from '@/features/workouts/session';
import { DEFAULT_SETTINGS } from '@/app/data';
import { generateProgram } from '@/lib/generator';
import { defaultProfile } from '@/features/onboarding/fields';
import type { ExerciseLog, Profile, Program, SetLog, WorkoutSession, WorkoutTemplate } from '@/lib/types';
import { dayKey, addDays, startOfWeek } from '@/lib/util';

const BENCH = 'bench_press_bb';
const SQUAT = 'back_squat';
const CURL = 'db_curl';

type S = [number, number] | [number, number, { rir?: number; rpe?: number; type?: SetLog['type'] }];
function log(exId: string, sets: S[], repMin = 8, repMax = 12): ExerciseLog {
  return { uid: `el_${exId}_${Math.random()}`, exerciseId: exId, restSec: 90, repMin, repMax, sets: sets.map(([w, r, o], i) => ({ uid: `s${i}_${Math.random()}`, weight: w, reps: r, done: true, ...(o ?? {}) })) };
}
function ses(id: string, date: string, logs: ExerciseLog[], extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return { id, name: 'Seduta', startedAt: `${date}T10:00:00.000Z`, endedAt: `${date}T11:00:00.000Z`, pausedMs: 0, status: 'completed', exercises: logs, ...extra };
}
const profile = (p: Partial<Profile> = {}): Profile => ({
  ...defaultProfile(), name: 'T', age: 30, sex: 'male', heightCm: 180, weightKg: 80, targetWeightKg: 80, level: 'intermediate',
  goals: ['hypertrophy'], daysPerWeek: 3, minutesPerSession: 60, fullGym: true, location: ['commercial_gym'], ...p,
});

describe('incrementi e arrotondamenti', () => {
  it('passo minimo realistico per attrezzo', () => {
    expect(loadStep(BENCH, 60)).toBe(2.5);
    expect(loadStep(SQUAT, 100)).toBe(5);
    expect(loadStep(CURL, 12)).toBe(1);
    expect(loadStep(CURL, 22)).toBe(2);
  });
  it('arrotonda ai carichi impostabili, anche in libbre', () => {
    expect(roundLoad(BENCH, 61.2)).toBe(60);
    expect(roundLoad(BENCH, 61.3, 'kg', 'up')).toBe(62.5);
    expect(roundLoad(CURL, 13.4)).toBe(13);
    const lb = roundLoad(BENCH, 100, 'lb') / 0.45359237;
    expect(Math.round(lb) % 5).toBe(0);
  });
  it('RIR da RPE e massimale corretto per lo sforzo', () => {
    expect(setRir({ rpe: 8 })).toBe(2);
    expect(setRir({ rir: 1, rpe: 6 })).toBe(1);
    expect(setRir({})).toBeNull();
    const one = e1rmRir(100, 5, 2); // come 7 ripetizioni a cedimento
    expect(Math.round(one)).toBe(123);
    expect(Math.round(weightFor(one, 5, 2))).toBe(100);
  });
});

describe('progressione automatica (prossima seduta)', () => {
  const plan = (sessions: WorkoutSession[], o: Partial<Parameters<typeof planNextLoad>[0]> = {}) => planNextLoad({ exerciseId: BENCH, sessions, repMin: 8, repMax: 12, ...o });
  it('prima volta: nessun carico inventato, oppure quello della scheda', () => {
    expect(plan([])).toMatchObject({ kind: 'start', weight: null });
    expect(plan([], { templateWeight: 41 })).toMatchObject({ kind: 'start', weight: 40 });
  });
  it('tutte le serie al massimo del range → +passo minimo', () => {
    const t = plan([ses('a', '2026-10-01', [log(BENCH, [[60, 12], [60, 12], [60, 12]])])]);
    expect(t).toMatchObject({ kind: 'increase', weight: 62.5, prevWeight: 60 });
    expect(t.reason).toMatch(/62,5 kg/);
  });
  it('molte ripetizioni in riserva → salto doppio', () => {
    const t = plan([ses('a', '2026-10-01', [log(BENCH, [[60, 12, { rir: 4 }], [60, 12, { rir: 4 }]])])]);
    expect(t.weight).toBe(65);
  });
  it('al cedimento sul massimo → consolida lo stesso carico', () => {
    const t = plan([ses('a', '2026-10-01', [log(BENCH, [[60, 12, { rpe: 10 }], [60, 12, { rpe: 10 }]])])]);
    expect(t).toMatchObject({ kind: 'hold', weight: 60 });
  });
  it('nel range → stesso carico e una ripetizione in più', () => {
    const t = plan([ses('a', '2026-10-01', [log(BENCH, [[60, 10], [60, 9]])])]);
    expect(t).toMatchObject({ kind: 'reps', weight: 60, aimReps: 10 });
  });
  it('sotto il range una volta → mantiene; due volte → −10%', () => {
    const s1 = ses('a', '2026-10-01', [log(BENCH, [[80, 6], [80, 5]])]);
    expect(plan([s1])).toMatchObject({ kind: 'hold', weight: 80 });
    const s2 = ses('b', '2026-10-04', [log(BENCH, [[80, 6], [80, 6]])]);
    expect(plan([s1, s2])).toMatchObject({ kind: 'decrease', weight: 72.5 });
  });
  it('le serie di riscaldamento non contano', () => {
    const t = plan([ses('a', '2026-10-01', [log(BENCH, [[40, 12, { type: 'warmup' }], [60, 12], [60, 12]])])]);
    expect(t.prevWeight).toBe(60);
  });
  it('settimana di scarico: −10% e nessuna progressione dalla seduta di scarico', () => {
    const base = ses('a', '2026-10-01', [log(BENCH, [[80, 10], [80, 10]])]);
    const week = BLOCK_MODELS.linear4.weeks[3];
    expect(plan([base], { week })).toMatchObject({ kind: 'deload', weight: 72.5 });
    const deload = ses('b', '2026-10-08', [log(BENCH, [[72.5, 10], [72.5, 10]])], { block: { programId: 'p', model: 'linear4', cycle: 1, week: 3, weeks: 4, kind: 'deload', rir: 4, load: 0.9 } });
    expect(plan([base, deload])).toMatchObject({ kind: 'reps', weight: 80 });
  });
  it('intensificazione: range più basso e carico ricalcolato dal massimale', () => {
    const base = ses('a', '2026-10-01', [log(BENCH, [[80, 8, { rir: 2 }], [80, 8, { rir: 2 }]], 6, 10)]);
    const t = planNextLoad({ exerciseId: BENCH, sessions: [base], repMin: 6, repMax: 10, week: { kind: 'intensification', rir: 1, extraSets: 0, setsFactor: 1, load: 1, repShift: -2 } });
    expect(t).toMatchObject({ kind: 'convert', repMin: 4, repMax: 8, rir: 1 });
    expect(t.weight!).toBeGreaterThan(80);
    expect(t.weight!).toBeLessThanOrEqual(92.5);
  });
  it('esercizi a corpo libero: una ripetizione in più', () => {
    const t = planNextLoad({ exerciseId: 'push_up', sessions: [ses('a', '2026-10-01', [log('push_up', [[0, 12], [0, 10]], 10, 15)])], repMin: 10, repMax: 15 });
    expect(t).toMatchObject({ kind: 'reps', aimReps: 11, weight: null });
  });
});

describe('adattamento serie per serie', () => {
  const base = { exerciseId: BENCH, repMin: 8, repMax: 10, rir: 2 };
  const set = (w: number, r: number, o: Partial<SetLog> = {}): SetLog => ({ uid: 'x', weight: w, reps: r, done: true, ...o });
  it('serie facile (RIR alto) → carico su', () => {
    const a = adviseNextSet({ ...base, done: set(60, 10, { rir: 5 }) })!;
    expect(a.change).toBe('up');
    expect(a.weight).toBeGreaterThan(60);
    expect(a.weight).toBeLessThanOrEqual(66);
  });
  it('massimo del range con 4 in riserva → almeno un passo in su', () => {
    const a = adviseNextSet({ ...base, repMax: 12, done: set(75, 12, { rpe: 6 }) })!;
    expect(a).toMatchObject({ change: 'up', weight: 77.5 });
  });
  it('serie al cedimento sotto il range → carico giù', () => {
    const a = adviseNextSet({ ...base, done: set(60, 6, { rir: 0 }) })!;
    expect(a.change).toBe('down');
    expect(a.weight).toBeLessThan(60);
  });
  it('in linea con l’obiettivo → resta', () => {
    expect(adviseNextSet({ ...base, done: set(60, 9, { rir: 2 }) })!.change).toBe('same');
  });
  it('senza RPE/RIR usa solo il range', () => {
    expect(adviseNextSet({ ...base, done: set(60, 13) })!.change).toBe('up');
    expect(adviseNextSet({ ...base, done: set(60, 5) })!.change).toBe('down');
    expect(adviseNextSet({ ...base, done: set(60, 9) })!.change).toBe('same');
  });
  it('riscaldamento ed esercizi senza carico: nessun consiglio', () => {
    expect(adviseNextSet({ ...base, done: set(40, 10, { type: 'warmup' }) })).toBeNull();
    expect(adviseNextSet({ ...base, exerciseId: 'push_up', done: set(0, 10) })).toBeNull();
  });
});

describe('record personali', () => {
  const s1 = ses('a', '2026-10-01', [log(BENCH, [[60, 10], [60, 10]])]);
  const s2 = ses('b', '2026-10-08', [log(BENCH, [[65, 8], [62.5, 10]])]);
  const s3 = ses('c', '2026-10-15', [log(BENCH, [[60, 12]])]);
  it('la prima volta è il punto di partenza, non un record', () => {
    expect(sessionRecords([s1], s1)).toHaveLength(0);
    const tl = recordTimeline([s1], BENCH);
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({ baseline: true, kind: 'weight', value: 60 });
  });
  it('record principale con valore precedente e record secondari', () => {
    const [r] = sessionRecords([s1, s2], s2);
    expect(r).toMatchObject({ kind: 'weight', value: 65, reps: 8, previous: 60 });
    expect(r.also?.map((a) => a.kind)).toEqual(['e1rm', 'rm']);
  });
  it('record per ripetizioni: più ripetizioni allo stesso carico', () => {
    const [r] = sessionRecords([s1, s2, s3], s3);
    expect(r).toMatchObject({ kind: 'e1rm', value: 84 });
    expect(r.also).toEqual([expect.objectContaining({ kind: 'rm', value: 60, reps: 12, previous: null })]);
    // stesso numero di ripetizioni con più carico
    const s4 = ses('d', '2026-10-20', [log(BENCH, [[62.5, 12]])]);
    expect(sessionRecords([s1, s2, s3, s4], s4)[0].also).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'rm', reps: 12, previous: 60 })]));
  });
  it('tabella dei massimali per ripetizioni', () => {
    const b = recordBook([s1, s2, s3], BENCH);
    expect(b.rm[1]?.value).toBe(65);
    expect(b.rm[8]?.value).toBe(65);
    expect(b.rm[10]?.value).toBe(62.5);
    expect(b.rm[12]?.value).toBe(60);
    expect(b.sessions).toBe(3);
  });
  it('rilevamento dal vivo considera le serie già fatte nella seduta', () => {
    const before = recordBook([s1], BENCH);
    const first: SetLog = { uid: 'f', weight: 62.5, reps: 10, done: true };
    expect(mainHit(liveSetRecords(before, [], first))).toMatchObject({ kind: 'weight', value: 62.5, previous: 60 });
    const same: SetLog = { uid: 'g', weight: 62.5, reps: 10, done: true };
    expect(liveSetRecords(before, [first], same)).toHaveLength(0);
    expect(liveSetRecords(before, [], { ...first, type: 'warmup' })).toHaveLength(0);
  });
  it('esercizi a tempo: record di durata', () => {
    const a = ses('a', '2026-10-01', [log('plank', [[0, 40]], 30, 45)]);
    const b = ses('b', '2026-10-05', [log('plank', [[0, 55]], 30, 45)]);
    expect(sessionRecords([a, b], b)[0]).toMatchObject({ kind: 'time', value: 55, previous: 40 });
  });
});

describe('programmi a più settimane', () => {
  const monday = (offsetWeeks: number) => dayKey(addDays(startOfWeek(), offsetWeeks * 7));
  it('modelli coerenti: ogni modello finisce con scarico o picco a volume ridotto', () => {
    for (const m of Object.values(BLOCK_MODELS)) {
      const last = m.weeks[m.weeks.length - 1];
      expect(last.setsFactor, m.id).toBeLessThan(1);
      expect(m.weeks.some((w) => w.kind === 'deload'), m.id).toBe(true);
    }
  });
  it('modello consigliato in base a livello e obiettivo', () => {
    expect(recommendedModel({ level: 'beginner', goals: ['strength'] })).toBe('beginner6');
    expect(recommendedModel({ level: 'advanced', goals: ['strength'] })).toBe('strength8');
    expect(recommendedModel({ level: 'intermediate', goals: ['hypertrophy'] })).toBe('hyp6');
    expect(recommendedModel({ level: 'intermediate', goals: ['fat_loss'] })).toBe('linear4');
  });
  it('posizione nel ciclo, ripetizione e fine', () => {
    const b = createBlock('linear4', monday(-5));
    const pos = blockPosition(b);
    expect(pos).toMatchObject({ started: true, cycle: 2, week: 1, total: 4, finished: false });
    expect(blockPosition({ ...b, repeat: false }).finished).toBe(true);
    expect(blockPosition(createBlock('linear4', monday(1))).started).toBe(false);
    expect(blockPosition(createBlock('linear4', monday(-3))).info.kind).toBe('deload');
  });
  it('ripeti settimana e scarico anticipato', () => {
    const b = createBlock('hyp6', monday(-2));
    expect(blockPosition(b).week).toBe(2);
    expect(blockPosition(repeatCurrentWeek(b)).week).toBe(1);
    const d = toggleDeloadNow(b);
    expect(blockPosition(d)).toMatchObject({ overridden: true, info: expect.objectContaining({ kind: 'deload' }) });
    expect(blockPosition(toggleDeloadNow(d)).overridden).toBe(false);
  });
  it('serie e range della settimana', () => {
    const [w1, , w3, , , w6] = BLOCK_MODELS.hyp6.weeks;
    expect(weekSets(3, w1, BENCH)).toBe(3);
    expect(weekSets(3, w3, BENCH)).toBe(4);
    expect(weekSets(3, w6, BENCH)).toBe(2);
    expect(weekSets(1, w6, BENCH)).toBe(1);
    const int = BLOCK_MODELS.strength8.weeks[4];
    expect(weekPrescription({ uid: 'u', exerciseId: SQUAT, sets: 4, repMin: 6, repMax: 8, restSec: 120 }, int)).toMatchObject({ repMin: 4, repMax: 6 });
    // gli esercizi di isolamento mantengono il range
    expect(weekPrescription({ uid: 'u', exerciseId: CURL, sets: 3, repMin: 10, repMax: 15, restSec: 60 }, int)).toMatchObject({ repMin: 10, repMax: 15 });
  });
  it('cardio più breve nello scarico, senza progressione', () => {
    const plan = { machine: 'bike' as const, mode: 'steady' as const, durationMin: 40, intensity: 'moderate' as const, progression: { stepMin: 5, capMin: 50 } };
    expect(weekCardio(plan, BLOCK_MODELS.linear4.weeks[3])).toMatchObject({ durationMin: 30, progression: null });
    expect(weekCardio(plan, BLOCK_MODELS.linear4.weeks[0])).toBe(plan);
  });
  it('segnali di fatica con più esercizi fermi', () => {
    const mk = (id: string, d: string) => ses(id, d, [log(BENCH, [[80, 8], [80, 7]]), log(SQUAT, [[100, 8], [100, 8]])]);
    const f = fatigueSignals([mk('a', '2026-10-01'), mk('b', '2026-10-04'), mk('c', '2026-10-08')], [BENCH, SQUAT]);
    expect(f.stalled).toEqual([BENCH, SQUAT]);
    expect(f.suggestDeload).toBe(true);
  });
  it('il generatore resta compatibile (il blocco si aggiunge al salvataggio)', () => {
    const g = generateProgram(profile());
    expect(g.program.block).toBeUndefined();
    const prog: Program = { ...g.program, block: createBlock('hyp6') };
    expect(activeWeek(prog)?.week).toBe(0);
  });
});

describe('seduta con progressione e settimana del programma', () => {
  beforeAll(async () => { await store.open('training-test'); await store.put('settings', 'me', { ...DEFAULT_SETTINGS }); });
  it('all’avvio propone carichi, serie della settimana e registra la settimana', async () => {
    const tpl: WorkoutTemplate = { id: 'tplA', name: 'A', source: 'manual', createdAt: '', updatedAt: '', exercises: [
      { uid: 'u1', exerciseId: BENCH, sets: 3, repMin: 8, repMax: 12, restSec: 90 },
      { uid: 'u2', exerciseId: CURL, sets: 3, repMin: 10, repMax: 15, restSec: 60 },
    ] };
    await store.put('templates', tpl.id, tpl);
    const start = dayKey(addDays(startOfWeek(), -14)); // terza settimana di hyp6: +1 serie
    await store.put('programs', 'p1', { id: 'p1', name: 'P', schedule: [tpl.id, null, null, null, null, null, null], active: true, source: 'manual', createdAt: '', block: createBlock('hyp6', start) } as Program);
    await store.put('sessions', 'old1', ses('old1', '2026-09-01', [log(BENCH, [[70, 12], [70, 12], [70, 12]])]));
    const s = await startSession(tpl);
    expect(s.block).toMatchObject({ programId: 'p1', week: 2, kind: 'accumulation', rir: 2 });
    const bench = s.exercises[0];
    expect(bench.sets).toHaveLength(4);
    expect(bench.target).toMatchObject({ kind: 'increase', weight: 72.5, rir: 2 });
    expect(bench.sets.every((x) => x.weight === 72.5 && x.auto)).toBe(true);
    const curl = s.exercises[1];
    expect(curl.target?.kind).toBe('start');
    expect(curl.sets.every((x) => x.weight == null)).toBe(true);
    // chiusura: record rilevato con il valore precedente
    s.exercises[0].sets = s.exercises[0].sets.map((x) => ({ ...x, reps: 10, done: true }));
    await saveSession(s);
    const ended = await finishSession(store.get<WorkoutSession>('sessions', s.id)!);
    expect(ended.prs?.[0]).toMatchObject({ exerciseId: BENCH, kind: 'weight', value: 72.5, previous: 70 });
    expect(ended.block?.week).toBe(2);
  });
  it('con la progressione disattivata si usa il comportamento precedente', async () => {
    await store.put('settings', 'me', { ...DEFAULT_SETTINGS, training: { autoProgression: false, liveAdjust: true } });
    const tpl = store.get<WorkoutTemplate>('templates', 'tplA')!;
    const s = await startSession(tpl);
    expect(s.exercises[0].target).toBeNull();
    expect(s.exercises[0].sets[0].weight).toBe(72.5); // ultimo carico usato
    await store.remove('sessions', s.id);
  });
});
