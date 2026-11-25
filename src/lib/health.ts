/**
 * Apple Salute → Forma.
 *
 * Con l'Apple ID gratuito (iloader / SideStore) l'app non può avere il permesso HealthKit, quindi i dati
 * arrivano da Comandi Rapidi: un comando legge passi, sonno e peso da Salute e apre Forma con un testo
 * di righe del tipo
 *
 *   passi;<data inizio>;<data fine>;<valore>
 *   sonno;<data inizio>;<data fine>;<fase>      (es. "Profondo", "Principale", "Sveglio", "In letto")
 *   peso;<data inizio>;<data fine>;<valore kg>
 *
 * Qui c'è solo logica pura (lettura del testo e calcolo di cosa scrivere), testata in src/test/health.test.ts.
 * I dati finiscono negli archivi che esistono già: WellnessDay (passi e sonno) e Measurement (peso).
 */
import type { Measurement, WellnessDay } from './types';
import { addDays, dayKey, fmtN, fromKey } from './util';

export type HealthKind = 'steps' | 'sleep' | 'weight';
export type SleepStage = 'inBed' | 'awake' | 'asleep';

export interface HealthSample {
  kind: HealthKind;
  start: Date;
  end: Date | null;
  /** passi o kg; null per il sonno */
  value: number | null;
  stage?: SleepStage;
}

export interface ParsedHealth {
  samples: HealthSample[];
  /** righe non comprese (al massimo le prime 5, per il messaggio d'errore) */
  invalid: string[];
  invalidCount: number;
}

// ---------------------------------------------------------------- lettura del testo

const KIND_WORDS: Record<string, HealthKind> = {
  passi: 'steps', passo: 'steps', steps: 'steps', step: 'steps', p: 'steps',
  sonno: 'sleep', sleep: 'sleep', s: 'sleep',
  peso: 'weight', weight: 'weight', w: 'weight',
};

const MONTHS: Record<string, number> = {
  gen: 0, gennaio: 0, jan: 0, january: 0,
  feb: 1, febbraio: 1, february: 1,
  mar: 2, marzo: 2, march: 2,
  apr: 3, aprile: 3, april: 3,
  mag: 4, maggio: 4, may: 4,
  giu: 5, giugno: 5, jun: 5, june: 5,
  lug: 6, luglio: 6, jul: 6, july: 6,
  ago: 7, agosto: 7, aug: 7, august: 7,
  set: 8, sett: 8, settembre: 8, sep: 8, sept: 8, september: 8,
  ott: 9, ottobre: 9, oct: 9, october: 9,
  nov: 10, novembre: 10, november: 10,
  dic: 11, dicembre: 11, dec: 11, december: 11,
};

