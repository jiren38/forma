import { useEffect, useRef, useState, memo } from 'react';
import { Pause, Play, RotateCcw, Gauge } from 'lucide-react';
import type { MuscleGroup } from '@/lib/types';
import { poseAt, solvePose, type Pattern, type Solved, type Vec, type SceneItem, type PropAttach } from './skeleton';
import { PATTERN_MAP } from './patterns';

type Region = 'chest' | 'back' | 'abs' | 'delt' | 'upper' | 'upperBack' | 'fore' | 'thighFront' | 'thighBack' | 'glute' | 'calf' | 'traps';

const MUSCLE_REGIONS: Partial<Record<MuscleGroup, Region[]>> = {
  chest: ['chest'], back: ['back'], lats: ['back'], traps: ['traps'], lower_back: ['back'],
  shoulders: ['delt'], front_delts: ['delt'], side_delts: ['delt'], rear_delts: ['delt'],
  biceps: ['upper'], triceps: ['upperBack'], forearms: ['fore'], abs: ['abs'], obliques: ['abs'],
  quads: ['thighFront'], hamstrings: ['thighBack'], glutes: ['glute'], adductors: ['thighFront'], abductors: ['glute'],
  calves: ['calf'], hip_flexors: ['thighFront'],
};

export function regionsFor(muscles: MuscleGroup[]): Set<Region> {
  const s = new Set<Region>();
  muscles.forEach((m) => MUSCLE_REGIONS[m]?.forEach((r) => s.add(r)));
  return s;
}

const L = (a: Vec, b: Vec, w: number, color: string, key: string, op = 1) => (
  <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" opacity={op} />
);
const off = (a: Vec, b: Vec, d: number): [Vec, Vec] => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * d, ny = dx / len * d;
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]];
};
const lerpP = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function anchorPos(s: Solved, at: PropAttach['at']): Vec {
  switch (at) {
    case 'hand': return s.hand;
    case 'hand2': return s.hand2;
    case 'hands': return [(s.hand[0] + s.hand2[0]) / 2, (s.hand[1] + s.hand2[1]) / 2];
    case 'shoulder': return s.shoulder;
    case 'hip': return s.hip;
  }
}

function Prop({ p, s, view, i }: { p: PropAttach; s: Solved; view: 'side' | 'front'; i: number }) {
  const [x0, y0] = anchorPos(s, p.at);
  const x = x0 + (p.dx ?? 0), y = y0 + (p.dy ?? 0);
  const metal = 'var(--anim-metal)';
  switch (p.kind) {
    case 'barbell':
      return view === 'side'
        ? <g key={i}><circle cx={x} cy={y} r={15} fill="var(--anim-plate)" stroke={metal} strokeWidth={2} /><circle cx={x} cy={y} r={3} fill={metal} /></g>
        : <g key={i}><line x1={x - 60} y1={y} x2={x + 60} y2={y} stroke={metal} strokeWidth={3} /><rect x={x - 66} y={y - 14} width={7} height={28} rx={2} fill="var(--anim-plate)" /><rect x={x + 59} y={y - 14} width={7} height={28} rx={2} fill="var(--anim-plate)" /></g>;
    case 'ezbar':
      return <g key={i}><circle cx={x} cy={y} r={11} fill="var(--anim-plate)" stroke={metal} strokeWidth={2} /><circle cx={x} cy={y} r={2.5} fill={metal} /></g>;
    case 'dumbbell':
      return <g key={i}><rect x={x - 9} y={y - 3} width={18} height={6} rx={2} fill={metal} /><rect x={x - 11} y={y - 7} width={6} height={14} rx={2} fill="var(--anim-plate)" /><rect x={x + 5} y={y - 7} width={6} height={14} rx={2} fill="var(--anim-plate)" /></g>;
    case 'kettlebell':
      return <g key={i}><circle cx={x} cy={y + 11} r={9} fill="var(--anim-plate)" /><path d={`M${x - 5} ${y + 4} Q${x} ${y - 6} ${x + 5} ${y + 4}`} stroke={metal} strokeWidth={2.5} fill="none" /></g>;
    case 'medball':
      return <circle key={i} cx={x} cy={y} r={9} fill="var(--anim-plate)" stroke={metal} strokeWidth={1.5} />;
    case 'plate':
      return <circle key={i} cx={x} cy={y} r={12} fill="var(--anim-plate)" stroke={metal} strokeWidth={2} />;
    case 'handle':
      return <rect key={i} x={x - 6} y={y - 2.5} width={12} height={5} rx={2} fill={metal} />;
    case 'rope':
      return <g key={i}><line x1={x} y1={y} x2={x + 4} y2={y + 10} stroke={metal} strokeWidth={3} strokeLinecap="round" /><line x1={x} y1={y} x2={x - 4} y2={y + 10} stroke={metal} strokeWidth={3} strokeLinecap="round" /></g>;
  }
}

