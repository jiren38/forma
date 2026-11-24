// Percorsi guidati per tapis roulant e cyclette: allenamenti a fasi che l'app può eseguire
// comandando l'attrezzo (velocità e pendenza, oppure resistenza), oppure da seguire a mano.
//
// Un percorso è un normale CardioPlan a intervalli (riscaldamento + fasi ripetute + defaticamento):
// così si avvia, si registra e finisce nei progressi come ogni altra attività cardio.
import type { CardioIntensity, CardioPhase, CardioPlan, Profile } from './types';
import { normalizePlan, planDurationSec, expandPhases } from './cardio';

export type RouteMachine = 'treadmill' | 'bike';
export type RouteLevel = 'easy' | 'medium' | 'hard';

export interface CardioRoute {
  id: string;
  name: string;
  machine: RouteMachine;
  level: RouteLevel;
  desc: string;
  /** percorso creato dall'utente */
  custom?: boolean;
  plan: CardioPlan;
}

/** Percorso personalizzato salvato nel profilo. */
export interface CustomRoute { id: string; name: string; machine: RouteMachine; level?: RouteLevel; plan: CardioPlan; createdAt: string }

export const LEVEL_INFO: Record<RouteLevel, { label: string; color: string }> = {
  easy: { label: 'Facile', color: 'var(--success)' },
  medium: { label: 'Medio', color: 'var(--warning)' },
  hard: { label: 'Difficile', color: 'var(--danger)' },
};

/** Livelli della JK 564 (cyclette dell'utente) se il profilo non dice altro. */
export const DEFAULT_BIKE_LEVELS = 32;

// --------------------------------------------------------------- definizioni compatte

type T = { min: number; v: number; inc: number; label?: string };          // tapis: minuti, km/h, %
type B = { min: number; r: number; rpm: number; label?: string };          // cyclette: minuti, frazione resistenza 0–1, rpm
type Def<P> = { id: string; name: string; level: RouteLevel; desc: string; wu: P; cycle: P[]; repeat?: number; cd: P };

