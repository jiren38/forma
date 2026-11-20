import { describe, expect, it, beforeAll } from 'vitest';
import { analyzeEquipment, generateProgram, substitutes, fitToBudget, type GeneratedProgram } from '@/lib/generator';
import {
  CARDIO_EQUIPMENT, actualFromPlan, buildCardio, cardioEntries, estimateDistanceKm, estimatePlanKcal, expandPhases, isCardioExercise, machineOf,
  pauseTimer, phaseAt, planDurationSec, planLines, progressTemplateCardio, sessionCardioStats, startTimer, templateCardio, templateMinutesExact, timerElapsedMs,
} from '@/lib/cardio';
import { getExercise, isAvailable, EXERCISES } from '@/data/exercises';
import { PATTERN_MAP } from '@/features/exercises/anim/patterns';
import { defaultProfile } from '@/features/onboarding/fields';
import { store } from '@/db/store';
import { startSession, saveSession, finishSession } from '@/features/workouts/session';
import type { Equipment, Profile, WorkoutSession, WorkoutTemplate } from '@/lib/types';

const profile = (p: Partial<Profile> = {}): Profile => ({
  ...defaultProfile(), name: 'Test', age: 35, sex: 'male', heightCm: 178, weightKg: 80, targetWeightKg: 80, level: 'intermediate',
  goals: ['fat_loss'], daysPerWeek: 4, minutesPerSession: 45, fullGym: false, location: ['home'], equipment: [], ...p,
});

const all = (g: GeneratedProgram) => g.templates.flatMap((t) => t.exercises);
const strengthOf = (g: GeneratedProgram) => all(g).filter((e) => !e.cardio);
const cardioOf = (g: GeneratedProgram) => all(g).filter((e) => e.cardio);
/** Ogni esercizio deve essere eseguibile con l'attrezzatura selezionata (vincolo obbligatorio). */
function expectOnlySelected(g: GeneratedProgram, selected: Equipment[]) {
  for (const te of all(g)) {
    const e = getExercise(te.exerciseId)!;
    expect(e, te.exerciseId).toBeTruthy();
    for (const q of e.equipment) expect(q === 'bodyweight' || selected.includes(q), `${te.exerciseId} richiede ${q}`).toBe(true);
  }
}
const scheduled = (g: GeneratedProgram) => g.program.schedule.filter(Boolean).map((id) => g.templates.find((t) => t.id === id)!);

describe('causa del problema', () => {
  it('le macchine cardio vengono riconosciute come attrezzatura cardio, non come attrezzatura per i pesi', () => {
    const a = analyzeEquipment(profile({ equipment: ['bike', 'treadmill'] }));
    expect(a.mode).toBe('cardio_only');
    expect(a.cardioMachines).toEqual(['treadmill', 'bike']);
    expect(a.strengthEquipment).toEqual([]);
    expect(analyzeEquipment(profile({ equipment: ['dumbbell', 'bike'] })).mode).toBe('mixed');
    expect(analyzeEquipment(profile({ equipment: ['dumbbell'] })).mode).toBe('strength_only');
    expect(analyzeEquipment(profile({ equipment: [] })).mode).toBe('bodyweight');
    expect(analyzeEquipment(profile({ fullGym: true, location: ['commercial_gym'] })).mode).toBe('mixed');
  });
  it('i nuovi esercizi cardio hanno animazione e macchina corretta', () => {
    for (const id of ['treadmill_walk', 'treadmill_intervals', 'bike_intervals', 'elliptical_intervals', 'rower_intervals']) {
      const e = getExercise(id)!;
      expect(isCardioExercise(e), id).toBe(true);
      expect(PATTERN_MAP[e.pattern], id).toBeTruthy();
    }
    expect(machineOf('treadmill_incline_walk')).toBe('treadmill');
    expect(machineOf('hiit_bike')).toBe('bike');
    expect(EXERCISES.filter(isCardioExercise).every((e) => e.equipment.every((q) => CARDIO_EQUIPMENT.includes(q) || q === 'machine_other') || !e.equipment.length)).toBe(true);
  });
});

