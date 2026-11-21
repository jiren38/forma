// Collegamento Bluetooth a cyclette e tapis roulant (FTMS) durante un'attività cardio.
//
// SOLO LETTURA: ci si iscrive alle notifiche dei dati di allenamento (Indoor Bike Data 0x2AD2,
// Treadmill Data 0x2ACD) e basta. Nessuna scrittura, nessuna iscrizione al Control Point:
// l'attrezzo non riceve comandi.
//
// Un solo attrezzo collegato alla volta, legato a un'attività cardio (ownerUid). Il collegamento
// vive fuori da React così non cade se la schermata si ridisegna o si cambia pagina.
import { useSyncExternalStore } from 'react';
import { getBluetooth } from '@/lib/ble';
import { fullUuid, shortOf } from '@/features/diagnostics/bluetooth/gatt';
import { FtmsAccumulator, parseFtmsPacket, type FtmsKind, type FtmsLive } from '@/lib/ftms-live';
import type { CardioMachineData } from '@/lib/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FtmsStatus = 'idle' | 'connecting' | 'connected' | 'lost' | 'error';

export interface FtmsState {
  status: FtmsStatus;
  ownerUid: string | null;
  device: string | null;
  kind: FtmsKind | null;
  live: FtmsLive;
  moving: boolean;
  summary: CardioMachineData | null;
  error: string | null;
  /** millisecondi dall'ultimo pacchetto ricevuto (per segnalare dati fermi) */
  lastPacketAt: number | null;
}

const FTMS = 0x1826;
const BIKE_DATA = 0x2ad2;
const TREADMILL_DATA = 0x2acd;

const initial: FtmsState = { status: 'idle', ownerUid: null, device: null, kind: null, live: {}, moving: false, summary: null, error: null, lastPacketAt: null };
let state: FtmsState = initial;
const subs = new Set<() => void>();
let acc: FtmsAccumulator | null = null;
let dev: any = null;
let dataChar: any = null;
let manualClose = false;

function set(p: Partial<FtmsState>) {
  state = { ...state, ...p };
  for (const s of [...subs]) s();
}

