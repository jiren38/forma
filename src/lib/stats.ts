import type { ExerciseLog, MuscleGroup, PRRecord, WorkoutSession } from './types';
import { getExercise } from '@/data/exercises';
import { dayKey, startOfWeek, addDays, sum } from './util';

/** 1RM stimato (Epley), limitato a 12 ripetizioni per affidabilità. */
export function e1rm(weight: number, reps: number) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, 12) / 30);
}

export const completedSessions = (sessions: WorkoutSession[]) =>
  sessions.filter((s) => s.status === 'completed' && s.endedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt));

export function sessionDurationMs(s: WorkoutSession) {
  const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
  const paused = s.pausedMs + (s.pausedAt ? Date.now() - new Date(s.pausedAt).getTime() : 0);
  return Math.max(0, end - new Date(s.startedAt).getTime() - paused);
}

export function doneSets(ex: ExerciseLog) { return ex.sets.filter((s) => s.done); }

export function sessionStats(s: WorkoutSession) {
  let sets = 0, reps = 0, volume = 0, exercises = 0;
  for (const ex of s.exercises) {
    const d = doneSets(ex);
    if (d.length) exercises++;
    sets += d.length;
    for (const st of d) { reps += st.reps ?? 0; volume += (st.weight ?? 0) * (st.reps ?? 0); }
  }
  return { sets, reps, volume, exercises, durationMs: sessionDurationMs(s) };
}

export interface ExercisePoint { date: string; sessionId: string; bestWeight: number; bestReps: number; e1rm: number; volume: number; sets: number; totalReps: number }

export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const s of completedSessions(sessions)) {
    const logs = s.exercises.filter((e) => e.exerciseId === exerciseId);
    if (!logs.length) continue;
    const sets = logs.flatMap(doneSets);
    if (!sets.length) continue;
    let bestWeight = 0, bestReps = 0, best1 = 0, vol = 0, tr = 0;
    for (const st of sets) {
      const w = st.weight ?? 0, r = st.reps ?? 0;
      if (w > bestWeight || (w === bestWeight && r > bestReps)) { bestWeight = w; bestReps = r; }
      best1 = Math.max(best1, e1rm(w, r));
      vol += w * r; tr += r;
    }
    out.push({ date: s.startedAt, sessionId: s.id, bestWeight, bestReps, e1rm: best1, volume: vol, sets: sets.length, totalReps: tr });
  }
  return out;
}

export function lastPerformance(sessions: WorkoutSession[], exerciseId: string, excludeSessionId?: string): ExerciseLog | null {
  const list = completedSessions(sessions).filter((s) => s.id !== excludeSessionId).reverse();
  for (const s of list) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.done));
    if (ex) return ex;
  }
  return null;
}

export interface PRSet { weight?: { value: number; reps: number; date: string }; e1rm?: { value: number; date: string }; reps?: { value: number; weight: number; date: string }; volume?: { value: number; date: string } }

export function personalRecords(sessions: WorkoutSession[], exerciseId: string, beforeIso?: string): PRSet {
  const pr: PRSet = {};
  for (const s of completedSessions(sessions)) {
    if (beforeIso && s.startedAt >= beforeIso) continue;
    for (const ex of s.exercises.filter((e) => e.exerciseId === exerciseId)) {
      let vol = 0;
      for (const st of doneSets(ex)) {
        const w = st.weight ?? 0, r = st.reps ?? 0;
        vol += w * r;
        if (w > 0 && (!pr.weight || w > pr.weight.value)) pr.weight = { value: w, reps: r, date: s.startedAt };
        const e = e1rm(w, r);
        if (e > 0 && (!pr.e1rm || e > pr.e1rm.value)) pr.e1rm = { value: e, date: s.startedAt };
        if (r > 0 && (!pr.reps || r > pr.reps.value)) pr.reps = { value: r, weight: w, date: s.startedAt };
      }
      if (vol > 0 && (!pr.volume || vol > pr.volume.value)) pr.volume = { value: vol, date: s.startedAt };
    }
  }
  return pr;
}

