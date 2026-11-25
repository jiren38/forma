import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarRange, Trophy, Flame, Clock, CalendarCheck, Dumbbell, TrendingUp, TrendingDown, Scale, Ruler, Camera, History } from 'lucide-react';
import { SectionHero } from '@/design/SectionHero';
import { useProfile, useSessions, useSettings } from '@/app/data';
import { completedSessions, consistencyGrid, exerciseHistory, monthlyCounts, muscleSets, personalRecords, streaks, weeklyCounts } from '@/lib/stats';
import { averageSessionMinutes, exerciseTrend } from '@/lib/insights';
import { Empty, Segmented, Bar } from '@/components/ui';
import { BarChart, Heatmap, LineChart } from '@/components/charts';
import { getExercise } from '@/data/exercises';
import { MUSCLE_LABEL } from '@/lib/labels';
import { fmtN, fmtW, formatShortDate, toDisplayWeight } from '@/lib/util';
import type { MuscleGroup } from '@/lib/types';
import CardioProgress, { useCardioEntries } from './CardioProgress';

type Tab = 'overview' | 'exercises' | 'muscles' | 'cardio' | 'records';

export default function ProgressPage() {
  const sessions = useSessions();
  const settings = useSettings();
  const profile = useProfile();
  const units = settings.units;
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (['overview', 'exercises', 'muscles', 'cardio', 'records'].includes(sp.get('tab') ?? '') ? sp.get('tab') as Tab : 'overview'));
  const done = completedSessions(sessions);
  const cardio = useCardioEntries();

  if (!done.length && !cardio.length) return (
    <div className="page stack"><SectionHero section="progress" compact title="Progressi" desc="Carichi, volumi, record personali e statistiche cardio, calcolati dai tuoi allenamenti."
        actions={<><Link to="/body" className="btn primary"><Scale size={17} /> Peso e misure</Link><Link to="/energy" className="btn"><Flame size={17} /> Bilancio</Link></>} />
      <div className="related five">
        <Link to="/body" style={{ ['--sc' as string]: 'var(--c-progress)' } as React.CSSProperties}><Ruler size={17} /> Misure</Link>
        <Link to="/body?tab=photos" style={{ ['--sc' as string]: 'var(--c-progress)' } as React.CSSProperties}><Camera size={17} /> Foto</Link>
        <Link to="/history" style={{ ['--sc' as string]: 'var(--c-training)' } as React.CSSProperties}><History size={17} /> Storico</Link>
        <Link to="/week" style={{ ['--sc' as string]: 'var(--c-progress)' } as React.CSSProperties}><CalendarRange size={17} /> Settimana</Link>
        <Link to="/goals" style={{ ['--sc' as string]: 'var(--warning)' } as React.CSSProperties}><Trophy size={17} /> Traguardi</Link>
      </div>
      <Empty icon={<BarChart3 />} title="Ancora nessun dato" text="Completa il primo allenamento: grafici, record e statistiche si costruiscono automaticamente dai tuoi dati reali." action={<Link to="/workouts" className="btn primary">Inizia ad allenarti</Link>} />
    </div>
  );

  return (
    <div className="page stack">
      <SectionHero section="progress" compact title="Progressi" desc="Carichi, volumi, record personali e statistiche cardio, calcolati dai tuoi allenamenti."
        actions={<><Link to="/body" className="btn primary"><Scale size={17} /> Peso e misure</Link><Link to="/energy" className="btn"><Flame size={17} /> Bilancio</Link></>} />
      <div className="related five">
        <Link to="/body" style={{ ['--sc' as string]: 'var(--c-progress)' } as React.CSSProperties}><Ruler size={17} /> Misure</Link>
        <Link to="/body?tab=photos" style={{ ['--sc' as string]: 'var(--c-progress)' } as React.CSSProperties}><Camera size={17} /> Foto</Link>
        <Link to="/history" style={{ ['--sc' as string]: 'var(--c-training)' } as React.CSSProperties}><History size={17} /> Storico</Link>
        <Link to="/week" style={{ ['--sc' as string]: 'var(--c-progress)' } as React.CSSProperties}><CalendarRange size={17} /> Settimana</Link>
        <Link to="/goals" style={{ ['--sc' as string]: 'var(--warning)' } as React.CSSProperties}><Trophy size={17} /> Traguardi</Link>
      </div>
      <div className="tabbar" role="tablist">
        {([['overview', 'Panoramica'], ['exercises', 'Esercizi'], ['muscles', 'Muscoli'], ['cardio', 'Cardio'], ['records', 'Record']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'overview' && <Overview sessions={sessions} units={units} goal={settings.weeklyWorkoutGoal ?? profile?.daysPerWeek ?? 3} />}
      {tab === 'exercises' && <Exercises sessions={sessions} units={units} />}
      {tab === 'muscles' && <Muscles sessions={sessions} />}
      {tab === 'cardio' && <CardioProgress />}
      {tab === 'records' && <Records sessions={sessions} units={units} />}
    </div>
  );
}

function Overview({ sessions, units, goal }: { sessions: ReturnType<typeof useSessions>; units: 'kg' | 'lb'; goal: number }) {
  const done = completedSessions(sessions);
  const weeks = weeklyCounts(sessions, 12);
  const months = monthlyCounts(sessions, 6);
  const st = streaks(sessions, goal);
  const avgMin = averageSessionMinutes(sessions);
  const totalPR = done.reduce((a, s) => a + (s.prs?.length ?? 0), 0);
  return (
    <div className="stack">
      <div className="grid-2">
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><CalendarCheck size={13} /> Allenamenti</span><span className="v">{done.length}</span><span className="tiny muted">{st.activeDays} giorni attivi</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Flame size={13} /> Serie di settimane</span><span className="v">{st.weekStreak}</span><span className="tiny muted">con almeno {goal} allenamenti</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Clock size={13} /> Durata media</span><span className="v">{avgMin} min</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Trophy size={13} /> Record</span><span className="v">{totalPR}</span></div></div>
      </div>
      <div className="desk-2">
        <div className="stack">
          <section className="card"><div className="card-title"><h3>Allenamenti a settimana</h3><span className="tiny muted">ultime 12</span></div>
            <BarChart ariaLabel="Allenamenti per settimana" data={weeks.map((w) => ({ label: w.label, value: w.count }))} highlightLast />
          </section>
          <section className="card"><div className="card-title"><h3>Volume settimanale</h3><span className="tiny muted">{units}</span></div>
            <BarChart ariaLabel="Volume per settimana" color="var(--orange)" data={weeks.map((w) => ({ label: w.label, value: toDisplayWeight(w.volume, units) ?? 0, tip: fmtN(toDisplayWeight(w.volume, units) ?? 0) }))} highlightLast format={(v) => (v >= 1000 ? `${fmtN(v / 1000, 1)}k` : fmtN(v))} />
          </section>
        </div>
        <div className="stack">
          <section className="card"><div className="card-title"><h3>Allenamenti al mese</h3></div>
            <BarChart ariaLabel="Allenamenti per mese" color="var(--blue)" data={months.map((m) => ({ label: m.label, value: m.count }))} highlightLast />
          </section>
          <section className="card"><div className="card-title"><h3>Costanza</h3><span className="tiny muted">ultime 16 settimane</span></div>
            <Heatmap grid={consistencyGrid(sessions, 16)} />
            <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: 'var(--surface-3)' }} />Riposo</span><span><i style={{ background: 'var(--accent)' }} />Allenamento</span></div>
          </section>
          <section className="card"><div className="card-title"><h3>Minuti di allenamento</h3><span className="tiny muted">a settimana</span></div>
            <BarChart ariaLabel="Minuti di allenamento per settimana" color="var(--accent)" data={weeks.map((w) => ({ label: w.label, value: Math.round(w.minutes) }))} highlightLast />
          </section>
        </div>
      </div>
    </div>
  );
}

