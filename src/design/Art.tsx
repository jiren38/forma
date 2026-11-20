/**
 * Illustrazioni originali di Forma (vettoriali, leggere, offline) e supporto alle foto con licenza.
 * Le figure riusano lo stesso motore delle animazioni degli esercizi (stickman), in pose statiche o in movimento.
 */
import { memo, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Figure, regionsFor } from '@/features/exercises/anim/render';
import { PATTERN_MAP } from '@/features/exercises/anim/patterns';
import type { MuscleGroup } from '@/lib/types';
import { VISUALS, type ArtSpec, type Visual, type VisualKey } from './visuals';

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fase 0..1 in loop, in pausa quando l'elemento non è visibile o se l'utente preferisce meno movimento. */
function useLoopPhase(duration: number, enabled: boolean, initial: number, host: React.RefObject<Element>) {
  const [phase, setPhase] = useState(initial);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled || !host.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '40px' });
    io.observe(host.current);
    return () => io.disconnect();
  }, [enabled, host]);
  useEffect(() => {
    if (!enabled || !visible || reduceMotion()) return;
    let raf = 0; let last = performance.now(); let p = phase;
    const tick = (now: number) => {
      p = (p + (now - last) / 1000 / duration) % 1; last = now;
      setPhase(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visible, duration]);
  return phase;
}

/** Figura dell'atleta su sfondo trasparente, con i muscoli evidenziati nel colore indicato. */
export const FigureArt = memo(function FigureArt({ pattern, muscles = [], phase = 0.5, animate, color = 'var(--accent)', x = 0, y = 0, size = 200 }: {
  pattern: string; muscles?: MuscleGroup[]; phase?: number; animate?: boolean; color?: string; x?: number; y?: number; size?: number;
}) {
  const p = PATTERN_MAP[pattern] ?? PATTERN_MAP.squat_bw;
  const ref = useRef<SVGSVGElement>(null);
  const ph = useLoopPhase(p.duration, !!animate, phase, ref);
  return (
    <svg ref={ref} x={x} y={y} width={size} height={size} viewBox="0 0 200 200" overflow="visible" style={{ ['--accent' as string]: color } as CSSProperties}>
      <Figure pattern={p} phase={animate ? ph : phase} highlight={regionsFor(muscles)} />
    </svg>
  );
});

function Backdrop({ id, color, color2, motif }: { id: string; color: string; color2: string; motif: 'arcs' | 'grid' | 'speed' | 'dots' }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color2} />
          <stop offset="0.75" stopColor="#0a0b0d" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.7" cy="0.45" r="0.55">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="0.6" stopColor={color} stopOpacity="0.08" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-floor`} x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="0.5" stopColor={color} stopOpacity="0.9" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-bg)`} />
      <rect width="320" height="200" fill={`url(#${id}-glow)`} />
      {motif === 'arcs' && <g fill="none" stroke={color} strokeOpacity="0.16">{[40, 70, 100, 130, 160].map((r) => <circle key={r} cx="230" cy="96" r={r} />)}</g>}
      {motif === 'grid' && (
        <g stroke={color} strokeOpacity="0.14">
          {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={230 + (i - 4) * 14} y1="150" x2={230 + (i - 4) * 46} y2="200" />)}
          {[156, 166, 180, 198].map((yy) => <line key={yy} x1="40" y1={yy} x2="320" y2={yy} />)}
          <g fill="none" strokeOpacity="0.12">{[60, 95, 130].map((r) => <circle key={r} cx="230" cy="90" r={r} />)}</g>
        </g>
      )}
      {motif === 'speed' && (
        <g stroke={color} strokeLinecap="round">
          {[[40, 70, 120], [20, 96, 150], [60, 122, 100], [30, 140, 130], [80, 50, 70]].map(([x1, yy, w], i) => <line key={i} x1={x1} y1={yy} x2={x1 + w} y2={yy} strokeOpacity={0.12 + (i % 3) * 0.08} strokeWidth={i % 2 ? 2 : 3} />)}
        </g>
      )}
      {motif === 'dots' && <g fill={color} fillOpacity="0.18">{Array.from({ length: 60 }, (_, i) => <circle key={i} cx={(i % 12) * 26 + 14} cy={Math.floor(i / 12) * 26 + 20} r="1.4" />)}</g>}
    </>
  );
}

