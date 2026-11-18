/**
 * Motore di analisi locale: progressione intelligente, recupero, costanza, nutrizione e traguardi.
 * Tutte le indicazioni sono prudenti e non sostituiscono professionisti qualificati.
 */
import { getExercise } from '@/data/exercises';
import type { Badge, DiaryEntry, Profile, Program, Settings, Suggestion, WellnessDay, WorkoutSession, WorkoutTemplate, CardioLog, Measurement } from './types';
import { completedSessions, doneSets, sessionStats, exerciseHistory } from './stats';
import { addDays, avg, dayKey, round, startOfWeek, startOfMonth } from './util';
import { computeTargets, totals } from './nutrition';

// ---------------- Progressione ----------------
function increment(exId: string, weight: number): number {
  const e = getExercise(exId);
  if (!e) return 2.5;
  const lower = e.primary.some((m) => ['quads', 'glutes', 'hamstrings'].includes(m));
  if (e.equipment.includes('dumbbell') || e.equipment.includes('kettlebell')) return weight >= 20 ? 2 : 1;
  if (e.mechanic === 'isolation' || e.kind === 'cable') return weight >= 30 ? 2.5 : 1.25;
  if (lower && weight >= 60) return 5;
  return 2.5;
}

export interface ProgressionAdvice { templateId: string; uid: string; exerciseId: string; kind: 'increase' | 'reps' | 'deload' | 'hold'; title: string; body: string; patch?: { targetWeight?: number; repMin?: number; repMax?: number } }

export function progressionAdvice(templates: WorkoutTemplate[], sessions: WorkoutSession[], p: Profile | undefined): ProgressionAdvice[] {
  const out: ProgressionAdvice[] = [];
  const done = completedSessions(sessions);
  for (const t of templates) {
    for (const te of t.exercises) {
      const e = getExercise(te.exerciseId);
      if (!e || e.tracking !== 'weight_reps') continue;
      const recent = done.filter((s) => s.exercises.some((x) => x.exerciseId === te.exerciseId && doneSets(x).length)).slice(-2);
      if (!recent.length) continue;
      const lastLog = recent[recent.length - 1].exercises.find((x) => x.exerciseId === te.exerciseId)!;
      const sets = doneSets(lastLog).filter((s) => s.type !== 'warmup');
      if (!sets.length) continue;
      const topW = Math.max(...sets.map((s) => s.weight ?? 0));
      const work = sets.filter((s) => (s.weight ?? 0) >= topW * 0.97);
      const allTop = work.length >= Math.min(te.sets, 2) && work.every((s) => (s.reps ?? 0) >= te.repMax);
      const hard = work.some((s) => (s.rpe ?? 0) >= 9.5 || (s.rir !== null && s.rir !== undefined && s.rir < 1));
      const missed = work.filter((s) => (s.reps ?? 0) < te.repMin).length >= Math.ceil(work.length / 2);
      const missedBefore = recent.length === 2 && (() => {
        const l = recent[0].exercises.find((x) => x.exerciseId === te.exerciseId);
        const ws = l ? doneSets(l) : [];
        return ws.length > 0 && ws.filter((s) => (s.reps ?? 0) < te.repMin).length >= Math.ceil(ws.length / 2);
      })();
      if (allTop && !hard && topW > 0) {
        const inc = increment(te.exerciseId, topW);
        const nw = round(topW + inc, 2);
        out.push({
          templateId: t.id, uid: te.uid, exerciseId: te.exerciseId, kind: 'increase',
          title: `${e.name}: pronto per +${inc} kg`,
          body: `Nell’ultima sessione hai completato ${work.length} serie a ${topW} kg arrivando al massimo del range (${te.repMax} ripetizioni)${sets.some((s) => s.rpe) ? ' senza arrivare al cedimento' : ''}. Proposta: ${nw} kg ripartendo da ${te.repMin} ripetizioni.`,
          patch: { targetWeight: nw },
        });
      } else if (missed && missedBefore && topW > 0) {
        const nw = round(topW * 0.9, 1);
        out.push({
          templateId: t.id, uid: te.uid, exerciseId: te.exerciseId, kind: 'deload',
          title: `${e.name}: valuta uno scarico`,
          body: `Nelle ultime 2 sessioni sei rimasto sotto le ${te.repMin} ripetizioni. Ridurre il carico del 10% (${nw} kg) per una settimana aiuta a recuperare e ripartire con una tecnica migliore.${p?.level === 'beginner' ? ' Controlla anche sonno e alimentazione.' : ''}`,
          patch: { targetWeight: nw },
        });
      } else if (!allTop && !missed && work.every((s) => (s.reps ?? 0) >= te.repMin)) {
        // nel range: suggerisci di aggiungere ripetizioni (nessuna modifica alla scheda)
      }
    }
  }
  return out;
}