function Exercises({ sessions, units }: { sessions: ReturnType<typeof useSessions>; units: 'kg' | 'lb' }) {
  const ids = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of completedSessions(sessions)) for (const e of s.exercises) if (e.sets.some((x) => x.done)) count.set(e.exerciseId, (count.get(e.exerciseId) ?? 0) + 1);
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => getExercise(id));
  }, [sessions]);
  const [sel, setSel] = useState(ids[0]);
  const [metric, setMetric] = useState<'e1rm' | 'weight' | 'volume' | 'reps'>('e1rm');
  const e = getExercise(sel ?? '');
  const hist = e ? exerciseHistory(sessions, e.id) : [];
  const weighted = e?.tracking === 'weight_reps';
  const trends = ids.map((id) => ({ id, t: exerciseTrend(sessions, id) })).filter((x) => x.t && getExercise(x.id)?.tracking === 'weight_reps').sort((a, b) => b.t!.pct - a.t!.pct);

  return (
    <div className="stack">
      <div className="field"><label htmlFor="exsel">Esercizio</label>
        <select id="exsel" className="select" value={sel} onChange={(ev) => setSel(ev.target.value)}>
          {ids.map((id) => <option key={id} value={id}>{getExercise(id)!.name}</option>)}
        </select>
      </div>
      {e && (
        <section className="card stack-sm">
          <div className="row-between"><Link to={`/exercises/${e.id}`}><h3>{e.name}</h3></Link><span className="tiny muted">{hist.length} sessioni</span></div>
          {weighted && <Segmented label="Metrica" value={metric} onChange={setMetric} options={[{ value: 'e1rm', label: '1RM st.' }, { value: 'weight', label: 'Carico max' }, { value: 'volume', label: 'Volume' }, { value: 'reps', label: 'Rip. totali' }]} />}
          {hist.length >= 2 ? (
            <LineChart ariaLabel={`Progressione ${e.name}`} format={(v) => fmtN(v, 1)} points={hist.map((h) => ({
              x: new Date(h.date).getTime(), label: formatShortDate(h.date),
              y: !weighted || metric === 'reps' ? h.totalReps : metric === 'e1rm' ? toDisplayWeight(h.e1rm, units)! : metric === 'weight' ? toDisplayWeight(h.bestWeight, units)! : toDisplayWeight(h.volume, units)!,
            }))} />
          ) : <p className="small muted">Servono almeno 2 sessioni con questo esercizio per mostrare il grafico.</p>}
          <div className="settings-group">
            {[...hist].reverse().slice(0, 8).map((h) => (
              <Link key={h.sessionId} to={`/session/${h.sessionId}`} className="list-item"><span className="grow"><div className="li-title">{formatShortDate(h.date)}</div><div className="li-sub">{h.sets} serie · {h.totalReps} {e.tracking === 'time' ? 's' : 'rip.'}{weighted ? ` · migliore ${fmtW(h.bestWeight, units)} × ${h.bestReps} · 1RM st. ${fmtW(h.e1rm, units)}` : ''}</div></span></Link>
            ))}
          </div>
        </section>
      )}
      {trends.length > 0 && (
        <section className="card">
          <div className="card-title"><h3>Evoluzione della forza</h3><span className="tiny muted">1RM stimato, prima vs ultima</span></div>
          <div className="stack-sm">
            {trends.slice(0, 10).map(({ id, t }) => (
              <button key={id} className="row-between small" style={{ background: 'none', border: 0, color: 'inherit', padding: '4px 0', cursor: 'pointer', textAlign: 'left' }} onClick={() => setSel(id)}>
                <span className="grow ellipsis" style={{ fontWeight: 600 }}>{getExercise(id)!.name}</span>
                <span className="muted tiny" style={{ marginRight: 10 }}>{fmtW(t!.first, units)} → {fmtW(t!.last, units)}</span>
                <span className="row" style={{ gap: 2, color: t!.pct >= 0 ? 'var(--success)' : 'var(--orange)', fontWeight: 700 }}>{t!.pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{t!.pct >= 0 ? '+' : ''}{Math.round(t!.pct * 100)}%</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Muscles({ sessions }: { sessions: ReturnType<typeof useSessions> }) {
  const [days, setDays] = useState<7 | 30>(7);
  const m = muscleSets(sessions, days);
  const rows = (Object.entries(m) as [MuscleGroup, number][]).filter(([k]) => k !== 'cardio' && k !== 'full_body').sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="stack">
      <Segmented label="Periodo" value={days} onChange={setDays} options={[{ value: 7, label: 'Ultimi 7 giorni' }, { value: 30, label: 'Ultimi 30 giorni' }]} />
      <section className="card">
        <div className="card-title"><h3><Dumbbell size={18} /> Serie per muscolo</h3></div>
        {rows.length === 0 ? <p className="small muted">Nessun allenamento nel periodo selezionato.</p> : (
          <div className="muscle-bars">
            {rows.map(([k, v]) => (
              <div key={k} className="mb"><span className="ellipsis">{MUSCLE_LABEL[k]}</span><Bar value={v} max={max} /><b className="num" style={{ textAlign: 'right' }}>{fmtN(v, 1)}</b></div>
            ))}
          </div>
        )}
        <p className="hint" style={{ marginTop: 12 }}>Muscoli principali contano 1 serie, secondari 0,5. {days === 7 ? 'Come riferimento generale, molte persone progrediscono con circa 10-20 serie settimanali per gruppo muscolare.' : ''}</p>
      </section>
    </div>
  );
}

function Records({ sessions, units }: { sessions: ReturnType<typeof useSessions>; units: 'kg' | 'lb' }) {
  const ids = Array.from(new Set(completedSessions(sessions).flatMap((s) => s.exercises.filter((e) => e.sets.some((x) => x.done)).map((e) => e.exerciseId)))).filter((id) => getExercise(id));
  const recent = completedSessions(sessions).flatMap((s) => (s.prs ?? []).map((p) => ({ ...p, name: s.name }))).reverse().slice(0, 15);
  return (
    <div className="stack">
      {recent.length > 0 && (
        <section className="card">
          <div className="card-title"><h3><Trophy size={18} color="#ffb020" /> Record recenti</h3></div>
          <div className="stack-sm">
            {recent.map((p, i) => (
              <Link key={i} to={`/session/${p.sessionId}`} className="row-between small"><span className="ellipsis" style={{ fontWeight: 600 }}>{getExercise(p.exerciseId)?.name}</span><span className="row" style={{ gap: 8 }}><span className="tiny muted">{formatShortDate(p.date)}</span><span className="pr-badge">{p.kind === 'weight' ? `${fmtW(p.value, units)} × ${p.reps}` : p.kind === 'e1rm' ? `1RM ${fmtW(p.value, units)}` : p.kind === 'reps' ? `${p.value} rip.` : `vol. ${fmtW(p.value, units)}`}</span></span></Link>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <div className="card-title"><h3>Migliori prestazioni per esercizio</h3></div>
        <div className="settings-group" style={{ border: 0, padding: 0 }}>
          {ids.map((id) => {
            const e = getExercise(id)!;
            const pr = personalRecords(sessions, id);
            return (
              <Link key={id} to={`/exercises/${id}`} className="list-item">
                <span className="grow" style={{ minWidth: 0 }}><div className="li-title ellipsis">{e.name}</div>
                  <div className="li-sub">{e.tracking === 'weight_reps' ? `Max ${fmtW(pr.weight?.value, units)} × ${pr.weight?.reps ?? 0} · 1RM st. ${fmtW(pr.e1rm?.value, units)}` : `Max ${pr.reps?.value ?? 0} ${e.tracking === 'time' ? 's' : 'rip.'}`}</div></span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
