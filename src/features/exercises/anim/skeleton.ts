/**
 * Motore di animazione scheletrica 2D (originale, nessun asset esterno).
 * Una "pose" è descritta da posizione dell'anca, inclinazione del busto e angoli/obiettivi IK degli arti.
 * I keyframe vengono interpolati e risolti con cinematica diretta o inversa a due segmenti.
 */

export const SEG = { torso: 52, neck: 7, headR: 9.5, upper: 28, fore: 26, thigh: 40, shin: 38, foot: 13 };
export const GROUND = 180;
export const ANKLE_Y = 173;

export type Vec = [number, number];
export type Bend = 'fwd' | 'back' | 'up' | 'down';

export interface Limb {
  /** angoli assoluti [segmento1, segmento2]: 0 = verso il basso, positivo = verso +x (avanti) */
  a?: Vec;
  /** obiettivo IK assoluto per l'estremità */
  ik?: Vec;
  /** obiettivo IK relativo alla spalla (solo braccia) */
  rel?: Vec;
  bend?: Bend;
}

export interface Keyframe {
  t: number; // posizione 0..1 nel ciclo
  hip: Vec;
  torso: number; // gradi dalla verticale (alto), positivo = verso avanti (+x)
  head?: number; // gradi relativi al busto
  shrug?: number; // sollevamento spalle in px
  arm: Limb;
  arm2?: Limb;
  leg: Limb;
  leg2?: Limb;
  foot?: number; // angolo del piede (0 = orizzontale in avanti, positivo = punta verso il basso)
  foot2?: number;
}

export type PropKind =
  | 'barbell' | 'dumbbell' | 'kettlebell' | 'plate' | 'medball' | 'handle' | 'rope' | 'ezbar';

export interface PropAttach { kind: PropKind; at: 'hand' | 'hand2' | 'hands' | 'shoulder' | 'hip'; dx?: number; dy?: number }

export interface SceneItem {
  type: 'bench' | 'incline' | 'box' | 'bar' | 'mat' | 'cable' | 'seat' | 'pad' | 'rack' | 'machine' | 'bike' | 'rower' | 'treadmill' | 'wall' | 'rope';
  x: number; y: number; w?: number; h?: number; angle?: number;
  /** per i cavi: punto di ancoraggio, collegato alla mano */
  to?: 'hand' | 'hand2' | 'hands' | 'ankle';
}

export interface Pattern {
  id: string;
  label: string;
  view: 'side' | 'front';
  duration: number; // secondi per ciclo completo
  loop: 'pingpong' | 'cycle';
  keys: Keyframe[];
  props?: PropAttach[];
  scene?: SceneItem[];
  phases?: { t: number; label: string }[];
}

export interface Solved {
  hip: Vec; hip2: Vec; shoulder: Vec; shoulder2: Vec; neck: Vec; head: Vec;
  elbow: Vec; hand: Vec; elbow2: Vec; hand2: Vec;
  knee: Vec; ankle: Vec; toe: Vec; knee2: Vec; ankle2: Vec; toe2: Vec;
  torsoAngle: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const fromDown = (deg: number, len: number): Vec => [Math.sin(rad(deg)) * len, Math.cos(rad(deg)) * len];
const fromUp = (deg: number, len: number): Vec => [Math.sin(rad(deg)) * len, -Math.cos(rad(deg)) * len];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];

const BEND_DIR: Record<Bend, Vec> = { fwd: [1, 0], back: [-1, 0], up: [0, -1], down: [0, 1] };

/** IK a due segmenti: restituisce il giunto intermedio e l'estremità effettiva. */
export function solveIK(root: Vec, target: Vec, l1: number, l2: number, bend: Bend): [Vec, Vec] {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.01;
  const minD = Math.abs(l1 - l2) + 0.01;
  const ux = d === 0 ? 0 : dx / d;
  const uy = d === 0 ? 1 : dy / d;
  d = Math.max(minD, Math.min(maxD, d));
  const end: Vec = [root[0] + ux * d, root[1] + uy * d];
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const base = Math.atan2(uy, ux);
  const c1: Vec = [root[0] + Math.cos(base + a) * l1, root[1] + Math.sin(base + a) * l1];
  const c2: Vec = [root[0] + Math.cos(base - a) * l1, root[1] + Math.sin(base - a) * l1];
  const pref = BEND_DIR[bend];
  const mid: Vec = [(root[0] + end[0]) / 2, (root[1] + end[1]) / 2];
  const s1 = (c1[0] - mid[0]) * pref[0] + (c1[1] - mid[1]) * pref[1];
  const s2 = (c2[0] - mid[0]) * pref[0] + (c2[1] - mid[1]) * pref[1];
  return [s1 >= s2 ? c1 : c2, end];
}

function solveLimb(root: Vec, limb: Limb, l1: number, l2: number, shoulder: Vec | null, defBend: Bend): [Vec, Vec] {
  if (limb.a) {
    const j = add(root, fromDown(limb.a[0], l1));
    return [j, add(j, fromDown(limb.a[1], l2))];
  }
  const target = limb.rel && shoulder ? add(shoulder, limb.rel) : (limb.ik ?? add(root, [0, l1 + l2]));
  return solveIK(root, target, l1, l2, limb.bend ?? defBend);
}