/** Confronta la sessione con lo storico precedente e restituisce i nuovi record. */
export function detectPRs(sessions: WorkoutSession[], session: WorkoutSession): PRRecord[] {
  const prs: PRRecord[] = [];
  const ids = Array.from(new Set(session.exercises.map((e) => e.exerciseId)));
  for (const id of ids) {
    const ex = getExercise(id);
    const before = personalRecords(sessions.filter((s) => s.id !== session.id), id, session.startedAt);
    const sets = session.exercises.filter((e) => e.exerciseId === id).flatMap(doneSets);
    if (!sets.length) continue;
    const hasHistory = !!(before.weight || before.reps);
    if (!hasHistory) continue; // la prima volta non è un record
    let bw = 0, bwReps = 0, be = 0, br = 0, vol = 0;
    for (const st of sets) {
      const w = st.weight ?? 0, r = st.reps ?? 0;
      if (w > bw) { bw = w; bwReps = r; }
      be = Math.max(be, e1rm(w, r)); br = Math.max(br, r); vol += w * r;
    }
    const weighted = ex?.tracking === 'weight_reps';
    if (weighted && bw > (before.weight?.value ?? 0)) prs.push({ exerciseId: id, kind: 'weight', value: bw, reps: bwReps, date: session.startedAt, sessionId: session.id });
    else if (weighted && be > (before.e1rm?.value ?? 0) * 1.0001) prs.push({ exerciseId: id, kind: 'e1rm', value: Math.round(be * 10) / 10, date: session.startedAt, sessionId: session.id });
    if (!weighted && br > (before.reps?.value ?? 0)) prs.push({ exerciseId: id, kind: 'reps', value: br, date: session.startedAt, sessionId: session.id });
    if (weighted && vol > (before.volume?.value ?? 0) && !prs.some((p) => p.exerciseId === id)) prs.push({ exerciseId: id, kind: 'volume', value: vol, date: session.startedAt, sessionId: session.id });
  }
  return prs;
}

export function weeklyCounts(sessions: WorkoutSession[], weeks = 12) {
  const done = completedSessions(sessions);
  const start = startOfWeek();
  const out: { week: string; label: string; count: number; volume: number; minutes: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(start, -7 * i), we = addDays(ws, 7);
    const inW = done.filter((s) => { const d = new Date(s.startedAt); return d >= ws && d < we; });
    out.push({
      week: dayKey(ws), label: `${ws.getDate()}/${ws.getMonth() + 1}`, count: inW.length,
      volume: sum(inW.map((s) => sessionStats(s).volume)), minutes: sum(inW.map((s) => sessionDurationMs(s) / 60000)),
    });
  }
  return out;
}

export function monthlyCounts(sessions: WorkoutSession[], months = 6) {
  const done = completedSessions(sessions);
  const now = new Date();
  const out: { label: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const n = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    out.push({ label: m.toLocaleDateString('it-IT', { month: 'short' }), count: done.filter((s) => { const d = new Date(s.startedAt); return d >= m && d < n; }).length });
  }
  return out;
}

/** Serie per gruppo muscolare (principali = 1, secondari = 0.5). */
export function muscleSets(sessions: WorkoutSession[], sinceDays = 7): Partial<Record<MuscleGroup, number>> {
  const since = addDays(new Date(), -sinceDays);
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const s of completedSessions(sessions)) {
    if (new Date(s.startedAt) < since) continue;
    for (const ex of s.exercises) {
      const e = getExercise(ex.exerciseId); if (!e) continue;
      const n = doneSets(ex).length; if (!n) continue;
      e.primary.forEach((m) => { out[m] = (out[m] ?? 0) + n; });
      e.secondary.forEach((m) => { out[m] = (out[m] ?? 0) + n * 0.5; });
    }
  }
  return out;
}

/** Giorni consecutivi/settimane consecutive con almeno un allenamento. */
export function streaks(sessions: WorkoutSession[], weeklyTarget: number) {
  const done = completedSessions(sessions);
  const days = new Set(done.map((s) => dayKey(s.startedAt)));
  let weekStreak = 0;
  const ws = startOfWeek();
  for (let i = 0; i < 520; i++) {
    const a = addDays(ws, -7 * i), b = addDays(a, 7);
    const c = done.filter((s) => { const d = new Date(s.startedAt); return d >= a && d < b; }).length;
    if (i === 0 && c < weeklyTarget) continue; // settimana in corso non ancora conclusa
    if (c >= Math.max(1, weeklyTarget)) weekStreak++; else break;
  }
  return { activeDays: days.size, weekStreak };
}

export function consistencyGrid(sessions: WorkoutSession[], weeks = 16) {
  const days = new Map<string, number>();
  for (const s of completedSessions(sessions)) { const k = dayKey(s.startedAt); days.set(k, (days.get(k) ?? 0) + 1); }
  const start = addDays(startOfWeek(), -7 * (weeks - 1));
  const grid: { key: string; count: number; future: boolean }[][] = [];
  const today = dayKey();
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const k = dayKey(addDays(start, w * 7 + d));
      col.push({ key: k, count: days.get(k) ?? 0, future: k > today });
    }
    grid.push(col);
  }
  return grid;
}