export function adviceToSuggestion(a: ProgressionAdvice): Suggestion {
  return {
    id: `prog_${a.templateId}_${a.uid}_${a.patch?.targetWeight ?? a.kind}`,
    kind: a.kind === 'deload' ? 'deload' : 'progression',
    title: a.title, body: a.body, createdAt: new Date().toISOString(), status: 'pending',
    action: a.patch ? { type: 'update_template_exercise', templateId: a.templateId, uid: a.uid, patch: a.patch } : null,
  };
}

// ---------------- Recupero ----------------
export interface Readiness { score: number | null; label: string; tone: 'good' | 'ok' | 'low' | 'unknown'; factors: string[]; advice: string }

export function readiness(today: WellnessDay | undefined, sessions: WorkoutSession[], sleepGoal = 8, cardio: CardioLog[] = []): Readiness {
  const factors: string[] = [];
  const parts: { w: number; v: number }[] = [];
  if (today?.sleepHours != null) {
    const v = Math.min(1, today.sleepHours / sleepGoal);
    parts.push({ w: 0.3, v: today.sleepQuality ? (v * 0.7 + (today.sleepQuality / 5) * 0.3) : v });
    if (today.sleepHours < sleepGoal - 1.5) factors.push(`Hai dormito ${today.sleepHours} h (obiettivo ${sleepGoal} h)`);
  }
  if (today?.energy != null) { parts.push({ w: 0.2, v: (today.energy - 1) / 4 }); if (today.energy <= 2) factors.push('Energia percepita bassa'); }
  if (today?.stress != null) { parts.push({ w: 0.15, v: 1 - (today.stress - 1) / 4 }); if (today.stress >= 4) factors.push('Stress elevato'); }
  const sore = today?.soreness ? Object.values(today.soreness).filter((x): x is number => typeof x === 'number') : [];
  if (sore.length) {
    const mx = Math.max(...sore);
    parts.push({ w: 0.2, v: 1 - mx / 3 });
    if (mx >= 2) factors.push('Indolenzimento muscolare marcato');
  }
  const last3 = completedSessions(sessions).filter((s) => new Date(s.startedAt) >= addDays(new Date(), -3));
  const card3 = cardio.filter((c) => new Date(c.date) >= addDays(new Date(), -3));
  const load = last3.length + card3.length * 0.5;
  parts.push({ w: 0.15, v: load >= 3 ? 0.3 : load >= 2 ? 0.6 : 1 });
  if (load >= 3) factors.push(`${last3.length} allenamenti negli ultimi 3 giorni`);
  if (parts.length <= 1) return { score: null, label: 'Dati insufficienti', tone: 'unknown', factors: [], advice: 'Registra sonno, energia e indolenzimento per ricevere un’indicazione sul recupero.' };
  const tw = parts.reduce((a, p) => a + p.w, 0);
  const score = Math.round((parts.reduce((a, p) => a + p.w * p.v, 0) / tw) * 100);
  if (score >= 75) return { score, label: 'Buon recupero', tone: 'good', factors, advice: 'Sembri pronto per allenarti come previsto.' };
  if (score >= 50) return { score, label: 'Recupero parziale', tone: 'ok', factors, advice: 'Puoi allenarti: ascolta le sensazioni, riduci un po’ volume o intensità se serve.' };
  return { score, label: 'Recupero basso', tone: 'low', factors, advice: 'Valuta una sessione leggera, mobilità o un giorno di riposo. Se la stanchezza persiste per giorni, parlane con il tuo medico.' };
}

// ---------------- Costanza ----------------
export function weekProgress(sessions: WorkoutSession[], goal: number) {
  const ws = startOfWeek();
  const done = completedSessions(sessions).filter((s) => new Date(s.startedAt) >= ws).length;
  return { done, goal, pct: goal ? Math.min(1, done / goal) : 0 };
}
export function monthProgress(sessions: WorkoutSession[], goal: number) {
  const ms = startOfMonth();
  const done = completedSessions(sessions).filter((s) => new Date(s.startedAt) >= ms).length;
  return { done, goal, pct: goal ? Math.min(1, done / goal) : 0 };
}

// ---------------- Nutrizione ----------------
export function nutritionTrend(diary: DiaryEntry[], days = 7) {
  const out: { date: string; kcal: number; protein: number; carbs: number; fat: number; logged: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(addDays(new Date(), -i));
    const es = diary.filter((d) => d.date === k);
    out.push({ date: k, ...totals(es), logged: es.length > 0 });
  }
  return out;
}

