/** Gestione della sessione di allenamento: avvio, salvataggio continuo, ripresa e chiusura. */
import { store } from '@/db/store';
import type { BlockWeek, CardioPlan, ExerciseLog, LoadTarget, Profile, Program, SessionBlockInfo, Settings, SetLog, WorkoutSession, WorkoutTemplate } from '@/lib/types';
import { planNextLoad } from '@/lib/progression';
import { activeWeek, sessionBlockInfo, weekCardio, weekSets } from '@/lib/periodization';
import { liveMachineSummary } from '@/lib/ble/ftms';
import { actualFromPlan, applyMachineData, defaultPlanFor, isCardioId, logStateFor, pauseTimer, planFromLegacy, progressTemplateCardio, timerElapsedMs } from '@/lib/cardio';
import { detectPRs, lastPerformance } from '@/lib/stats';
import { fmtW, uid } from '@/lib/util';
import { recordDeltaText, recordValueText } from '@/lib/records';
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

export function makeSets(n: number, prev: ExerciseLog | null, targetWeight?: number | null, auto = false): SetLog[] {
  return Array.from({ length: n }, (_, i) => {
    const p = prev?.sets.filter((x) => x.done)[i] ?? prev?.sets.filter((x) => x.done).slice(-1)[0];
    const weight = targetWeight ?? p?.weight ?? null;
    return { uid: uid('s_'), weight, reps: null, rpe: null, rir: null, done: false, type: 'normal', ...(auto && weight != null ? { auto: true } : {}) };
  });
}

const PLAN_FALLBACK = { level: 'beginner', injuries: [], age: 0 } as unknown as Profile;
const currentProfile = (): Profile => store.get<Profile>('profile', 'me') ?? PLAN_FALLBACK;

/** Preferenze di progressione (attive se non disattivate nelle impostazioni). */
export function trainingPrefs(s?: Settings | null) {
  const t = (s ?? store.get<Settings>('settings', 'me'))?.training;
  return { autoProgression: t?.autoProgression !== false, liveAdjust: t?.liveAdjust !== false };
}

export interface LogOptions { sets?: number; repMin?: number; repMax?: number; restSec?: number; targetWeight?: number | null; notes?: string; cardio?: CardioPlan | null; week?: BlockWeek | null }

export function exerciseLogFor(exerciseId: string, sessions: WorkoutSession[], opts: LogOptions = {}): ExerciseLog {
  // attività cardio: niente serie, ma piano + timer + valori effettivi
  if (opts.cardio || isCardioId(exerciseId)) {
    const base = opts.cardio ?? (opts.repMax ? planFromLegacy({ exerciseId, sets: opts.sets ?? 1, repMin: opts.repMin ?? 20, repMax: opts.repMax }, currentProfile()) : defaultPlanFor(exerciseId, currentProfile()));
    const plan = weekCardio(base, opts.week);
    return { uid: uid('el_'), exerciseId, restSec: 0, repMin: Math.round(plan.durationMin), repMax: Math.round(plan.durationMin), notes: opts.notes ?? '', sets: [], cardio: logStateFor(plan) };
  }
  const prev = lastPerformance(sessions, exerciseId);
  const e = getExercise(exerciseId);
  const defRest = e?.mechanic === 'isolation' ? 75 : 120;
  const repMin = opts.repMin ?? 8, repMax = opts.repMax ?? 12;
  const nSets = weekSets(opts.sets ?? 3, opts.week, exerciseId);
  // progressione automatica: carico, range e RIR proposti in base allo storico e alla settimana del programma
  let target: LoadTarget | null = null;
  if (trainingPrefs().autoProgression) {
    const settings = store.get<Settings>('settings', 'me');
    target = planNextLoad({ exerciseId, sessions, repMin, repMax, units: settings?.units ?? 'kg', profile: currentProfile(), week: opts.week, templateWeight: opts.targetWeight });
  }
  const weight = target ? target.weight : opts.targetWeight;
  return {
    uid: uid('el_'), exerciseId, restSec: opts.restSec ?? defRest, repMin: target?.repMin ?? repMin, repMax: target?.repMax ?? repMax, notes: opts.notes ?? '',
    sets: makeSets(nSets, prev, weight, !!target), target,
  };
}

