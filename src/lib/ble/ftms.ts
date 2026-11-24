// Collegamento Bluetooth a cyclette e tapis roulant (FTMS) durante un'attività cardio.
//
// Lettura: notifiche dei dati di allenamento (Indoor Bike Data 0x2AD2, Treadmill Data 0x2ACD).
// Comandi (solo dopo che l'utente li attiva con takeFtmsControl): si scrive SOLO sul Fitness Machine
// Control Point 0x2AD9, un comando alla volta, ogni valore limitato da clampTarget. Lo STOP passa
// davanti a tutti gli altri comandi in coda.
//
// Un solo attrezzo collegato alla volta, legato a un'attività cardio (ownerUid). Il collegamento
// vive fuori da React così non cade se la schermata si ridisegna o si cambia pagina.
import { useSyncExternalStore } from 'react';
import { getBluetooth } from '@/lib/ble';
import { fullUuid, shortOf } from '@/features/diagnostics/bluetooth/gatt';
import { FtmsAccumulator, parseFtmsPacket, type FtmsKind, type FtmsLive } from '@/lib/ftms-live';
import { OP, cmd, clampTarget, effectiveLimits, parseCpResponse, parseMachineStatus, parseRange, type ControlLimits, type MachineEvent, type Range } from '@/lib/ftms-control';
import type { CardioMachineData, MachineSpec } from '@/lib/types';

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
  control: FtmsControl;
}

export interface FtmsControl {
  /** off = solo lettura; requesting = richiesta in corso; on = l'app comanda l'attrezzo */
  status: 'unavailable' | 'off' | 'requesting' | 'on' | 'error';
  error: string | null;
  /** ultimi valori impostati dall'app */
  targets: { speed?: number; incline?: number; resistance?: number };
  /** l'app ha avviato l'attrezzo (e non l'ha ancora fermato o messo in pausa) */
  running: boolean;
  limits: ControlLimits | null;
  /** ultimo evento segnalato dall'attrezzo (stop dal pulsante, chiave di sicurezza…) */
  lastEvent: MachineEvent | null;
  /** registro degli ultimi comandi e risposte (per capire i problemi) */
  log: string[];
}

const FTMS = 0x1826;
const BIKE_DATA = 0x2ad2;
const TREADMILL_DATA = 0x2acd;

const CONTROL_POINT = 0x2ad9;
const MACHINE_STATUS = 0x2ada;
const RANGE_CHARS = { speed: 0x2ad4, incline: 0x2ad5, resistance: 0x2ad6 } as const;

const controlOff: FtmsControl = { status: 'unavailable', error: null, targets: {}, running: false, limits: null, lastEvent: null, log: [] };
const initial: FtmsState = { status: 'idle', ownerUid: null, device: null, kind: null, live: {}, moving: false, summary: null, error: null, lastPacketAt: null, control: controlOff };
let state: FtmsState = initial;
const subs = new Set<() => void>();
let acc: FtmsAccumulator | null = null;
let dev: any = null;
let dataChar: any = null;
let manualClose = false;
let cpChar: any = null;
let statusChar: any = null;
let ftmsChars: any[] = [];

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
  speedWatchdog(Date.now());
}

function onDisconnected() {
  try { dataChar?.removeEventListener?.('characteristicvaluechanged', onPacket); } catch { /* ignore */ }
  dataChar = null;
  dropControl();
  if (manualClose) return;
  set({ status: 'lost', moving: false, control: { ...state.control, status: cpChar ? 'off' : 'unavailable', running: false } });
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
  ftmsChars = chars;
  // il Control Point si usa solo se ha la scrittura (iOS e Chrome la espongono solo lì)
  const cp = pick(CONTROL_POINT);
  cpChar = cp && typeof cp.writeValueWithResponse === 'function' ? cp : null;
  statusChar = pick(MACHINE_STATUS) ?? null;
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
    set({ status: 'connected', device: name, kind, summary: acc.summary(), error: null, control: { ...controlOff, status: cpChar ? 'off' : 'unavailable' } });
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
    set({ status: 'connected', control: { ...state.control, status: cpChar ? 'off' : 'unavailable', running: false } });
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
  // se l'app stava comandando l'attrezzo, prima lo si ferma
  if (state.control.status === 'on' && state.control.running) { try { await stopFtms(); } catch { /* ignore */ } }
  dropControl();
  manualClose = true;
  const ch = dataChar;
  dataChar = null;
  try { ch?.removeEventListener?.('characteristicvaluechanged', onPacket); await ch?.stopNotifications?.(); } catch { /* ignore */ }
  try { dev?.removeEventListener?.('gattserverdisconnected', onDisconnected); dev?.gatt?.disconnect(); } catch { /* ignore */ }
  dev = null;
  acc = null;
  if (state.status !== 'idle') set(initial);
}

