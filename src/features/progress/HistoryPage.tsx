import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Dumbbell, History, TrendingUp, Bike } from 'lucide-react';
import { useCardio, useSessions, useSettings } from '@/app/data';
import { completedSessions, sessionStats } from '@/lib/stats';
import { PageHeader, SearchInput, Empty, Segmented } from '@/components/ui';
import { formatDuration, formatShortDate, fmtW, normalize, sum } from '@/lib/util';
import { CARDIO_INFO } from '@/lib/labels';
import { getExercise } from '@/data/exercises';

export default function HistoryPage() {
  const sessions = useSessions();
  const cardio = useCardio();
  const units = useSettings().units;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'gym' | 'cardio'>('all');

  const items = useMemo(() => {
    const n = normalize(q.trim());
    const w = completedSessions(sessions).filter((s) => !n || normalize(`${s.name} ${s.exercises.map((e) => getExercise(e.exerciseId)?.name ?? '').join(' ')}`).includes(n))
      .map((s) => ({ type: 'gym' as const, date: s.startedAt, s }));
    const c = cardio.filter((x) => !n || normalize(`${CARDIO_INFO[x.type].label} ${x.label ?? ''}`).includes(n)).map((x) => ({ type: 'cardio' as const, date: `${x.date}T12:00:00`, c: x }));
    const all = [...(kind !== 'cardio' ? w : []), ...(kind !== 'gym' ? c : [])].sort((a, b) => b.date.localeCompare(a.date));
    const groups = new Map<string, typeof all>();
    for (const it of all) {
      const d = new Date(it.date);
      const k = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it);
    }
    return Array.from(groups.entries());
  }, [sessions, cardio, q, kind]);

  return (
    <div className="page stack">
      <PageHeader title="Storico" back right={<Link to="/progress" className="icon-btn" aria-label="Progressi"><TrendingUp size={20} /></Link>} />
      <SearchInput value={q} onChange={setQ} placeholder="Cerca per nome o esercizio" />
      <Segmented label="Tipo" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Tutto' }, { value: 'gym', label: 'Allenamenti' }, { value: 'cardio', label: 'Cardio' }]} />
      {items.length === 0 ? <Empty icon={<History />} title={q ? 'Nessun risultato' : 'Storico vuoto'} text={q ? 'Prova un altro termine.' : 'Gli allenamenti e le sessioni cardio completate compariranno qui.'} action={!q ? <Link to="/workouts" className="btn primary">Vai agli allenamenti</Link> : undefined} /> : items.map(([month, list]) => {
        const gym = list.filter((x) => x.type === 'gym');
        const vol = sum(gym.map((x) => (x.type === 'gym' ? sessionStats(x.s).volume : 0)));
        return (
          <section key={month}>
            <div className="section-title"><span style={{ textTransform: 'capitalize' }}>{month}</span><span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{gym.length} allenam. · {fmtW(vol, units)}</span></div>
            <div className="settings-group">
              {list.map((it) => it.type === 'gym' ? (() => {
                const st = sessionStats(it.s);
                return (
                  <Link key={it.s.id} to={`/session/${it.s.id}`} className="list-item">
                    <span className="li-icon"><Dumbbell size={18} /></span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <div className="li-title ellipsis">{it.s.name}</div>
                      <div className="li-sub">{formatShortDate(it.s.startedAt)} · {formatDuration(st.durationMs)} · {st.exercises} esercizi · {st.sets} serie · {fmtW(st.volume, units)}</div>
                    </span>
                    {!!it.s.prs?.length && <span className="pr-badge">{it.s.prs.length} PR</span>}
                    <ChevronRight size={18} className="muted" />
                  </Link>
                );
              })() : (
                <Link key={it.c.id} to="/cardio" className="list-item">
                  <span className="li-icon"><Bike size={18} /></span>
                  <span className="grow"><div className="li-title">{it.c.label || CARDIO_INFO[it.c.type].label}</div><div className="li-sub">{formatShortDate(it.c.date)} · {it.c.durationMin} min{it.c.distanceKm ? ` · ${it.c.distanceKm} km` : ''}{it.c.kcal ? ` · ~${it.c.kcal} kcal` : ''}</div></span>
                  <ChevronRight size={18} className="muted" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