describe('TEST 1 – solo cyclette e tapis roulant', () => {
  for (const goals of [['fat_loss'], ['hypertrophy'], ['fitness'], ['endurance']] as Profile['goals'][]) {
    for (const days of [2, 3, 5]) {
      it(`programma esclusivamente cardio (${goals[0]}, ${days} giorni)`, () => {
        const p = profile({ goals, daysPerWeek: days, equipment: ['bike', 'treadmill'], split: 'ppl' });
        const g = generateProgram(p);
        expect(g.mode).toBe('cardio_only');
        expect(g.program.schedule.filter(Boolean)).toHaveLength(days);
        expect(strengthOf(g)).toHaveLength(0); // niente flessioni, squat, plank, addominali, pesi
        for (const te of all(g)) {
          expect(te.cardio, te.exerciseId).toBeTruthy();
          expect(['treadmill', 'bike']).toContain(te.cardio!.machine);
          expect(getExercise(te.exerciseId)!.kind).toBe('cardio');
        }
        expectOnlySelected(g, ['bike', 'treadmill']);
        // usa entrambe le macchine nella settimana
        if (days >= 3) expect(new Set(cardioOf(g).map((e) => e.cardio!.machine)).size).toBe(2);
        for (const t of g.templates) expect(templateMinutesExact(t)).toBeLessThanOrEqual(45);
      });
    }
  }
  it('include le tipologie richieste: camminata, salita, intervalli, cyclette moderata e intervallata', () => {
    const g = generateProgram(profile({ goals: ['fat_loss'], daysPerWeek: 5, minutesPerSession: 45, equipment: ['bike', 'treadmill'] }), [], {});
    const ids = new Set(cardioOf(g).map((e) => e.exerciseId));
    const g2 = generateProgram(profile({ goals: ['fat_loss'], daysPerWeek: 5, minutesPerSession: 45, equipment: ['bike', 'treadmill'] }), [], { variant: 1 });
    cardioOf(g2).forEach((e) => ids.add(e.exerciseId));
    expect([...ids].some((id) => id.startsWith('treadmill'))).toBe(true);
    expect([...ids].some((id) => id.includes('intervals') || id === 'hiit_bike')).toBe(true);
    expect([...ids]).toContain('treadmill_incline_walk');
    expect([...ids].some((id) => id === 'bike' || id === 'bike_intervals' || id === 'hiit_bike')).toBe(true);
  });
  it('mai due sedute intense di fila e intervalli ben strutturati', () => {
    const g = generateProgram(profile({ level: 'advanced', goals: ['endurance'], daysPerWeek: 6, minutesPerSession: 50, equipment: ['bike', 'treadmill'] }));
    const days = scheduled(g).map((t) => t.exercises.some((e) => e.cardio?.mode === 'intervals'));
    for (let i = 1; i < days.length; i++) expect(days[i] && days[i - 1], `giorni ${i - 1}-${i}`).toBe(false);
    const iv = cardioOf(g).find((e) => e.cardio!.mode === 'intervals')!.cardio!;
    expect(iv.warmup?.durationSec).toBeGreaterThan(0);
    expect(iv.cooldown?.durationSec).toBeGreaterThan(0);
    expect(iv.cycle!.length).toBeGreaterThanOrEqual(2);
    expect(iv.repeat).toBeGreaterThanOrEqual(2);
    expect(planLines(iv).some((l) => /Ripeti il ciclo \d+ volte/.test(l))).toBe(true);
  });
});

describe('TEST 2 – manubri, panca, bilanciere, cyclette e tapis roulant', () => {
  const eq: Equipment[] = ['dumbbell', 'flat_bench', 'barbell', 'bike', 'treadmill'];
  for (const goals of [['hypertrophy'], ['fat_loss'], ['fitness'], ['strength']] as Profile['goals'][]) {
    it(`programma muscolare con sessioni cardio integrate (${goals[0]})`, () => {
      const p = profile({ goals, daysPerWeek: 4, minutesPerSession: 60, equipment: eq });
      const g = generateProgram(p);
      expect(g.mode).toBe('mixed');
      expectOnlySelected(g, eq);
      expect(strengthOf(g).length).toBeGreaterThanOrEqual(8);
      expect(strengthOf(g).some((e) => getExercise(e.exerciseId)!.equipment.some((q) => q === 'dumbbell' || q === 'barbell'))).toBe(true);
      const sched = scheduled(g);
      const cardioDays = sched.filter((t) => t.exercises.some((e) => e.cardio)).length;
      expect(cardioDays).toBeGreaterThanOrEqual(1);
      // per la massa/forza non su ogni singolo giorno; per il dimagrimento può esserci in ogni seduta
      if (goals[0] !== 'fat_loss') expect(cardioDays).toBeLessThan(sched.length);
      else expect(cardioDays).toBeLessThanOrEqual(sched.length);
      for (const t of g.templates.filter((x) => x.exercises.some((e) => e.cardio))) {
        // la scheda contiene entrambe le parti
        expect(t.exercises.some((e) => !e.cardio)).toBe(true);
        expect(t.name).toMatch(/Cardio/);
      }
      for (const t of g.templates) expect(templateMinutesExact(t)).toBeLessThanOrEqual(60);
    });
  }
  it('più cardio per il dimagrimento che per la massa', () => {
    const days = (goals: Profile['goals']) => scheduled(generateProgram(profile({ goals, daysPerWeek: 6, minutesPerSession: 60, fullGym: true, location: ['commercial_gym'] }))).filter((t) => t.exercises.some((e) => e.cardio)).length;
    expect(days(['fat_loss'])).toBeGreaterThan(days(['hypertrophy']));
  });
});