const TREADMILL: Def<T>[] = [
  { id: 't_walk_easy', name: 'Camminata leggera', level: 'easy', desc: 'Passo comodo e costante, quasi in piano. Ideale per iniziare o recuperare.',
    wu: { min: 3, v: 3.5, inc: 0 }, cycle: [{ min: 14, v: 4.5, inc: 1, label: 'Camminata' }], cd: { min: 3, v: 3.5, inc: 0 } },
  { id: 't_hills_easy', name: 'Passeggiata in collina', level: 'easy', desc: 'Salite dolci che arrivano al 6% e poi tornano giù, a passo tranquillo.',
    wu: { min: 3, v: 4, inc: 0 }, cycle: [{ min: 4, v: 4.5, inc: 2, label: 'Salita leggera' }, { min: 4, v: 4.5, inc: 4, label: 'Salita' }, { min: 4, v: 4.5, inc: 6, label: 'Cima' }, { min: 4, v: 4.5, inc: 4, label: 'Discesa' }, { min: 4, v: 4.5, inc: 2, label: 'Discesa leggera' }], cd: { min: 3, v: 4, inc: 0 } },
  { id: 't_brisk', name: 'Camminata veloce', level: 'easy', desc: 'Alterna 2 minuti di passo svelto e 2 di passo normale.',
    wu: { min: 4, v: 4, inc: 0 }, cycle: [{ min: 2, v: 5.5, inc: 1, label: 'Passo svelto' }, { min: 2, v: 4.8, inc: 1, label: 'Passo normale' }], repeat: 4, cd: { min: 5, v: 4, inc: 0 } },
  { id: 't_fatburn', name: 'Brucia grassi in salita', level: 'medium', desc: 'Camminata in pendenza tra il 6 e il 10%: tanta fatica utile, nessuna corsa.',
    wu: { min: 5, v: 4.5, inc: 1 }, cycle: [{ min: 3, v: 5, inc: 6, label: 'Salita' }, { min: 2, v: 5, inc: 10, label: 'Salita ripida' }], repeat: 4, cd: { min: 5, v: 4, inc: 0 } },
  { id: 't_walk_run', name: 'Cammina e corri', level: 'medium', desc: '2 minuti di corsa leggera e 2 di camminata, ripetuti 5 volte.',
    wu: { min: 5, v: 5, inc: 0 }, cycle: [{ min: 2, v: 8, inc: 0, label: 'Corsa leggera' }, { min: 2, v: 5, inc: 0, label: 'Camminata' }], repeat: 5, cd: { min: 5, v: 4.5, inc: 0 } },
  { id: 't_pyramid', name: 'Piramide', level: 'medium', desc: 'Velocità e pendenza salgono fino all’8% e poi scendono, ogni 3 minuti.',
    wu: { min: 4, v: 4.5, inc: 0 }, cycle: [{ min: 3, v: 5, inc: 2, label: 'Gradino 1' }, { min: 3, v: 5.5, inc: 4, label: 'Gradino 2' }, { min: 3, v: 6, inc: 6, label: 'Gradino 3' }, { min: 3, v: 6, inc: 8, label: 'Vetta' }, { min: 3, v: 6, inc: 6, label: 'Gradino 3' }, { min: 3, v: 5.5, inc: 4, label: 'Gradino 2' }, { min: 3, v: 5, inc: 2, label: 'Gradino 1' }], cd: { min: 5, v: 4, inc: 0 } },
  { id: 't_mountain', name: 'Montagna', level: 'hard', desc: 'Lunga salita fino alla pendenza massima (12%) a passo sostenuto.',
    wu: { min: 5, v: 5, inc: 2 }, cycle: [{ min: 5, v: 5.5, inc: 6, label: 'Salita' }, { min: 5, v: 5.5, inc: 9, label: 'Salita dura' }, { min: 5, v: 5.5, inc: 12, label: 'Vetta' }, { min: 5, v: 5, inc: 10, label: 'Cresta' }, { min: 5, v: 5, inc: 6, label: 'Discesa' }], cd: { min: 5, v: 4, inc: 0 } },
  { id: 't_run_intervals', name: 'Intervalli di corsa', level: 'hard', desc: '1 minuto veloce a 11 km/h e 1 minuto e mezzo di recupero, 8 volte.',
    wu: { min: 5, v: 6, inc: 0 }, cycle: [{ min: 1, v: 11, inc: 0, label: 'Veloce' }, { min: 1.5, v: 6, inc: 0, label: 'Recupero' }], repeat: 8, cd: { min: 5, v: 5, inc: 0 } },
  { id: 't_progressive', name: 'Corsa progressiva', level: 'hard', desc: 'Corsa continua che accelera ogni 5 minuti, da 8 a 11 km/h.',
    wu: { min: 5, v: 6, inc: 0 }, cycle: [{ min: 5, v: 8, inc: 1, label: 'Ritmo 1' }, { min: 5, v: 9, inc: 1, label: 'Ritmo 2' }, { min: 5, v: 10, inc: 1, label: 'Ritmo 3' }, { min: 5, v: 11, inc: 1, label: 'Ritmo 4' }], cd: { min: 5, v: 6, inc: 0 } },
];

