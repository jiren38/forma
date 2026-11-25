import { describe, expect, it } from 'vitest';
import {
  healthPayloadFromUrl, healthSummaryText, parseHealthDate, parseHealthNumber, parseHealthPayload, parseSleepStage,
  planHealthImport, sleepNights,
} from '@/lib/health';
import type { Measurement, WellnessDay } from '@/lib/types';

// mercoledì 25 novembre 2026, 09:00 ora locale
const NOW = new Date(2026, 10, 25, 9, 0);
const L = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const iso = (d: Date) => {
  const p = (n: number) => `${n}`.padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
};

describe('Apple Salute: date', () => {
  it('ISO 8601 con e senza fuso', () => {
    expect(+parseHealthDate(iso(L(2026, 11, 25, 7, 12)))!).toBe(+L(2026, 11, 25, 7, 12));
    expect(+parseHealthDate('2026-11-25T06:12:00Z')!).toBe(Date.UTC(2026, 10, 25, 6, 12));
    expect(+parseHealthDate('2026-11-25T07:12:00+0100')!).toBe(Date.UTC(2026, 10, 25, 6, 12));
    expect(+parseHealthDate('2026-11-25')!).toBe(+L(2026, 11, 25));
    expect(+parseHealthDate('2026-11-25 07:12')!).toBe(+L(2026, 11, 25, 7, 12));
  });
  it('formati predefiniti di Comandi Rapidi in italiano e inglese', () => {
    expect(+parseHealthDate('25 nov 2026, 07:12')!).toBe(+L(2026, 11, 25, 7, 12));
    expect(+parseHealthDate('25 novembre 2026 alle ore 23:05')!).toBe(+L(2026, 11, 25, 23, 5));
    expect(+parseHealthDate('mercoledì 25 novembre 2026')!).toBe(+L(2026, 11, 25));
    expect(+parseHealthDate('25/11/26, 07:12')!).toBe(+L(2026, 11, 25, 7, 12));
    expect(+parseHealthDate('03/11/2026 07:12')!).toBe(+L(2026, 11, 3, 7, 12)); // giorno prima del mese
    expect(+parseHealthDate('Nov 25, 2026 at 7:12 PM')!).toBe(+L(2026, 11, 25, 19, 12));
    expect(+parseHealthDate('11/3/26, 7:12 AM')!).toBe(+L(2026, 11, 3, 7, 12)); // formato USA
    expect(+parseHealthDate('Oggi alle 07:12', NOW)!).toBe(+L(2026, 11, 25, 7, 12));
    expect(+parseHealthDate('Ieri, 23:40', NOW)!).toBe(+L(2026, 11, 24, 23, 40));
  });
  it('rifiuta date impossibili', () => {
    expect(parseHealthDate('31/02/2026 07:00')).toBeNull();
    expect(parseHealthDate('ciao')).toBeNull();
    expect(parseHealthDate('')).toBeNull();
  });
});

describe('Apple Salute: numeri e fasi del sonno', () => {
  it('passi con separatori delle migliaia', () => {
    expect(parseHealthNumber('8.432', true)).toBe(8432);
    expect(parseHealthNumber('8,432', true)).toBe(8432);
    expect(parseHealthNumber('12 345', true)).toBe(12345);
    expect(parseHealthNumber('8432 passi', true)).toBe(8432);
    expect(parseHealthNumber('8432,5', true)).toBe(8432.5);
  });
  it('peso con virgola o punto decimale', () => {
    expect(parseHealthNumber('72,5', false)).toBe(72.5);
    expect(parseHealthNumber('72.45 kg', false)).toBe(72.45);
    expect(parseHealthNumber('1.072,5', false)).toBe(1072.5);
    expect(parseHealthNumber('kg', false)).toBeNull();
  });
  it('fasi in italiano, inglese e numeriche', () => {
    expect(parseSleepStage('In letto')).toBe('inBed');
    expect(parseSleepStage('In Bed')).toBe('inBed');
    expect(parseSleepStage('Sveglio')).toBe('awake');
    expect(parseSleepStage('Profondo')).toBe('asleep');
    expect(parseSleepStage('REM')).toBe('asleep');
    expect(parseSleepStage('Principale')).toBe('asleep');
    expect(parseSleepStage('0')).toBe('inBed');
    expect(parseSleepStage('2')).toBe('awake');
    expect(parseSleepStage('4')).toBe('asleep');
  });
});