function FoodMotif({ id, color }: { id: string; color: string }) {
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-plate`} cx="0.45" cy="0.4" r="0.7"><stop offset="0" stopColor="#2a2d33" /><stop offset="1" stopColor="#15171b" /></radialGradient>
      </defs>
      <ellipse cx="226" cy="178" rx="92" ry="12" fill="#000" opacity="0.35" />
      <circle cx="226" cy="100" r="80" fill={`url(#${id}-plate)`} stroke={color} strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="226" cy="100" r="64" fill="none" stroke="#fff" strokeOpacity="0.06" strokeWidth="2" />
      {/* cereali */}
      <g fill="#f3e3b5">{Array.from({ length: 22 }, (_, i) => <rect key={i} x={182 + (i % 6) * 8 + (Math.floor(i / 6) % 2) * 4} y={98 + Math.floor(i / 6) * 7} width="7" height="4" rx="2" transform={`rotate(${(i * 37) % 60 - 30} ${185 + (i % 6) * 8} ${100 + Math.floor(i / 6) * 7})`} />)}</g>
      {/* salmone */}
      <path d="M232 52 q34 -6 46 22 q-12 22 -46 16 q-10 -18 0 -38z" fill="#ff8a5c" />
      <g stroke="#ffd2bf" strokeWidth="2.2" strokeLinecap="round" opacity="0.8"><path d="M244 58 q8 12 4 26" fill="none" /><path d="M256 58 q8 12 4 28" fill="none" /><path d="M268 64 q6 10 2 22" fill="none" /></g>
      {/* avocado */}
      <g transform="rotate(-20 262 128)"><ellipse cx="262" cy="128" rx="20" ry="27" fill="#7bbf3a" /><ellipse cx="262" cy="128" rx="15" ry="21" fill="#d8ef8e" /><circle cx="262" cy="133" r="8" fill="#8a5a2b" /></g>
      {/* foglie */}
      <g fill="#4fbf4f">{[[196, 66, -30], [210, 58, 10], [184, 80, -60], [204, 74, 40]].map(([cx, cy, r], i) => <ellipse key={i} cx={cx} cy={cy} rx="16" ry="7" transform={`rotate(${r} ${cx} ${cy})`} opacity={0.85 - i * 0.1} />)}</g>
      {/* pomodorini */}
      <g><circle cx="228" cy="150" r="9" fill="#ff4d4d" /><circle cx="244" cy="156" r="7" fill="#ff6b4d" /><circle cx="214" cy="140" r="6" fill="#ff4d4d" /></g>
      {/* forchetta */}
      <g stroke="#cfd3da" strokeWidth="4" strokeLinecap="round"><line x1="120" y1="40" x2="120" y2="170" /><line x1="112" y1="40" x2="112" y2="70" strokeWidth="3" /><line x1="128" y1="40" x2="128" y2="70" strokeWidth="3" /></g>
    </g>
  );
}

function ChartMotif({ color }: { color: string }) {
  const bars = [38, 52, 46, 70, 64, 92, 118];
  return (
    <g>
      <g stroke="#fff" strokeOpacity="0.07">{[60, 95, 130, 165].map((yy) => <line key={yy} x1="120" y1={yy} x2="312" y2={yy} />)}</g>
      {bars.map((h, i) => <rect key={i} x={132 + i * 25} y={170 - h} width="15" height={h} rx="5" fill={color} opacity={0.25 + i * 0.1} />)}
      <polyline points={bars.map((h, i) => `${139.5 + i * 25},${150 - h * 0.95}`).join(' ')} fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {bars.map((h, i) => <circle key={i} cx={139.5 + i * 25} cy={150 - h * 0.95} r={i === bars.length - 1 ? 6 : 3.5} fill={i === bars.length - 1 ? color : '#fff'} stroke={i === bars.length - 1 ? '#fff' : 'none'} strokeWidth="2" />)}
      <g transform="translate(118 30)" fill={color}><path d="M0 -10 L3 -3 L10 -3 L4.5 1.5 L6.5 9 L0 4.5 L-6.5 9 L-4.5 1.5 L-10 -3 L-3 -3z" /></g>
    </g>
  );
}

