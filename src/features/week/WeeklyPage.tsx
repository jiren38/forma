/**
 * Riepilogo settimanale: allenamenti, alimentazione, sonno, peso e benessere della settimana,
 * con il confronto rispetto alla settimana precedente e l'andamento delle ultime 8 settimane.
 * La domenica (o nei giorni successivi) si apre sulla settimana appena chiusa.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDownRight, ArrowUpRight, BatteryMedium, Brain, CalendarRange, Check, ChevronLeft, ChevronRight, Droplets, Dumbbell, Equal, Flame,
  HeartPulse, Info, Moon, Scale, Smile, Trophy, Utensils, X,
} from 'lucide-react';
import { patchMeta, useMeta, useSettings } from '@/app/data';
import { PageHeader, Segmented } from '@/components/ui';
import { BarChart, LineChart, Sparkline } from '@/components/charts';
import { useNow } from '@/features/home/DailySummary';
import {
  fmtHours, fmtMinutesDelta, recapFresh, recapWeekStart, signedN, weeklyRecap, weeklyTrend,
  type DayCell, type Delta, type Highlight, type WeeklyRecap,
} from '@/lib/weekly';
import { addDays, dayKey, fmtN, fmtW, fromKey, startOfWeek, toDisplayWeight } from '@/lib/util';
import { useWeeklyInput } from './useWeekly';

const LETTER = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const DAY_NAME = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const C = { training: 'var(--c-training)', food: 'var(--c-nutrition)', sleep: 'var(--c-coach)', weight: 'var(--c-progress)', well: 'var(--c-wellness)', cardio: 'var(--c-cardio)' };

export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

export default function WeeklyPage() {
  const now = useNow(60_000);
  const inp = useWeeklyInput(now);
  const meta = useMeta();
  const settings = useSettings();
  const units = settings.units;
  const [sp, setSp] = useSearchParams();
  const thisWeek = startOfWeek(now);
  const w = sp.get('w');
  const anchor = w && /^\d{4}-\d{2}-\d{2}$/.test(w) && w <= dayKey(thisWeek) ? startOfWeek(fromKey(w)) : recapWeekStart(now);
  const key = dayKey(anchor);
  const go = (d: Date) => setSp({ w: dayKey(startOfWeek(d)) }, { replace: true });

  const recap = useMemo(() => (inp ? weeklyRecap(inp, anchor) : null), [inp, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const trend = useMemo(() => (inp ? weeklyTrend(inp, anchor, 8) : []), [inp, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = useMemo(() => {
    if (!inp) return key;
    const ds = [
      ...inp.sessions.filter((s) => s.status === 'completed').map((s) => dayKey(s.startedAt)), ...inp.diary.map((d) => d.date),
      ...inp.wellness.map((x) => x.date), ...inp.measurements.map((m) => m.date.slice(0, 10)), ...inp.cardio.map((c) => c.date),
    ].sort();
    return dayKey(startOfWeek(fromKey(ds[0] ?? dayKey(now))));
  }, [inp]); // eslint-disable-line react-hooks/exhaustive-deps

  // aperto il riepilogo "nuovo", la scheda in Home non serve più (anche sugli altri dispositivi)
  useEffect(() => {
    if (recapFresh(now) && key === dayKey(recapWeekStart(now)) && meta.lastSummaryWeek !== key) void patchMeta({ lastSummaryWeek: key });
  }, [key, meta.lastSummaryWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!recap || !inp) return null;
  const { cur, prev } = recap;
  const canPrev = key > first;
  const canNext = key < dayKey(thisWeek);
  const weeksAgo = Math.round((thisWeek.getTime() - anchor.getTime()) / (7 * 86400000));
  const when = cur.range.phase === 'closing' ? 'Si chiude oggi' : cur.range.phase === 'current' ? `In corso · giorno ${cur.range.days} di 7` : weeksAgo === 1 ? 'Settimana scorsa' : `${weeksAgo} settimane fa`;

  return (
    <div className="page stack wk-page">
      <PageHeader title="Riepilogo settimanale" back sub="Allenamenti, alimentazione, sonno e peso, a confronto con la settimana prima." />
      <div className="period-nav">
        <button className="icon-btn ghost" aria-label="Settimana precedente" disabled={!canPrev} onClick={() => canPrev && go(addDays(anchor, -7))}><ChevronLeft size={22} /></button>
        <div className="grow center"><b>{cur.range.label}</b><div className="tiny muted">{when}</div></div>
        <button className="icon-btn ghost" aria-label="Settimana successiva" disabled={!canNext} onClick={() => canNext && go(addDays(anchor, 7))}><ChevronRight size={22} /></button>
      </div>

      <Hero recap={recap} />

      <div className="wk-grid">
        <TrainingCard recap={recap} units={units} />
        <NutritionCard recap={recap} />
        <SleepCard recap={recap} />
        <WeightCard recap={recap} units={units} trend={trend.map((t) => t.avgWeight)} />
      </div>
      <WellbeingCard recap={recap} />
      <TrendCard trend={trend} units={units} />

      <p className="tiny muted wk-foot"><Info size={13} /> {recap.partial
        ? `Settimana in corso: il confronto è con gli stessi ${cur.range.days} giorni della settimana ${prev.range.label}.`
        : `Confronto con la settimana ${prev.range.label}.`} Calorie consumate e bilancio sono stime; le medie contano solo i giorni registrati.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Hero({ recap }: { recap: WeeklyRecap }) {
  const { headline, highlights, cur } = recap;
  return (
    <section className={`card wk-hero t-${headline.tone}`} aria-label="Sintesi della settimana">
      <span className="wk-eyebrow"><CalendarRange size={14} /> La settimana in sintesi</span>
      <h2 className="wk-title">{headline.title}</h2>
      {headline.sub && <p className="wk-sub">{headline.sub}</p>}
      <WeekStrip days={cur.training.days} />
      {highlights.length > 0 && (
        <ul className="wk-hl" aria-label="Punti salienti">
          {highlights.map((h) => <HighlightRow key={h.id} h={h} />)}
        </ul>
      )}
    </section>
  );
}

const HL_ICON: Record<Highlight['icon'], typeof Dumbbell> = { training: Dumbbell, record: Trophy, sleep: Moon, weight: Scale, food: Utensils, water: Droplets, cardio: HeartPulse };
const HL_COLOR: Record<Highlight['icon'], string> = { training: C.training, record: '#ffb020', sleep: C.sleep, weight: C.weight, food: C.food, water: 'var(--blue)', cardio: C.cardio };

function HighlightRow({ h }: { h: Highlight }) {
  const Ic = HL_ICON[h.icon];
  const inner = <><span className="wk-hl-ic"><Ic size={16} /></span><span className="grow">{h.text}</span>{h.to && <ChevronRight size={16} className="muted" />}</>;
  const style = { ['--sc' as string]: HL_COLOR[h.icon] } as CSSProperties;
  return <li className={`wk-hl-row ${h.tone}`} style={style}>{h.to ? <Link to={h.to}>{inner}</Link> : <div>{inner}</div>}</li>;
}

const STATUS_LABEL: Record<DayCell['status'], string> = {
  done: 'allenamento fatto', extra: 'allenamento fuori programma', missed: 'allenamento saltato', planned: 'in programma', rest: 'riposo', future: 'non ancora arrivato',
};

function WeekStrip({ days }: { days: DayCell[] }) {
  return (
    <ol className="wk-strip" aria-label="Allenamenti giorno per giorno">
      {days.map((d) => {
        const name = d.sessions.map((s) => s.name).join(', ') || d.planned || '';
        const dt = fromKey(d.key);
        return (
          <li key={d.key} className={`wk-day ${d.status}`} title={`${DAY_NAME[d.idx]} ${dt.getDate()}: ${STATUS_LABEL[d.status]}${name ? ` · ${name}` : ''}`}>
            <span className="wk-day-l">{LETTER[d.idx]}</span>
            <span className="wk-day-dot" aria-hidden>
              {d.status === 'done' || d.status === 'extra' ? <Check size={14} strokeWidth={3} /> : d.status === 'missed' ? <X size={13} strokeWidth={3} /> : d.status === 'planned' ? <Dumbbell size={12} /> : null}
            </span>
            <span className="wk-day-n">{dt.getDate()}</span>
            <span className="sr-only">{`${DAY_NAME[d.idx]} ${dt.getDate()}: ${STATUS_LABEL[d.status]}${name ? `, ${name}` : ''}`}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------

function DeltaChip({ d, fmt, label = 'settimana prima' }: { d: Delta | null; fmt: (v: number) => string; label?: string }) {
  if (!d) return <span className="wk-delta none">Nessun confronto</span>;
  const Ic = Math.abs(d.value) < 1e-9 ? Equal : d.value > 0 ? ArrowUpRight : ArrowDownRight;
  const txt = Math.abs(d.value) < 1e-9 ? 'Come la' : fmt(d.value);
  return <span className={`wk-delta ${d.tone}`}><Ic size={14} strokeWidth={2.5} /> {txt} <i>{Math.abs(d.value) < 1e-9 ? label : `vs ${label}`}</i></span>;
}

function MetricCard({ color, icon, title, link, children }: { color: string; icon: ReactNode; title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="card wk-card" style={{ ['--sc' as string]: color } as CSSProperties} aria-label={title}>
      <div className="wk-card-h">
        <span className="wk-card-ic">{icon}</span>
        <h3>{title}</h3>
        {link && <Link to={link.to} className="link">{link.label} <ChevronRight size={16} /></Link>}
      </div>
      {children}
    </section>
  );
}

function Big({ value, unit, cap, delta }: { value: ReactNode; unit?: ReactNode; cap: ReactNode; delta?: ReactNode }) {
  return (
    <div className="wk-big">
      <div className="wk-big-row">
        <div className="wk-big-v num">{value}{unit && <small>{unit}</small>}</div>
        <div className="wk-big-cap">{cap}</div>
      </div>
      {delta}
    </div>
  );
}

function Facts({ rows }: { rows: ([string, ReactNode] | null | false)[] }) {
  const xs = rows.filter(Boolean) as [string, ReactNode][];
  return <dl className="wk-facts">{xs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

/** Barre dei 7 giorni con linea dell'obiettivo. I giorni senza dato restano vuoti (non valgono 0). */
function DayBars({ values, goal, label, fmt }: { values: (number | null)[]; goal?: number | null; label: string; fmt: (v: number) => string }) {
  const max = Math.max(goal ?? 0, ...values.map((v) => v ?? 0)) * 1.12 || 1;
  return (
    <div className="wk-bars" role="img" aria-label={`${label}: ${values.map((v, i) => `${DAY_NAME[i]} ${v == null ? 'non registrato' : fmt(v)}`).join(', ')}`}>
      <div className="wk-bars-plot">
        {goal ? <i className="wk-goal" style={{ bottom: `${(goal / max) * 100}%` }} /> : null}
        {values.map((v, i) => (
          <span key={i} className={`wk-bar ${v == null ? 'empty' : ''} ${goal && v != null && v >= goal * 0.9 ? 'hit' : ''}`} title={`${DAY_NAME[i]}: ${v == null ? 'non registrato' : fmt(v)}`}>
            <i style={{ height: v == null ? undefined : `${Math.max(4, (v / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="wk-bars-x" aria-hidden>{LETTER.map((l, i) => <span key={i}>{l}</span>)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TrainingCard({ recap, units }: { recap: WeeklyRecap; units: 'kg' | 'lb' }) {
  const T = recap.cur.training;
  const hasPlan = T.planned != null && T.planned > 0;
  const plural = (n: number) => (n === 1 ? 'allenamento' : 'allenamenti');
  const extra = T.days.filter((d) => d.status === 'extra').length;
  return (
    <MetricCard color={C.training} icon={<Dumbbell size={18} />} title="Allenamenti" link={{ to: '/history', label: 'Storico' }}>
      <Big value={hasPlan ? T.plannedDone : T.sessions} unit={`/${hasPlan ? T.planned : T.goal}`}
        cap={hasPlan ? `in programma${extra ? ` · +${extra} extra` : ''}` : 'obiettivo settimanale'}
        delta={<DeltaChip d={recap.cmp.sessions} fmt={(v) => `${signedN(v)} ${Math.abs(v) === 1 ? 'sessione' : 'sessioni'}`} />} />
      <Facts rows={[
        ['Sessioni', `${T.sessions} ${plural(T.sessions)}`],
        ['Tempo totale', T.minutes ? <>{fmtMin(T.minutes)} <Mini d={recap.cmp.minutes} fmt={(v) => `${signedN(v)} min`} /></> : '–'],
        T.volume > 0 && ['Volume', <>{fmtN(toDisplayWeight(T.volume, units) ?? 0)} {units} <Mini d={recap.cmp.volume} fmt={(v) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) / Math.max(1, recap.prev.training.volume) * 100)}%`} /></>],
        T.sets > 0 && ['Serie', fmtN(T.sets)],
        (T.cardioMin > 0 || recap.prev.training.cardioMin > 0) && ['Cardio', <>{T.cardioMin ? `${fmtMin(T.cardioMin)}${T.cardioKm ? ` · ${fmtN(T.cardioKm, 1)} km` : ''}` : '–'} <Mini d={recap.cmp.cardioMin} fmt={(v) => `${signedN(v)} min`} /></>],
        ['Giorni attivi', `${T.activeDays} su ${recap.cur.range.days}`],
      ]} />
      {T.prs.length > 0 && (
        <div className="wk-prs">
          <div className="wk-sub-h"><Trophy size={14} color="#ffb020" /> Record personali</div>
          {T.prs.slice(0, 4).map((p, i) => (
            <Link key={i} to={`/session/${p.sessionId}`} className="wk-pr">
              <span className="ellipsis">{p.name}</span>
              <span className="pr-badge">{p.kind === 'weight' ? `${fmtW(p.value, units)} × ${p.reps}` : p.kind === 'e1rm' ? `1RM ${fmtW(p.value, units)}` : p.kind === 'reps' ? `${p.value} rip.` : `vol. ${fmtW(p.value, units)}`}</span>
            </Link>
          ))}
          {T.prs.length > 4 && <Link to="/progress?tab=records" className="tiny link-btn">Altri {T.prs.length - 4} record</Link>}
        </div>
      )}
      {!T.sessions && !T.cardioLogs && <p className="small muted wk-empty">Nessun allenamento registrato in questa settimana.</p>}
    </MetricCard>
  );
}

function Mini({ d, fmt }: { d: Delta | null; fmt: (v: number) => string }) {
  if (!d || Math.abs(d.value) < 1e-9) return null;
  return <span className={`wk-mini ${d.tone}`}>{fmt(d.value)}</span>;
}

function NutritionCard({ recap }: { recap: WeeklyRecap }) {
  const N = recap.cur.nutrition;
  const k = recap.cur.range.key;
  return (
    <MetricCard color={C.food} icon={<Utensils size={18} />} title="Alimentazione" link={{ to: `/energy?p=week&d=${k}`, label: 'Bilancio' }}>
      {N.avgKcal == null ? (
        <>
          <Big value="–" cap={N.days ? 'nessun pasto registrato' : 'nessun giorno concluso'} />
          <p className="small muted wk-empty">Senza il diario non si possono calcolare calorie e bilancio: i giorni vuoti non contano come 0 kcal.{' '}
            <Link to="/nutrition" className="link-btn">Apri il diario</Link></p>
        </>
      ) : (
        <>
          <Big value={fmtN(N.avgKcal)} unit=" kcal" cap="al giorno, in media" delta={<DeltaChip d={recap.cmp.kcal} fmt={(v) => `${signedN(v)} kcal`} />} />
          <DayBars values={N.perDay} goal={N.targetKcal} label="Calorie per giorno" fmt={(v) => `${fmtN(v)} kcal`} />
          <Facts rows={[
            ['Obiettivo', `${fmtN(N.targetKcal)} kcal`],
            ['Vicine all’obiettivo', `${N.inTarget} giorni su ${N.loggedDays}`],
            N.avgProtein != null && ['Proteine', <>{fmtN(N.avgProtein)} g <span className="muted">/ {fmtN(N.targetProtein)} g</span> <Mini d={recap.cmp.protein} fmt={(v) => `${signedN(v)} g`} /></>],
            ['Giorni registrati', `${N.loggedDays} su ${N.days}`],
            N.avgBalance != null && ['Bilancio medio', <>{signedN(N.avgBalance)} kcal/giorno <span className="muted">(stima)</span></>],
          ]} />
        </>
      )}
      {N.todayPending && <p className="tiny muted wk-note">Oggi entra nella media quando registri la cena.</p>}
    </MetricCard>
  );
}

function SleepCard({ recap }: { recap: WeeklyRecap }) {
  const S = recap.cur.sleep;
  const short = (key: string) => `${DAY_NAME[(fromKey(key).getDay() + 6) % 7].slice(0, 3).toLowerCase()} ${fromKey(key).getDate()}`;
  return (
    <MetricCard color={C.sleep} icon={<Moon size={18} />} title="Sonno" link={{ to: '/wellness', label: 'Benessere' }}>
      {S.avgH == null ? (
        <>
          <Big value="–" cap="nessuna notte registrata" />
          <p className="small muted wk-empty">Registra ogni mattina le ore di sonno in Benessere: qui vedrai media, notti migliori e confronto.{' '}
            <Link to="/wellness?focus=sleep" className="link-btn">Registra il sonno</Link></p>
        </>
      ) : (
        <>
          <Big value={fmtHours(S.avgH)} cap="a notte, in media" delta={<DeltaChip d={recap.cmp.sleep} fmt={fmtMinutesDelta} />} />
          <DayBars values={S.perDay} goal={S.goalH} label="Ore di sonno per notte" fmt={(v) => fmtHours(v)} />
          <Facts rows={[
            ['Obiettivo', `${fmtN(S.goalH, 1)} h`],
            ['Notti in linea', `${S.onGoal} su ${S.nights}`],
            S.avgQuality != null && ['Qualità media', `${fmtN(S.avgQuality, 1)} su 5`],
            S.best && ['Notte migliore', `${short(S.best.key)} · ${fmtHours(S.best.h)}`],
            S.worst && ['Notte peggiore', `${short(S.worst.key)} · ${fmtHours(S.worst.h)}`],
            ['Notti registrate', `${S.nights} su ${recap.cur.range.days}`],
          ]} />
        </>
      )}
    </MetricCard>
  );
}

function WeightCard({ recap, units, trend }: { recap: WeeklyRecap; units: 'kg' | 'lb'; trend: (number | null)[] }) {
  const W = recap.cur.weight;
  const N = recap.cur.nutrition;
  const pts = trend.filter((x): x is number => x != null);
  const dirLabel = recap.weightDirection === 'lose' ? 'da perdere' : recap.weightDirection === 'gain' ? 'da prendere' : '';
  const latest = W.last ?? W.before;
  return (
    <MetricCard color={C.weight} icon={<Scale size={18} />} title="Peso" link={{ to: '/body', label: 'Peso e misure' }}>
      {W.avg == null ? (
        <>
          <Big value="–" cap="nessuna pesata in questa settimana" />
          <p className="small muted wk-empty">{W.before != null ? `Ultima pesata: ${fmtW(W.before, units)}. ` : ''}Una pesata a settimana, al mattino e a digiuno, basta per vedere l’andamento.{' '}
            <Link to="/body?new=1" className="link-btn">Registra il peso</Link></p>
        </>
      ) : (
        <>
          <Big value={fmtW(W.avg, units)} cap={W.count === 1 ? '1 pesata' : `media di ${W.count} pesate`}
            delta={<DeltaChip d={recap.cmp.weight ? { ...recap.cmp.weight, value: toDisplayWeight(recap.cmp.weight.value, units) ?? 0 } : null} fmt={(v) => `${signedN(v, 1)} ${units}`}
              label={recap.weightRef === 'last_before' ? 'ultima pesata' : 'settimana prima'} />} />
          {pts.length >= 2 && <div className="wk-spark"><Sparkline values={pts} color={C.weight} height={46} /><span className="tiny muted">media settimanale, ultime {pts.length} settimane con pesate</span></div>}
          <Facts rows={[
            recap.targetKg > 0 && ['Obiettivo', <>{fmtW(recap.targetKg, units)}{latest != null && dirLabel ? <span className="muted"> · {fmtW(Math.abs(recap.targetKg - latest), units)} {dirLabel}</span> : null}</>],
            W.count > 1 && ['Minimo e massimo', `${fmtW(W.min, units)} – ${fmtW(W.max, units)}`],
            N.predictedKg != null && N.loggedDays >= 4 && ['Previsione dal bilancio', <>{signedN(toDisplayWeight(N.predictedKg, units) ?? 0, 1)} {units} <span className="muted">(teorici)</span></>],
          ]} />
        </>
      )}
    </MetricCard>
  );
}

function WellbeingCard({ recap }: { recap: WeeklyRecap }) {
  const B = recap.cur.wellbeing;
  if (!B.waterDays && !B.checkins) return null;
  const scale = (v: number | null) => (v == null ? '–' : `${fmtN(v, 1)}/5`);
  return (
    <section className="card wk-well" aria-label="Benessere della settimana">
      <div className="card-title"><h3><BatteryMedium size={18} /> Benessere</h3><Link to="/wellness" className="link">Apri <ChevronRight size={16} /></Link></div>
      <div className="wk-kpis">
        <div style={{ ['--sc' as string]: 'var(--blue)' } as CSSProperties}>
          <span className="wk-k-ic"><Droplets size={16} /></span>
          <b className="num">{B.avgWaterMl == null ? '–' : `${fmtN(B.avgWaterMl / 1000, 1)} L`}</b>
          <span>acqua al giorno{B.waterDays ? ` · obiettivo in ${B.waterOnGoal} su ${B.waterDays}` : ''}</span>
        </div>
        <div style={{ ['--sc' as string]: C.training } as CSSProperties}><span className="wk-k-ic"><Flame size={16} /></span><b className="num">{scale(B.energy)}</b><span>energia</span></div>
        <div style={{ ['--sc' as string]: 'var(--orange)' } as CSSProperties}><span className="wk-k-ic"><Brain size={16} /></span><b className="num">{scale(B.stress)}</b><span>stress</span></div>
        <div style={{ ['--sc' as string]: C.well } as CSSProperties}><span className="wk-k-ic"><Smile size={16} /></span><b className="num">{scale(B.mood)}</b><span>umore</span></div>
      </div>
    </section>
  );
}

type TrendMetric = 'sessions' | 'kcal' | 'sleep' | 'weight';

function TrendCard({ trend, units }: { trend: ReturnType<typeof weeklyTrend>; units: 'kg' | 'lb' }) {
  const [m, setM] = useState<TrendMetric>('sessions');
  if (trend.length < 2) return null;
  const weights = trend.filter((t) => t.avgWeight != null);
  return (
    <section className="card" aria-label="Andamento delle ultime settimane">
      <div className="card-title"><h3>Andamento</h3><span className="tiny muted">ultime {trend.length} settimane</span></div>
      <Segmented label="Dato" value={m} onChange={setM} options={[{ value: 'sessions', label: 'Allenamenti' }, { value: 'kcal', label: 'Calorie' }, { value: 'sleep', label: 'Sonno' }, { value: 'weight', label: 'Peso' }]} />
      <div style={{ marginTop: 14 }}>
        {m === 'sessions' && <BarChart ariaLabel="Allenamenti per settimana" color={C.training} highlightLast data={trend.map((t) => ({ label: t.label, value: t.sessions }))} />}
        {m === 'kcal' && <BarChart ariaLabel="Calorie medie al giorno per settimana" color={C.food} highlightLast format={(v) => (v ? fmtN(v) : '')}
          data={trend.map((t) => ({ label: t.label, value: t.avgKcal ?? 0, tip: t.avgKcal == null ? '–' : fmtN(t.avgKcal) }))} />}
        {m === 'sleep' && <BarChart ariaLabel="Ore di sonno medie per settimana" color={C.sleep} highlightLast format={(v) => (v ? fmtN(v, 1) : '')}
          data={trend.map((t) => ({ label: t.label, value: t.avgSleep ?? 0, tip: t.avgSleep == null ? '–' : fmtN(t.avgSleep, 1) }))} />}
        {m === 'weight' && (weights.length >= 2
          ? <LineChart ariaLabel="Peso medio per settimana" color={C.weight} format={(v) => fmtN(v, 1)}
              points={weights.map((t) => ({ x: fromKey(t.key).getTime(), y: toDisplayWeight(t.avgWeight, units)!, label: t.label, tip: `${t.label} · ${fmtW(t.avgWeight, units)}` }))} />
          : <p className="small muted">Servono pesate in almeno 2 settimane per disegnare l’andamento.</p>)}
      </div>
      <p className="tiny muted" style={{ margin: '8px 0 0' }}>
        {m === 'kcal' ? 'Media dei soli giorni con pasti registrati.' : m === 'sleep' ? 'Media delle notti registrate.' : m === 'weight' ? 'Media delle pesate di ogni settimana.' : 'Sessioni completate per settimana; l’ultima barra è la settimana selezionata.'}
      </p>
    </section>
  );
}