describe('TEST 3 – sola attrezzatura per i pesi', () => {
  it('programma muscolare, nessuna attività con macchine cardio', () => {
    const eq: Equipment[] = ['dumbbell', 'barbell', 'flat_bench', 'squat_rack', 'pullup_bar'];
    for (const goals of [['hypertrophy'], ['fat_loss']] as Profile['goals'][]) {
      const g = generateProgram(profile({ goals, daysPerWeek: 4, minutesPerSession: 60, equipment: eq }));
      expect(g.mode).toBe('strength_only');
      expect(cardioOf(g)).toHaveLength(0);
      expectOnlySelected(g, eq);
      for (const te of all(g)) for (const q of getExercise(te.exerciseId)!.equipment) expect(CARDIO_EQUIPMENT).not.toContain(q);
      expect(strengthOf(g).length).toBeGreaterThan(8);
    }
  });
  it('suggerisce cardio senza attrezzatura solo se compatibile (allenamento anche all’aperto)', () => {
    const indoor = generateProgram(profile({ goals: ['fat_loss'], equipment: ['dumbbell'] }));
    expect(cardioOf(indoor)).toHaveLength(0);
    expect(indoor.notes.join(' ')).toMatch(/camminate/);
    const outdoor = generateProgram(profile({ goals: ['fat_loss'], equipment: ['dumbbell'], location: ['home', 'outdoor'] }));
    expect(cardioOf(outdoor).length).toBeGreaterThan(0);
    for (const c of cardioOf(outdoor)) expect(['outdoor_walk', 'outdoor_run']).toContain(c.cardio!.machine);
    const hyp = generateProgram(profile({ goals: ['hypertrophy'], equipment: ['dumbbell'], location: ['home', 'outdoor'] }));
    expect(cardioOf(hyp)).toHaveLength(0);
  });
  it('le sostituzioni restano dentro l’attrezzatura', () => {
    const p = profile({ equipment: ['dumbbell', 'flat_bench'] });
    const eq = new Set<string>(['dumbbell', 'flat_bench', 'bodyweight']);
    for (const s of substitutes('bench_press_db', p)) expect(isAvailable(s, eq), s.id).toBe(true);
    const c = profile({ equipment: ['bike', 'treadmill'] });
    const subs = substitutes('bike', c);
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) expect(['bike', 'treadmill']).toContain(machineOf(s.id));
  });
});