// ---------------- Badge ----------------
export interface BadgeDef { id: string; title: string; desc: string; icon: string; check: (c: BadgeCtx) => boolean }
export interface BadgeCtx { sessions: WorkoutSession[]; diary: DiaryEntry[]; measurements: Measurement[]; cardio: CardioLog[]; wellness: WellnessDay[]; prCount: number; weekStreak: number }

export const BADGES: BadgeDef[] = [
  { id: 'first_workout', title: 'Primo passo', desc: 'Completa il primo allenamento', icon: 'footprints', check: (c) => completedSessions(c.sessions).length >= 1 },
  { id: 'workouts_10', title: 'Abitudine', desc: '10 allenamenti completati', icon: 'repeat', check: (c) => completedSessions(c.sessions).length >= 10 },
  { id: 'workouts_50', title: 'Costanza', desc: '50 allenamenti completati', icon: 'calendar-check', check: (c) => completedSessions(c.sessions).length >= 50 },
  { id: 'workouts_100', title: 'Cento', desc: '100 allenamenti completati', icon: 'medal', check: (c) => completedSessions(c.sessions).length >= 100 },
  { id: 'streak_4', title: 'Un mese di fila', desc: 'Obiettivo settimanale raggiunto per 4 settimane consecutive', icon: 'flame', check: (c) => c.weekStreak >= 4 },
  { id: 'streak_12', title: 'Trimestre solido', desc: '12 settimane consecutive in linea con l’obiettivo', icon: 'flame', check: (c) => c.weekStreak >= 12 },
  { id: 'first_pr', title: 'Nuovo record', desc: 'Stabilisci il primo record personale', icon: 'trophy', check: (c) => c.prCount >= 1 },
  { id: 'pr_10', title: 'Collezionista di record', desc: '10 record personali', icon: 'trophy', check: (c) => c.prCount >= 10 },
  { id: 'volume_10t', title: '10 tonnellate', desc: 'Volume totale sollevato di 10.000 kg', icon: 'weight', check: (c) => completedSessions(c.sessions).reduce((a, s) => a + sessionStats(s).volume, 0) >= 10000 },
  { id: 'volume_100t', title: '100 tonnellate', desc: 'Volume totale sollevato di 100.000 kg', icon: 'weight', check: (c) => completedSessions(c.sessions).reduce((a, s) => a + sessionStats(s).volume, 0) >= 100000 },
  { id: 'food_7', title: 'Diario attento', desc: 'Registra i pasti per 7 giorni diversi', icon: 'utensils', check: (c) => new Set(c.diary.map((d) => d.date)).size >= 7 },
  { id: 'weigh_in_4', title: 'Sotto controllo', desc: '4 misurazioni del peso registrate', icon: 'scale', check: (c) => c.measurements.filter((m) => m.weightKg).length >= 4 },
  { id: 'cardio_10', title: 'Cuore allenato', desc: '10 sessioni di cardio', icon: 'heart-pulse', check: (c) => c.cardio.length >= 10 },
  { id: 'sleep_7', title: 'Riposo di qualità', desc: 'Registra il sonno per 7 giorni', icon: 'moon', check: (c) => c.wellness.filter((w) => w.sleepHours).length >= 7 },
];

export function earnedBadges(ctx: BadgeCtx, already: Badge[]): BadgeDef[] {
  const have = new Set(already.map((b) => b.id));
  return BADGES.filter((b) => !have.has(b.id) && b.check(ctx));
}

export function averageSessionMinutes(sessions: WorkoutSession[]) {
  const d = completedSessions(sessions);
  return d.length ? Math.round(avg(d.map((s) => sessionStats(s).durationMs / 60000))) : 0;
}

export function todaysTemplate(program: Program | undefined, templates: WorkoutTemplate[], date = new Date()) {
  if (!program) return null;
  const idx = (date.getDay() + 6) % 7;
  const tid = program.schedule[idx];
  return tid ? templates.find((t) => t.id === tid) ?? null : null;
}

export function exerciseTrend(sessions: WorkoutSession[], exerciseId: string) {
  const h = exerciseHistory(sessions, exerciseId);
  if (h.length < 2) return null;
  const first = h[0].e1rm, last = h[h.length - 1].e1rm;
  return { first, last, pct: first ? (last - first) / first : 0, points: h.length };
}

export function targetsFor(p: Profile, s: Settings | undefined, program?: Program) {
  const days = program ? program.schedule.filter(Boolean).length : p.daysPerWeek;
  return computeTargets(p, s, days);
}
