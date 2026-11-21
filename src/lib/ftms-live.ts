// Dati dal vivo degli attrezzi cardio Bluetooth (FTMS): accumulo dei pacchetti e riepilogo.
//
// Logica pura, senza Bluetooth: riceve i pacchetti già decodificati da gatt.ts
// (Indoor Bike Data 0x2AD2 della cyclette, Treadmill Data 0x2ACD del tapis) e calcola
// totali e medie della sessione. SOLO LETTURA: qui non si invia nulla agli attrezzi.
//
// Distanza e calorie si calcolano sommando gli incrementi dei contatori dell'attrezzo:
// così non contano i metri fatti prima del collegamento, e un azzeramento del display
// o una riconnessione non fanno perdere quanto già accumulato.
import { decodeIndoorBikeData, decodeTreadmillData } from '@/features/diagnostics/bluetooth/gatt';
import type { CardioMachineData } from '@/lib/types';

export type FtmsKind = 'bike' | 'treadmill';

/** Valori istantanei più recenti, per la schermata dal vivo. */
export interface FtmsLive {
  speedKmh?: number;
  cadence?: number;
  resistance?: number;
  inclinePct?: number;
  power?: number;
  hr?: number;
  /** contatori dell'attrezzo (come sul suo display) */
  machineDistanceM?: number;
  machineKcal?: number;
  machineElapsedSec?: number;
}

const AVG_KEYS = ['speedKmh', 'cadence', 'resistance', 'inclinePct', 'power', 'hr'] as const;
type AvgKey = (typeof AVG_KEYS)[number];

/** Salto massimo plausibile tra due pacchetti: oltre si considera un errore e si ignora. */
const MAX_STEP_M = 500;
const MAX_STEP_KCAL = 50;
/** Un pacchetto copre al massimo questo intervallo (se arrivano in ritardo, es. app in background). */
const MAX_DT_MS = 3000;

/** Decodifica un pacchetto FTMS nei campi che usiamo. */
export function parseFtmsPacket(kind: FtmsKind, dv: DataView): Partial<FtmsLive> {
  const d = kind === 'bike' ? decodeIndoorBikeData(dv) : decodeTreadmillData(dv);
  const v: Record<string, number> = {};
  for (const f of d.fields) if (typeof f.value === 'number' && Number.isFinite(f.value)) v[f.key] = f.value;
  const out: Partial<FtmsLive> = {};
  if (v.speed != null) out.speedKmh = v.speed;
  if (v.cadence != null) out.cadence = v.cadence;
  if (v.resistance != null) out.resistance = v.resistance;
  if (v.incline != null) out.inclinePct = v.incline;
  if (v.power != null) out.power = v.power;
  // 0 = "nessun sensore" per la frequenza cardiaca
  if (v.hr != null && v.hr > 0) out.hr = v.hr;
  if (v.distance != null) out.machineDistanceM = v.distance;
  // 0xFFFF = "dato non disponibile" nella specifica FTMS
  if (v.kcal != null && v.kcal !== 0xffff) out.machineKcal = v.kcal;
  if (v.elapsed != null) out.machineElapsedSec = v.elapsed;
  return out;
}

const r = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export class FtmsAccumulator {
  live: FtmsLive = {};
  movingSec = 0;
  distanceM = 0;
  kcal = 0;
  maxSpeed = 0;
  packets = 0;
  private sums: Record<AvgKey, { v: number; t: number }> = Object.fromEntries(AVG_KEYS.map((k) => [k, { v: 0, t: 0 }])) as never;
  private prevDist: number | null = null;
  private prevKcal: number | null = null;
  private lastT: number | null = null;

  constructor(readonly kind: FtmsKind, readonly device: string) {}

  /** Riprende i totali di un riepilogo salvato (es. dopo aver riaperto l'app). */
  seed(s: CardioMachineData) {
    this.movingSec = s.movingSec;
    this.distanceM = s.distanceM;
    this.kcal = s.kcal;
    this.maxSpeed = s.maxSpeedKmh ?? 0;
    const put = (k: AvgKey, v?: number | null) => { if (v != null) this.sums[k] = { v: v * s.movingSec, t: s.movingSec }; };
    put('speedKmh', s.avgSpeedKmh); put('cadence', s.avgCadence); put('resistance', s.avgResistance);
    put('inclinePct', s.avgIncline); put('hr', s.avgHr); put('power', s.avgPower);
  }

  /** Dopo una riconnessione i contatori ripartono dal nuovo valore letto (nessun salto). */
  relink() { this.prevDist = null; this.prevKcal = null; this.lastT = null; }

  get moving(): boolean {
    return (this.live.speedKmh ?? 0) > 0.2 || (this.live.cadence ?? 0) > 0;
  }

  push(p: Partial<FtmsLive>, tMs: number) {
    this.packets++;
    const dt = this.lastT == null ? 0 : Math.max(0, Math.min(MAX_DT_MS, tMs - this.lastT)) / 1000;
    this.lastT = tMs;
    // le medie pesano il tempo trascorso con i valori in vigore fino a questo pacchetto
    if (dt > 0 && this.moving) {
      this.movingSec += dt;
      for (const k of AVG_KEYS) {
        const v = this.live[k];
        if (v != null) { this.sums[k].v += v * dt; this.sums[k].t += dt; }
      }
    }
    // i pacchetti "More Data" portano solo una parte dei campi: si fondono con i precedenti
    this.live = { ...this.live, ...p };
    if (p.speedKmh != null) this.maxSpeed = Math.max(this.maxSpeed, p.speedKmh);
    if (p.machineDistanceM != null) {
      this.distanceM += step(this.prevDist, p.machineDistanceM, MAX_STEP_M);
      this.prevDist = p.machineDistanceM;
    }
    if (p.machineKcal != null) {
      this.kcal += step(this.prevKcal, p.machineKcal, MAX_STEP_KCAL);
      this.prevKcal = p.machineKcal;
    }
  }

  avg(k: AvgKey): number | null {
    const s = this.sums[k];
    return s.t > 0 ? s.v / s.t : null;
  }

  summary(now = new Date()): CardioMachineData {
    const a = (k: AvgKey, d = 1) => { const v = this.avg(k); return v == null ? null : r(v, d); };
    return {
      device: this.device, kind: this.kind, movingSec: Math.round(this.movingSec), distanceM: Math.round(this.distanceM), kcal: Math.round(this.kcal),
      avgSpeedKmh: a('speedKmh'), maxSpeedKmh: this.maxSpeed ? r(this.maxSpeed) : null, avgCadence: a('cadence', 0), avgResistance: a('resistance'),
      avgIncline: a('inclinePct'), avgHr: a('hr', 0), avgPower: a('power', 0), updatedAt: now.toISOString(),
    };
  }
}

/** Incremento di un contatore: se il valore scende l'attrezzo è stato azzerato e si riparte da lì. */
function step(prev: number | null, cur: number, max: number): number {
  if (prev == null) return 0;
  const d = cur - prev;
  if (d >= 0) return d <= max ? d : 0;
  return cur <= max ? cur : 0;
}

/** Il riepilogo contiene dati utili (l'attrezzo si è mosso)? */
export function hasMachineData(m?: CardioMachineData | null): m is CardioMachineData {
  return !!m && (m.movingSec > 0 || m.distanceM > 0);
}
