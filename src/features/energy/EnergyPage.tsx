import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flame, Info, Utensils, Dumbbell, Bike, Scale, HeartPulse, Footprints, AlertTriangle, CalendarDays } from 'lucide-react';
import { useCardio, useDiary, useMeasurements, useProfile, useSessions } from '@/app/data';
import { PageHeader, Segmented, Sheet } from '@/components/ui';
import { ACTIVITY_INFO } from '@/lib/labels';
import {
  KCAL_PER_KG, MOBILITY_MET, outSoFar, STRENGTH_MET, balanceLabel, bmrFor, buildEnergyIndex, daysInRange, scaleCheck, summarize,
  type DayEnergy, type EnergyIndex, type PeriodEnergy, type WorkoutEnergy,
} from '@/lib/energy';
import { addDays, cap, dayKey, fmtN, formatLongDate, formatShortDate, fromKey, round, startOfMonth, startOfWeek } from '@/lib/util';
import { BalanceBars, DualLine, StackBar } from './charts';
import { BarChart } from '@/components/charts';

type Period = 'day' | 'week' | 'month' | 'year';
const COL = { intake: 'var(--success)', out: 'var(--purple)', bmr: 'color-mix(in srgb, var(--purple) 55%, var(--surface-3))', life: 'var(--carbs)', ex: 'var(--accent)' };

