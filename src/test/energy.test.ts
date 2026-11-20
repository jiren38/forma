import { describe, expect, it } from 'vitest';
import { EXERCISES } from '@/data/exercises';
import { isCardioExercise } from '@/lib/cardio';
import { bmrFor, buildEnergyIndex, daysInRange, scaleCheck, sessionEnergy, summarize, weightResolver } from '@/lib/energy';
import { addDays, dayKey, fromKey } from '@/lib/util';
import type { ExerciseLog, Measurement, WorkoutSession } from '@/lib/types';

const P = { sex: 'male' as const, age: 35, heightCm: 178, weightKg: 80, activity: 'moderate' as const };
const strengthId = EXERCISES.find((e) => e.kind === 'free' && !isCardioExercise(e))!.id;
const cardioId = EXERCISES.find((e) => isCardioExercise(e) && e.equipment.includes('bike'))!.id;

function strengthLog(sets: number, restSec = 90, rpe?: number): ExerciseLog {
  return { uid: `u${Math.random()}`, exerciseId: strengthId, restSec, repMin: 8, repMax: 12, sets: Array.from({ length: sets }, (_, i) => ({ uid: `s${i}`, weight: 40, reps: 10, done: true, rpe: rpe ?? null })) };
}
function session(start: string, minutes: number, exercises: ExerciseLog[]): WorkoutSession {
  const s = new Date(start);
  return { id: `ses_${start}`, name: 'Test', startedAt: s.toISOString(), endedAt: new Date(s.getTime() + minutes * 60000).toISOString(), pausedMs: 0, exercises, status: 'completed' };
}

describe('metabolismo basale', () => {
  it('Mifflin-St Jeor per uomo e donna', () => {
    expect(bmrFor(P).kcal).toBe(1743); // 800 + 1112,5 − 175 + 5
    expect(bmrFor({ ...P, sex: 'female' }).kcal).toBe(1577);
    expect(bmrFor(P).method).toBe('mifflin');
  });
  it('Katch-McArdle se è nota la percentuale di grasso', () => {
    const b = bmrFor({ ...P, bodyFatPct: 20 });
    expect(b.method).toBe('katch');
    expect(b.kcal).toBe(1752); // 370 + 21,6 × 64
  });
  it('usa il peso registrato più vicino al giorno', () => {
    const ms: Measurement[] = [{ id: 'a', date: '2026-10-01', weightKg: 84 }, { id: 'b', date: '2026-10-15', weightKg: 82 }];
    const w = weightResolver(ms, 80);
    expect(w('2026-09-20')).toBe(84);
    expect(w('2026-10-10')).toBe(84);
    expect(w('2026-10-15')).toBe(82);
    expect(w('2026-11-01')).toBe(82);
    expect(weightResolver([], 80)('2026-11-01')).toBe(80);
  });
});

describe('calorie degli allenamenti', () => {
  it('pesi a impegno moderato: 3,5 MET per la durata reale', () => {
    const e = sessionEnergy(session('2026-11-10T18:00:00', 60, [strengthLog(18)]), 80);
    expect(e.minutes).toBe(60);
    expect(e.kcal).toBe(280); // 3,5 × 80 × 1 h
    expect(e.netKcal).toBe(200); // (3,5 − 1) × 80 × 1 h
    expect(e.intensity).toBe('light');
    expect(e.capped).toBe(false);
  });
  it('RPE alto porta a 6 MET', () => {
    const e = sessionEnergy(session('2026-11-10T18:00:00', 60, [strengthLog(18, 90, 9)]), 80);
    expect(e.intensity).toBe('vigorous');
    expect(e.kcal).toBe(480);
  });
  it('una sessione dimenticata aperta non conta ore di allenamento', () => {
    const e = sessionEnergy(session('2026-11-10T18:00:00', 300, [strengthLog(12)]), 80);
    expect(e.capped).toBe(true);
    expect(e.minutes).toBeLessThan(60);
    expect(e.kcal).toBeLessThan(300);
  });
  it('il cardio usa le kcal stimate dai dati reali e somma la parte pesi', () => {
    const cardio: ExerciseLog = {
      uid: 'c', exerciseId: cardioId, restSec: 0, repMin: 0, repMax: 0, sets: [],
      cardio: { plan: { machine: 'bike', mode: 'steady', durationMin: 30, intensity: 'moderate' }, timer: { running: false, startedAt: null, accumulatedMs: 1800000 }, done: true, actual: { durationSec: 1800, kcal: 300, completedAt: '2026-11-10T19:00:00Z' } },
    };
    const e = sessionEnergy(session('2026-11-10T18:00:00', 75, [strengthLog(15), cardio]), 80);
    const c = e.parts.find((p) => p.kind === 'cardio')!;
    expect(c.kcal).toBe(300);
    expect(c.netKcal).toBe(260); // 300 − 1 MET × 80 kg × 0,5 h
    const s = e.parts.find((p) => p.kind === 'strength')!;
    expect(s.minutes).toBe(45);
    expect(e.kcal).toBe(300 + 210);
  });
  it('nessuna serie svolta, nessuna caloria inventata', () => {
    expect(sessionEnergy(session('2026-11-10T18:00:00', 40, []), 80).kcal).toBe(0);
  });
});

