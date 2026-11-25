import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/data';
import { dailyHeadline, dailySummary, lastWeighDay, type DailyInput } from '@/lib/daily';
import type { Program, WorkoutSession, WorkoutTemplate } from '@/lib/types';

// mercoledì 25 novembre 2026, ora locale
const at = (h: number, m = 0, d = 25) => new Date(2026, 10, d, h, m);
const tpl: WorkoutTemplate = { id: 't1', name: 'Upper A', exercises: [{ uid: 'e1', exerciseId: 'bench', sets: 3, repMin: 8, repMax: 10, restSec: 90 } as any], createdAt: '', updatedAt: '' } as any;
const cardioTpl: WorkoutTemplate = { ...tpl, id: 't2', name: 'Cardio', exercises: [{ uid: 'c1', exerciseId: 'bike', sets: 1, repMin: 1, repMax: 1, restSec: 0, cardio: {} } as any] } as any;
// lunedì = 0 … mercoledì = 2
const program = (wed: string | null): Program => ({ id: 'p', name: 'P', schedule: [null, null, wed, null, null, null, null], active: true, source: 'manual', createdAt: '' });

function base(over: Partial<DailyInput> = {}): DailyInput {
  return { now: at(9), settings: { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, weight: false } }, program: undefined, templates: [tpl, cardioTpl], sessions: [], diary: [], wellness: [], measurements: [], cardio: [], mealPlans: [], ...over };
}
const keys = (inp: DailyInput) => dailySummary(inp).items.map((i) => i.key);
const item = (inp: DailyInput, k: string) => dailySummary(inp).items.find((i) => i.key === k);