export function useEnergyIndex(): EnergyIndex | null {
  const profile = useProfile();
  const sessions = useSessions();
  const cardioLogs = useCardio();
  const diary = useDiary();
  const measurements = useMeasurements();
  return useMemo(() => (profile ? buildEnergyIndex({ profile, sessions, cardioLogs, diary, measurements }) : null), [profile, sessions, cardioLogs, diary, measurements]);
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtN(Math.abs(Math.round(n)))}`;
const monthName = (d: Date) => cap(d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));

function range(period: Period, anchor: Date): { from: Date; to: Date; label: string } {
  if (period === 'day') return { from: anchor, to: addDays(anchor, 1), label: formatLongDate(anchor) };
  if (period === 'week') { const f = startOfWeek(anchor); const l = addDays(f, 6); return { from: f, to: addDays(f, 7), label: `${formatShortDate(f)} – ${formatShortDate(l)}` }; }
  if (period === 'month') { const f = startOfMonth(anchor); return { from: f, to: new Date(f.getFullYear(), f.getMonth() + 1, 1), label: monthName(f) }; }
  const f = new Date(anchor.getFullYear(), 0, 1);
  return { from: f, to: new Date(f.getFullYear() + 1, 0, 1), label: String(f.getFullYear()) };
}
function shift(period: Period, anchor: Date, dir: 1 | -1) {
  if (period === 'day') return addDays(anchor, dir);
  if (period === 'week') return addDays(anchor, 7 * dir);
  if (period === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return new Date(anchor.getFullYear() + dir, 0, 1);
}

export default function EnergyPage() {
  const idx = useEnergyIndex();
  const profile = useProfile();
  const measurements = useMeasurements();
  const [sp, setSp] = useSearchParams();
  const [method, setMethod] = useState(false);
  const period = (['day', 'week', 'month', 'year'].includes(sp.get('p') ?? '') ? sp.get('p') : 'day') as Period;
  const dParam = sp.get('d');
  const today = fromKey(dayKey());
  const anchor = dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam) && dParam <= dayKey() ? fromKey(dParam) : today;
  const go = (p: Period, d: Date) => setSp({ p, d: dayKey(d) }, { replace: true });

  if (!idx || !profile) return null;
  const r = range(period, anchor);
  const next = shift(period, anchor, 1);
  const canNext = dayKey(range(period, next).from) <= dayKey();
  const days = daysInRange(idx, r.from, r.to);

  return (
    <div className="page stack energy-page">
      <PageHeader title="Bilancio calorico" back sub="Calorie assunte e consumate · stime"
        right={<button className="icon-btn" aria-label="Come calcoliamo le calorie" onClick={() => setMethod(true)}><Info size={20} /></button>} />
      <Segmented label="Periodo" value={period} onChange={(p) => go(p, anchor)}
        options={[{ value: 'day', label: 'Giorno' }, { value: 'week', label: 'Settimana' }, { value: 'month', label: 'Mese' }, { value: 'year', label: 'Anno' }]} />
      <div className="period-nav">
        <button className="icon-btn ghost" aria-label="Periodo precedente" onClick={() => go(period, shift(period, anchor, -1))}><ChevronLeft size={22} /></button>
        <div className="grow center"><b>{r.label}</b>{period === 'day' && days[0]?.isToday && <div className="tiny muted">Oggi</div>}</div>
        <button className="icon-btn ghost" aria-label="Periodo successivo" disabled={!canNext} onClick={() => canNext && go(period, next)}><ChevronRight size={22} /></button>
      </div>

      {period === 'day' && days[0] && <DayView d={days[0]} />}
      {period !== 'day' && <PeriodView period={period} days={days} from={r.from} onPick={(k) => go('day', fromKey(k))} onPickMonth={(d) => go('month', d)} />}

      <LongTerm idx={idx} />
      <ScaleCard idx={idx} measurements={measurements} />

      <button className="card clickable row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setMethod(true)}>
        <Info size={20} className="accent" />
        <span className="grow"><b className="small">Come calcoliamo questi numeri</b><div className="tiny muted">Formule riconosciute, ma restano stime: l’errore tipico è del 10-15%.</div></span>
        <ChevronRight size={18} className="muted" />
      </button>
      <MethodSheet open={method} onClose={() => setMethod(false)} idx={idx} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Totals({ intake, out, balance, sub, provisional }: { intake: number | null; out: number; balance: number | null; sub?: React.ReactNode; provisional?: boolean }) {
  return (
    <section className="card hero pad-lg" aria-label="Bilancio">
      <div className="energy-totals">
        <div><span className="l"><Utensils size={13} /> Assunte</span><span className="v num" style={{ color: intake == null ? 'var(--muted)' : undefined }}>{intake == null ? '–' : fmtN(intake)}</span></div>
        <div><span className="l"><Flame size={13} /> Consumate</span><span className="v num">~{fmtN(out)}</span></div>
        <div><span className="l">{balance == null ? 'Bilancio' : balanceLabel(balance)}</span>
          <span className="v num" style={{ color: balance == null ? 'var(--muted)' : Math.abs(balance) < 100 ? 'var(--text)' : balance < 0 ? 'var(--blue)' : 'var(--orange)' }}>{balance == null ? '–' : signed(balance)}</span></div>
      </div>
      {sub && <div className="tiny muted" style={{ marginTop: 10 }}>{sub}</div>}
      {provisional && <div className="tiny" style={{ marginTop: 6, color: 'var(--warning)' }}>Giornata in corso: il bilancio cambierà con i prossimi pasti e allenamenti.</div>}
    </section>
  );
}

function DayView({ d }: { d: DayEnergy }) {
  // oggi: il consumo di base cresce durante la giornata, gli allenamenti fatti contano per intero
  const out = outSoFar(d);
  const balance = d.intake == null ? null : d.intake - out;
  return (
    <>
      <Totals intake={d.intake} out={out} balance={balance} provisional={d.isToday}
        sub={<>{d.isToday ? <>Consumo fino a ora; a fine giornata sarà circa {fmtN(d.out)} kcal. </> : null}{d.intake == null ? null : <>{d.entries} alimenti registrati{!d.isToday && balance != null && Math.abs(balance) >= 100 ? ` · ≈ ${fmtN(Math.abs(balance) / KCAL_PER_KG * 1000, 0)} g di massa grassa ${balance < 0 ? 'in meno' : 'in più'} (teorici)` : ''}</>}</>} />
      {d.intake == null && (
        <div className="card row" style={{ alignItems: 'flex-start', borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))' }}>
          <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <div className="grow small"><b>Nessun pasto registrato {d.isToday ? 'oggi' : 'in questo giorno'}.</b> <span className="text-2">Senza il diario non possiamo calcolare il bilancio: le giornate vuote non vengono contate come 0 kcal.</span>
            <div style={{ marginTop: 8 }}><Link className="btn sm primary" to={`/nutrition${d.isToday ? '' : `?date=${d.date}`}`}>Registra i pasti</Link></div></div>
        </div>
      )}
      <section className="card">
        <div className="card-title"><h3><Flame size={18} /> Dove vanno le calorie</h3><span className="tiny muted">stima</span></div>
        <StackBar parts={[{ label: 'Basale', value: d.bmr, color: COL.bmr }, { label: 'Attività quotidiana', value: d.lifestyle, color: COL.life }, { label: 'Allenamenti', value: d.exerciseNet, color: COL.ex }]} />
        <div className="energy-rows">
          <Row color={COL.bmr} icon={<HeartPulse size={16} />} title="Metabolismo basale" sub={`a riposo, con ${fmtN(d.weightKg, 1)} kg`} value={d.bmr} />
          <Row color={COL.life} icon={<Footprints size={16} />} title="Attività quotidiana e digestione" sub="passi, lavoro, movimenti, digestione" value={d.lifestyle} />
          <Row color={COL.ex} icon={<Dumbbell size={16} />} title="Allenamenti" sub={d.workouts.length ? `${d.workouts.length} attività · ${fmtN(d.exerciseKcal)} kcal totali, ${fmtN(d.exerciseNet)} oltre il riposo` : 'nessun allenamento registrato'} value={d.exerciseNet} />
          <div className="row-between energy-total-row"><b>Totale consumato</b><b className="num">~{fmtN(d.out)} kcal</b></div>
        </div>
      </section>
      <Workouts list={d.workouts} title="Allenamenti del giorno" />
    </>
  );
}

function Row({ color, icon, title, sub, value }: { color: string; icon: React.ReactNode; title: string; sub: string; value: number }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <span className="energy-ic" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, color: 'var(--text)' }}>{icon}</span>
      <span className="grow" style={{ minWidth: 0 }}><div className="small" style={{ fontWeight: 650 }}>{title}</div><div className="tiny muted">{sub}</div></span>
      <span className="num small" style={{ fontWeight: 700 }}>{fmtN(value)} kcal</span>
    </div>
  );
}

function Workouts({ list, title }: { list: WorkoutEnergy[]; title: string }) {
  const [all, setAll] = useState(false);
  if (!list.length) return null;
  const limit = all ? list.length : 6;
  const sorted = list.slice().sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="section-title">{title} <span className="tiny" style={{ textTransform: 'none', letterSpacing: 0 }}>kcal totali stimate</span></div>
      <div className="settings-group">
        {sorted.slice(0, limit).map((w) => {
          const body = (<>
            <span className="li-icon">{w.parts.some((p) => p.kind === 'strength') ? <Dumbbell size={18} /> : <Bike size={18} />}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <div className="li-title ellipsis">{w.name}</div>
              <div className="li-sub">{formatShortDate(w.date)} · {fmtN(w.minutes)} min{w.parts.length > 1 ? ` · ${w.parts.map((p) => `${p.kind === 'strength' ? 'pesi' : p.kind === 'mobility' ? 'mobilità' : 'cardio'} ${fmtN(p.kcal)}`).join(', ')}` : ''}</div>
              {w.capped && <div className="tiny" style={{ color: 'var(--warning)' }}>Sessione aperta {fmtN(w.elapsedMin)} min: contati solo i minuti plausibili</div>}
            </span>
            <span className="col" style={{ alignItems: 'flex-end' }}><b className="num">~{fmtN(w.kcal)}</b><span className="tiny muted">+{fmtN(w.netKcal)} sul riposo</span></span>
          </>);
          return w.sessionId
            ? <Link key={w.id} to={`/session/${w.sessionId}`} className="list-item">{body}</Link>
            : <Link key={w.id} to="/cardio" className="list-item">{body}</Link>;
        })}
        {sorted.length > limit && <button className="list-item accent small" style={{ justifyContent: 'center', fontWeight: 650 }} onClick={() => setAll(true)}>Mostra tutti ({sorted.length})</button>}
      </div>
    </>
  );
}

function PeriodStats({ s }: { s: PeriodEnergy }) {
  return (
    <div className="grid-2">
      <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Utensils size={13} /> Media assunte</span><span className="v">{s.avgIntake == null ? '–' : fmtN(s.avgIntake)}</span><span className="tiny muted">kcal al giorno registrato</span></div></div>
      <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Flame size={13} /> Media consumate</span><span className="v">~{fmtN(s.avgOut)}</span><span className="tiny muted">kcal al giorno</span></div></div>
      <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Dumbbell size={13} /> Allenamenti</span><span className="v">~{fmtN(s.exerciseKcal)}</span><span className="tiny muted">kcal in {s.workouts} attività · {fmtN(s.workoutMinutes)} min</span></div></div>
      <div className="stat-tile"><div className="stat"><span className="l row" style={{ gap: 4 }}><Scale size={13} /> Effetto teorico</span><span className="v">{s.predictedKg == null ? '–' : `${s.predictedKg > 0 ? '+' : s.predictedKg < 0 ? '−' : ''}${fmtN(Math.abs(s.predictedKg), 2)} kg`}</span><span className="tiny muted">bilancio ÷ {fmtN(KCAL_PER_KG)} kcal/kg</span></div></div>
    </div>
  );
}

function PeriodView({ period, days, from, onPick, onPickMonth }: { period: Exclude<Period, 'day'>; days: DayEnergy[]; from: Date; onPick: (k: string) => void; onPickMonth: (d: Date) => void }) {
  const s = summarize(days);
  const todayIn = days.find((d) => d.isToday);
  const totalsSub = s.loggedDays
    ? <>Somma dei {s.loggedDays} giorni con i pasti registrati su {days.length - (todayIn ? 1 : 0)} conclusi{todayIn ? ' (oggi non è ancora incluso)' : ''}. Media: {signed(s.avgBalance!)} kcal al giorno.</>
    : <>Nessun giorno concluso con i pasti registrati: il bilancio comparirà quando inizierai a usare il diario.</>;

  // mesi dell'anno
  const months = period === 'year' ? Array.from({ length: 12 }, (_, m) => {
    const f = new Date(from.getFullYear(), m, 1), t = new Date(from.getFullYear(), m + 1, 1);
    const ds = days.filter((d) => d.date >= dayKey(f) && d.date < dayKey(t));
    return { f, ds, s: summarize(ds) };
  }).filter((m) => m.ds.length) : [];

  const bars = period === 'year'
    ? months.map((m) => ({ key: dayKey(m.f), label: m.f.toLocaleDateString('it-IT', { month: 'narrow' }), value: m.s.avgBalance, tip: m.s.avgBalance == null ? `${m.f.toLocaleDateString('it-IT', { month: 'long' })}: pasti non registrati` : `${m.f.toLocaleDateString('it-IT', { month: 'long' })}: ${signed(m.s.avgBalance)} kcal/giorno` }))
    : days.map((d) => ({
      key: d.date, label: period === 'week' ? fromKey(d.date).toLocaleDateString('it-IT', { weekday: 'narrow' }) : String(fromKey(d.date).getDate()),
      value: d.isToday ? null : d.balance, muted: d.isToday,
      tip: d.balance == null ? `${formatShortDate(d.date)}: pasti non registrati` : `${formatShortDate(d.date)}: ${signed(d.balance)} kcal${d.isToday ? ' (in corso)' : ''}`,
    }));

  return (
    <>
      <Totals intake={s.loggedDays ? s.intake : null} out={s.loggedDays ? s.outLogged : sum(days.map((d) => d.out))} balance={s.balance} sub={totalsSub} />
      <PeriodStats s={s} />
      <section className="card">
        <div className="card-title"><h3>{period === 'year' ? 'Bilancio medio al giorno, per mese' : 'Bilancio giorno per giorno'}</h3></div>
        <BalanceBars ariaLabel="Bilancio calorico" data={bars} onPick={(k) => (period === 'year' ? onPickMonth(fromKey(k)) : onPick(k))} />
        <div className="row tiny muted" style={{ gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
          <span className="row" style={{ gap: 5 }}><i className="legend-dot" style={{ background: 'var(--blue)' }} />Deficit</span>
          <span className="row" style={{ gap: 5 }}><i className="legend-dot" style={{ background: 'var(--orange)' }} />Surplus</span>
          <span className="row" style={{ gap: 5 }}><i className="legend-dot" style={{ background: 'var(--surface-3)' }} />Pasti non registrati</span>
        </div>
      </section>
      {period !== 'year' && days.length > 1 && (
        <section className="card">
          <div className="card-title"><h3>Assunte e consumate</h3></div>
          <DualLine ariaLabel="Calorie assunte e consumate per giorno" aLabel="Assunte (diario)" bLabel="Consumate (stima)"
            points={days.map((d) => ({ key: d.date, label: period === 'week' ? fromKey(d.date).toLocaleDateString('it-IT', { weekday: 'short' }) : String(fromKey(d.date).getDate()), a: d.intake, b: d.out, tip: `${formatShortDate(d.date)}: ${d.intake == null ? 'n.d.' : fmtN(d.intake)} / ~${fmtN(d.out)}` }))} />
        </section>
      )}

      {period === 'year'
        ? <>
          <div className="section-title">Mese per mese</div>
          <div className="settings-group">
            {months.slice().reverse().map((m) => <PeriodRow key={dayKey(m.f)} title={monthName(m.f)} s={m.s} onClick={() => onPickMonth(m.f)} />)}
          </div>
        </>
        : <>
          <Workouts list={days.flatMap((d) => d.workouts)} title={`Allenamenti ${period === 'week' ? 'della settimana' : 'del mese'}`} />
          <div className="section-title">Giorno per giorno</div>
          <div className="settings-group">
            {days.slice().reverse().map((d) => (
              <button key={d.date} className="list-item" onClick={() => onPick(d.date)}>
                <span className="li-icon"><CalendarDays size={18} /></span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="li-title">{cap(fromKey(d.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }))}{d.isToday ? ' · oggi' : ''}</div>
                  <div className="li-sub">{d.intake == null ? 'pasti non registrati' : `${fmtN(d.intake)} assunte`} · ~{fmtN(d.out)} consumate{d.workouts.length ? ` · ${d.workouts.length} allenam.` : ''}</div>
                </span>
                <b className="num small" style={{ color: d.balance == null ? 'var(--muted)' : d.balance < -99 ? 'var(--blue)' : d.balance > 99 ? 'var(--orange)' : undefined }}>{d.balance == null ? '–' : signed(d.balance)}</b>
              </button>
            ))}
          </div>
        </>}
    </>
  );
}

function PeriodRow({ title, s, onClick }: { title: string; s: PeriodEnergy; onClick: () => void }) {
  return (
    <button className="list-item" onClick={onClick}>
      <span className="li-icon"><CalendarDays size={18} /></span>
      <span className="grow" style={{ minWidth: 0 }}>
        <div className="li-title">{title}</div>
        <div className="li-sub">{s.loggedDays}/{s.days} giorni registrati · {s.workouts} allenamenti · ~{fmtN(s.exerciseKcal)} kcal in allenamento</div>
      </span>
      <span className="col" style={{ alignItems: 'flex-end' }}>
        <b className="num small" style={{ color: s.avgBalance == null ? 'var(--muted)' : s.avgBalance < -99 ? 'var(--blue)' : s.avgBalance > 99 ? 'var(--orange)' : undefined }}>{s.avgBalance == null ? '–' : signed(s.avgBalance)}</b>
        <span className="tiny muted">kcal/giorno</span>
      </span>
    </button>
  );
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

// ---------------------------------------------------------------------------
// Andamento a lungo termine: ultime 12 settimane

function LongTerm({ idx }: { idx: EnergyIndex }) {
  const [weeksN, setWeeksN] = useState<12 | 26 | 52>(12);
  const data = useMemo(() => {
    const ws = startOfWeek();
    return Array.from({ length: weeksN }, (_, i) => {
      const f = addDays(ws, -7 * (weeksN - 1 - i));
      const s = summarize(daysInRange(idx, f, addDays(f, 7)));
      return { f, s };
    });
  }, [idx, weeksN]);
  const any = data.some((w) => w.s.loggedDays || w.s.workouts);
  // bilancio cumulato → variazione di peso teorica
  let acc = 0;
  const cumul = data.map((w) => { acc += w.s.balance ?? 0; return { ...w, kg: acc / KCAL_PER_KG }; });
  const totalKg = cumul.length ? cumul[cumul.length - 1].kg : 0;
  const totW = sum(data.map((w) => w.s.exerciseKcal));
  return (
    <>
      <div className="section-title">Andamento nel tempo</div>
      <Segmented label="Intervallo" value={weeksN} onChange={setWeeksN} options={[{ value: 12, label: '12 settimane' }, { value: 26, label: '6 mesi' }, { value: 52, label: '1 anno' }]} />
      {!any ? <div className="card small text-2">Qui vedrai l’andamento settimanale quando avrai registrato pasti o allenamenti.</div> : <>
        <section className="card">
          <div className="card-title"><h3>Media giornaliera per settimana</h3></div>
          <DualLine ariaLabel="Calorie medie assunte e consumate per settimana" aLabel="Assunte (diario)" bLabel="Consumate (stima)"
            points={data.map((w) => ({ key: dayKey(w.f), label: `${w.f.getDate()}/${w.f.getMonth() + 1}`, a: w.s.avgIntake, b: w.s.avgOut, tip: `Sett. ${formatShortDate(w.f)}: ${w.s.avgIntake == null ? 'n.d.' : fmtN(w.s.avgIntake)} / ~${fmtN(w.s.avgOut)}` }))} />
        </section>
        <section className="card">
          <div className="card-title"><h3>Bilancio medio al giorno</h3></div>
          <BalanceBars ariaLabel="Bilancio medio giornaliero per settimana" data={data.map((w) => ({ key: dayKey(w.f), label: `${w.f.getDate()}/${w.f.getMonth() + 1}`, value: w.s.avgBalance, tip: w.s.avgBalance == null ? `Sett. ${formatShortDate(w.f)}: pasti non registrati` : `Sett. ${formatShortDate(w.f)}: ${signed(w.s.avgBalance)} kcal/giorno (${w.s.loggedDays} gg)` }))} />
          <p className="tiny muted" style={{ marginTop: 8 }}>Nel periodo il bilancio registrato vale in teoria {totalKg > 0 ? '+' : totalKg < 0 ? '−' : ''}{fmtN(Math.abs(totalKg), 1)} kg. Il peso reale oscilla anche per acqua, sale e glicogeno: confrontalo sulle settimane, non sul giorno.</p>
        </section>
        <section className="card">
          <div className="card-title"><h3><Dumbbell size={18} /> Calorie degli allenamenti</h3><span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>~{fmtN(totW)} kcal</span></div>
          <BarChart ariaLabel="Calorie degli allenamenti per settimana" color="var(--accent)" highlightLast height={140} data={data.map((w) => ({ label: `${w.f.getDate()}/${w.f.getMonth() + 1}`, value: w.s.exerciseKcal }))} />
        </section>
      </>}
    </>
  );
}

// ---------------------------------------------------------------------------

function ScaleCard({ idx, measurements }: { idx: EnergyIndex; measurements: Parameters<typeof scaleCheck>[1] }) {
  const c = useMemo(() => scaleCheck(idx, measurements), [idx, measurements]);
  return (
    <section className="card">
      <div className="card-title"><h3><Scale size={18} /> Verifica con la bilancia</h3><span className="tiny muted">ultimi 28 giorni</span></div>
      {!c.ok ? <p className="small text-2">Confrontando il peso reale con le calorie registrate possiamo capire se la stima del consumo è giusta per te. {c.reason} <Link to="/body" className="accent">Registra il peso</Link></p> : <>
        <div className="grid-2">
          <div className="stat-tile"><div className="stat"><span className="l">Consumo stimato dal modello</span><span className="v">~{fmtN(c.modelOut)}</span><span className="tiny muted">kcal al giorno</span></div></div>
          <div className="stat-tile"><div className="stat"><span className="l">Consumo ricavato dal tuo peso</span><span className="v">~{fmtN(c.observedOut)}</span><span className="tiny muted">peso {c.kgChange > 0 ? '+' : c.kgChange < 0 ? '−' : ''}{fmtN(Math.abs(c.kgChange), 1)} kg in 28 gg</span></div></div>
        </div>
        <p className="small text-2" style={{ marginTop: 10 }}>
          {Math.abs(c.diff) < Math.max(150, c.modelOut * 0.08)
            ? 'Il peso reale conferma la stima: i numeri di questa pagina sono affidabili per te.'
            : c.diff > 0
              ? `Il tuo peso suggerisce che consumi circa ${fmtN(c.diff)} kcal al giorno in più della stima. Può dipendere da più movimento quotidiano o da pasti non registrati del tutto.`
              : `Il tuo peso suggerisce che consumi circa ${fmtN(-c.diff)} kcal al giorno in meno della stima, oppure che alcuni alimenti o condimenti non vengono registrati. Prova il livello di attività più basso nel profilo.`}
        </p>
        <p className="tiny muted">Basato su {c.weighIns} pesate e {c.loggedDays} giorni di diario. Funziona solo se registri tutto quello che mangi.</p>
      </>}
    </section>
  );
}

function MethodSheet({ open, onClose, idx }: { open: boolean; onClose: () => void; idx: EnergyIndex }) {
  const p = useProfile()!;
  const b = bmrFor(p, idx.weightOn(dayKey()));
  const act = ACTIVITY_INFO[p.activity ?? 'moderate'];
  return (
    <Sheet open={open} onClose={onClose} title="Come calcoliamo le calorie">
      <div className="stack-sm small text-2 method">
        <p><b>Sono stime, non misure.</b> Senza un calorimetro nessuna app o orologio misura davvero le calorie: anche i metodi migliori sbagliano del 10-15%. Usiamo formule validate nella letteratura scientifica e i tuoi dati reali.</p>
        <h4>1. Metabolismo basale</h4>
        <p>Le calorie che il corpo usa a riposo. {b.method === 'katch' ? 'Formula di Katch-McArdle, perché conosciamo la tua percentuale di grasso' : 'Formula di Mifflin-St Jeor (1990), la più accurata tra quelle che non richiedono la composizione corporea'}:</p>
        <p className="mono">{b.formula} = <b>{fmtN(b.kcal)} kcal</b></p>
        <p>Il peso usato è quello registrato più vicino a ogni giorno, quindi il calcolo segue i tuoi cambiamenti.</p>
        <h4>2. Attività quotidiana e digestione</h4>
        <p>Passi, lavoro, movimenti spontanei e digestione del cibo. Moltiplichiamo il basale per il fattore del tuo stile di vita ({act.label.toLowerCase()}: <b>×{fmtN(act.factor, 2)}</b>), che non comprende gli allenamenti. Puoi cambiarlo nel <Link to="/profile/edit" className="accent">profilo</Link>.</p>
        <h4>3. Allenamenti</h4>
        <p>kcal = MET × peso (kg) × ore. Il MET indica quante volte l’attività costa più del riposo. Valori dal Compendium of Physical Activities (2024):</p>
        <ul>
          <li>Pesi, impegno moderato: {fmtN(STRENGTH_MET.light, 1)} MET. Impegno elevato (RPE 7-8 o recuperi ≤ 60 s): {fmtN(STRENGTH_MET.moderate, 1)} MET. Impegno massimo o circuito (RPE ≥ 8,5 o recuperi ≤ 45 s): {fmtN(STRENGTH_MET.vigorous, 1)} MET.</li>
          <li>Mobilità e stretching: {fmtN(MOBILITY_MET, 1)} MET.</li>
          <li>Tapis roulant e corsa/camminata: equazioni metaboliche ACSM con velocità e pendenza reali. Cyclette, ellittica, vogatore, corda: MET in base all’intensità.</li>
        </ul>
        <p>Il tempo è quello reale della sessione. Se ti dimentichi di chiuderla, contiamo solo i minuti plausibili per le serie svolte. Se registri l’RPE delle serie, la stima diventa più precisa.</p>
        <p>Nella lista vedi le <b>kcal totali</b> dell’allenamento (come su un orologio sportivo). Nel bilancio sommiamo solo la parte <b>in più rispetto al riposo</b> (MET − 1), perché il basale di quei minuti è già contato al punto 1.</p>
        <h4>4. Calorie assunte</h4>
        <p>Somma del diario alimentare. I giorni senza pasti registrati non sono considerati 0 kcal: vengono esclusi dal bilancio. Oggi non entra nel bilancio di settimana e mese finché la giornata non è finita.</p>
        <h4>5. Dal bilancio al peso</h4>
        <p>Usiamo la regola di circa {fmtN(KCAL_PER_KG)} kcal per kg di tessuto adiposo. È un ordine di grandezza: nel tempo il corpo si adatta. Per questo c’è la verifica con la bilancia, che confronta il peso reale con le calorie registrate e ti dice se la stima è troppo alta o troppo bassa per te.</p>
        <p className="tiny muted">Riferimenti: Mifflin MD et al., Am J Clin Nutr 1990; Herrmann SD et al., Compendium of Physical Activities 2024, J Sport Health Sci; ACSM’s Guidelines for Exercise Testing and Prescription, equazioni metaboliche. Valori indicativi, non sostituiscono il parere di un medico o di un nutrizionista.</p>
        <p className="tiny muted">Oggi: basale {fmtN(b.kcal)} + attività quotidiana {fmtN(round(b.kcal * (act.factor - 1)))} = ~{fmtN(round(b.kcal * act.factor))} kcal senza allenamento.</p>
      </div>
    </Sheet>
  );
}