export function getFtmsState() { return state; }
export function subscribeFtms(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
export function useFtms(): FtmsState { return useSyncExternalStore(subscribeFtms, getFtmsState, getFtmsState); }

/** Il Bluetooth è disponibile qui? (app iPhone o Chrome/Edge; non in Safari) */
export function ftmsSupported(): boolean { return !!getBluetooth(); }

/** Riepilogo aggiornato dei dati dell'attrezzo collegato a questa attività, se c'è. */
export function liveMachineSummary(ownerUid: string): CardioMachineData | null {
  if (!acc || state.ownerUid !== ownerUid) return null;
  return acc.summary();
}

function onPacket(ev: any) {
  const dv: DataView | undefined = ev?.target?.value;
  if (!dv || !acc) return;
  try {
    acc.push(parseFtmsPacket(acc.kind, dv), Date.now());
  } catch { return; /* pacchetto troncato: si ignora */ }
  set({ live: acc.live, moving: acc.moving, summary: acc.summary(), lastPacketAt: Date.now() });
}

function onDisconnected() {
  try { dataChar?.removeEventListener?.('characteristicvaluechanged', onPacket); } catch { /* ignore */ }
  dataChar = null;
  if (manualClose) return;
  set({ status: 'lost', moving: false });
}

async function subscribe(): Promise<FtmsKind> {
  const server = dev.gatt.connected ? dev.gatt : await dev.gatt.connect();
  const services: any[] = await server.getPrimaryServices();
  const ftms = services.find((s) => shortOf(String(s.uuid)) === FTMS);
  if (!ftms) throw new Error('Questo dispositivo non ha il servizio Fitness Machine (FTMS): scegli la cyclette o il tapis roulant.');
  const chars: any[] = await ftms.getCharacteristics();
  const pick = (id: number) => chars.find((c) => shortOf(String(c.uuid)) === id);
  const ch = pick(BIKE_DATA) ?? pick(TREADMILL_DATA);
  if (!ch) throw new Error('L’attrezzo non invia dati di cyclette o tapis roulant.');
  const kind: FtmsKind = shortOf(String(ch.uuid)) === BIKE_DATA ? 'bike' : 'treadmill';
  ch.addEventListener('characteristicvaluechanged', onPacket);
  await ch.startNotifications();
  dataChar = ch;
  return kind;
}

function friendly(e: any): string {
  const name = e?.name ?? '';
  const msg = String(e?.message ?? e ?? '');
  if (name === 'NotFoundError' || /cancel/i.test(msg)) return '';
  if (/powered off|not enabled|bluetooth.*(off|disabled)/i.test(msg)) return 'Il Bluetooth del telefono è spento: accendilo e riprova.';
  if (/unauthori[sz]ed|permission|denied/i.test(msg)) return 'Forma non ha il permesso di usare il Bluetooth: concedilo in Impostazioni › Forma.';
  return msg || 'Collegamento non riuscito. Controlla che l’attrezzo sia acceso e non collegato a un’altra app, poi riprova.';
}

/**
 * Sceglie e collega un attrezzo per l'attività `ownerUid`. Se c'è un riepilogo salvato
 * (`resume`) si continua a sommare da lì. Restituisce false se l'utente ha annullato.
 */
export async function connectFtms(ownerUid: string, resume?: CardioMachineData | null): Promise<boolean> {
  const bt = getBluetooth();
  if (!bt) { set({ status: 'error', error: 'Il Bluetooth non è disponibile in questo browser. Usa l’app Forma per iPhone o Chrome sul computer.' }); return false; }
  await disconnectFtms();
  set({ ...initial, status: 'connecting', ownerUid });
  try {
    const optionalServices = [fullUuid(FTMS), fullUuid(0x180a)];
    // Nel browser si mostrano solo gli attrezzi FTMS (o i nomi noti di cyclette e tapis dell'utente).
    // Nell'app iPhone la lista mostra tutti i dispositivi vicini: il filtro per servizio di iOS
    // scarta gli attrezzi che non pubblicizzano FTMS nell'annuncio.
    dev = await bt.requestDevice(bt.backend === 'web'
      ? { filters: [{ services: [fullUuid(FTMS)] }, { namePrefix: 'iConsole' }, { namePrefix: 'FS-' }], optionalServices }
      : { acceptAllDevices: true, optionalServices });
    manualClose = false;
    dev.addEventListener?.('gattserverdisconnected', onDisconnected);
    const name = String(dev.name ?? 'Attrezzo');
    const kind = await subscribe();
    acc = new FtmsAccumulator(kind, name);
    if (resume && resume.kind === kind) acc.seed(resume);
    set({ status: 'connected', device: name, kind, summary: acc.summary(), error: null });
    return true;
  } catch (e) {
    const msg = friendly(e);
    try { dev?.gatt?.disconnect(); } catch { /* ignore */ }
    dev = null;
    set({ ...initial, status: msg ? 'error' : 'idle', error: msg || null });
    return false;
  }
}

/** Ricollega lo stesso attrezzo dopo una perdita di connessione, senza perdere i totali. */
export async function reconnectFtms(): Promise<boolean> {
  if (!dev || !acc) return false;
  set({ status: 'connecting', error: null });
  try {
    manualClose = false;
    acc.relink();
    await subscribe();
    set({ status: 'connected' });
    return true;
  } catch (e) {
    set({ status: 'lost', error: friendly(e) || null });
    return false;
  }
}

/** Sposta l'attrezzo collegato su un'altra attività cardio (i totali ripartono da zero). */
export function moveFtmsTo(ownerUid: string) {
  if (!acc) return;
  acc = new FtmsAccumulator(acc.kind, acc.device);
  set({ ownerUid, summary: acc.summary(), live: {}, moving: false });
}

export async function disconnectFtms() {
  manualClose = true;
  const ch = dataChar;
  dataChar = null;
  try { ch?.removeEventListener?.('characteristicvaluechanged', onPacket); await ch?.stopNotifications?.(); } catch { /* ignore */ }
  try { dev?.removeEventListener?.('gattserverdisconnected', onDisconnected); dev?.gatt?.disconnect(); } catch { /* ignore */ }
  dev = null;
  acc = null;
  if (state.status !== 'idle') set(initial);
}

/** Solo per i test. */
export function __resetFtms() { state = initial; acc = null; dev = null; dataChar = null; manualClose = false; subs.clear(); }