function Scene({ it, s, i }: { it: SceneItem; s: Solved; i: number }) {
  const eq = 'var(--anim-equip)';
  switch (it.type) {
    case 'bench':
      return <g key={i}><rect x={it.x} y={it.y} width={it.w ?? 100} height={8} rx={3} fill={eq} /><rect x={it.x + 8} y={it.y + 8} width={5} height={180 - it.y - 8} fill={eq} opacity={0.7} /><rect x={it.x + (it.w ?? 100) - 13} y={it.y + 8} width={5} height={180 - it.y - 8} fill={eq} opacity={0.7} /></g>;
    case 'seat':
      return <g key={i}><rect x={it.x} y={it.y} width={it.w ?? 50} height={8} rx={3} fill={eq} /><rect x={it.x + (it.w ?? 50) / 2 - 3} y={it.y + 8} width={6} height={180 - it.y - 8} fill={eq} opacity={0.7} /></g>;
    case 'incline':
      return <rect key={i} x={it.x} y={it.y} width={it.w ?? 60} height={8} rx={3} fill={eq} transform={`rotate(${it.angle ?? -40} ${it.x} ${it.y})`} />;
    case 'pad':
      if (it.to === 'ankle') return <circle key={i} cx={s.ankle[0]} cy={s.ankle[1] - 2} r={6} fill={eq} />;
      return <rect key={i} x={it.x} y={it.y} width={it.w ?? 8} height={it.h ?? 40} rx={4} fill={eq} />;
    case 'box':
      return <rect key={i} x={it.x} y={it.y} width={it.w ?? 50} height={it.h ?? 40} rx={3} fill={eq} />;
    case 'bar':
      return <g key={i}><line x1={it.x - (it.w ?? 20)} y1={it.y} x2={it.x + (it.w ?? 20)} y2={it.y} stroke="var(--anim-metal)" strokeWidth={4} strokeLinecap="round" /></g>;
    case 'rack':
      return <g key={i}><rect x={it.x - 3} y={it.y} width={6} height={it.h ?? 140} fill={eq} opacity={0.45} /></g>;
    case 'mat':
      return <rect key={i} x={it.x} y={it.y} width={it.w ?? 150} height={3} rx={1.5} fill="var(--accent)" opacity={0.35} />;
    case 'wall':
      return <rect key={i} x={it.x} y={it.y} width={6} height={it.h ?? 160} fill={eq} opacity={0.6} />;
    case 'cable': {
      const target = it.to === 'hand2' ? s.hand2 : s.hand;
      return <g key={i}><circle cx={it.x} cy={it.y} r={4} fill={eq} /><line x1={it.x} y1={it.y} x2={target[0]} y2={target[1]} stroke="var(--anim-metal)" strokeWidth={1.4} strokeDasharray="3 2" /></g>;
    }
    case 'machine': {
      // pedana della leg press perpendicolare alla spinta
      const [ax, ay] = s.ankle;
      return <g key={i}><line x1={ax - 18} y1={ay - 14} x2={ax + 14} y2={ay + 18} stroke={eq} strokeWidth={6} strokeLinecap="round" /><line x1={ax + 6} y1={ay + 4} x2={ax + 40} y2={ay - 30} stroke={eq} strokeWidth={3} opacity={0.5} /></g>;
    }
    case 'bike':
      return <g key={i}><circle cx={it.x} cy={it.y} r={5} fill={eq} /><line x1={it.x} y1={it.y} x2={84} y2={110} stroke={eq} strokeWidth={5} /><line x1={it.x} y1={it.y} x2={138} y2={92} stroke={eq} strokeWidth={5} /><line x1={it.x - 30} y1={180} x2={it.x + 40} y2={180} stroke={eq} strokeWidth={6} /><line x1={it.x} y1={it.y} x2={it.x} y2={180} stroke={eq} strokeWidth={5} /><rect x={72} y={106} width={24} height={5} rx={2} fill={eq} /></g>;
    case 'rower':
      return <g key={i}><rect x={it.x} y={it.y} width={it.w ?? 150} height={5} rx={2} fill={eq} /><rect x={(it.x) + (it.w ?? 150) - 22} y={it.y - 26} width={18} height={26} rx={4} fill={eq} opacity={0.8} /></g>;
    case 'treadmill':
      return <g key={i}><rect x={it.x} y={it.y + 1} width={it.w ?? 130} height={4} rx={2} fill={eq} /><line x1={(it.x) + (it.w ?? 130) - 6} y1={it.y} x2={(it.x) + (it.w ?? 130) + 4} y2={it.y - 70} stroke={eq} strokeWidth={4} /></g>;
    case 'rope':
      return null;
  }
}