describe('TEST 4 – principiante con sola attrezzatura cardio', () => {
  const p = profile({ level: 'beginner', goals: ['fat_loss'], daysPerWeek: 3, minutesPerSession: 40, equipment: ['bike', 'treadmill'] });
  const g = generateProgram(p);
  it('solo cardio, intensità adatte al principiante', () => {
    expect(g.mode).toBe('cardio_only');
    expect(strengthOf(g)).toHaveLength(0);
    for (const c of cardioOf(g)) {
      const phases = expandPhases(c.cardio!);
      for (const ph of phases) expect(ph.intensity, c.exerciseId).not.toBe('high');
      expect(c.exerciseId).not.toBe('hiit_bike');
      // niente corsa veloce: velocità da camminata
      for (const ph of phases) if (ph.speedKmh != null) expect(ph.speedKmh).toBeLessThanOrEqual(6.5);
    }
    // al massimo una seduta a intervalli a settimana
    expect(scheduled(g).filter((t) => t.exercises.some((e) => e.cardio?.mode === 'intervals')).length).toBeLessThanOrEqual(1);
  });
  it('programma progressivo: parte breve e cresce fino al tempo disponibile', () => {
    for (const c of cardioOf(g)) expect(planDurationSec(c.cardio!) / 60).toBeLessThanOrEqual(25);
    const prog = cardioOf(g).filter((c) => c.cardio!.progression);
    expect(prog.length).toBeGreaterThan(0);
    for (const c of prog) expect(c.cardio!.progression!.capMin).toBe(40);
    expect(g.notes.join(' ')).toMatch(/progressivo/i);
  });
  it('con limitazioni a ginocchio niente corsa e intensità contenuta', () => {
    const k = generateProgram(profile({ level: 'beginner', injuries: ['knee'], goals: ['endurance'], daysPerWeek: 4, equipment: ['treadmill'] }));
    for (const c of cardioOf(k)) for (const ph of expandPhases(c.cardio!)) { expect(ph.intensity).not.toBe('high'); expect(ph.intensity).not.toBe('vigorous'); if (ph.speedKmh) expect(ph.speedKmh).toBeLessThan(7); }
    const adv = generateProgram(profile({ level: 'advanced', injuries: ['knee'], goals: ['endurance'], daysPerWeek: 4, equipment: ['treadmill'] }));
    for (const c of cardioOf(adv)) for (const ph of expandPhases(c.cardio!)) if (ph.speedKmh) expect(ph.speedKmh).toBeLessThan(7);
  });
});

describe('TEST 5 – 45 minuti con attrezzatura muscolare e cardio', () => {
  const eq: Equipment[] = ['dumbbell', 'flat_bench', 'barbell', 'bike', 'treadmill'];
  for (const goals of [['fat_loss'], ['hypertrophy'], ['fitness'], ['strength'], ['endurance']] as Profile['goals'][]) {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      it(`nessuna seduta supera 45 minuti e il tempo è diviso tra pesi e cardio (${goals[0]}, ${level})`, () => {
        const g = generateProgram(profile({ goals, level, daysPerWeek: 4, minutesPerSession: 45, equipment: eq }));
        for (const t of g.templates) {
          const tot = templateMinutesExact(t);
          expect(tot, t.name).toBeLessThanOrEqual(45);
          const c = t.exercises.filter((e) => e.cardio);
          if (c.length) {
            const cm = c.reduce((a, e) => a + planDurationSec(e.cardio!) / 60, 0);
            expect(cm).toBeGreaterThanOrEqual(10);
            expect(cm).toBeLessThanOrEqual(20);
            expect(tot - cm).toBeGreaterThanOrEqual(15); // spazio reale per la parte muscolare
            expect(t.exercises.filter((e) => !e.cardio).length).toBeGreaterThanOrEqual(2);
          }
        }
        expect(g.templates.some((t) => t.exercises.some((e) => e.cardio))).toBe(true);
      });
    }
  }
  it('anche in palestra completa con 45 minuti', () => {
    const g = generateProgram(profile({ goals: ['hypertrophy'], level: 'advanced', daysPerWeek: 5, minutesPerSession: 45, fullGym: true, location: ['commercial_gym'] }));
    for (const t of g.templates) expect(templateMinutesExact(t)).toBeLessThanOrEqual(45);
  });
  it('fitToBudget riduce prima gli accessori e poi il cardio', () => {
    const t: WorkoutTemplate = {
      id: 't', name: 'x', source: 'manual', createdAt: '', updatedAt: '',
      exercises: [
        ...['bench_press_bb', 'db_row', 'ohp_bb', 'db_curl', 'rope_pushdown', 'lateral_raise_db'].map((id, i) => ({ uid: `u${i}`, exerciseId: id, sets: 4, repMin: 8, repMax: 10, restSec: 120 })),
        templateCardio('treadmill_walk', buildCardio('treadmill', 'steady', 20, profile()).plan),
      ],
    };
    const f = fitToBudget(t, 45);
    expect(templateMinutesExact(f)).toBeLessThanOrEqual(45);
    expect(f.exercises.find((e) => e.cardio)!.cardio!.durationMin).toBe(20);
    expect(f.exercises[0].exerciseId).toBe('bench_press_bb');
  });
});

