/** Grafici SVG leggeri e accessibili, basati esclusivamente sui dati passati. */
import { useId, useMemo, useRef, useState } from 'react';

export interface Pt { x: number; y: number; label?: string; tip?: string }

function niceRange(min: number, max: number) {
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; return [min - d, max + d]; }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

export function LineChart({ points, height = 180, color = 'var(--accent)', format = (v: number) => String(Math.round(v)), area = true, ariaLabel, goal }: {
  points: Pt[]; height?: number; color?: string; format?: (v: number) => string; area?: boolean; ariaLabel: string; goal?: number | null;
}) {
  const W = 600, H = height, padL = 40, padR = 12, padT = 12, padB = 26;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const calc = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y).concat(goal != null ? [goal] : []);
    const [y0, y1] = niceRange(Math.min(...ys), Math.max(...ys));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const sx = (x: number) => (x1 === x0 ? (padL + W - padR) / 2 : padL + ((x - x0) / (x1 - x0)) * (W - padL - padR));
    const sy = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (H - padT - padB);
    const ticks = [0, 0.5, 1].map((t) => y0 + (y1 - y0) * t);
    return { sx, sy, ticks };
  }, [points, H, goal]);
  if (!calc) return null;
  const { sx, sy, ticks } = calc;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const areaD = `${d} L${sx(points[points.length - 1].x)},${H - padB} L${sx(points[0].x)},${H - padB} Z`;
  const gid = `g${Math.random().toString(36).slice(2, 7)}`;
  const labelIdx = points.length <= 6 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(sx(p.x) - x); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)} preserveAspectRatio="none" style={{ height: H }}>
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <g className="grid">{ticks.map((t, i) => <line key={i} x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} />)}</g>
        {ticks.map((t, i) => <text key={i} x={padL - 6} y={sy(t) + 3} textAnchor="end">{format(t)}</text>)}
        {goal != null && <line x1={padL} x2={W - padR} y1={sy(goal)} y2={sy(goal)} stroke="var(--orange)" strokeDasharray="6 5" strokeWidth={1.5} />}
        {area && <path d={areaD} fill={`url(#${gid})`} />}
        <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={hover === i ? 5 : points.length > 30 ? 0 : 3} fill={color} />)}
        {labelIdx.map((i) => points[i]?.label && <text key={`l${i}`} x={sx(points[i].x)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{points[i].label}</text>)}
        {hp && <line x1={sx(hp.x)} x2={sx(hp.x)} y1={padT} y2={H - padB} stroke="var(--border-strong)" />}
      </svg>
      {hp && <div className="chart-tip" style={{ left: `${(sx(hp.x) / W) * 100}%`, top: (sy(hp.y) / H) * H }}>{hp.tip ?? `${hp.label ?? ''} · ${format(hp.y)}`}</div>}
    </div>
  );
}

export function BarChart({ data, height = 160, color = 'var(--accent)', format = (v: number) => String(Math.round(v)), ariaLabel, highlightLast }: {
  data: { label: string; value: number; tip?: string }[]; height?: number; color?: string; format?: (v: number) => string; ariaLabel: string; highlightLast?: boolean;
}) {
  const W = 600, H = height, padB = 22, padT = 18;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (W / data.length) * 0.62;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ height: H }} preserveAspectRatio="none">
      {data.map((d, i) => {
        const x = (i + 0.5) * (W / data.length);
        const h = (d.value / max) * (H - padB - padT);
        const last = highlightLast && i === data.length - 1;
        return (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <rect x={x - bw / 2} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
            <rect x={x - bw / 2} y={H - padB - h} width={bw} height={Math.max(h, d.value > 0 ? 3 : 0)} rx={Math.min(8, bw / 3)} fill={color} opacity={hover === null || hover === i ? (last || !highlightLast ? 1 : 0.55) : 0.35} />
            {(hover === i || (d.value > 0 && data.length <= 8)) && <text x={x} y={H - padB - h - 5} textAnchor="middle" style={{ fill: 'var(--text-2)', fontWeight: 600 }}>{d.tip ?? format(d.value)}</text>}
            {(data.length <= 12 || i % Math.ceil(data.length / 8) === 0) && <text x={x} y={H - 6} textAnchor="middle">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ parts, size = 132, stroke = 16, children, ariaLabel }: { parts: { value: number; color: string }[]; size?: number; stroke?: number; children?: React.ReactNode; ariaLabel: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={ariaLabel}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        {total > 0 && parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} stroke={p.color} strokeWidth={stroke} fill="none" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
          acc += len;
          return el;
        })}
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

export function Heatmap({ grid }: { grid: { key: string; count: number; future: boolean }[][] }) {
  return (
    <div className="heat" style={{ gridTemplateColumns: `repeat(${grid.length}, 1fr)` }} role="img" aria-label="Calendario della costanza: ogni quadrato è un giorno">
      {grid.flat().map((d) => <i key={d.key} className={`${d.count >= 2 ? 'l2' : d.count === 1 ? 'l2' : ''} ${d.future ? 'f' : ''}`} title={`${d.key}: ${d.count} allenamenti`} />)}
    </div>
  );
}

/** Mini grafico di tendenza senza assi (per le card riassuntive). Si disegna con un'animazione al primo render. */
export function Sparkline({ values, color = 'var(--accent)', height = 40 }: { values: number[]; color?: string; height?: number }) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return null;
  const W = 120; const H = height;
  const min = Math.min(...values); const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 4 - ((v - min) / span) * (H - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden>
      <defs><linearGradient id={`sp${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#sp${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} className="draw" />
    </svg>
  );
}
