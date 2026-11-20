/** Grafici del bilancio energetico: barre sopra/sotto lo zero e due linee (assunte vs consumate). */
import { useMemo, useRef, useState } from 'react';
import { fmtN } from '@/lib/util';

export interface BalanceBar { key: string; label: string; value: number | null; tip: string; muted?: boolean }

/** Barre divergenti: sotto lo zero il deficit (blu), sopra il surplus (arancio). I giorni senza pasti sono vuoti. */
export function BalanceBars({ data, height = 170, ariaLabel, onPick, selected }: { data: BalanceBar[]; height?: number; ariaLabel: string; onPick?: (key: string) => void; selected?: string }) {
  const W = 600, H = height, padT = 14, padB = 22, padL = 44, padR = 6;
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.map((d) => d.value ?? 0);
  const m = Math.max(250, ...vals.map(Math.abs));
  const max = Math.max(...vals, 0) > 0 ? m : 250, min = Math.min(...vals, 0) < 0 ? -m : -250;
  const sy = (v: number) => padT + ((max - v) / (max - min)) * (H - padT - padB);
  const step = (W - padL - padR) / Math.max(1, data.length);
  const bw = Math.max(3, step * 0.62);
  const every = data.length <= 12 ? 1 : Math.ceil(data.length / 8);
  const hp = hover != null ? data[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ height: H }} preserveAspectRatio="none" onPointerLeave={() => setHover(null)}>
        <g className="grid">{[max, max / 2, min / 2, min].map((t, i) => <line key={i} x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} />)}</g>
        {[max, 0, min].map((t, i) => <text key={i} x={padL - 6} y={sy(t) + 3} textAnchor="end">{t > 0 ? '+' : ''}{fmtN(Math.round(t))}</text>)}
        <line x1={padL} x2={W - padR} y1={sy(0)} y2={sy(0)} stroke="var(--border-strong)" strokeWidth={1.5} />
        {data.map((d, i) => {
          const x = padL + (i + 0.5) * step;
          const v = d.value;
          const y = v == null ? sy(0) : Math.min(sy(0), sy(v));
          const h = v == null ? 0 : Math.max(2, Math.abs(sy(v) - sy(0)));
          const col = v == null ? 'var(--surface-3)' : v < 0 ? 'var(--blue)' : 'var(--orange)';
          const dim = (hover != null && hover !== i) || (selected && selected !== d.key) || d.muted;
          return (
            <g key={d.key} onPointerEnter={() => setHover(i)} onClick={() => onPick?.(d.key)} style={{ cursor: onPick ? 'pointer' : undefined }}>
              <rect x={x - step / 2} y={padT} width={step} height={H - padT - padB} fill="transparent" />
              {v == null
                ? <rect x={x - bw / 2} y={sy(0) - 1.5} width={bw} height={3} rx={1.5} fill="var(--surface-3)" />
                : <rect x={x - bw / 2} y={y} width={bw} height={h} rx={Math.min(5, bw / 3)} fill={col} opacity={dim ? 0.45 : 1} />}
              {i % every === 0 && <text x={x} y={H - 6} textAnchor="middle">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {hp && <div className="chart-tip" style={{ left: `${((padL + (hover! + 0.5) * step) / W) * 100}%`, top: 4 }}>{hp.tip}</div>}
    </div>
  );
}

export interface DualPt { key: string; label: string; a: number | null; b: number | null; tip: string }

/** Due serie sullo stesso asse: a = assunte (verde), b = consumate (arancio). */
export function DualLine({ points, height = 190, ariaLabel, aLabel, bLabel }: { points: DualPt[]; height?: number; ariaLabel: string; aLabel: string; bLabel: string }) {
  const W = 600, H = height, padL = 44, padR = 10, padT = 12, padB = 24;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const calc = useMemo(() => {
    const ys = points.flatMap((p) => [p.a, p.b]).filter((v): v is number => v != null);
    if (!ys.length) return null;
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(100, (y1 - y0) * 0.15); y0 -= pad; y1 += pad;
    const sx = (i: number) => (points.length === 1 ? (padL + W - padR) / 2 : padL + (i / (points.length - 1)) * (W - padL - padR));
    const sy = (v: number) => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);
    return { sx, sy, ticks: [y0 + pad, (y0 + y1) / 2, y1 - pad] };
  }, [points, H]);
  if (!calc) return null;
  const { sx, sy, ticks } = calc;
  const path = (k: 'a' | 'b') => {
    let d = '', pen = false;
    points.forEach((p, i) => { const v = p[k]; if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)} `; pen = true; });
    return d;
  };
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((_, i) => { const dd = Math.abs(sx(i) - x); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };
  const every = points.length <= 8 ? 1 : Math.ceil(points.length / 6);
  const hp = hover != null ? points[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ height: H }} preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <g className="grid">{ticks.map((t, i) => <line key={i} x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} />)}</g>
        {ticks.map((t, i) => <text key={i} x={padL - 6} y={sy(t) + 3} textAnchor="end">{fmtN(Math.round(t / 10) * 10)}</text>)}
        <path d={path('b')} fill="none" stroke="var(--purple)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={path('a')} fill="none" stroke="var(--success)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => <g key={p.key}>
          {p.b != null && <circle cx={sx(i)} cy={sy(p.b)} r={hover === i ? 5 : points.length > 20 ? 0 : 3} fill="var(--purple)" />}
          {p.a != null && <circle cx={sx(i)} cy={sy(p.a)} r={hover === i ? 5 : points.length > 20 ? 0 : 3} fill="var(--success)" />}
          {i % every === 0 && <text x={sx(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{p.label}</text>}
        </g>)}
        {hp && <line x1={sx(hover!)} x2={sx(hover!)} y1={padT} y2={H - padB} stroke="var(--border-strong)" />}
      </svg>
      {hp && <div className="chart-tip" style={{ left: `${(sx(hover!) / W) * 100}%`, top: 4 }}>{hp.tip}</div>}
      <div className="row tiny muted" style={{ gap: 14, marginTop: 6 }}>
        <span className="row" style={{ gap: 5 }}><i className="legend-dot" style={{ background: 'var(--success)' }} />{aLabel}</span>
        <span className="row" style={{ gap: 5 }}><i className="legend-dot" style={{ background: "var(--purple)" }} />{bLabel}</span>
      </div>
    </div>
  );
}

/** Barra orizzontale a segmenti per la composizione del consumo. */
export function StackBar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const tot = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div className="stack-bar" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round(p.value)} kcal`).join(', ')}>
      {parts.filter((p) => p.value > 0).map((p) => <i key={p.label} style={{ width: `${(p.value / tot) * 100}%`, background: p.color }} />)}
    </div>
  );
}
