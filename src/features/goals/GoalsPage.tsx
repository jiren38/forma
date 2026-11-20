import { Link } from 'react-router-dom';
import { type LucideIcon, Footprints, Repeat, CalendarCheck, Medal, Flame, Trophy, Weight, Utensils, Scale, HeartPulse, Moon, Target, Lock } from 'lucide-react';
import { useBadges, useMeasurements, useProfile, useSessions, useSettings, patchSettings } from '@/app/data';
import { BADGES, monthProgress, weekProgress } from '@/lib/insights';
import { completedSessions, streaks } from '@/lib/stats';
import { PageHeader, Ring, Stepper, Bar } from '@/components/ui';
import { fmtW, formatShortDate } from '@/lib/util';

const ICONS: Record<string, LucideIcon> = {
  footprints: Footprints, repeat: Repeat, 'calendar-check': CalendarCheck, medal: Medal, flame: Flame, trophy: Trophy,
  weight: Weight, utensils: Utensils, scale: Scale, 'heart-pulse': HeartPulse, moon: Moon,
};

export default function GoalsPage() {
  const profile = useProfile()!;
  const settings = useSettings();
  const sessions = useSessions();
  const badges = useBadges();
  const ms = useMeasurements().filter((m) => m.weightKg).sort((a, b) => a.date.localeCompare(b.date));
  const wGoal = settings.weeklyWorkoutGoal ?? profile.daysPerWeek;
  const mGoal = settings.monthlyWorkoutGoal ?? wGoal * 4;
  const wk = weekProgress(sessions, wGoal);
  const mo = monthProgress(sessions, mGoal);
  const st = streaks(sessions, wGoal);
  const earned = new Map(badges.map((b) => [b.id, b]));
  const startW = ms[0]?.weightKg ?? profile.weightKg;
  const curW = ms[ms.length - 1]?.weightKg ?? profile.weightKg;
  const span = profile.targetWeightKg - startW;
  const pct = Math.abs(span) < 0.1 ? 1 : Math.max(0, Math.min(1, (curW - startW) / span));
  const totalPR = completedSessions(sessions).reduce((a, s) => a + (s.prs?.length ?? 0), 0);

  return (
    <div className="page stack">
      <PageHeader title="Obiettivi e traguardi" back />
      <div className="grid-2 goals-grid">
        <section className="card col" style={{ alignItems: 'center', gap: 10 }}>
          <Ring value={wk.done} max={wGoal} size={110} stroke={10}><div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{wk.done}<span className="muted" style={{ fontSize: 15 }}>/{wGoal}</span></div></Ring>
          <b className="small">Questa settimana</b>
          <Stepper value={wGoal} min={1} max={7} onChange={(v) => patchSettings({ weeklyWorkoutGoal: v, monthlyWorkoutGoal: Math.max(settings.monthlyWorkoutGoal ?? 0, v * 4) })} format={(v) => `${v} / sett.`} />
        </section>
        <section className="card col" style={{ alignItems: 'center', gap: 10 }}>
          <Ring value={mo.done} max={mGoal} size={110} stroke={10} color="var(--blue)"><div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{mo.done}<span className="muted" style={{ fontSize: 15 }}>/{mGoal}</span></div></Ring>
          <b className="small">Questo mese</b>
          <Stepper value={mGoal} min={1} max={31} onChange={(v) => patchSettings({ monthlyWorkoutGoal: v })} format={(v) => `${v} / mese`} />
        </section>
      </div>
      <div className="grid-3">
        <div className="stat-tile"><div className="stat"><span className="l">Settimane di fila</span><span className="v">{st.weekStreak}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l">Giorni attivi</span><span className="v">{st.activeDays}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l">Record</span><span className="v">{totalPR}</span></div></div>
      </div>
      <section className="card">
        <div className="card-title"><h3><Target size={18} /> Obiettivo di peso</h3><Link to="/profile/edit" className="link">Modifica</Link></div>
        <div className="row-between small"><span>Partenza {fmtW(startW, settings.units)}</span><b>Attuale {fmtW(curW, settings.units)}</b><span>Obiettivo {fmtW(profile.targetWeightKg, settings.units)}</span></div>
        <div style={{ marginTop: 8 }}><Bar value={pct * 100} max={100} /></div>
        <div className="tiny muted" style={{ marginTop: 6 }}>{Math.round(pct * 100)}% del percorso · <Link to="/body" className="accent">registra il peso</Link></div>
      </section>

      <div className="section-title">Traguardi · {badges.length}/{BADGES.length}</div>
      <div className="badge-grid">
        {BADGES.map((b) => {
          const e = earned.get(b.id);
          const Icon = ICONS[b.icon] ?? Medal;
          return (
            <div key={b.id} className={`badge-card ${e ? 'on' : ''}`} aria-label={`${b.title}: ${e ? 'ottenuto' : 'da sbloccare'}`}>
              <div className="bi">{e ? <Icon size={22} /> : <Lock size={18} />}</div>
              <b className="small">{b.title}</b>
              <span className="tiny muted">{b.desc}</span>
              {e && <span className="tiny accent">{formatShortDate(e.earnedAt)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
