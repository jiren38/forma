import { Link } from 'react-router-dom';
import { ChevronRight, Flame } from 'lucide-react';
import { balanceLabel, daysInRange, outSoFar, summarize } from '@/lib/energy';
import { addDays, dayKey, fmtN, fromKey, startOfWeek } from '@/lib/util';
import { useEnergyIndex } from './EnergyPage';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtN(Math.abs(Math.round(n)))}`;

/** Riquadro in Home: bilancio di oggi, di ieri e media della settimana. */
export function EnergyCard() {
  const idx = useEnergyIndex();
  if (!idx) return null;
  const t = idx.day(dayKey());
  const y = idx.day(dayKey(addDays(fromKey(dayKey()), -1)));
  const w = summarize(daysInRange(idx, startOfWeek(), addDays(startOfWeek(), 7)));
  return (
    <Link to="/energy" className="card clickable" aria-label="Bilancio calorico">
      <div className="card-title"><h3><Flame size={18} /> Bilancio calorico</h3><ChevronRight size={18} className="muted" /></div>
      <div className="energy-mini">
        <div><span className="tiny muted">Assunte</span><b className="num">{t.intake == null ? '–' : fmtN(t.intake)}</b></div>
        <div><span className="tiny muted">Consumate finora</span><b className="num">~{fmtN(outSoFar(t))}</b></div>
        <div><span className="tiny muted">Allenamenti</span><b className="num">~{fmtN(t.exerciseKcal)}</b></div>
      </div>
      <div className="row-between small" style={{ marginTop: 12, flexWrap: 'wrap', gap: 6 }}>
        <span className="muted">Ieri {y.balance == null ? 'non registrato' : <b style={{ color: 'var(--text)' }}>{balanceLabel(y.balance).toLowerCase()} {signed(y.balance)}</b>}</span>
        <span className="muted">Settimana {w.avgBalance == null ? '–' : <b style={{ color: 'var(--text)' }}>{signed(w.avgBalance)}/giorno</b>}</span>
      </div>
      <div className="tiny muted" style={{ marginTop: 4 }}>Stime · a fine giornata consumerai circa {fmtN(t.out)} kcal</div>
    </Link>
  );
}
