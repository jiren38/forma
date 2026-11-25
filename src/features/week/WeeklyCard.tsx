/**
 * Scheda in Home con il riepilogo della settimana appena chiusa.
 * Compare dalla domenica alle 18 fino a martedì e sparisce quando il riepilogo viene aperto
 * o nascosto (lo stato è nei metadati sincronizzati, quindi vale su tutti i dispositivi).
 */
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CalendarRange, ChevronRight, Dumbbell, Moon, Scale, Utensils, X } from 'lucide-react';
import { patchMeta, useMeta, useSettings } from '@/app/data';
import { useNow } from '@/features/home/DailySummary';
import { recapFresh, recapWeekStart, signedN, weeklyRecap, type Delta } from '@/lib/weekly';
import { dayKey, fmtN, fmtW, toDisplayWeight } from '@/lib/util';
import { useWeeklyInput } from './useWeekly';

export function WeeklyCard() {
  const now = useNow(60_000);
  const meta = useMeta();
  const settings = useSettings();
  const inp = useWeeklyInput(now);
  const start = recapWeekStart(now);
  const key = dayKey(start);
  const show = recapFresh(now) && meta.lastSummaryWeek !== key;
  const r = useMemo(() => (show && inp ? weeklyRecap(inp, start) : null), [show, inp, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r || !r.cur.hasData) return null;

  const T = r.cur.training;
  const hasPlan = T.planned != null && T.planned > 0;
  const units = settings.units;
  const kpis = [
    { k: 'tr', icon: Dumbbell, c: 'var(--c-training)', label: 'Allenamenti', v: hasPlan ? `${T.plannedDone}/${T.planned}` : `${T.sessions}/${T.goal}`, d: r.cmp.sessions },
    { k: 'kc', icon: Utensils, c: 'var(--c-nutrition)', label: 'Kcal al giorno', v: r.cur.nutrition.avgKcal == null ? '–' : fmtN(r.cur.nutrition.avgKcal), d: r.cmp.kcal },
    { k: 'sl', icon: Moon, c: 'var(--c-coach)', label: 'Sonno medio', v: r.cur.sleep.avgH == null ? '–' : `${fmtN(r.cur.sleep.avgH, 1)} h`, d: r.cmp.sleep },
    { k: 'wt', icon: Scale, c: 'var(--c-progress)', label: 'Peso', v: r.cmp.weight ? `${signedN(toDisplayWeight(r.cmp.weight.value, units) ?? 0, 1)} ${units}` : r.cur.weight.avg != null ? fmtW(r.cur.weight.avg, units) : '–', d: r.cmp.weight, noArrow: true },
  ];

  return (
    <section className="card wk-home" aria-label="Riepilogo settimanale">
      <div className="wk-home-top">
        <span className="wk-eyebrow"><CalendarRange size={14} /> Riepilogo settimanale · {r.cur.range.label}</span>
        <button type="button" className="wk-home-x" aria-label="Nascondi il riepilogo settimanale" title="Nascondi" onClick={() => void patchMeta({ lastSummaryWeek: key })}><X size={16} /></button>
      </div>
      <Link to={`/week?w=${key}`} className="wk-home-link">
        <b className="wk-home-title">{r.headline.title}</b>
        {r.highlights[0] && <span className="wk-home-sub">{r.highlights[0].text}</span>}
        <span className="wk-home-kpis">
          {kpis.map((x) => (
            <span key={x.k} className="wk-home-kpi" style={{ ['--sc' as string]: x.c } as CSSProperties}>
              <span className="lbl"><x.icon size={13} /> {x.label}</span>
              <b className={`num ${x.noArrow && x.d ? `tone-${x.d.tone}` : ''}`}>{x.v}{!x.noArrow && <Arrow d={x.d} />}</b>
            </span>
          ))}
        </span>
        <span className="wk-home-cta">Confronta con la settimana prima <ChevronRight size={16} /></span>
      </Link>
    </section>
  );
}

function Arrow({ d }: { d: Delta | null }) {
  if (!d || Math.abs(d.value) < 1e-9) return null;
  const Ic = d.value > 0 ? ArrowUpRight : ArrowDownRight;
  return <Ic size={14} strokeWidth={2.5} className={`wk-home-arrow ${d.tone}`} aria-label={d.value > 0 ? 'in aumento' : 'in calo'} />;
}
