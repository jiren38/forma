/** Progressi cardio: minuti, distanza, sessioni, previsto vs svolto e grafici distinti per macchina. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, Timer, Route, CalendarCheck, Target } from 'lucide-react';
import { useCardio, useSessions } from '@/app/data';
import { BarChart, LineChart } from '@/components/charts';
import { Empty, Segmented, Bar } from '@/components/ui';
import { MACHINE_ORDER, cardioEntries, cardioMonthly, cardioWeekly, machineLabel, type CardioEntry } from '@/lib/cardio';
import { dayKey, fmtN, formatShortDate, fromKey, startOfMonth, startOfWeek, sum } from '@/lib/util';
import type { CardioMachine } from '@/lib/types';
import { CardioIcon } from '@/features/workouts/cardio-ui';

export function useCardioEntries() {
  const sessions = useSessions();
  const logs = useCardio();
  return useMemo(() => cardioEntries(sessions, logs), [sessions, logs]);
}

export default function CardioProgress() {
  const entries = useCardioEntries();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  if (!entries.length) {
    return <Empty icon={<Bike />} title="Nessuna attività cardio" text="Le attività cardio delle tue schede e quelle registrate a parte compariranno qui, con grafici per ogni macchina." action={<Link to="/workouts" className="btn primary">Vai agli allenamenti</Link>} />;
  }
  const from = dayKey(period === 'week' ? startOfWeek() : startOfMonth());
  const inP = entries.filter((e) => e.date >= from);
  const weeks = cardioWeekly(entries, 12);
  const months = cardioMonthly(entries, 6);
  const planned = entries.filter((e) => e.plannedMin != null);
  const last4 = planned.filter((e) => fromKey(e.date) >= new Date(Date.now() - 28 * 86400000));
  const pct = (list: CardioEntry[]) => { const p = sum(list.map((e) => e.plannedMin!)); return p ? sum(list.map((e) => Math.min(e.actualMin, e.plannedMin! * 1.5))) / p : null; };
  const pAll = pct(last4.length ? last4 : planned);
  const machines = MACHINE_ORDER.filter((m) => entries.some((e) => e.machine === m));

  return (
    <div className="stack">
      <Segmented label="Periodo" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Questa settimana' }, { value: 'month', label: 'Questo mese' }]} />
      <div className="grid-2">
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Timer size={13} /> Minuti di cardio</span><span className="v">{fmtN(sum(inP.map((e) => e.actualMin)))}</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><CalendarCheck size={13} /> Sessioni</span><span className="v">{inP.length}</span><span className="tiny muted">{entries.length} in totale</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Route size={13} /> Distanza</span><span className="v">{fmtN(sum(inP.map((e) => e.distanceKm ?? 0)), 1)} km</span><span className="tiny muted">{fmtN(sum(entries.map((e) => e.distanceKm ?? 0)), 1)} km in totale</span></div></div>
        <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Target size={13} /> Svolto vs previsto</span><span className="v">{pAll != null ? `${Math.round(pAll * 100)}%` : 'n.d.'}</span><span className="tiny muted">{last4.length ? 'ultime 4 settimane' : 'attività delle schede'}</span></div></div>
      </div>
      <div className="desk-2">
        <section className="card"><div className="card-title"><h3>Minuti a settimana</h3><span className="tiny muted">ultime 12</span></div>
          <BarChart ariaLabel="Minuti di cardio per settimana" color="var(--blue)" data={weeks.map((w) => ({ label: w.label, value: Math.round(w.minutes) }))} highlightLast />
        </section>
        <section className="card"><div className="card-title"><h3>Minuti al mese</h3><span className="tiny muted">ultimi 6</span></div>
          <BarChart ariaLabel="Minuti di cardio per mese" color="var(--blue)" data={months.map((m) => ({ label: m.label, value: Math.round(m.minutes) }))} highlightLast />
        </section>
      </div>

      {planned.length > 0 && (
        <section className="card">
          <div className="card-title"><h3>Previsto e svolto</h3><span className="tiny muted">minuti per settimana</span></div>
          <div className="stack-sm">
            {weeks.filter((w) => w.plannedMin > 0).slice(-6).map((w) => (
              <div key={w.label} className="row" style={{ gap: 10 }}>
                <span className="tiny muted" style={{ width: 42 }}>{w.label}</span>
                <span className="grow"><Bar value={Math.min(w.doneOfPlanned, w.plannedMin)} max={w.plannedMin} color="var(--blue)" /></span>
                <span className="tiny num" style={{ width: 92, textAlign: 'right' }}>{Math.round(w.doneOfPlanned)} / {Math.round(w.plannedMin)} min</span>
              </div>
            ))}
          </div>
          <div className="settings-group" style={{ marginTop: 12 }}>
            {[...planned].reverse().slice(0, 6).map((e) => (
              <Link key={e.id} to={`/session/${e.sessionId}`} className="list-item">
                <span className="grow" style={{ minWidth: 0 }}><div className="li-title ellipsis">{e.label} <span className="tiny muted">· {formatShortDate(e.date)}</span></div>
                  <div className="li-sub">Previsti {fmtN(e.plannedMin!, 0)} min · svolti {fmtN(e.actualMin, 1)} min{e.speedKmh ? ` · ${fmtN(e.speedKmh, 1)} km/h` : ''}{e.resistance ? ` · resistenza ${fmtN(e.resistance, 1)}` : ''}</div></span>
                <span className={`pill ${e.actualMin >= e.plannedMin! * 0.95 ? 'success' : 'orange'}`}>{Math.round((e.actualMin / Math.max(1, e.plannedMin!)) * 100)}%</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="section-title">Per macchina</div>
      {machines.map((m) => <MachineCard key={m} machine={m} entries={entries.filter((e) => e.machine === m)} />)}
      <p className="hint">Calorie e distanze calcolate dall’app sono stime. Le attività registrate a parte nella sezione <Link to="/cardio" className="accent">Cardio</Link> sono incluse.</p>
    </div>
  );
}

type Metric = 'speed' | 'incline' | 'resistance' | 'minutes' | 'distance';
const METRIC_LABEL: Record<Metric, string> = { speed: 'Velocità', incline: 'Pendenza', resistance: 'Resistenza', minutes: 'Minuti', distance: 'Distanza' };

function MachineCard({ machine, entries }: { machine: CardioMachine; entries: CardioEntry[] }) {
  const metrics: Metric[] = machine === 'treadmill' ? ['speed', 'incline', 'minutes', 'distance']
    : machine === 'outdoor_walk' || machine === 'outdoor_run' ? ['speed', 'minutes', 'distance']
      : machine === 'bike' || machine === 'elliptical' || machine === 'rower' || machine === 'other' ? ['resistance', 'minutes'] : ['minutes'];
  const [metric, setMetric] = useState<Metric>(metrics[0]);
  const val = (e: CardioEntry): number | null => metric === 'speed' ? e.speedKmh : metric === 'incline' ? e.inclinePct : metric === 'resistance' ? e.resistance : metric === 'distance' ? e.distanceKm : e.actualMin;
  const pts = entries.filter((e) => val(e) != null && val(e)! > 0).map((e) => ({ x: fromKey(e.date).getTime(), y: val(e)!, label: formatShortDate(e.date) }));
  const unit = metric === 'speed' ? 'km/h' : metric === 'incline' ? '%' : metric === 'distance' ? 'km' : metric === 'minutes' ? 'min' : 'livello';
  const first = pts[0]?.y, last = pts[pts.length - 1]?.y;
  return (
    <section className="card stack-sm" aria-label={`Progressi ${machineLabel(machine)}`}>
      <div className="row" style={{ gap: 10 }}>
        <CardioIcon machine={machine} size={42} />
        <div className="grow"><h3>{machineLabel(machine)}</h3><div className="tiny muted">{entries.length} {entries.length === 1 ? "sessione" : "sessioni"} · {fmtN(sum(entries.map((e) => e.actualMin)))} min{sum(entries.map((e) => e.distanceKm ?? 0)) > 0 ? ` · ${fmtN(sum(entries.map((e) => e.distanceKm ?? 0)), 1)} km` : ''}</div></div>
      </div>
      {metrics.length > 1 && <Segmented label="Metrica" value={metric} onChange={setMetric} options={metrics.map((x) => ({ value: x, label: METRIC_LABEL[x] }))} />}
      {pts.length >= 2 ? (
        <>
          <LineChart ariaLabel={`${METRIC_LABEL[metric]} ${machineLabel(machine)}`} color="var(--blue)" points={pts} format={(v) => fmtN(v, 1)} />
          <div className="tiny muted">{METRIC_LABEL[metric]}: {fmtN(first!, 1)} → {fmtN(last!, 1)} {unit}</div>
        </>
      ) : <p className="small muted">Servono almeno 2 sessioni con {METRIC_LABEL[metric].toLowerCase()} registrata per mostrare il grafico.</p>}
    </section>
  );
}
