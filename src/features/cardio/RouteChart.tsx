/**
 * Profilo di un percorso: una barra per fase (larga quanto dura, alta quanto la velocità
 * o la resistenza) e, sul tapis, la linea della pendenza.
 */
import { expandPhases } from '@/lib/cardio';
import type { CardioIntensity, CardioPlan } from '@/lib/types';

const COLOR: Record<CardioIntensity, string> = {
  light: 'color-mix(in srgb, var(--c-cardio) 45%, transparent)',
  moderate: 'var(--c-cardio)',
  vigorous: 'var(--warning)',
  high: 'var(--danger)',
};

export function RouteChart({ plan, height = 80, axis }: { plan: CardioPlan; height?: number; axis?: boolean }) {
  const ph = expandPhases(plan).filter((p) => p.durationSec > 0);
  const total = ph.reduce((s, p) => s + p.durationSec, 0) || 1;
  const W = 300, H = 100, GAP = ph.length > 30 ? 0.4 : 1;
  const tread = plan.machine === 'treadmill';
  const top = tread ? Math.max(8, ...ph.map((p) => p.speedKmh ?? 0)) : Math.max(1, plan.resistanceMax ?? 0, ...ph.map((p) => p.resistance ?? 0));
  const incTop = Math.max(6, ...ph.map((p) => p.inclinePct ?? 0));
  let x = 0;
  const bars = ph.map((p) => {
    const w = (p.durationSec / total) * W;
    const v = tread ? p.speedKmh ?? 0 : p.resistance ?? 0;
    const h = Math.max(4, (v / top) * (H - 8));
    const r = { x: x + GAP / 2, w: Math.max(0.6, w - GAP), h, c: COLOR[p.intensity], key: p.uid };
    x += w;
    return r;
  });
  // linea della pendenza a gradini
  let line = '';
  if (tread && ph.some((p) => (p.inclinePct ?? 0) > 0)) {
    let lx = 0;
    ph.forEach((p, i) => {
      const y = H - 4 - ((p.inclinePct ?? 0) / incTop) * (H - 14);
      const w = (p.durationSec / total) * W;
      line += `${i ? 'L' : 'M'}${lx.toFixed(1)},${y.toFixed(1)} L${(lx + w).toFixed(1)},${y.toFixed(1)} `;
      lx += w;
    });
  }
  const minutes = Math.round(total / 60);
  return (
    <div className="route-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} role="img"
        aria-label={tread ? 'Profilo del percorso: velocità (barre) e pendenza (linea)' : 'Profilo del percorso: resistenza per fase'}>
        {bars.map((b) => <rect key={b.key} x={b.x} y={H - b.h} width={b.w} height={b.h} rx={1.5} fill={b.c} />)}
        {line && <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      </svg>
      {axis && (
        <div className="route-axis">
          <span>0’</span><span>{Math.round(minutes / 2)}’</span><span>{minutes}’</span>
          {tread && <span className="legend"><i className="b" /> velocità <i className="l" /> pendenza</span>}
        </div>
      )}
    </div>
  );
}