describe('piani, stime e timer', () => {
  it('tapis roulant come nell’esempio: 2 min a 6 km/h, 1 min di corsa a 9 km/h', () => {
    const b = buildCardio('treadmill', 'intervals', 26, profile({ level: 'intermediate' }));
    const [rec, work] = b.plan.cycle!;
    expect(rec.durationSec).toBe(120); expect(rec.speedKmh).toBe(6);
    expect(work.durationSec).toBe(60); expect(work.speedKmh).toBe(9);
    expect(b.plan.warmup!.speedKmh).toBe(4); expect(b.plan.cooldown!.durationSec).toBe(180);
    expect(planDurationSec(b.plan)).toBeLessThanOrEqual(26 * 60);
  });
  it('cyclette: resistenza adattata ai livelli della macchina dell’utente', () => {
    const d = buildCardio('bike', 'steady', 15, profile());
    expect(d.plan.resistance).toBe(5); expect(d.plan.rpm).toBe(70); expect(d.plan.resistanceMax).toBe(16);
    const m = buildCardio('bike', 'steady', 15, profile({ cardioMachines: { bike: { maxResistance: 8 } } }));
    expect(m.plan.resistance).toBeLessThanOrEqual(3); expect(m.plan.resistanceMax).toBe(8);
  });
  it('fasi e posizione nel timer', () => {
    const b = buildCardio('bike', 'intervals', 24, profile());
    const ph = expandPhases(b.plan);
    expect(ph[0].kind).toBe('warmup');
    expect(ph[ph.length - 1].kind).toBe('cooldown');
    expect(phaseAt(ph, 0).index).toBe(0);
    expect(phaseAt(ph, ph[0].durationSec + 1).index).toBe(1);
    expect(phaseAt(ph, 99999).finished).toBe(true);
  });
  it('timer: avvia, pausa, riprendi', () => {
    let t = startTimer({ running: false, startedAt: null, accumulatedMs: 0 }, 1000);
    t = pauseTimer(t, 61000);
    expect(timerElapsedMs(t, 999999)).toBe(60000);
    t = startTimer(t, 100000);
    expect(timerElapsedMs(t, 130000)).toBe(90000);
  });
  it('distanza e calorie stimate plausibili', () => {
    const plan = { ...buildCardio('treadmill', 'steady', 20, profile()).plan, speedKmh: 5.5, inclinePct: 5 };
    expect(estimateDistanceKm(plan)).toBeCloseTo(1.83, 1);
    const kcal = estimatePlanKcal(plan, 80)!;
    expect(kcal).toBeGreaterThan(110); expect(kcal).toBeLessThan(220);
    const a = actualFromPlan(plan, 18 * 60, 80);
    expect(a.durationSec).toBe(1080); expect(a.distanceKm).toBeCloseTo(1.65, 1);
  });
});