const BIKE: Def<B>[] = [
  { id: 'b_flat', name: 'Pianura', level: 'easy', desc: 'Pedalata costante con resistenza bassa. Perfetta per iniziare.',
    wu: { min: 4, r: 0.2, rpm: 70 }, cycle: [{ min: 12, r: 0.3, rpm: 75, label: 'Pianura' }], cd: { min: 4, r: 0.15, rpm: 65 } },
  { id: 'b_rollers', name: 'Giro tranquillo', level: 'easy', desc: 'Piccoli saliscendi: 3 minuti facili e 2 un po’ più duri.',
    wu: { min: 4, r: 0.2, rpm: 70 }, cycle: [{ min: 3, r: 0.3, rpm: 75, label: 'Pianura' }, { min: 2, r: 0.4, rpm: 70, label: 'Salitella' }], repeat: 3, cd: { min: 4, r: 0.15, rpm: 65 } },
  { id: 'b_hills', name: 'Colline', level: 'medium', desc: 'Salite di 3 minuti seguite da 2 minuti di pedalata agile.',
    wu: { min: 5, r: 0.25, rpm: 75 }, cycle: [{ min: 3, r: 0.5, rpm: 70, label: 'Salita' }, { min: 2, r: 0.3, rpm: 85, label: 'Pedalata agile' }], repeat: 4, cd: { min: 5, r: 0.2, rpm: 65 } },
  { id: 'b_pyramid', name: 'Piramide', level: 'medium', desc: 'La resistenza sale ogni 3 minuti fino a metà e poi ridiscende.',
    wu: { min: 5, r: 0.25, rpm: 75 }, cycle: [{ min: 3, r: 0.3, rpm: 80, label: 'Gradino 1' }, { min: 3, r: 0.4, rpm: 75, label: 'Gradino 2' }, { min: 3, r: 0.5, rpm: 72, label: 'Gradino 3' }, { min: 3, r: 0.6, rpm: 70, label: 'Vetta' }, { min: 3, r: 0.5, rpm: 72, label: 'Gradino 3' }, { min: 3, r: 0.4, rpm: 75, label: 'Gradino 2' }, { min: 3, r: 0.3, rpm: 80, label: 'Gradino 1' }], cd: { min: 4, r: 0.2, rpm: 65 } },
  { id: 'b_climb', name: 'Scalata', level: 'hard', desc: 'Una lunga salita: la resistenza cresce ogni 5 minuti fino al 75%.',
    wu: { min: 5, r: 0.3, rpm: 75 }, cycle: [{ min: 5, r: 0.5, rpm: 70, label: 'Salita' }, { min: 5, r: 0.6, rpm: 68, label: 'Salita dura' }, { min: 5, r: 0.7, rpm: 65, label: 'Muro' }, { min: 5, r: 0.75, rpm: 62, label: 'Vetta' }, { min: 5, r: 0.5, rpm: 75, label: 'Discesa' }], cd: { min: 5, r: 0.2, rpm: 65 } },
  { id: 'b_hiit', name: 'HIIT', level: 'hard', desc: '30 secondi a tutta e 90 secondi di recupero, 8 volte.',
    wu: { min: 5, r: 0.3, rpm: 75 }, cycle: [{ min: 0.5, r: 0.8, rpm: 95, label: 'A tutta' }, { min: 1.5, r: 0.3, rpm: 70, label: 'Recupero' }], repeat: 8, cd: { min: 4, r: 0.2, rpm: 65 } },
];

// --------------------------------------------------------------- costruzione dei piani

function intensityT(v: number, inc: number): CardioIntensity {
  if (v >= 10) return 'high';
  if (v >= 7.5 || inc >= 9) return 'vigorous';
  if (v >= 5 || inc >= 4) return 'moderate';
  return 'light';
}
function intensityB(r: number): CardioIntensity {
  return r >= 0.75 ? 'high' : r >= 0.55 ? 'vigorous' : r >= 0.35 ? 'moderate' : 'light';
}

const maxOf = <T>(xs: T[], f: (x: T) => CardioIntensity): CardioIntensity => {
  const order: CardioIntensity[] = ['light', 'moderate', 'vigorous', 'high'];
  return xs.map(f).reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), 'light');
};

function treadmillPlan(d: Def<T>): CardioPlan {
  const ph = (kind: CardioPhase['kind'], p: T, i: number): CardioPhase => ({
    uid: `${d.id}_${kind}_${i}`, kind, label: p.label ?? (kind === 'warmup' ? 'Riscaldamento' : kind === 'cooldown' ? 'Defaticamento' : 'Fase'),
    durationSec: Math.round(p.min * 60), speedKmh: p.v, inclinePct: p.inc, resistance: null, rpm: null, intensity: intensityT(p.v, p.inc),
  });
  return normalizePlan({
    machine: 'treadmill', mode: 'intervals', title: d.name, durationMin: 0, intensity: maxOf(d.cycle, (p) => intensityT(p.v, p.inc)),
    warmup: ph('warmup', d.wu, 0), cycle: d.cycle.map((p, i) => ph(i % 2 && (d.repeat ?? 1) > 1 ? 'recovery' : 'work', p, i)), repeat: d.repeat ?? 1,
    cooldown: ph('cooldown', d.cd, 0), progression: null,
  } as CardioPlan);
}