describe('riepilogo giornaliero', () => {
  it('nessun allenamento nei giorni di riposo o senza programma', () => {
    expect(keys(base())).not.toContain('workout');
    expect(keys(base({ program: program(null) }))).not.toContain('workout');
    expect(keys(base({ program: program('t1') }))).toContain('workout');
  });

  it('allenamento completato solo con una sessione conclusa oggi', () => {
    const s = (start: Date, status: WorkoutSession['status'] = 'completed'): WorkoutSession => ({ id: `s${+start}`, name: 'Upper A', startedAt: start.toISOString(), endedAt: status === 'completed' ? new Date(+start + 3600e3).toISOString() : null, pausedMs: 0, exercises: [], status } as any);
    expect(item(base({ program: program('t1'), sessions: [s(at(18, 0, 24))] }), 'workout')!.status).toBe('todo');
    expect(item(base({ program: program('t1'), sessions: [s(at(7))] }), 'workout')!.status).toBe('done');
    const active = item(base({ program: program('t1'), sessions: [s(at(8), 'active')] }), 'workout')!;
    expect(active.status).toBe('todo');
    expect(active.to).toBe('/workout/live');
  });

  it('scheda solo cardio: vale anche un’attività cardio registrata oggi', () => {
    const inp = base({ program: program('t2'), cardio: [{ id: 'c', date: '2026-11-25', type: 'bike', durationMin: 30, createdAt: '' }] });
    const w = item(inp, 'workout')!;
    expect(w.kind).toBe('cardio');
    expect(w.status).toBe('done');
  });

  it('pasti: quelli non ancora arrivati sono "più tardi", gli spuntini solo se pianificati', () => {
    const inp = base({ now: at(9), diary: [{ id: 'd', date: '2026-11-25', slot: 'breakfast', name: 'Latte', grams: 200, kcal: 120, protein: 6, carbs: 10, fat: 6, createdAt: '' }] });
    expect(item(inp, 'breakfast')!.status).toBe('done');
    expect(item(inp, 'lunch')!.status).toBe('later');
    expect(item(inp, 'dinner')!.status).toBe('later');
    expect(keys(inp)).not.toContain('snack_pm');
    expect(item({ ...inp, now: at(13) }, 'lunch')!.status).toBe('todo');
    const planned = { ...inp, mealPlans: [{ id: '2026-11-25', date: '2026-11-25', items: [{ uid: 'x', slot: 'snack_pm' as const, kind: 'food' as const, refId: 'f', name: 'Yogurt', grams: 125 }] }] };
    expect(keys(planned)).toContain('snack_pm');
  });

  it('una voce del diario di ieri non conta per oggi', () => {
    const inp = base({ now: at(9), diary: [{ id: 'd', date: '2026-11-24', slot: 'breakfast', name: 'X', grams: 1, kcal: 1, protein: 0, carbs: 0, fat: 0, createdAt: '' }] });
    expect(item(inp, 'breakfast')!.status).toBe('todo');
  });

  it('acqua completata solo a obiettivo raggiunto, con avanzamento', () => {
    const half = item(base({ wellness: [{ id: '2026-11-25', date: '2026-11-25', waterMl: 1000 }] }), 'water')!;
    expect(half.status).toBe('todo');
    expect(half.progress).toEqual({ value: 1000, max: 2000 });
    expect(item(base({ wellness: [{ id: '2026-11-25', date: '2026-11-25', waterMl: 2000 }] }), 'water')!.status).toBe('done');
  });

  it('peso solo nel giorno impostato, con recupero in settimana', () => {
    const s = (day: number) => ({ ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, weight: true, weightDay: day } });
    // pesata il mercoledì: prevista oggi
    expect(keys(base({ settings: s(2) }))).toContain('weight');
    // pesata il lunedì, nessuna misura da allora: da recuperare
    expect(item(base({ settings: s(0) }), 'weight')!.detail).toMatch(/lunedì/);
    // pesata lunedì già fatta martedì: non serve più
    expect(keys(base({ settings: s(0), measurements: [{ id: 'm', date: '2026-11-24', weightKg: 80 }] }))).not.toContain('weight');
    // promemoria disattivato: mai previsto
    expect(keys(base())).not.toContain('weight');
    // registrato oggi: completato
    expect(item(base({ settings: s(2), measurements: [{ id: 'm', date: '2026-11-25', weightKg: 80 }] }), 'weight')!.status).toBe('done');
    expect(lastWeighDay(at(9), 3).getDate()).toBe(19); // giovedì precedente (0 = lunedì)
  });

  it('sonno e check-in', () => {
    const w = { id: '2026-11-25', date: '2026-11-25', waterMl: 0, sleepHours: 7.5, energy: 4, stress: 2 };
    const inp = base({ wellness: [w] });
    expect(item(inp, 'sleep')!.status).toBe('done');
    expect(item(inp, 'checkin')!.status).toBe('todo');
    expect(item(inp, 'checkin')!.detail).toBe('2 di 3 indicatori');
    expect(item(base({ wellness: [{ ...w, mood: 3 }] }), 'checkin')!.status).toBe('done');
    expect(item(base({ now: at(3) }), 'sleep')!.status).toBe('later');
  });

  it('cambio di giornata: a mezzanotte si riparte da zero', () => {
    const w = { id: '2026-11-25', date: '2026-11-25', waterMl: 2500, sleepHours: 8, energy: 4, stress: 2, mood: 4 };
    const today = dailySummary(base({ now: at(23, 59), wellness: [w] }));
    const tomorrow = dailySummary(base({ now: at(0, 1, 26), wellness: [w] }));
    expect(today.done).toBeGreaterThan(tomorrow.done);
    expect(tomorrow.date).toBe('2026-11-26');
    expect(tomorrow.done).toBe(0);
  });

  it('voci saltate escono dal conteggio; il completamento usa solo le voci previste', () => {
    const w = { id: '2026-11-25', date: '2026-11-25', waterMl: 2000, sleepHours: 8, energy: 3, stress: 3, mood: 3, dailySkip: ['breakfast'] };
    const s = dailySummary(base({ now: at(9), wellness: [w] }));
    expect(s.skipped.map((i) => i.key)).toEqual(['breakfast']);
    expect(s.items.map((i) => i.key)).not.toContain('breakfast');
    expect(s.todo).toHaveLength(0);
    expect(s.done).toBe(3);
    expect(s.total).toBe(5); // sonno, acqua, check-in fatti + pranzo e cena più tardi
    expect(dailyHeadline(s, at(9)).title).toBe('Sei in pari');
  });

  it('tutto registrato: messaggio positivo', () => {
    const w = { id: '2026-11-25', date: '2026-11-25', waterMl: 2000, sleepHours: 8, energy: 3, stress: 3, mood: 3 };
    const diary = (['breakfast', 'lunch', 'dinner'] as const).map((slot) => ({ id: slot, date: '2026-11-25', slot, name: 'x', grams: 1, kcal: 300, protein: 0, carbs: 0, fat: 0, createdAt: '' }));
    const s = dailySummary(base({ now: at(21), wellness: [w], diary }));
    expect(s.allDone).toBe(true);
    expect(dailyHeadline(s, at(21)).title).toBe('Tutto registrato');
  });

  it('priorità: prima le voci da fare, poi più tardi, poi completate', () => {
    const s = dailySummary(base({ now: at(9), program: program('t1'), wellness: [{ id: '2026-11-25', date: '2026-11-25', waterMl: 0, sleepHours: 7 }] }));
    const st = s.items.map((i) => i.status);
    expect(st.indexOf('later')).toBeGreaterThan(st.lastIndexOf('todo'));
    expect(st.indexOf('done')).toBeGreaterThan(st.lastIndexOf('later'));
    expect(s.items[0].key).toBe('workout');
  });
});