describe('sessione live con cardio e storico', () => {
  beforeAll(async () => { await store.open('cardiotest'); await store.put('profile', 'me', profile({ level: 'beginner' })); });
  it('salva i valori effettivi, li usa nel riepilogo e nello storico, e fa progredire la scheda', async () => {
    const plan = { ...buildCardio('treadmill', 'steady', 20, profile({ level: 'beginner' })).plan, speedKmh: 5.5, inclinePct: 5, progression: { stepMin: 2, capMin: 30 } };
    const tpl: WorkoutTemplate = { id: 'tpl_c', name: 'Petto, tricipiti e cardio', source: 'manual', createdAt: '', updatedAt: '', exercises: [
      { uid: 'te1', exerciseId: 'bench_press_bb', sets: 3, repMin: 10, repMax: 10, restSec: 90 },
      templateCardio('treadmill_incline_walk', plan),
    ] };
    await store.put('templates', tpl.id, tpl);
    for (let k = 0; k < 2; k++) {
      const s = await startSession(tpl);
      const c = s.exercises.find((e) => e.cardio)!;
      expect(c.sets).toHaveLength(0);
      expect(c.cardio!.plan.durationMin).toBe(k === 0 ? 20 : 20);
      const st = s.exercises[0].sets.map((x) => ({ ...x, weight: 60, reps: 10, done: true }));
      const actual = k === 0
        ? { durationSec: 18 * 60, speedKmh: 5.2, inclinePct: 4, distanceKm: 1.56, kcal: 120, completedAt: new Date().toISOString() }
        : { durationSec: 20 * 60, speedKmh: 5.5, inclinePct: 5, distanceKm: 1.83, kcal: 140, completedAt: new Date().toISOString() };
      await saveSession({ ...s, exercises: [{ ...s.exercises[0], sets: st }, { ...c, cardio: { ...c.cardio!, actual, done: true } }] });
      const ended = await finishSession(store.get<WorkoutSession>('sessions', s.id)!);
      const cs = sessionCardioStats(ended);
      expect(cs.activities).toBe(1);
      expect(cs.minutes).toBe(k === 0 ? 18 : 20);
      expect(cs.plannedMin).toBe(20);
      expect(cs.distanceKm).toBe(k === 0 ? 1.56 : 1.83);
      expect(ended.exercises).toHaveLength(2);
    }
    // 18/20 min la prima volta: nessuna progressione; ora (20/20) solo 1 su 2 completa → ancora 20
    expect(store.get<WorkoutTemplate>('templates', 'tpl_c')!.exercises[1].cardio!.durationMin).toBe(20);
    const entries = cardioEntries(store.list<WorkoutSession>('sessions'));
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.speedKmh)).toEqual([5.2, 5.5]);
    expect(entries[0].plannedMin).toBe(20);
  });
  it('progressione dopo due sessioni completate come previsto', () => {
    const plan = { ...buildCardio('bike', 'steady', 20, profile({ level: 'beginner' })).plan, progression: { stepMin: 2, capMin: 24 } };
    const t: WorkoutTemplate = { id: 'tp', name: 'C', source: 'generated', createdAt: '', updatedAt: '', exercises: [templateCardio('bike', plan)] };
    const mk = (id: string, d: string, sec: number): WorkoutSession => ({ id, name: 'C', templateId: 'tp', startedAt: d, endedAt: d, pausedMs: 0, status: 'completed',
      exercises: [{ uid: 'x', exerciseId: 'bike', restSec: 0, repMin: 20, repMax: 20, sets: [], cardio: { plan, timer: { running: false, startedAt: null, accumulatedMs: sec * 1000 }, done: true, actual: { durationSec: sec, completedAt: d } } }] });
    expect(progressTemplateCardio(t, [mk('a', '2026-11-01', 1200)])).toBeNull();
    const r = progressTemplateCardio(t, [mk('a', '2026-11-01', 1200), mk('b', '2026-11-03', 1200)])!;
    expect(r.template.exercises[0].cardio!.durationMin).toBe(22);
    expect(progressTemplateCardio(t, [mk('a', '2026-11-01', 1200), mk('b', '2026-11-03', 900)])).toBeNull();
  });
  it('il cardio avviato ma non chiuso viene salvato con il tempo svolto', async () => {
    const plan = buildCardio('bike', 'steady', 15, profile()).plan;
    const tpl: WorkoutTemplate = { id: 'tpl_d', name: 'Solo cyclette', source: 'manual', createdAt: '', updatedAt: '', exercises: [templateCardio('bike', plan)] };
    const s = await startSession(tpl);
    const c = s.exercises[0];
    await saveSession({ ...s, exercises: [{ ...c, cardio: { ...c.cardio!, timer: { running: false, startedAt: null, accumulatedMs: 10 * 60000 } } }] });
    const ended = await finishSession(store.get<WorkoutSession>('sessions', s.id)!);
    expect(ended.status).toBe('completed');
    expect(ended.exercises[0].cardio!.actual!.durationSec).toBe(600);
    expect(ended.exercises[0].cardio!.actual!.resistance).toBe(plan.resistance);
  });
});

