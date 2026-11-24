// Comandi FTMS (Fitness Machine Control Point 0x2AD9) per tapis roulant e cyclette.
//
// Logica pura, senza Bluetooth: costruisce i pacchetti dei comandi, interpreta le risposte
// e applica i limiti di sicurezza. Formati dalla specifica Bluetooth FTMS 1.0, § 4.16.
//
// Ogni valore inviato passa da clampTarget: mai oltre i limiti scelti dall'utente
// né oltre l'intervallo dichiarato dall'attrezzo.
import type { MachineSpec } from '@/lib/types';

export const OP = {
  requestControl: 0x00,
  reset: 0x01,
  setSpeed: 0x02,
  setIncline: 0x03,
  setResistance: 0x04,
  startResume: 0x07,
  stopPause: 0x08,
  response: 0x80,
} as const;

export const RESULT: Record<number, string> = {
  0x01: 'ok',
  0x02: 'Comando non supportato dall’attrezzo',
  0x03: 'Valore non accettato dall’attrezzo',
  0x04: 'L’attrezzo non è riuscito a eseguire il comando',
  0x05: 'L’attrezzo non accetta comandi in questo momento',
};

const bytes = (...b: number[]) => new Uint8Array(b);
const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const s16 = (v: number) => u16(v < 0 ? v + 0x10000 : v);

export const cmd = {
  requestControl: () => bytes(OP.requestControl),
  start: () => bytes(OP.startResume),
  stop: () => bytes(OP.stopPause, 0x01),
  pause: () => bytes(OP.stopPause, 0x02),
  /** km/h, risoluzione 0,01 */
  speed: (kmh: number) => bytes(OP.setSpeed, ...u16(Math.round(kmh * 100))),
  /** %, risoluzione 0,1 */
  incline: (pct: number) => bytes(OP.setIncline, ...s16(Math.round(pct * 10))),
  /** livello, risoluzione 0,1 (uint8 nella FTMS 1.0) */
  resistance: (level: number) => bytes(OP.setResistance, Math.max(0, Math.min(255, Math.round(level * 10)))),
};

export interface CpResponse { request: number; result: number; ok: boolean; message: string }

/** Risposta del Control Point: 0x80, codice del comando, esito. Null se non è una risposta. */
export function parseCpResponse(dv: DataView): CpResponse | null {
  if (dv.byteLength < 3 || dv.getUint8(0) !== OP.response) return null;
  const result = dv.getUint8(2);
  return { request: dv.getUint8(1), result, ok: result === 0x01, message: RESULT[result] ?? `Errore ${result}` };
}

/** Fitness Machine Status (0x2ADA): eventi che ci interessano per la sicurezza. */
export type MachineEvent = 'stopped' | 'paused' | 'safety_key' | 'started' | 'control_lost' | 'reset' | 'other';
export function parseMachineStatus(dv: DataView): MachineEvent {
  if (dv.byteLength < 1) return 'other';
  switch (dv.getUint8(0)) {
    case 0x01: return 'reset';
    case 0x02: return dv.byteLength > 1 && dv.getUint8(1) === 0x02 ? 'paused' : 'stopped';
    case 0x03: return 'safety_key';
    case 0x04: return 'started';
    case 0xff: return 'control_lost';
    default: return 'other';
  }
}

export interface Range { min: number; max: number; step: number }

/** Supported Speed (0x2AD4, uint16 /100), Inclination (0x2AD5, sint16 /10), Resistance (0x2AD6, sint16 /10). */
export function parseRange(kind: 'speed' | 'incline' | 'resistance', dv: DataView): Range | null {
  if (dv.byteLength < 6) return null;
  const sc = kind === 'speed' ? 100 : 10;
  const rd = (o: number) => (kind === 'speed' ? dv.getUint16(o, true) : dv.getInt16(o, true)) / sc;
  const r = { min: rd(0), max: rd(2), step: dv.getUint16(4, true) / sc };
  return r.max > r.min ? r : null;
}

export interface ControlLimits {
  speed: Range;
  incline: Range;
  resistance: Range;
}

/** Limiti predefiniti prudenti, se l'utente non ha scelto altro. */
export const DEFAULT_LIMITS = {
  treadmill: { maxSpeed: 12, maxIncline: 12 },
  bike: { maxResistance: 32 },
};

/**
 * Limiti effettivi: i più restrittivi tra quelli scelti dall'utente (profilo) e quelli dichiarati
 * dall'attrezzo. Senza dati dall'attrezzo si usano i valori del TFK 495 (0,8–16 km/h, 0–12 %).
 */
export function effectiveLimits(spec: MachineSpec | undefined, dev: Partial<Record<'speed' | 'incline' | 'resistance', Range | null>>): ControlLimits {
  const ds = dev.speed ?? { min: 0.8, max: 16, step: 0.1 };
  const di = dev.incline ?? { min: 0, max: 12, step: 1 };
  const dr = dev.resistance ?? { min: 1, max: spec?.maxResistance ?? DEFAULT_LIMITS.bike.maxResistance, step: 1 };
  return {
    speed: { ...ds, max: Math.min(ds.max, spec?.maxSpeed ?? DEFAULT_LIMITS.treadmill.maxSpeed) },
    incline: { ...di, min: Math.max(di.min, 0), max: Math.min(di.max, spec?.maxIncline ?? DEFAULT_LIMITS.treadmill.maxIncline) },
    resistance: { ...dr, max: Math.min(dr.max, spec?.maxResistance ?? dr.max) },
  };
}

/** Porta un valore dentro i limiti e sul passo dell'attrezzo. */
export function clampTarget(v: number, r: Range): number {
  const step = r.step > 0 ? r.step : 0.1;
  const c = Math.min(r.max, Math.max(r.min, v));
  const snapped = r.min + Math.round((c - r.min) / step) * step;
  return Math.round(Math.min(r.max, Math.max(r.min, snapped)) * 100) / 100;
}