// ---------------------------------------------------------------- comandi

type Pending = { op: number; resolve: (r: { ok: boolean; message: string }) => void; timer: ReturnType<typeof setTimeout> };
let pending: Pending | null = null;
let chain: Promise<unknown> = Promise.resolve();
let generation = 0;
const RESPONSE_TIMEOUT_MS = 4000;
const eventListeners = new Set<(e: MachineEvent) => void>();

/** Avvisa quando l'attrezzo si ferma da solo (pulsante, chiave di sicurezza) o perde il controllo. */
export function onFtmsMachineEvent(fn: (e: MachineEvent) => void) { eventListeners.add(fn); return () => { eventListeners.delete(fn); }; }

function setControl(p: Partial<FtmsControl>) { set({ control: { ...state.control, ...p } }); }

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');
const CMD_NAME: Record<number, string> = { 0x00: 'richiesta controllo', 0x02: 'velocità', 0x03: 'pendenza', 0x04: 'resistenza', 0x07: 'avvio', 0x08: 'stop/pausa' };
function logLine(text: string) {
  const t = new Date();
  const ts = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
  const sp = state.live.speedKmh != null ? ` [nastro ${state.live.speedKmh.toFixed(1)} km/h]` : '';
  setControl({ log: [...state.control.log, `${ts} ${text}${sp}`].slice(-40) });
}

// ------------------------------------------------ controllo di sicurezza della velocità
// Se il nastro va molto più veloce di quanto chiesto (o oltre il limite dell'utente) dopo il tempo
// necessario ad adeguarsi, si ripete la velocità; se continua, si ferma il tapis.
let lastSpeedCmd = { at: 0, from: 0 };
let overSince: number | null = null;
let resent = false;
const OVER_KMH = 2;
// Il TFK 495 a volte risponde "ok" a un cambio di velocità ma il nastro non cambia: se dopo il tempo
// di adeguamento la velocità non corrisponde, si ripete il comando (al massimo 2 volte per obiettivo).
let offSince: number | null = null;
let adjustTries = 0;
const OFF_KMH = 0.4;
const MAX_ADJUST = 2;

function speedWatchdog(now: number) {
  const c = state.control;
  const v = state.live.speedKmh;
  const target = c.targets.speed;
  if (state.kind !== 'treadmill' || c.status !== 'on' || !c.running || v == null || target == null || target <= 0) { overSince = null; offSince = null; return; }
  const settle = 4000 + Math.abs(target - lastSpeedCmd.from) * 1500;
  // velocità diversa dall'obiettivo (ma non pericolosa): si ripete il comando
  if (Math.abs(v - target) > OFF_KMH && v > 0 && now - lastSpeedCmd.at >= settle && adjustTries < MAX_ADJUST && !(v > target + OVER_KMH)) {
    offSince ??= now;
    if (now - offSince >= 3000) {
      offSince = null;
      adjustTries++;
      logLine(`il nastro non ha raggiunto ${target} km/h, ripeto il comando (${adjustTries}/${MAX_ADJUST})`);
      void setFtmsSpeed(target, true);
    }
  } else if (Math.abs(v - target) <= OFF_KMH) offSince = null;
  const overLimit = !!c.limits && v > c.limits.speed.max + 1;
  const overTarget = v > target + OVER_KMH && v > target * 1.3;
  if (!(overLimit || overTarget) || (!overLimit && now - lastSpeedCmd.at < settle) || now - lastSpeedCmd.at < 2500) { overSince = null; return; }
  overSince ??= now;
  if (now - overSince < 2500) return;
  overSince = null;
  if (!resent && !overLimit) {
    resent = true;
    logLine(`controllo sicurezza: nastro troppo veloce, ripeto ${target} km/h`);
    void setFtmsSpeed(target, true);
    return;
  }
  logLine('controllo sicurezza: nastro oltre la velocità prevista, STOP');
  void stopFtms().then(() => setControl({ error: `Il tapis andava a ${v.toFixed(1)} km/h invece di ${target} km/h: l’ho fermato per sicurezza. Mandami il registro comandi qui sotto.` }));
}

function onCpIndication(ev: any) {
  const dv: DataView | undefined = ev?.target?.value;
  if (!dv) return;
  const r = parseCpResponse(dv);
  if (!r || !pending || r.request !== pending.op) return;
  clearTimeout(pending.timer);
  const p = pending; pending = null;
  p.resolve({ ok: r.ok, message: r.message });
}

function onStatus(ev: any) {
  const dv: DataView | undefined = ev?.target?.value;
  if (!dv) return;
  const e = parseMachineStatus(dv);
  if (e === 'other') return;
  logLine(`attrezzo: ${e}`);
  if (e === 'stopped' || e === 'paused' || e === 'safety_key') setControl({ running: false, lastEvent: e });
  else if (e === 'control_lost') setControl({ status: 'off', running: false, lastEvent: e });
  else setControl({ lastEvent: e });
  for (const fn of [...eventListeners]) { try { fn(e); } catch (err) { console.error(err); } }
}