describe('cardio per il dimagrimento: obiettivo settimanale', () => {
  const eq: Equipment[] = ['dumbbell', 'flat_bench', 'barbell', 'bike', 'treadmill'];
  const weekMin = (g: GeneratedProgram) => scheduled(g).reduce((a, t) => a + t.exercises.filter((e) => e.cardio).reduce((b, e) => b + planDurationSec(e.cardio!) / 60, 0), 0);

  it('riconosce il dimagrimento dal peso obiettivo anche se l’obiettivo è un altro (76 → 72 kg)', () => {
    for (const goals of [['recomp'], ['fitness'], ['hypertrophy']] as Profile['goals'][]) {
      const lose = generateProgram(profile({ goals, weightKg: 76, targetWeightKg: 72, daysPerWeek: 4, minutesPerSession: 45, equipment: eq }));
      const keep = generateProgram(profile({ goals, weightKg: 76, targetWeightKg: 76, daysPerWeek: 4, minutesPerSession: 45, equipment: eq }));
      expect(lose.cardioWeek.weightLoss).toBe(true);
      expect(keep.cardioWeek.weightLoss).toBe(false);
      expect(weekMin(lose)).toBeGreaterThan(weekMin(keep));
      expect(lose.notes.join(' ')).toMatch(/peso obiettivo/i);
    }
  });
  it('molti più minuti a settimana di prima (non più 2 × 10 minuti)', () => {
    const g = generateProgram(profile({ goals: ['recomp'], weightKg: 76, targetWeightKg: 72, daysPerWeek: 4, minutesPerSession: 45, equipment: eq }));
    expect(weekMin(g)).toBeGreaterThanOrEqual(60);
    expect(scheduled(g).filter((t) => t.exercises.some((e) => e.cardio)).length).toBeGreaterThanOrEqual(3);
    expect(g.cardioWeek.minutes).toBe(Math.round(weekMin(g)));
    expect(g.cardioWeek.target.start).toBeGreaterThanOrEqual(150);
    expect(g.cardioWeek.kcal).toBeGreaterThan(0);
    for (const t of g.templates) {
      const cm = t.exercises.filter((e) => e.cardio).reduce((a, e) => a + planDurationSec(e.cardio!) / 60, 0);
      if (cm) expect(templateMinutesExact(t) - cm, t.name).toBeGreaterThanOrEqual(15);
    }
  });
  it('raggiunge l’obiettivo minimo quando il tempo lo permette', () => {
    const g = generateProgram(profile({ goals: ['fat_loss'], daysPerWeek: 5, minutesPerSession: 75, equipment: eq, targetWeightKg: 74 }));
    expect(weekMin(g)).toBeGreaterThanOrEqual(g.cardioWeek.target.start);
  });
  it('nessun giorno extra: le sedute restano quelle scelte e il tempo è rispettato', () => {
    for (const days of [2, 3, 4, 5]) for (const minutes of [30, 45, 60]) for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      const g = generateProgram(profile({ goals: ['fat_loss'], level, targetWeightKg: 72, daysPerWeek: days, minutesPerSession: minutes, equipment: eq }));
      expect(g.program.schedule.filter(Boolean).length).toBe(days);
      for (const t of g.templates) {
        const tot = templateMinutesExact(t);
        expect(tot, `${days}g ${minutes}' ${level}`).toBeLessThanOrEqual(minutes);
        const cm = t.exercises.filter((e) => e.cardio).reduce((a, e) => a + planDurationSec(e.cardio!) / 60, 0);
        if (cm) expect(cm).toBeLessThanOrEqual(Math.max(10, minutes / 2));
        for (const e of t.exercises) if (e.cardio?.progression) expect(e.cardio.progression.capMin).toBeLessThanOrEqual(Math.max(10, minutes / 2));
      }
    }
  });
  it('se il tempo non basta lo dice e suggerisce come arrivarci', () => {
    const g = generateProgram(profile({ goals: ['fat_loss'], targetWeightKg: 72, daysPerWeek: 2, minutesPerSession: 30, equipment: eq }));
    expect(g.cardioWeek.minutes).toBeLessThan(g.cardioWeek.target.start);
    expect(g.notes.join(' ')).toMatch(/kcal/);
  });
  it('salita reale sul tapis roulant (non più 4%)', () => {
    const g = generateProgram(profile({ goals: ['fat_loss'], daysPerWeek: 4, minutesPerSession: 60, equipment: ['treadmill', 'dumbbell'] }));
    const incl = cardioOf(g).flatMap((c) => expandPhases(c.cardio!)).map((ph) => ph.inclinePct ?? 0);
    expect(Math.max(...incl)).toBeGreaterThanOrEqual(6);
  });
  it('per la massa senza dimagrimento il cardio resta leggero', () => {
    const g = generateProgram(profile({ goals: ['hypertrophy'], daysPerWeek: 4, minutesPerSession: 60, equipment: eq }));
    expect(g.cardioWeek.weightLoss).toBe(false);
    expect(weekMin(g)).toBeLessThanOrEqual(90);
  });
});