/** Settimana del programma attivo valida per la scheda (se il programma è a più settimane). */
export function blockFor(template: WorkoutTemplate | null): { week: BlockWeek; info: SessionBlockInfo } | null {
  if (!template) return null;
  const program = store.list<Program>('programs').find((p) => p.active && p.block && p.schedule.includes(template.id));
  const pos = activeWeek(program);
  if (!program || !pos) return null;
  return { week: pos.info, info: sessionBlockInfo(program, pos) };
}

export async function startSession(template: WorkoutTemplate | null, name?: string): Promise<WorkoutSession> {
  const existing = activeSession();
  if (existing) return existing;
  const sessions = store.list<WorkoutSession>('sessions');
  const block = blockFor(template);
  const s: WorkoutSession = {
    id: uid('ses_'), name: name ?? template?.name ?? 'Allenamento libero', templateId: template?.id ?? null,
    startedAt: new Date().toISOString(), endedAt: null, pausedMs: 0, pausedAt: null, status: 'active', notes: '',
    exercises: (template?.exercises ?? []).map((te) => exerciseLogFor(te.exerciseId, sessions, { ...te, week: block?.week })),
    block: block?.info ?? null,
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
      // dati dell'attrezzo Bluetooth: quelli dal vivo se è ancora collegato, altrimenti l'ultimo riepilogo salvato
      const machine = liveMachineSummary(e.uid) ?? e.cardio.machine ?? null;
      const sec = timerElapsedMs(e.cardio.timer, now.getTime()) / 1000;
      if (sec < 60 && !(machine && machine.movingSec >= 60)) return { ...e, cardio: { ...e.cardio, done: false } };
      const actual = applyMachineData(actualFromPlan(e.cardio.plan, sec, weightKg), e.cardio.plan, machine, weightKg);
      return { ...e, cardio: { ...e.cardio, machine, timer: pauseTimer(e.cardio.timer, now.getTime()), done: true, actual } };
    })
    .filter((e) => (e.cardio ? e.cardio.done && !!e.cardio.actual : e.sets.some((x) => x.done)));
  const ended: WorkoutSession = { ...s, exercises, status: 'completed', endedAt: now.toISOString(), pausedMs: s.pausedMs + paused, pausedAt: null };
  const all = store.list<WorkoutSession>('sessions');
  ended.prs = detectPRs(all, ended);
  await store.put('sessions', ended.id, ended);
  backup(null);
  // progressione automatica del cardio della scheda (es. programmi per principianti)
  const tpl = ended.templateId ? store.get<WorkoutTemplate>('templates', ended.templateId) : undefined;
  if (tpl && ended.block?.kind !== 'deload') {
    const prog = progressTemplateCardio(tpl, [...all.filter((x) => x.id !== ended.id), ended]);
    if (prog) {
      await store.put('templates', tpl.id, { ...prog.template, updatedAt: now.toISOString() });
      notify({ title: 'Cardio: si sale di livello', body: `Hai completato il cardio come previsto: ${prog.changes.join('; ')}.`, kind: 'coach', link: `/workouts/template/${tpl.id}` }, `cardio_prog_${ended.id}`);
    }
  }
  const prNotif = store.get<any>('settings', 'me')?.notifications?.prs !== false;
  for (const pr of prNotif ? ended.prs.slice(0, 3) : []) {
    const ex = getExercise(pr.exerciseId);
    const units = store.get<Settings>('settings', 'me')?.units ?? 'kg';
    const fw = (kg: number) => fmtW(kg, units);
    const delta = recordDeltaText(pr, fw);
    notify({ title: 'Nuovo record personale!', body: `${ex?.name ?? 'Esercizio'}: ${recordValueText(pr, fw)}${delta ? ` (${delta})` : ''}`, kind: 'pr', link: `/exercises/${pr.exerciseId}?tab=progress` }, `pr_${ended.id}_${pr.exerciseId}`);
  }
  return ended;
}

export async function discardSession(s: WorkoutSession) {
  backup(null);
  await store.remove('sessions', s.id);
}