function dropControl() {
  generation++;
  if (pending) { clearTimeout(pending.timer); pending.resolve({ ok: false, message: 'Collegamento interrotto' }); pending = null; }
  chain = Promise.resolve();
  try { cpChar?.removeEventListener?.('characteristicvaluechanged', onCpIndication); } catch { /* ignore */ }
  try { statusChar?.removeEventListener?.('characteristicvaluechanged', onStatus); } catch { /* ignore */ }
}

/** Scrive un comando e aspetta la risposta dell'attrezzo (o il timeout). Un comando alla volta. */
async function write(bytes: Uint8Array): Promise<{ ok: boolean; message: string }> {
  if (!cpChar) return { ok: false, message: 'L’attrezzo non accetta comandi' };
  const op = bytes[0];
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // alcuni attrezzi eseguono il comando senza rispondere: lo si considera inviato
      if (pending?.op === op) { pending = null; resolve({ ok: true, message: 'Inviato (nessuna conferma dall’attrezzo)' }); }
    }, RESPONSE_TIMEOUT_MS);
    pending = { op, resolve, timer };
    Promise.resolve(cpChar.writeValueWithResponse(bytes)).catch((e: any) => {
      if (pending?.op === op) { clearTimeout(timer); pending = null; }
      resolve({ ok: false, message: String(e?.message ?? e ?? 'Scrittura non riuscita') });
    });
  });
}

/** Mette in coda un comando: i comandi partono uno dopo l'altro, nell'ordine. */
function enqueue(bytes: Uint8Array): Promise<{ ok: boolean; message: string }> {
  const gen = generation;
  const run = chain.then(async () => {
    if (gen !== generation) return { ok: false, message: 'Annullato' };
    const r = await write(bytes);
    logLine(`${CMD_NAME[bytes[0]] ?? 'comando'} (${hex(bytes)}) → ${r.ok ? r.message === 'ok' ? 'ok' : r.message : r.message}`);
    return r;
  });
  chain = run.catch(() => undefined);
  return run;
}

async function readRange(kind: keyof typeof RANGE_CHARS): Promise<Range | null> {
  const ch = ftmsChars.find((c) => shortOf(String(c.uuid)) === RANGE_CHARS[kind]);
  if (!ch?.readValue) return null;
  try { return parseRange(kind, await ch.readValue()); } catch { return null; }
}

/**
 * Comandi del tapis SOSPESI (2026-11-24): sul TFK 495 l'avvio dall'app porta il nastro alla
 * velocità massima e lo STOP automatico non lo ha fermato. Finché non è chiarito, il tapis si
 * usa solo in lettura. La cyclette resta comandabile.
 */
let treadmillControlSuspended = false;
/**
 * Prova prudente dopo la correzione delle unità (PR #23): il tapis non supera mai questa velocità,
 * qualunque limite scelga l'utente. Da togliere quando l'utente conferma che la velocità è giusta.
 */
export const TREADMILL_TEST_MAX_KMH = 6;
function capTreadmill<T extends { speed: { max: number } }>(l: T): T {
  if (state.kind === 'treadmill') l.speed = { ...l.speed, max: Math.min(l.speed.max, TREADMILL_TEST_MAX_KMH) };
  return l;
}
export const TREADMILL_SUSPENDED_MSG = 'Comandi del tapis sospesi per sicurezza: usa la console del tapis. I dati restano visibili qui.';
export const isTreadmillControlSuspended = () => treadmillControlSuspended;
/** solo per i test */
export function __setTreadmillControlSuspended(v: boolean) { treadmillControlSuspended = v; }

/**
 * Prende il controllo dell'attrezzo (Request Control). Da chiamare solo dopo che l'utente ha
 * confermato le avvertenze di sicurezza. `spec` = limiti scelti dall'utente nel profilo.
 */
