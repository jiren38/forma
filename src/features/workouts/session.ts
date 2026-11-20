/** Gestione della sessione di allenamento: avvio, salvataggio continuo, ripresa e chiusura. */
import { store } from '@/db/store';
import type { CardioPlan, ExerciseLog, Profile, SetLog, WorkoutSession, WorkoutTemplate } from '@/lib/types';
import { actualFromPlan, defaultPlanFor, isCardioId, logStateFor, pauseTimer, planFromLegacy, progressTemplateCardio, timerElapsedMs } from '@/lib/cardio';
import { detectPRs, lastPerformance } from '@/lib/stats';
import { uid } from '@/lib/util';
import { getExercise } from '@/data/exercises';
import { notify } from '@/app/data';

const BACKUP_KEY = 'forma.activeSessionBackup';

export function activeSession(): WorkoutSession | undefined {
  return store.list<WorkoutSession>('sessions').find((s) => s.status === 'active');
}

/** Backup sincrono in localStorage: protegge da chiusure improvvise anche prima che IndexedDB completi la scrittura. */
export function backup(s: WorkoutSession | null) {
  try { s ? localStorage.setItem(BACKUP_KEY, JSON.stringify(s)) : localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
}
export function recoverBackup(): WorkoutSession | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WorkoutSession;
    return s && s.status === 'active' ? s : null;
  } catch { return null; }
}

export function makeSets(n: number, prev: ExerciseLog | null, targetWeight?: number | null): SetLog[] {
  return Array.from({ length: n }, (_, i) => {
    const p = prev?.sets.filter((x) => x.done)[i] ?? prev?.sets.filter((x) => x.done).slice(-1)[0];
    return { uid: uid('s_'), weight: targetWeight ?? p?.weight ?? null, reps: null, rpe: null, rir: null, done: false, type: 'normal' };
  });
}

const PLAN_FALLBACK = { level: 'beginner', injuries: [], age: 0 } as unknown as Profile;
const currentProfile = (): Profile => store.get<Profile>('profile', 'me') ?? PLAN_FALLBACK;

export function exerciseLogFor(exerciseId: string, sessions: WorkoutSession[], opts: { sets?: number; repMin?: number; repMax?: number; restSec?: number; targetWeight?: number | null; notes?: string; cardio?: CardioPlan | null } = {}): ExerciseLog {
  // attività cardio: niente serie, ma piano + timer + valori effettivi
  if (opts.cardio || isCardioId(exerciseId)) {
    const plan = opts.cardio ?? (opts.repMax ? planFromLegacy({ exerciseId, sets: opts.sets ?? 1, repMin: opts.repMin ?? 20, repMax: opts.repMax }, currentProfile()) : defaultPlanFor(exerciseId, currentProfile()));
    return { uid: uid('el_'), exerciseId, restSec: 0, repMin: Math.round(plan.durationMin), repMax: Math.round(plan.durationMin), notes: opts.notes ?? '', sets: [], cardio: logStateFor(plan) };
  }
  const prev = lastPerformance(sessions, exerciseId);
  const e = getExercise(exerciseId);
  const defRest = e?.mechanic === 'isolation' ? 75 : 120;
  return {
    uid: uid('el_'), exerciseId, restSec: opts.restSec ?? defRest, repMin: opts.repMin ?? 8, repMax: opts.repMax ?? 12, notes: opts.notes ?? '',
    sets: makeSets(opts.sets ?? 3, prev, opts.targetWeight),
  };
}

export async function startSession(template: WorkoutTemplate | null, name?: string): Promise<WorkoutSession> {
  const existing = activeSession();
  if (existing) return existing;
  const sessions = store.list<WorkoutSession>('sessions');
  const s: WorkoutSession = {
    id: uid('ses_'), name: name ?? template?.name ?? 'Allenamento libero', templateId: template?.id ?? null,
    startedAt: new Date().toISOString(), endedAt: null, pausedMs: 0, pausedAt: null, status: 'active', notes: '',
    exercises: (template?.exercises ?? []).map((te) => exerciseLogFor(te.exerciseId, sessions, te)),
  };
  backup(s);
  await store.put('sessions', s.id, s);
  return s;
}

export async function saveSession(s: WorkoutSession) {
  backup(s.status === 'active' ? s : null);
  await store.put('sessions', s.id, s);
}

export async function finishSession(s: WorkoutSession): Promise<WorkoutSession> {
  const now = new Date();
  const paused = s.pausedAt ? now.getTime() - new Date(s.pausedAt).getTime() : 0;
  const weightKg = currentProfile().weightKg || 0;
  // rimuovi serie vuote non completate; il cardio avviato ma non chiuso viene registrato con il tempo svolto
  const exercises = s.exercises
    .map((e) => {
      if (!e.cardio) return { ...e, sets: e.sets.filter((x) => x.done || x.reps || x.weight) };
      if (e.cardio.done) return { ...e, cardio: { ...e.cardio, timer: pauseTimer(e.cardio.timer, now.getTime()) } };
      const sec = timerElapsedMs(e.cardio.timer, now.getTime()) / 1000;
      if (sec < 60) return { ...e, cardio: { ...e.cardio, done: false } };
      return { ...e, cardio: { ...e.cardio, timer: pauseTimer(e.cardio.timer, now.getTime()), done: true, actual: actualFromPlan(e.cardio.plan, sec, weightKg) } };
    })
    .filter((e) => (e.cardio ? e.cardio.done && !!e.cardio.actual : e.sets.some((x) => x.done)));
  const ended: WorkoutSession = { ...s, exercises, status: 'completed', endedAt: now.toISOString(), pausedMs: s.pausedMs + paused, pausedAt: null };
  const all = store.list<WorkoutSession>('sessions');
  ended.prs = detectPRs(all, ended);
  await store.put('sessions', ended.id, ended);
  backup(null);
  // progressione automatica del cardio della scheda (es. programmi per principianti)
  const tpl = ended.templateId ? store.get<WorkoutTemplate>('templates', ended.templateId) : undefined;
  if (tpl) {
    const prog = progressTemplateCardio(tpl, [...all.filter((x) => x.id !== ended.id), ended]);
    if (prog) {
      await store.put('templates', tpl.id, { ...prog.template, updatedAt: now.toISOString() });
      notify({ title: 'Cardio: si sale di livello', body: `Hai completato il cardio come previsto: ${prog.changes.join('; ')}.`, kind: 'coach', link: `/workouts/template/${tpl.id}` }, `cardio_prog_${ended.id}`);
    }
  }
  const prNotif = store.get<any>('settings', 'me')?.notifications?.prs !== false;
  for (const pr of prNotif ? ended.prs.slice(0, 3) : []) {
    const ex = getExercise(pr.exerciseId);
    notify({ title: 'Nuovo record personale!', body: `${ex?.name ?? 'Esercizio'}: ${pr.kind === 'weight' ? `${pr.value} kg × ${pr.reps}` : pr.kind === 'e1rm' ? `1RM stimato ${pr.value} kg` : pr.kind === 'reps' ? `${pr.value} ripetizioni` : `volume ${Math.round(pr.value)} kg`}`, kind: 'pr', link: `/session/${ended.id}` }, `pr_${ended.id}_${pr.exerciseId}`);
  }
  return ended;
}

export async function discardSession(s: WorkoutSession) {
  backup(null);
  await store.remove('sessions', s.id);
}