describe('bilancio giornaliero e di periodo', () => {
  const today = '2026-11-20';
  const diary = [
    { date: '2026-11-18', kcal: 1500 }, { date: '2026-11-18', kcal: 700 },
    { date: '2026-11-20', kcal: 800 },
  ];
  const idx = buildEnergyIndex({ profile: P, sessions: [session('2026-11-18T18:00:00', 60, [strengthLog(18)])], cardioLogs: [], diary, measurements: [] }, today);

  it('consumo = basale × fattore di stile di vita + costo netto dell’allenamento', () => {
    const d = idx.day('2026-11-18');
    expect(d.bmr).toBe(1743);
    expect(d.lifestyle).toBe(Math.round(1743 * 0.5));
    expect(d.exerciseNet).toBe(200);
    expect(d.out).toBe(1743 + 872 + 200);
    expect(d.intake).toBe(2200);
    expect(d.balance).toBe(2200 - d.out);
  });
  it('un giorno senza pasti non vale 0 kcal', () => {
    const d = idx.day('2026-11-19');
    expect(d.intake).toBeNull();
    expect(d.balance).toBeNull();
  });
  it('la settimana conta solo i giorni conclusi e registrati', () => {
    const days = daysInRange(idx, fromKey('2026-11-16'), fromKey('2026-11-23'));
    expect(days[days.length - 1].date).toBe(today); // niente giorni futuri
    const s = summarize(days);
    expect(s.loggedDays).toBe(1); // il 18; oggi è escluso perché in corso
    expect(s.balance).toBe(idx.day('2026-11-18').balance);
    expect(s.workouts).toBe(1);
    expect(s.exerciseKcal).toBe(280);
  });
  it('le attività cardio registrate a parte entrano nel giorno giusto', () => {
    const i2 = buildEnergyIndex({ profile: P, sessions: [], cardioLogs: [{ id: 'c1', date: '2026-11-19', type: 'run', durationMin: 30, kcal: 400, createdAt: '' }], diary: [], measurements: [] }, today);
    const d = i2.day('2026-11-19');
    expect(d.exerciseKcal).toBe(400);
    expect(d.exerciseNet).toBe(360); // 400 − 80 × 0,5
  });
});

describe('verifica con la bilancia', () => {
  it('ricava il consumo reale da peso e diario', () => {
    const today = '2026-11-20';
    const start = addDays(fromKey(today), -28);
    const diary = Array.from({ length: 28 }, (_, i) => ({ date: dayKey(addDays(start, i)), kcal: 2000 }));
    // −0,5 kg a settimana
    const measurements: Measurement[] = [0, 7, 14, 21, 27].map((d) => ({ id: `m${d}`, date: dayKey(addDays(start, d)), weightKg: 85 - (0.5 / 7) * d }));
    const idx = buildEnergyIndex({ profile: P, sessions: [], cardioLogs: [], diary, measurements }, today);
    const c = scaleCheck(idx, measurements);
    expect(c.ok).toBe(true);
    expect(c.observedOut).toBe(2550); // 2000 + 0,0714 kg/giorno × 7700
    expect(c.kgChange).toBeCloseTo(-2, 1);
  });
  it('con pochi dati non dà numeri', () => {
    const idx = buildEnergyIndex({ profile: P, sessions: [], cardioLogs: [], diary: [], measurements: [] }, '2026-11-20');
    expect(scaleCheck(idx, []).ok).toBe(false);
  });
});
