/**
 * Attività in background mentre l'app è aperta: traguardi, suggerimenti di progressione,
 * promemoria e riepiloghi settimanali. Le notifiche di sistema richiedono il permesso del browser.
 */
import { useEffect, useRef } from 'react';
import { store } from '@/db/store';
import {
  notify, patchMeta, useActiveProgram, useBadges, useCardio, useDiary, useMeasurements, useMeta, useSessions, useSettings, useSuggestions,
  useTemplates, useWellness,
} from './data';
import { BADGES, adviceToSuggestion, earnedBadges, progressionAdvice } from '@/lib/insights';
import { completedSessions, streaks } from '@/lib/stats';
import { dayKey, weekdayIdx, fmtN } from '@/lib/util';
import { recapFresh, recapNotificationBody, recapWeekStart, weeklyRecap } from '@/lib/weekly';
import { useProfile } from './data';
import { backup, recoverBackup } from '@/features/workouts/session';
import type { WorkoutSession } from '@/lib/types';

export function Background() {
  const sessions = useSessions();
  const templates = useTemplates();
  const program = useActiveProgram();
  const badges = useBadges();
  const diary = useDiary();
  const measurements = useMeasurements();
  const cardio = useCardio();
  const wellness = useWellness();
  const suggestions = useSuggestions();
  const settings = useSettings();
  const meta = useMeta();
  const profile = useProfile();
  const done = completedSessions(sessions);
  const doneCount = done.length;

  // Ripristino sessione attiva dal backup sincrono (chiusura improvvisa prima della scrittura su IndexedDB)
  useEffect(() => {
    if (!store.ready) return;
    const b = recoverBackup();
    if (!b) return;
    const cur = store.get<WorkoutSession>('sessions', b.id);
    if (!cur) store.put('sessions', b.id, b);
    else if (cur.status !== 'active') backup(null);
  }, []);

  // Traguardi
  useEffect(() => {
    if (!store.ready) return;
    const prCount = done.reduce((a, s) => a + (s.prs?.length ?? 0), 0);
    const goal = settings.weeklyWorkoutGoal ?? profile?.daysPerWeek ?? 3;
    const ctx = { sessions, diary, measurements, cardio, wellness, prCount, weekStreak: streaks(sessions, goal).weekStreak };
    for (const b of earnedBadges(ctx, badges)) {
      store.put('badges', b.id, { id: b.id, earnedAt: new Date().toISOString() });
      notify({ title: `Traguardo sbloccato: ${b.title}`, body: b.desc, kind: 'badge', link: '/goals' }, `badge_${b.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount, diary.length, measurements.length, cardio.length, wellness.length]);

  // Progressione intelligente: crea suggerimenti (mai modifiche automatiche)
  useEffect(() => {
    if (!store.ready || !program) return;
    const tpls = templates.filter((t) => program.schedule.includes(t.id));
    const existing = new Set(suggestions.map((s) => s.id));
    for (const a of progressionAdvice(tpls, sessions, profile)) {
      const s = adviceToSuggestion(a);
      if (existing.has(s.id)) continue;
      // non riproporre se la scheda ha già quel carico
      const te = tpls.find((t) => t.id === a.templateId)?.exercises.find((x) => x.uid === a.uid);
      if (te && a.patch?.targetWeight && te.targetWeight && te.targetWeight >= a.patch.targetWeight && a.kind === 'increase') continue;
      store.put('suggestions', s.id, s);
      notify({ title: 'Nuovo suggerimento del coach', body: s.title, kind: 'coach', link: '/coach' }, `ntf_${s.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount, program?.id]);

  // Promemoria (controllo ogni minuto)
  const ref = useRef({ settings, meta, program, sessions, wellness, measurements, profile, templates, diary, cardio });
  ref.current = { settings, meta, program, sessions, wellness, measurements, profile, templates, diary, cardio };
  useEffect(() => {
    const tick = () => {
      if (!store.ready) return;
      const { settings: s, meta: m, program: p, sessions: ss, wellness: ws, measurements: ms, profile: pf, templates: tp, diary: dy, cardio: cd } = ref.current;
      const now = new Date();
      const today = dayKey(now);
      const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const last = { ...(m.lastReminder ?? {}) };
      let changed = false;
      const fire = (key: string, period: string, n: Parameters<typeof notify>[0]) => {
        if (last[key] === period) return;
        last[key] = period; changed = true;
        notify(n, `rem_${key}_${period}`);
      };
      const trainedToday = completedSessions(ss).some((x) => dayKey(x.startedAt) === today);
      const scheduled = p?.schedule[weekdayIdx(now)];
      if (s.notifications.workout && scheduled && !trainedToday && hm >= s.notifications.workoutTime) {
        fire('workout', today, { title: 'Allenamento di oggi', body: 'È in programma una sessione: quando sei pronto premi “Inizia allenamento”.', kind: 'reminder', link: '/' });
      }
      if (s.notifications.restDays && p && !scheduled && hm >= '09:00') {
        fire('rest', today, { title: 'Giorno di riposo', body: 'Oggi recupero: un po’ di mobilità, idratazione e sonno di qualità aiutano i progressi.', kind: 'reminder', link: '/wellness' });
      }
      if (s.notifications.weight && weekdayIdx(now) === s.notifications.weightDay && hm >= '08:00') {
        const weighedToday = ms.some((x) => x.date === today && x.weightKg);
        if (!weighedToday) fire('weight', today, { title: 'Registra il peso', body: 'Pesati al mattino, a digiuno, per un confronto affidabile.', kind: 'reminder', link: '/body' });
      }
      if (s.notifications.water && hm >= s.notifications.waterFrom && hm <= s.notifications.waterTo) {
        const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / Math.max(30, s.notifications.waterEveryMin));
        const w = ws.find((x) => x.date === today);
        if ((w?.waterMl ?? 0) < s.waterGoalMl) fire('water', `${today}_${slot}`, { title: 'Bevi un bicchiere d’acqua', body: `Oggi: ${fmtN(w?.waterMl ?? 0)} / ${fmtN(s.waterGoalMl)} ml`, kind: 'reminder', link: '/wellness' });
      }
      // Riepilogo settimanale: domenica dalle 18 (o lunedì e martedì, se l'app non era aperta), una volta per settimana
      if (s.notifications.weeklySummary && pf && recapFresh(now)) {
        const start = recapWeekStart(now);
        const wk = dayKey(start);
        if (last.summary !== wk) {
          const r = weeklyRecap({ now, profile: pf, settings: s, program: p, templates: tp, sessions: ss, cardio: cd, diary: dy, wellness: ws, measurements: ms }, start);
          if (r.cur.hasData) fire('summary', wk, { title: `Riepilogo settimanale · ${r.cur.range.label}`, body: recapNotificationBody(r), kind: 'summary', link: `/week?w=${wk}` });
        }
      }
      if (changed) patchMeta({ lastReminder: last });
    };
    const t = setInterval(tick, 60_000);
    const first = setTimeout(tick, 4000);
    return () => { clearInterval(t); clearTimeout(first); };
  }, []);

  return null;
}

export { BADGES };