describe('Apple Salute: lettura del testo', () => {
  it('legge le tre metriche e conta le righe non valide', () => {
    const p = parseHealthPayload([
      `passi;${iso(L(2026, 11, 24))};${iso(L(2026, 11, 25))};9.120`,
      `Passi ; ${iso(L(2026, 11, 25))} ; ${iso(L(2026, 11, 25, 9))} ; 1.250`,
      `sonno;${iso(L(2026, 11, 24, 23, 30))};${iso(L(2026, 11, 25, 7))};Principale`,
      `peso;${iso(L(2026, 11, 25, 7, 5))};${iso(L(2026, 11, 25, 7, 5))};72,4`,
      'peso;25 nov 2026, 07:10;80000', // peso fuori scala
      'qualcosa di strano',
      '',
    ].join('\n'), NOW);
    expect(p.samples.map((s) => s.kind)).toEqual(['steps', 'steps', 'sleep', 'weight']);
    expect(p.samples[1].value).toBe(1250);
    expect(p.samples[3].value).toBe(72.4);
    expect(p.invalidCount).toBe(2);
  });
  it('converte le libbre', () => {
    const p = parseHealthPayload('peso;2026-11-25T07:00;160 lb', NOW);
    expect(p.samples[0].value).toBeCloseTo(72.57, 2);
  });
  it('estrae i dati dagli indirizzi dell’app e del sito', () => {
    expect(healthPayloadFromUrl('forma://salute?d=passi%3B1')).toBe('passi;1');
    expect(healthPayloadFromUrl('https://jiren38.github.io/forma/#/salute/importa?d=peso%3Bx')).toBe('peso;x');
    expect(healthPayloadFromUrl('forma://altro')).toBeNull();
  });
});

describe('Apple Salute: sonno', () => {
  const sl = (a: Date, b: Date, stage: string) => `sonno;${iso(a)};${iso(b)};${stage}`;
  it('unisce le fasi sovrapposte (iPhone + Watch) ed esclude i risvegli', () => {
    const p = parseHealthPayload([
      sl(L(2026, 11, 24, 23, 0), L(2026, 11, 25, 7, 0), 'In letto'),
      sl(L(2026, 11, 24, 23, 20), L(2026, 11, 25, 2, 0), 'Principale'),
      sl(L(2026, 11, 25, 1, 0), L(2026, 11, 25, 2, 30), 'Profondo'), // si sovrappone: non conta due volte
      sl(L(2026, 11, 25, 2, 30), L(2026, 11, 25, 2, 50), 'Sveglio'),
      sl(L(2026, 11, 25, 2, 50), L(2026, 11, 25, 6, 40), 'REM'),
    ].join('\n'), NOW);
    const [n] = sleepNights(p.samples);
    expect(n.date).toBe('2026-11-25');
    // 23:20 → 02:30 = 3 h 10, 02:50 → 06:40 = 3 h 50 → 7 h 00
    expect(n.hours).toBe(7);
    expect(n.bedTime).toBe('23:00');
    expect(n.wakeTime).toBe('06:40');
    expect(n.fromInBed).toBe(false);
  });
  it('solo "In letto" (iPhone senza Watch): usa il tempo a letto; due notti distinte', () => {
    const p = parseHealthPayload([
      sl(L(2026, 11, 23, 23, 45), L(2026, 11, 24, 7, 15), 'In letto'),
      sl(L(2026, 11, 25, 0, 30), L(2026, 11, 25, 6, 0), 'In letto'),
      sl(L(2026, 11, 25, 15, 0), L(2026, 11, 25, 15, 20), 'Principale'), // pisolino pomeridiano: ignorato
    ].join('\n'), NOW);
    const ns = sleepNights(p.samples);
    expect(ns.map((n) => [n.date, n.hours, n.fromInBed])).toEqual([['2026-11-24', 7.5, true], ['2026-11-25', 5.5, true]]);
  });
});