function bikePlan(d: Def<B>, levels: number): CardioPlan {
  const lv = (f: number) => Math.max(1, Math.min(levels, Math.round(f * levels)));
  const ph = (kind: CardioPhase['kind'], p: B, i: number): CardioPhase => ({
    uid: `${d.id}_${kind}_${i}`, kind, label: p.label ?? (kind === 'warmup' ? 'Riscaldamento' : kind === 'cooldown' ? 'Defaticamento' : 'Fase'),
    durationSec: Math.round(p.min * 60), speedKmh: null, inclinePct: null, resistance: lv(p.r), rpm: p.rpm, intensity: intensityB(p.r),
  });
  return normalizePlan({
    machine: 'bike', mode: 'intervals', title: d.name, durationMin: 0, intensity: maxOf(d.cycle, (p) => intensityB(p.r)), resistanceMax: levels,
    warmup: ph('warmup', d.wu, 0), cycle: d.cycle.map((p, i) => ph(i % 2 && (d.repeat ?? 1) > 1 ? 'recovery' : 'work', p, i)), repeat: d.repeat ?? 1,
    cooldown: ph('cooldown', d.cd, 0), progression: null,
  } as CardioPlan);
}

export function bikeLevels(profile?: Pick<Profile, 'cardioMachines'> | null): number {
  return profile?.cardioMachines?.bike?.maxResistance ?? DEFAULT_BIKE_LEVELS;
}

/** Tutti i percorsi di una macchina: predefiniti (dal più facile) e poi quelli dell'utente. */
export function routesFor(machine: RouteMachine, profile?: (Pick<Profile, 'cardioMachines'> & { cardioRoutes?: CustomRoute[] }) | null): CardioRoute[] {
  const builtIn: CardioRoute[] = machine === 'treadmill'
    ? TREADMILL.map((d) => ({ id: d.id, name: d.name, machine, level: d.level, desc: d.desc, plan: treadmillPlan(d) }))
    : BIKE.map((d) => ({ id: d.id, name: d.name, machine, level: d.level, desc: d.desc, plan: bikePlan(d, bikeLevels(profile)) }));
  const mine: CardioRoute[] = (profile?.cardioRoutes ?? []).filter((r) => r.machine === machine)
    .map((r) => ({ id: r.id, name: r.name, machine, level: r.level ?? guessLevel(r.plan), desc: 'Percorso creato da te', custom: true, plan: { ...r.plan, title: r.name } }));
  return [...builtIn, ...mine];
}

export function findRoute(id: string, profile?: Parameters<typeof routesFor>[1]): CardioRoute | undefined {
  return [...routesFor('treadmill', profile), ...routesFor('bike', profile)].find((r) => r.id === id);
}

/** Difficoltà stimata di un percorso personalizzato. */
export function guessLevel(plan: CardioPlan): RouteLevel {
  const ph = expandPhases(plan);
  const order: CardioIntensity[] = ['light', 'moderate', 'vigorous', 'high'];
  const top = Math.max(...ph.map((p) => order.indexOf(p.intensity)));
  return top >= 3 ? 'hard' : top >= 2 ? 'medium' : 'easy';
}

/** Dati riassuntivi per le schede dei percorsi. */
export function routeStats(plan: CardioPlan) {
  const ph = expandPhases(plan);
  const nums = (k: 'speedKmh' | 'inclinePct' | 'resistance') => ph.map((p) => p[k]).filter((x): x is number => x != null);
  const mx = (a: number[]) => (a.length ? Math.max(...a) : null);
  const distKm = plan.machine === 'treadmill' ? ph.reduce((s, p) => s + ((p.speedKmh ?? 0) * p.durationSec) / 3600, 0) : null;
  return { minutes: Math.round(planDurationSec(plan) / 60), maxSpeed: mx(nums('speedKmh')), maxIncline: mx(nums('inclinePct')), maxResistance: mx(nums('resistance')), distKm, phases: ph };
}

/** Modello di partenza per un nuovo percorso personalizzato. */
export function blankRoutePlan(machine: RouteMachine, profile?: Pick<Profile, 'cardioMachines'> | null): CardioPlan {
  const base = machine === 'treadmill' ? treadmillPlan(TREADMILL[2]) : bikePlan(BIKE[1], bikeLevels(profile));
  return { ...base, title: 'Il mio percorso' };
}