export function Figure({ pattern, phase, highlight }: { pattern: Pattern; phase: number; highlight: Set<Region> }) {
  const k = poseAt(pattern, phase);
  const s = solvePose(k, pattern.view);
  const body = 'var(--anim-body)';
  const far = 'var(--anim-body-far)';
  const hi = 'var(--accent)';
  const has = (r: Region) => highlight.has(r);
  const front = pattern.view === 'front';
  const els: JSX.Element[] = [];
  // arti lontani (dietro)
  const farArm = [L(s.shoulder2, s.elbow2, 8, has('upper') || has('upperBack') ? hi : far, 'fa1', front ? 1 : 0.9), L(s.elbow2, s.hand2, 7, has('fore') ? hi : far, 'fa2', front ? 1 : 0.9)];
  const farLeg = [L(s.hip2, s.knee2, 11, has('thighFront') || has('thighBack') ? hi : far, 'fl1', front ? 1 : 0.9), L(s.knee2, s.ankle2, 9, has('calf') ? hi : far, 'fl2', front ? 1 : 0.9), L(s.ankle2, s.toe2, 6, far, 'fl3')];
  els.push(...farLeg, ...farArm);
  // busto
  const chestHi = has('chest') || has('abs');
  els.push(L(s.hip, s.shoulder, 19, body, 'torso'));
  if (front) {
    els.push(L(s.hip2, s.hip, 14, body, 'pelvis'), L(s.shoulder2, s.shoulder, 12, body, 'shoulders'));
    const mid = lerpP(s.hip, s.shoulder, 0.5);
    const top: Vec = [(s.shoulder[0] + s.shoulder2[0]) / 2, (s.shoulder[1] + s.shoulder2[1]) / 2 + 4];
    if (has('chest')) els.push(L([top[0] - 8, top[1] + 5], [top[0] + 8, top[1] + 5], 9, hi, 'pecs'));
    if (has('abs')) els.push(L([mid[0], mid[1] + 18], [mid[0], mid[1] - 2], 9, hi, 'absF'));
    if (has('back') || has('traps')) els.push(L([top[0], top[1]], [top[0], top[1] + 14], 6, hi, 'backF', 0.6));
  } else {
    // lato anteriore (+normale) e posteriore
    const dir = s.torsoAngle;
    const frontSign = 1; // normale sinistra = davanti per figura rivolta a destra
    const [fa, fb] = off(s.hip, s.shoulder, -5.5 * frontSign);
    const [ba, bb] = off(s.hip, s.shoulder, 5.5 * frontSign);
    if (has('chest')) els.push(L(lerpP(fa, fb, 0.62), lerpP(fa, fb, 0.92), 8, hi, 'chest'));
    if (has('abs')) els.push(L(lerpP(fa, fb, 0.12), lerpP(fa, fb, 0.55), 8, hi, 'abs'));
    if (has('back')) els.push(L(lerpP(ba, bb, 0.15), lerpP(ba, bb, 0.85), 8, hi, 'back'));
    if (has('traps')) els.push(L(lerpP(ba, bb, 0.82), lerpP(s.hip, s.neck, 1), 8, hi, 'traps'));
    if (has('glute')) {
      const g = lerpP(ba, bb, 0.02);
      els.push(<circle key="glute" cx={g[0]} cy={g[1]} r={7.5} fill={hi} />);
    }
    void dir;
  }
  if (front && has('glute')) els.push(<circle key="gluteF" cx={s.hip[0]} cy={s.hip[1] + 2} r={6} fill={hi} />);
  // testa
  els.push(L(s.shoulder, s.neck, 7, body, 'neck'));
  els.push(<circle key="head" cx={s.head[0]} cy={s.head[1]} r={10} fill={body} />);
  // arti vicini
  const thighCol = has('thighFront') || has('thighBack') ? hi : body;
  els.push(L(s.hip, s.knee, 12, thighCol, 'nl1'), L(s.knee, s.ankle, 9.5, has('calf') ? hi : body, 'nl2'), L(s.ankle, s.toe, 6.5, body, 'nl3'));
  if (!front && (has('thighFront') || has('thighBack')) && !(has('thighFront') && has('thighBack'))) {
    const [a, b] = off(s.hip, s.knee, has('thighFront') ? -3 : 3);
    els.push(L(a, b, 5, 'var(--anim-body)', 'thighShade', 0.35));
  }
  els.push(L(s.shoulder, s.elbow, 8.5, has('upper') || has('upperBack') ? hi : body, 'na1'), L(s.elbow, s.hand, 7.5, has('fore') ? hi : body, 'na2'));
  if (has('delt')) {
    els.push(<circle key="delt" cx={s.shoulder[0]} cy={s.shoulder[1]} r={7} fill={hi} />);
    if (front) els.push(<circle key="delt2" cx={s.shoulder2[0]} cy={s.shoulder2[1]} r={7} fill={hi} />);
  }
  return (
    <g>
      {pattern.scene?.filter((it) => it.type !== 'cable').map((it, i) => <Scene key={`s${i}`} it={it} s={s} i={i} />)}
      {els}
      {pattern.scene?.filter((it) => it.type === 'cable').map((it, i) => <Scene key={`c${i}`} it={it} s={s} i={i} />)}
      {pattern.props?.map((p, i) => <Prop key={`p${i}`} p={p} s={s} view={pattern.view} i={i} />)}
    </g>
  );
}