export async function takeFtmsControl(spec?: MachineSpec): Promise<boolean> {
  if (state.kind === 'treadmill' && treadmillControlSuspended) { setControl({ status: 'error', error: TREADMILL_SUSPENDED_MSG }); return false; }
  if (!cpChar || state.status !== 'connected') { setControl({ status: 'error', error: 'Collega prima l’attrezzo.' }); return false; }
  setControl({ status: 'requesting', error: null });
  try {
    cpChar.addEventListener('characteristicvaluechanged', onCpIndication);
    await cpChar.startNotifications();
    if (statusChar) {
      statusChar.addEventListener('characteristicvaluechanged', onStatus);
      try { await statusChar.startNotifications(); } catch { /* facoltativo */ }
    }
  } catch (e: any) {
    setControl({ status: 'error', error: `Impossibile aprire i comandi: ${e?.message ?? e}` });
    return false;
  }
  const [speed, incline, resistance] = [await readRange('speed'), await readRange('incline'), await readRange('resistance')];
  const limits = effectiveLimits(spec, { speed, incline, resistance });
  capTreadmill(limits);
  const r = await enqueue(cmd.requestControl());
  if (!r.ok) { setControl({ status: 'error', error: r.message, limits }); return false; }
  setControl({ status: 'on', error: null, limits, targets: {}, running: false, lastEvent: null });
  logLine(`limiti: velocità ${limits.speed.min}–${limits.speed.max} km/h, pendenza ${limits.incline.min}–${limits.incline.max}%${speed ? ` (tapis ${speed.min}–${speed.max}, unità ${speed.perKmh === 10 ? '0,1' : '0,01'} km/h)` : ''}`);
  return true;
}

/** Aggiorna i limiti (es. l'utente li cambia durante l'allenamento). */
export function setFtmsLimits(spec?: MachineSpec) {
  if (!state.control.limits) return;
  setControl({ limits: capTreadmill(effectiveLimits(spec, { speed: state.control.limits.speed, incline: state.control.limits.incline, resistance: state.control.limits.resistance })) });
}

const controlling = () => state.control.status === 'on' && !!state.control.limits && !(state.kind === 'treadmill' && treadmillControlSuspended);

export async function startFtms(): Promise<boolean> {
  if (!controlling()) return false;
  lastSpeedCmd = { at: Date.now(), from: state.live.speedKmh ?? 0 };
  const r = await enqueue(cmd.start());
  if (r.ok) setControl({ running: true, error: null }); else setControl({ error: r.message });
  return r.ok;
}

export async function pauseFtms(): Promise<boolean> {
  if (!controlling()) return false;
  const r = await enqueue(cmd.pause());
  if (r.ok) setControl({ running: false }); else setControl({ error: r.message });
  return r.ok;
}

/** STOP: svuota la coda e ferma subito l'attrezzo. */
export async function stopFtms(): Promise<boolean> {
  if (!cpChar) return false;
  generation++;
  chain = Promise.resolve();
  if (pending) { clearTimeout(pending.timer); pending.resolve({ ok: false, message: 'Annullato dallo STOP' }); pending = null; }
  let r = await write(cmd.stop());
  if (!r.ok) r = await write(cmd.stop()); // un secondo tentativo
  logLine(`STOP → ${r.ok ? 'ok' : r.message}`);
  setControl({ running: false, targets: { ...state.control.targets, speed: 0 }, error: r.ok ? null : `STOP non confermato: usa il pulsante o la chiave di sicurezza dell’attrezzo. (${r.message})` });
  return r.ok;
}

export async function setFtmsSpeed(kmh: number, retry = false): Promise<number | null> {
  if (!controlling() || state.kind !== 'treadmill') return null;
  const v = clampTarget(kmh, state.control.limits!.speed);
  lastSpeedCmd = { at: Date.now(), from: state.live.speedKmh ?? 0 };
  if (!retry) { resent = false; adjustTries = 0; offSince = null; }
  overSince = null;
  setControl({ targets: { ...state.control.targets, speed: v } });
  const r = await enqueue(cmd.speed(v, state.control.limits!.speed.perKmh ?? 100));
  if (!r.ok) setControl({ error: r.message });
  return r.ok ? v : null;
}

export async function setFtmsIncline(pct: number): Promise<number | null> {
  if (!controlling() || state.kind !== 'treadmill') return null;
  const v = clampTarget(pct, state.control.limits!.incline);
  setControl({ targets: { ...state.control.targets, incline: v } });
  const r = await enqueue(cmd.incline(v));
  if (!r.ok) setControl({ error: r.message });
  return r.ok ? v : null;
}

export async function setFtmsResistance(level: number): Promise<number | null> {
  if (!controlling() || state.kind !== 'bike') return null;
  const v = clampTarget(level, state.control.limits!.resistance);
  setControl({ targets: { ...state.control.targets, resistance: v } });
  const r = await enqueue(cmd.resistance(v));
  if (!r.ok) setControl({ error: r.message });
  return r.ok ? v : null;
}

/** Torna alla sola lettura (l'attrezzo resta com'è: va fermato prima, se serve). */
export function releaseFtmsControl() {
  dropControl();
  setControl({ ...controlOff, status: cpChar ? 'off' : 'unavailable' });
}

export const FTMS_OP = OP;

/** Solo per i test. */
export function __resetFtms() { dropControl(); state = initial; acc = null; dev = null; dataChar = null; cpChar = null; statusChar = null; ftmsChars = []; manualClose = false; subs.clear(); eventListeners.clear(); }