const TIME_RE = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?`;

interface Clock { h: number; mi: number; se: number }

function clockOf(m: RegExpExecArray | null): Clock | null {
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]), se = m[3] ? Number(m[3]) : 0;
  const ap = m[4]?.toLowerCase().replace(/[.\s]/g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return { h, mi, se };
}

function withTime(y: number, mo: number, d: number, c: Clock | null): Date | null {
  const { h, mi, se } = c ?? { h: 0, mi: 0, se: 0 };
  if (y < 100) y += 2000;
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  const out = new Date(y, mo, d, h, mi, se);
  return out.getMonth() === mo ? out : null; // scarta date impossibili (31 febbraio)
}

/**
 * Legge una data come la scrive Comandi Rapidi: ISO 8601 (consigliato) oppure i formati predefiniti
 * italiano e inglese ("25 nov 2026, 07:12", "25/11/26, 07:12", "Nov 25, 2026 at 7:12 AM", "Oggi alle 07:12").
 */
export function parseHealthDate(input: string, now = new Date()): Date | null {
  const s = input.trim();
  if (!s) return null;
  // ISO 8601: "2026-11-25T07:12:00+01:00", "2026-11-25 07:12", "2026-11-25"
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(s);
  if (iso) {
    const [, y, mo, d, h, mi, se, tz] = iso;
    if (tz) {
      const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se ?? '00'}${tz.length === 5 && tz !== 'Z' ? `${tz.slice(0, 3)}:${tz.slice(3)}` : tz.toUpperCase()}`);
      return Number.isNaN(t) ? null : new Date(t);
    }
    return withTime(Number(y), Number(mo) - 1, Number(d), h ? { h: Number(h), mi: Number(mi), se: Number(se ?? 0) } : null);
  }
  const low = s.toLowerCase().replace(/\balle ore\b|\balle\b|\bore\b|\bat\b|,/g, ' ').replace(/\s+/g, ' ').trim();
  const clock = clockOf(new RegExp(TIME_RE, 'i').exec(low.replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/, ' ')));
  // relative: oggi, ieri, domani
  const rel = /\b(oggi|today|ieri|yesterday)\b/.exec(low);
  if (rel) {
    const base = addDays(now, rel[1] === 'ieri' || rel[1] === 'yesterday' ? -1 : 0);
    return withTime(base.getFullYear(), base.getMonth(), base.getDate(), clock);
  }
  // numerica: 25/11/2026 07:12 · 11/25/26 7:12 PM
  const num = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(low);
  if (num) {
    let a = Number(num[1]), b = Number(num[2]);
    const us = /\b[ap]\.?\s?m\b/.test(low);
    let day = a, mon = b;
    if (a > 12) { day = a; mon = b; } else if (b > 12 || us) { day = b; mon = a; }
    return withTime(Number(num[3]), mon - 1, day, clock);
  }
  // testuale: 25 nov 2026 · mercoledì 25 novembre 2026 · nov 25 2026
  const dmy = /(\d{1,2})\s+([a-zà-ù]+)\.?\s+(\d{4})/.exec(low);
  if (dmy && MONTHS[dmy[2]] != null) return withTime(Number(dmy[3]), MONTHS[dmy[2]], Number(dmy[1]), clock);
  const mdy = /([a-z]+)\.?\s+(\d{1,2})\s+(\d{4})/.exec(low);
  if (mdy && MONTHS[mdy[1]] != null) return withTime(Number(mdy[3]), MONTHS[mdy[1]], Number(mdy[2]), clock);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Numero scritto con le impostazioni internazionali dell'iPhone: "8.432" e "8,432" sono migliaia per i passi,
 * "72,5" e "72.5" sono decimali per il peso. Toglie unità e spazi ("72,5 kg").
 */