function CalmMotif({ id, color }: { id: string; color: string }) {
  return (
    <g>
      <defs><mask id={`${id}-moon`}><rect width="320" height="200" fill="#fff" /><circle cx="252" cy="54" r="34" fill="#000" /></mask></defs>
      <circle cx="236" cy="66" r="36" fill="#e9f5f2" mask={`url(#${id}-moon)`} />
      <g fill="#fff">{[[150, 30, 1.6], [180, 60, 1.2], [290, 110, 1.4], [130, 80, 1], [300, 30, 1.8], [200, 24, 1]].map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} opacity="0.8" />)}</g>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M0 ${140 + i * 18} C 60 ${124 + i * 18}, 120 ${160 + i * 18}, 180 ${142 + i * 18} S 290 ${128 + i * 18}, 320 ${140 + i * 18} L320 200 L0 200z`} fill={color} opacity={0.18 + i * 0.16} />
      ))}
      <path d="M96 52 C 96 52, 80 74, 80 84 a16 16 0 0 0 32 0 C 112 74, 96 52, 96 52z" fill={color} opacity="0.85" />
    </g>
  );
}

function NeuralMotif({ id, color }: { id: string; color: string }) {
  const nodes: [number, number][] = [[150, 40], [190, 90], [150, 150], [240, 40], [236, 150], [290, 90], [120, 100], [300, 160], [300, 24]];
  const links: [number, number][] = [[0, 1], [1, 2], [1, 3], [1, 4], [3, 5], [4, 5], [6, 1], [6, 0], [6, 2], [5, 7], [5, 8], [3, 8], [4, 7]];
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-orb`}><stop offset="0" stopColor="#fff" /><stop offset="0.35" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
      </defs>
      <g stroke={color} strokeOpacity="0.45" strokeWidth="1.4">{links.map(([a, b], i) => <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />)}</g>
      {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 1 ? 0 : 4} fill="#fff" stroke={color} strokeWidth="2" />)}
      <circle cx="210" cy="96" r="46" fill={`url(#${id}-orb)`} opacity="0.85" className="art-pulse" />
      <path d="M210 74 L215 91 L232 96 L215 101 L210 118 L205 101 L188 96 L205 91z" fill="#fff" />
      <g fill="none" stroke="#fff" strokeOpacity="0.15">{[62, 84].map((r) => <circle key={r} cx="210" cy="96" r={r} />)}</g>
    </g>
  );
}

function RingsMotif() {
  const rings: [number, string, number][] = [[70, 'var(--c-training)', 0.72], [54, 'var(--c-nutrition)', 0.55], [38, 'var(--c-cardio)', 0.85]];
  return (
    <g transform="translate(232 100)">
      {rings.map(([r, c, p]) => {
        const len = 2 * Math.PI * r;
        return (
          <g key={r} transform="rotate(-90)">
            <circle r={r} fill="none" stroke={c} strokeOpacity="0.16" strokeWidth="12" />
            <circle r={r} fill="none" stroke={c} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${len * p} ${len}`} />
          </g>
        );
      })}
    </g>
  );
}

/** Pannello illustrato: sfondo, motivo e soggetto. È sempre scuro (anche nel tema chiaro) come una foto. */
export function ArtPanel({ visual, spec, color, color2, animate, className, style, children, label }: {
  visual?: VisualKey; spec?: ArtSpec; color?: string; color2?: string; animate?: boolean; className?: string; style?: CSSProperties; children?: ReactNode; label?: string;
}) {
  const v: Visual | undefined = visual ? VISUALS[visual] : undefined;
  const s = spec ?? v?.art ?? { kind: 'rings' };
  const c = color ?? v?.color ?? 'var(--accent)';
  const c2 = color2 ?? v?.color2 ?? '#1a1d22';
  const id = useId().replace(/:/g, '');
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = v?.photo && !photoFailed ? v.photo : null;
  const motif = s.kind === 'figure' ? (s.scene === 'track' ? 'speed' : s.scene === 'gym' ? 'grid' : 'arcs') : s.kind === 'chart' ? 'dots' : s.kind === 'neural' ? 'arcs' : 'arcs';
  return (
    <div className={`art ${className ?? ''}`} style={{ ['--art-c' as string]: c, ...style } as CSSProperties} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {photo ? (
        <img className="art-photo" src={photo.src} alt="" style={{ objectPosition: photo.position }} loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} />
      ) : (
        <svg className="art-svg" viewBox="0 0 320 200" preserveAspectRatio="xMaxYMid slice">
          <Backdrop id={id} color={c} color2={c2} motif={motif} />
          {s.kind === 'food' && <FoodMotif id={id} color={c} />}
          {s.kind === 'chart' && <ChartMotif color={c} />}
          {s.kind === 'calm' && <CalmMotif id={id} color={c} />}
          {s.kind === 'neural' && <NeuralMotif id={id} color={c} />}
          {s.kind === 'rings' && <RingsMotif />}
        </svg>
      )}
      {!photo && s.kind === 'figure' && (
        <svg className="art-fig" viewBox="0 0 200 200" preserveAspectRatio="xMidYMax meet" overflow="visible">
          <defs>
            <radialGradient id={`${id}-fl`}><stop offset="0" stopColor={c} stopOpacity="0.8" /><stop offset="1" stopColor={c} stopOpacity="0" /></radialGradient>
          </defs>
          <ellipse cx="100" cy="182" rx="88" ry="7" fill={`url(#${id}-fl)`} />
          <FigureArt pattern={s.pattern} muscles={s.muscles} phase={s.phase} animate={animate} color={c} />
        </svg>
      )}
      <div className="art-shade" />
      {children}
    </div>
  );
}
