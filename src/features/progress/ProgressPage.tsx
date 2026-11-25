import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarRange, Trophy, Flame, Clock, CalendarCheck, Dumbbell, TrendingUp, TrendingDown, Scale, Ruler, Camera, History } from 'lucide-react';
import { SectionHero } from '@/design/SectionHero';
import { useProfile, useSessions, useSettings } from '@/app/data';
import { completedSessions, consistencyGrid, exerciseHistory, monthlyCounts, muscleSets, streaks, weeklyCounts } from '@/lib/stats';
import { recentRecords, recordBook, recordDeltaText, recordValueText, recordsPerMonth } from '@/lib/records';
import { averageSessionMinutes, exerciseTrend } from '@/lib/insights';
import { Empty, Segmented, Bar } from '@/components/ui';
import { BarChart, Heatmap, LineChart } from '@/components/charts';
import { getExercise } from '@/data/exercises';
import { MUSCLE_LABEL } from '@/lib/labels';
import { addDays, fmtN, fmtW, formatShortDate, toDisplayWeight } from '@/lib/util';
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
  const fw = (kg: number) => fmtW(kg, units);
  const [sort, setSort] = useState<'recent' | 'strength'>('recent');
  const done = completedSessions(sessions);
  const recent = recentRecords(sessions, 40);
  const since30 = addDays(new Date(), -30).toISOString();
  const last30 = done.filter((s) => s.startedAt >= since30).reduce((a, s) => a + (s.prs?.length ?? 0), 0);
  const total = done.reduce((a, s) => a + (s.prs?.length ?? 0), 0);
  const months = recordsPerMonth(sessions, 6);
  const [showAll, setShowAll] = useState(false);
  const books = useMemo(() => {
    const ids = Array.from(new Set(done.flatMap((s) => s.exercises.filter((e) => !e.cardio && e.sets.some((x) => x.done && x.type !== 'warmup')).map((e) => e.exerciseId)))).filter((id) => getExercise(id));
    return ids.map((id) => {
      const b = recordBook(sessions, id);
      const lastPr = recent.find((p) => p.exerciseId === id);
      return { id, b, last: lastPr?.date ?? '', e1: b.e1rm?.value ?? 0 };
    });
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = [...books].sort((x, y) => (sort === 'recent' ? y.last.localeCompare(x.last) || y.e1 - x.e1 : y.e1 - x.e1));
  return (
    <div className="stack">
      <div className="rec-hero">
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Trophy size={13} /> Record totali</span><span className="v">{total}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l">Ultimi 30 giorni</span><span className="v">{last30}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l">Esercizi monitorati</span><span className="v">{books.length}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l">Ultimo record</span><span className="v" style={{ fontSize: 20 }}>{recent[0] ? formatShortDate(recent[0].date) : '–'}</span>{recent[0] && <span className="tiny muted ellipsis">{getExercise(recent[0].exerciseId)?.name}</span>}</div></div>
      </div>
      <div className="desk-2">
        <div className="stack">
          <section className="card">
            <div className="card-title"><h3><Trophy size={18} color="#ffb020" /> Record recenti</h3></div>
            {recent.length === 0 ? <p className="small muted">I record compaiono dalla seconda volta che esegui un esercizio, quando superi il tuo miglior carico, il 1RM stimato o le ripetizioni a un certo carico.</p> : (
              <div>
                {(showAll ? recent : recent.slice(0, 8)).map((p, i) => {
                  const d = recordDeltaText(p, fw);
                  return (
                    <Link key={i} to={`/exercises/${p.exerciseId}?tab=progress`} className="rec-row">
                      <span className="rr-ic"><Trophy size={16} /></span>
                      <span className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 650 }}>{getExercise(p.exerciseId)?.name}</div><div className="tiny muted ellipsis">{recordValueText(p, fw)} · {formatShortDate(p.date)}</div></span>
                      {d && <span className="rr-delta">{d}</span>}
                    </Link>
                  );
                })}
                {recent.length > 8 && <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostra meno' : `Mostra tutti (${recent.length})`}</button>}
              </div>
            )}
          </section>
          <section className="card"><div className="card-title"><h3>Record al mese</h3><span className="tiny muted">ultimi 6 mesi</span></div>
            <BarChart ariaLabel="Record personali per mese" color="#ffb020" data={months.map((m) => ({ label: m.label, value: m.count }))} highlightLast />
          </section>
        </div>
        <section className="card">
          <div className="card-title"><h3>Massimali per esercizio</h3></div>
          <Segmented label="Ordina" value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Record recenti' }, { value: 'strength', label: '1RM più alto' }]} />
          <div style={{ marginTop: 8 }}>
            {sorted.map(({ id, b }) => {
              const e = getExercise(id)!;
              const weighted = e.tracking === 'weight_reps';
              return (
                <Link key={id} to={`/exercises/${id}?tab=progress`} className="rec-row">
                  <span className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 650 }}>{e.name}</div>
                    <div className="tiny muted ellipsis">{weighted ? `Max ${fw(b.weight?.value ?? 0)} × ${b.weight?.reps ?? 0}${b.rm[5] ? ` · 5RM ${fw(b.rm[5]!.value)}` : ''}` : e.tracking === 'time' ? `Max ${b.time?.value ?? 0} s` : `Max ${b.reps?.value ?? 0} ripetizioni`}</div></span>
                  {weighted && b.e1rm && <span className="num" style={{ textAlign: 'right' }}><b>{fw(b.e1rm.value)}</b><div className="tiny muted">1RM st.</div></span>}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