export function solvePose(k: Keyframe, view: 'side' | 'front'): Solved {
  const hip = k.hip;
  const shrug = k.shrug ?? 0;
  const shoulder = add(hip, fromUp(k.torso, SEG.torso + shrug));
  const neck = add(hip, fromUp(k.torso, SEG.torso + SEG.neck));
  const head = add(neck, fromUp(k.torso + (k.head ?? 0), SEG.headR + 1));
  let hipL: Vec = hip, hipR: Vec = hip, shL: Vec = shoulder, shR: Vec = shoulder;
  if (view === 'front') {
    hipL = [hip[0] - 9, hip[1]]; hipR = [hip[0] + 9, hip[1]];
    shL = [shoulder[0] - 15, shoulder[1]]; shR = [shoulder[0] + 15, shoulder[1]];
  }
  const mirror = (l?: Limb): Limb | undefined => {
    if (!l) return undefined;
    if (view !== 'front') return l;
    return {
      ...l,
      a: l.a ? [-l.a[0], -l.a[1]] : undefined,
      ik: l.ik ? [2 * hip[0] - l.ik[0], l.ik[1]] : undefined,
      rel: l.rel ? [-l.rel[0], l.rel[1]] : undefined,
      bend: l.bend === 'fwd' ? 'back' : l.bend === 'back' ? 'fwd' : l.bend,
    };
  };
  const arm2 = k.arm2 ?? (view === 'front' ? mirror(k.arm)! : k.arm);
  const leg2 = k.leg2 ?? (view === 'front' ? mirror(k.leg)! : k.leg);
  const [elbow, hand] = solveLimb(shR, k.arm, SEG.upper, SEG.fore, shR, 'back');
  const [elbow2, hand2] = solveLimb(shL, arm2, SEG.upper, SEG.fore, shL, view === 'front' ? 'fwd' : 'back');
  const [knee, ankle] = solveLimb(hipR, k.leg, SEG.thigh, SEG.shin, null, 'fwd');
  const [knee2, ankle2] = solveLimb(hipL, leg2, SEG.thigh, SEG.shin, null, view === 'front' ? 'back' : 'fwd');
  const fa = k.foot ?? 0;
  const fa2 = k.foot2 ?? k.foot ?? 0;
  const toe: Vec = view === 'front' ? [ankle[0] + 6, ankle[1] + 4] : add(ankle, [Math.cos(rad(fa)) * SEG.foot, Math.sin(rad(fa)) * SEG.foot]);
  const toe2: Vec = view === 'front' ? [ankle2[0] - 6, ankle2[1] + 4] : add(ankle2, [Math.cos(rad(fa2)) * SEG.foot, Math.sin(rad(fa2)) * SEG.foot]);
  return {
    hip: hipR, hip2: hipL, shoulder: shR, shoulder2: shL, neck, head, elbow, hand, elbow2, hand2,
    knee, ankle, toe, knee2, ankle2, toe2, torsoAngle: k.torso,
  };
}

// ---- Interpolazione ----
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: Vec | undefined, b: Vec | undefined, t: number): Vec | undefined =>
  a && b ? [lerp(a[0], b[0], t), lerp(a[1], b[1], t)] : (a ?? b);
const lerpLimb = (a: Limb | undefined, b: Limb | undefined, t: number): Limb | undefined => {
  if (!a || !b) return a ?? b;
  return { a: lerpV(a.a, b.a, t), ik: lerpV(a.ik, b.ik, t), rel: lerpV(a.rel, b.rel, t), bend: t < 0.5 ? a.bend : b.bend };
};
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function poseAt(p: Pattern, phase: number): Keyframe {
  // phase 0..1 sull'intero ciclo
  let u = phase;
  if (p.loop === 'pingpong') u = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  const keys = p.keys;
  if (keys.length === 1) return keys[0];
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const span = k1.t - k0.t || 1;
  const local = ease(Math.max(0, Math.min(1, (u - k0.t) / span)));
  return {
    t: u,
    hip: lerpV(k0.hip, k1.hip, local)!,
    torso: lerp(k0.torso, k1.torso, local),
    head: lerp(k0.head ?? 0, k1.head ?? 0, local),
    shrug: lerp(k0.shrug ?? 0, k1.shrug ?? 0, local),
    arm: lerpLimb(k0.arm, k1.arm, local)!,
    arm2: lerpLimb(k0.arm2, k1.arm2, local),
    leg: lerpLimb(k0.leg, k1.leg, local)!,
    leg2: lerpLimb(k0.leg2, k1.leg2, local),
    foot: lerp(k0.foot ?? 0, k1.foot ?? 0, local),
    foot2: k0.foot2 !== undefined || k1.foot2 !== undefined ? lerp(k0.foot2 ?? k0.foot ?? 0, k1.foot2 ?? k1.foot ?? 0, local) : undefined,
  };
}