describe('Apple Salute: cosa viene scritto', () => {
  const payload = [
    `passi;${iso(L(2026, 11, 24))};${iso(L(2026, 11, 25))};9120`,
    `passi;${iso(L(2026, 11, 25))};${iso(L(2026, 11, 25, 9))};1250`,
    `sonno;${iso(L(2026, 11, 24, 23, 30))};${iso(L(2026, 11, 25, 7))};Principale`,
    `peso;${iso(L(2026, 11, 24, 7, 30))};${iso(L(2026, 11, 24, 7, 30))};72,8`,
    `peso;${iso(L(2026, 11, 24, 21, 0))};${iso(L(2026, 11, 24, 21, 0))};73,6`, // seconda pesata dello stesso giorno: ignorata
    `peso;${iso(L(2026, 11, 25, 7, 5))};${iso(L(2026, 11, 25, 7, 5))};72,4`,
  ].join('\n');
  const parsed = parseHealthPayload(payload, NOW);

  it('archivio vuoto: passi e sonno in Benessere, una pesata al giorno', () => {
    const plan = planHealthImport(parsed, { wellness: [], measurements: [], now: NOW });
    const byDate = Object.fromEntries(plan.wellness.map((w) => [w.date, w]));
    expect(byDate['2026-11-24'].steps).toBe(9120);
    expect(byDate['2026-11-25']).toMatchObject({ steps: 1250, sleepHours: 7.5, bedTime: '23:30', wakeTime: '07:00', sleepSource: 'health', waterMl: 0 });
    expect(plan.measurements.map((m) => [m.id, m.weightKg, m.weightSource])).toEqual([['hk_w_2026-11-24', 72.8, 'health'], ['hk_w_2026-11-25', 72.4, 'health']]);
    expect(plan.weightCursor).toBe(L(2026, 11, 25, 7, 5).toISOString());
    expect(plan.summary).toMatchObject({ steps: { today: 1250, changed: 2 }, sleep: { changed: 1 }, weight: { added: 2, latest: { kg: 72.4 } } });
    expect(healthSummaryText(plan.summary)).toBe('1250 passi oggi · sonno 7 h 30 · 2 pesate');
  });

  it('una seconda importazione uguale non scrive nulla', () => {
    const first = planHealthImport(parsed, { wellness: [], measurements: [], now: NOW });
    const again = planHealthImport(parsed, { wellness: first.wellness, measurements: first.measurements, weightCursor: first.weightCursor, now: NOW });
    expect(again.wellness).toEqual([]);
    expect(again.measurements).toEqual([]);
    expect(healthSummaryText(again.summary)).toContain('1250 passi oggi');
  });

  it('rispetta i dati inseriti a mano e mantiene gli altri campi del giorno', () => {
    const wellness: WellnessDay[] = [{ id: '2026-11-25', date: '2026-11-25', waterMl: 750, sleepHours: 6, energy: 4, dailySkip: ['snack'] }];
    const measurements: Measurement[] = [
      { id: 'm1', date: '2026-11-24', weightKg: 73 },
      { id: 'm2', date: '2026-11-25', waistCm: 82 }, // misura senza peso: il peso si aggiunge qui
    ];
    const plan = planHealthImport(parsed, { wellness, measurements, now: NOW });
    const today = plan.wellness.find((w) => w.date === '2026-11-25')!;
    expect(today).toMatchObject({ steps: 1250, sleepHours: 6, waterMl: 750, energy: 4, dailySkip: ['snack'] });
    expect(today.sleepSource).toBeUndefined();
    expect(plan.summary.sleep.keptManual).toBe(1);
    expect(plan.measurements).toEqual([{ id: 'm2', date: '2026-11-25', waistCm: 82, weightKg: 72.4, weightSource: 'health' }]);
    expect(plan.summary.weight.keptManual).toBe(1);
  });

  it('aggiorna il sonno già importato quando Salute lo corregge', () => {
    const wellness: WellnessDay[] = [{ id: '2026-11-25', date: '2026-11-25', waterMl: 0, sleepHours: 5, sleepSource: 'health', steps: 1250 }];
    const plan = planHealthImport(parsed, { wellness, measurements: [], weightCursor: L(2026, 11, 25, 7, 5).toISOString(), now: NOW });
    expect(plan.wellness.find((w) => w.date === '2026-11-25')).toMatchObject({ sleepHours: 7.5, sleepSource: 'health' });
    expect(plan.measurements).toEqual([]); // pesate già importate (anche se poi cancellate a mano) non tornano
  });

  it('ignora i dati nel futuro', () => {
    const p = parseHealthPayload(`passi;${iso(L(2026, 11, 26))};${iso(L(2026, 11, 26, 9))};500`, NOW);
    expect(planHealthImport(p, { wellness: [], measurements: [], now: NOW }).wellness).toEqual([]);
  });
});