export function parseHealthNumber(input: string, integer: boolean): number | null {
  const s = input.replace(/[\s  ']/g, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  let norm: string;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    norm = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const thousands = new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})+$`).test(s);
    if (integer && thousands) norm = s.split(sep).join('');
    else if (s.split(sep).length === 2) norm = s.replace(sep, '.');
    else return null;
  } else norm = s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Fase del sonno come la scrive Salute in italiano o in inglese, oppure come numero di HealthKit. */
export function parseSleepStage(input: string): SleepStage | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s === '0' ? 'inBed' : s === '2' ? 'awake' : 'asleep';
  if (/letto|bed/.test(s)) return 'inBed';
  if (/svegl|awake|veglia/.test(s)) return 'awake';
  return 'asleep'; // Principale/Core, Profondo/Deep, REM, Sonno/Asleep
}

export function parseHealthPayload(text: string, now = new Date()): ParsedHealth {
  const samples: HealthSample[] = [];
  const invalid: string[] = [];
  let invalidCount = 0;
  const bad = (l: string) => { invalidCount++; if (invalid.length < 5) invalid.push(l.slice(0, 120)); };
  for (const raw of text.split(/\r?\n|\r|\u2028/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s*[;\t]\s*/);
    const kind = KIND_WORDS[parts[0]?.toLowerCase()];
    if (!kind || parts.length < 3) { bad(line); continue; }
    // 4 campi (tipo;inizio;fine;valore) oppure 3 (tipo;inizio;valore)
    const [startS, endS, valueS] = parts.length >= 4 ? [parts[1], parts[2], parts.slice(3).join(';')] : [parts[1], '', parts[2]];
    const start = parseHealthDate(startS, now);
    const end = endS ? parseHealthDate(endS, now) : null;
    if (!start) { bad(line); continue; }
    if (kind === 'sleep') {
      const stage = parseSleepStage(valueS);
      if (!stage || !end || end <= start) { bad(line); continue; }
      samples.push({ kind, start, end, value: null, stage });
      continue;
    }
    let value = parseHealthNumber(valueS, kind === 'steps');
    if (value == null || value < 0) { bad(line); continue; }
    if (kind === 'weight' && /\b(lb|lbs|libbre)\b/i.test(valueS)) value = value * 0.45359237;
    if (kind === 'weight' && (value < 25 || value > 350)) { bad(line); continue; }
    if (kind === 'steps' && value > 150000) { bad(line); continue; }
    samples.push({ kind, start, end, value });
  }
  return { samples, invalid, invalidCount };
}

// ---------------------------------------------------------------- calcolo delle scritture

type Interval = [number, number];

function unionMinutes(list: Interval[]): number {
  const xs = list.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let total = 0, cs = -Infinity, ce = -Infinity;
  for (const [a, b] of xs) {
    if (a > ce) { if (ce > cs) total += ce - cs; cs = a; ce = b; } else ce = Math.max(ce, b);
  }
  if (ce > cs) total += ce - cs;
  return total / 60000;
}

const hhmm = (t: number) => { const d = new Date(t); return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`; };

export interface SleepNight { date: string; hours: number; bedTime: string; wakeTime: string; fromInBed: boolean }

/**
 * Notti di sonno. Il sonno conta sul giorno del risveglio (come la sezione Benessere: "notte scorsa"):
 * per il giorno D si guarda la finestra dalle 18 del giorno prima alle 14 di D. Le fasi sovrapposte
 * (iPhone + Apple Watch) si uniscono senza contarle due volte; "Sveglio" non conta.
 * Se ci sono solo dati "In letto" (iPhone senza Watch) si usa il tempo a letto.
 */
export function sleepNights(samples: HealthSample[]): SleepNight[] {
  const sleep = samples.filter((s) => s.kind === 'sleep' && s.end);
  const days = new Set<string>();
  for (const s of sleep) {
    // un campione può toccare la finestra di D (fine prima delle 14) o di D+1 (inizio dopo le 18)
    days.add(dayKey(s.end!.getHours() >= 14 ? addDays(s.end!, 1) : s.end!));
    days.add(dayKey(s.start.getHours() >= 18 ? addDays(s.start, 1) : s.start));
  }
  const out: SleepNight[] = [];
  for (const date of [...days].sort()) {
    const d = fromKey(date);
    const w0 = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 18).getTime();
    const w1 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 14).getTime();
    const clip = (s: HealthSample): Interval | null => {
      const a = Math.max(+s.start, w0), b = Math.min(+s.end!, w1);
      return b > a ? [a, b] : null;
    };
    const asleep = sleep.filter((s) => s.stage === 'asleep').map(clip).filter(Boolean) as Interval[];
    const inBed = sleep.filter((s) => s.stage === 'inBed').map(clip).filter(Boolean) as Interval[];
    const fromInBed = asleep.length === 0;
    const main = fromInBed ? inBed : asleep;
    const minutes = unionMinutes(main);
    if (minutes < 30 || minutes > 16 * 60) continue;
    const bed = Math.min(...[...inBed, ...asleep].map((x) => x[0]));
    const wake = Math.max(...main.map((x) => x[1]));
    out.push({ date, hours: Math.round((minutes / 60) * 100) / 100, bedTime: hhmm(bed), wakeTime: hhmm(wake), fromInBed });
  }
  return out;
}

/** Passi per giorno. Con "Raggruppa per giorno" Salute dà già un totale al giorno; campioni sciolti si sommano. */
export function stepsByDay(samples: HealthSample[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of samples) if (s.kind === 'steps' && s.value != null) m.set(dayKey(s.start), (m.get(dayKey(s.start)) ?? 0) + s.value);
  for (const [k, v] of m) m.set(k, Math.round(v));
  return m;
}

/** Una pesata al giorno: la prima della giornata (di solito quella del mattino, la più confrontabile). */
export function weightsByDay(samples: HealthSample[]): { date: string; kg: number; at: Date }[] {
  const m = new Map<string, HealthSample>();
  for (const s of samples) {
    if (s.kind !== 'weight' || s.value == null) continue;
    const k = dayKey(s.start), cur = m.get(k);
    if (!cur || s.start < cur.start) m.set(k, s);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, s]) => ({ date, kg: Math.round(s.value! * 100) / 100, at: s.start }));
}

export interface HealthImportSummary {
  samples: number;
  invalid: number;
  steps: { days: number; changed: number; today: number | null };
  sleep: { nights: number; changed: number; keptManual: number; last: SleepNight | null };
  weight: { found: number; added: number; keptManual: number; latest: { date: string; kg: number } | null };
}

export interface HealthImportPlan {
  wellness: WellnessDay[];
  measurements: Measurement[];
  /** pesate più recenti già considerate: le successive importazioni guardano solo quelle nuove */
  weightCursor: string | null;
  summary: HealthImportSummary;
}

const sameSleep = (w: WellnessDay | undefined, n: SleepNight) =>
  !!w && w.sleepSource === 'health' && w.sleepHours === n.hours && w.bedTime === n.bedTime && w.wakeTime === n.wakeTime;

/**
 * Decide cosa scrivere, senza doppioni e senza toccare i dati inseriti a mano:
 * - passi: Salute è l'unica fonte, il valore del giorno viene aggiornato;
 * - sonno: si scrive solo se il giorno è vuoto o era già stato importato da Salute (vince il dato a mano);
 * - peso: solo pesate successive all'ultima importata; se quel giorno c'è già un peso non si aggiunge nulla,
 *   se c'è una misurazione senza peso (solo circonferenze) il peso si aggiunge a quella.
 * Ritorna solo i documenti che cambiano davvero, così una nuova importazione uguale non scrive niente.
 */
export function planHealthImport(
  parsed: ParsedHealth,
  ctx: { wellness: WellnessDay[]; measurements: Measurement[]; weightCursor?: string | null; now?: Date },
): HealthImportPlan {
  const now = ctx.now ?? new Date();
  const todayK = dayKey(now);
  const samples = parsed.samples.filter((s) => +s.start <= +now + 5 * 60000); // niente dati nel futuro
  const wByDay = new Map(ctx.wellness.map((w) => [w.date, w]));
  const changedW = new Map<string, WellnessDay>();
  const wellnessOf = (date: string): WellnessDay => changedW.get(date) ?? { ...(wByDay.get(date) ?? { id: date, date, waterMl: 0 }) };

  // passi
  const steps = stepsByDay(samples);
  let stepsChanged = 0;
  for (const [date, n] of steps) {
    if (date > todayK) continue;
    const w = wellnessOf(date);
    if (w.steps === n) continue;
    changedW.set(date, { ...w, steps: n, id: date, date });
    stepsChanged++;
  }

  // sonno
  const nights = sleepNights(samples).filter((n) => n.date <= todayK);
  let sleepChanged = 0, keptManual = 0;
  for (const n of nights) {
    const cur = wByDay.get(n.date);
    const manual = cur && cur.sleepHours != null && cur.sleepHours > 0 && cur.sleepSource !== 'health';
    if (manual) { keptManual++; continue; }
    if (sameSleep(cur, n)) continue;
    const w = wellnessOf(n.date);
    changedW.set(n.date, { ...w, sleepHours: n.hours, bedTime: n.bedTime, wakeTime: n.wakeTime, sleepSource: 'health', id: n.date, date: n.date });
    sleepChanged++;
  }

  // peso
  const weights = weightsByDay(samples).filter((x) => x.date <= todayK);
  const cursor = ctx.weightCursor ?? null;
  const fresh = weights.filter((x) => !cursor || x.at.toISOString() > cursor);
  const outM: Measurement[] = [];
  let added = 0, keptManualW = 0;
  for (const x of fresh) {
    const sameDay = ctx.measurements.filter((m) => m.date === x.date);
    if (sameDay.some((m) => m.weightKg != null && m.weightKg > 0)) { keptManualW++; continue; }
    const host = sameDay[0];
    outM.push(host
      ? { ...host, weightKg: x.kg, weightSource: 'health' }
      : { id: `hk_w_${x.date}`, date: x.date, weightKg: x.kg, weightSource: 'health' });
    added++;
  }
  const newestSeen = weights.length ? weights.reduce((a, b) => (a.at > b.at ? a : b)).at.toISOString() : null;
  const weightCursor = [cursor, newestSeen].filter(Boolean).sort().pop() ?? null;

  const lastW = weights[weights.length - 1];
  return {
    wellness: [...changedW.values()],
    measurements: outM,
    weightCursor,
    summary: {
      samples: samples.length,
      invalid: parsed.invalidCount,
      steps: { days: steps.size, changed: stepsChanged, today: steps.get(todayK) ?? null },
      sleep: { nights: nights.length, changed: sleepChanged, keptManual, last: nights[nights.length - 1] ?? null },
      weight: { found: weights.length, added, keptManual: keptManualW, latest: lastW ? { date: lastW.date, kg: lastW.kg } : null },
    },
  };
}

// ---------------------------------------------------------------- collegamenti

/** Nome del comando rapido che Forma avvia con il pulsante "Aggiorna da Salute". */
export const HEALTH_SHORTCUT_NAME = 'Forma Salute';
/** Schema registrato dall'app iPhone (Info.plist, CFBundleURLTypes). */
export const NATIVE_HEALTH_URL = 'forma://salute?d=';
export const WEB_HEALTH_URL = 'https://jiren38.github.io/forma/#/salute/importa?d=';
export const runShortcutUrl = (name = HEALTH_SHORTCUT_NAME) => `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`;

/** Estrae il testo dei dati da un indirizzo forma://salute?d=… o …#/salute/importa?d=… */
export function healthPayloadFromUrl(url: string): string | null {
  const m = /^forma:\/\/salute\/?(?:\?(.*))?$/i.exec(url.trim()) ?? /#\/salute\/importa\?(.*)$/i.exec(url.trim());
  if (!m) return null;
  const q = new URLSearchParams(m[1] ?? '');
  return q.get('d') ?? q.get('dati') ?? '';
}

/** Breve frase per il messaggio dopo l'importazione. */
export function healthSummaryText(s: HealthImportSummary): string {
  const parts: string[] = [];
  if (s.steps.today != null) parts.push(`${fmtN(s.steps.today)} passi oggi`);
  else if (s.steps.days) parts.push(`passi di ${s.steps.days} giorni`);
  if (s.sleep.last) {
    const h = Math.floor(s.sleep.last.hours), m = Math.round((s.sleep.last.hours - h) * 60);
    parts.push(`sonno ${h} h ${`${m}`.padStart(2, '0')}`);
  }
  if (s.weight.added) parts.push(s.weight.added === 1 && s.weight.latest ? `peso ${fmtN(s.weight.latest.kg, 1)} kg` : `${s.weight.added} pesate`);
  return parts.length ? parts.join(' · ') : 'nessun dato nuovo';
}