export interface AnimProps {
  patternId: string;
  muscles?: MuscleGroup[];
  size?: number | string;
  autoPlay?: boolean;
  controls?: boolean;
  className?: string;
  label?: string;
}

/** Animazione dimostrativa in loop dell'esercizio, con controlli play/pausa, velocità e riavvio. */
export const ExerciseAnimation = memo(function ExerciseAnimation({ patternId, muscles = [], autoPlay = true, controls = false, className, label }: AnimProps) {
  const pattern = PATTERN_MAP[patternId] ?? PATTERN_MAP.squat_bw;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [playing, setPlaying] = useState(autoPlay && !reduce);
  const [speed, setSpeed] = useState(1);
  const [phase, setPhase] = useState(reduce ? 0.5 : 0);
  const ref = useRef<{ last: number; phase: number }>({ last: 0, phase: 0 });
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '80px' });
    io.observe(host.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    let raf = 0;
    ref.current.last = performance.now();
    const tick = (now: number) => {
      const dt = (now - ref.current.last) / 1000;
      ref.current.last = now;
      ref.current.phase = (ref.current.phase + (dt * speed) / pattern.duration) % 1;
      setPhase(ref.current.phase);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, pattern.duration, visible]);

  const hl = regionsFor(muscles);
  const phaseLabel = (() => {
    const ph = pattern.phases ?? [];
    const u = pattern.loop === 'pingpong' ? (phase < 0.5 ? phase : 1 - phase) * 2 : phase;
    let cur = ph[0]?.label ?? '';
    for (const p of ph) if ((pattern.loop === 'pingpong' ? p.t * 2 : p.t) <= u + 0.001) cur = p.label;
    return cur;
  })();

  return (
    <div ref={host} className={`anim ${className ?? ''}`}>
      <svg viewBox="0 0 200 200" role="img" aria-label={`Animazione: ${label ?? pattern.label}`} className="anim-svg">
        <defs>
          <radialGradient id="animglow" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#animglow)" />
        <line x1="8" y1="180" x2="192" y2="180" stroke="var(--anim-floor)" strokeWidth="2" strokeLinecap="round" />
        <Figure pattern={pattern} phase={phase} highlight={hl} />
      </svg>
      {controls && (
        <div className="anim-controls">
          <button className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausa animazione' : 'Riproduci animazione'}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="icon-btn" onClick={() => { ref.current.phase = 0; setPhase(0); setPlaying(true); }} aria-label="Ricomincia">
            <RotateCcw size={18} />
          </button>
          <button className="chip-btn" onClick={() => setSpeed((s) => (s === 1 ? 0.5 : s === 0.5 ? 0.25 : 1))} aria-label="Velocità animazione">
            <Gauge size={14} /> {speed}x
          </button>
          <input aria-label="Posizione nel movimento" type="range" min={0} max={1000} value={Math.round(phase * 1000)}
            onChange={(e) => { setPlaying(false); ref.current.phase = Number(e.target.value) / 1000; setPhase(ref.current.phase); }} />
        </div>
      )}
      {controls && phaseLabel && <div className="anim-phase">{phaseLabel}</div>}
    </div>
  );
});