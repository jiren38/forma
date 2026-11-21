// Dati dal vivo di cyclette e tapis (FTMS): decodifica, totali, medie, riconnessione,
// applicazione allo storico e collegamento in SOLA LETTURA.
import { afterEach, describe, expect, it } from 'vitest';
import { FtmsAccumulator, hasMachineData, parseFtmsPacket } from '@/lib/ftms-live';
import { applyMachineData, actualFromPlan, defaultPlanFor } from '@/lib/cardio';
import type { CardioPlan } from '@/lib/types';

class W {
  b: number[] = [];
  u8(v: number) { this.b.push(v & 0xff); return this; }
  u16(v: number) { return this.u8(v).u8(v >> 8); }
  s16(v: number) { return this.u16(v < 0 ? v + 0x10000 : v); }
  u24(v: number) { return this.u8(v).u8(v >> 8).u8(v >> 16); }
  dv() { return new DataView(new Uint8Array(this.b).buffer); }
}

/** Indoor Bike Data come la JK 564: velocità, cadenza, distanza, resistenza, energia, tempo. */
function bike(o: { speed: number; cadence: number; dist: number; res: number; kcal: number; t: number }) {
  const flags = (1 << 2) | (1 << 4) | (1 << 5) | (1 << 8) | (1 << 11);
  return new W().u16(flags).u16(Math.round(o.speed * 100)).u16(o.cadence * 2).u24(o.dist).s16(o.res).u16(o.kcal).u16(0).u8(0).u16(o.t).dv();
}
/** Treadmill Data come il TFK 495: velocità, distanza, inclinazione, energia, tempo. */
function tread(o: { speed: number; dist: number; incl: number; kcal: number; t: number }) {
  const flags = (1 << 2) | (1 << 3) | (1 << 7) | (1 << 10);
  return new W().u16(flags).u16(Math.round(o.speed * 100)).u24(o.dist).s16(Math.round(o.incl * 10)).s16(0).u16(o.kcal).u16(0).u8(0).u16(o.t).dv();
}

describe('pacchetti FTMS', () => {
  it('decodifica la cyclette', () => {
    const p = parseFtmsPacket('bike', bike({ speed: 24.5, cadence: 80, dist: 1234, res: 6, kcal: 42, t: 300 }));
    expect(p).toMatchObject({ speedKmh: 24.5, cadence: 80, machineDistanceM: 1234, resistance: 6, machineKcal: 42, machineElapsedSec: 300 });
  });
  it('decodifica il tapis', () => {
    const p = parseFtmsPacket('treadmill', tread({ speed: 2.3, dist: 150, incl: 2, kcal: 10, t: 120 }));
    expect(p).toMatchObject({ speedKmh: 2.3, machineDistanceM: 150, inclinePct: 2, machineKcal: 10, machineElapsedSec: 120 });
  });
  it('pacchetto "More Data" senza velocità', () => {
    const dv = new W().u16(1 | (1 << 4)).u24(500).dv();
    expect(parseFtmsPacket('bike', dv)).toEqual({ machineDistanceM: 500 });
  });
});

describe('accumulo della sessione', () => {
  it('conta solo da quando è collegato, con medie pesate sul tempo', () => {
    const a = new FtmsAccumulator('treadmill', 'FS-505551');
    // l'attrezzo aveva già 1000 m sul display al collegamento
    let t = 0;
    for (let i = 0; i <= 60; i++) { a.push(parseFtmsPacket('treadmill', tread({ speed: 6, dist: 1000 + i * 2, incl: 3, kcal: 50 + Math.floor(i / 10), t: 600 + i })), t); t += 1000; }
    const s = a.summary();
    expect(s.distanceM).toBe(120);
    expect(s.kcal).toBe(6);
    expect(s.movingSec).toBe(60);
    expect(s.avgSpeedKmh).toBe(6);
    expect(s.avgIncline).toBe(3);
    expect(hasMachineData(s)).toBe(true);
  });

  it('non conta il tempo da fermo e sopravvive a azzeramento e riconnessione', () => {
    const a = new FtmsAccumulator('bike', 'iConsole+0006');
    let t = 0;
    const push = (p: Parameters<typeof bike>[0]) => { a.push(parseFtmsPacket('bike', bike(p)), t); t += 1000; };
    for (let i = 0; i < 5; i++) push({ speed: 0, cadence: 0, dist: 0, res: 1, kcal: 0, t: i });
    expect(a.summary().movingSec).toBe(0);
    for (let i = 0; i < 10; i++) push({ speed: 20, cadence: 70, dist: i * 5, res: 4, kcal: i, t: 5 + i });
    // display azzerato: il contatore riparte da 0
    push({ speed: 20, cadence: 70, dist: 0, res: 4, kcal: 0, t: 0 });
    push({ speed: 20, cadence: 70, dist: 10, res: 4, kcal: 1, t: 1 });
    // connessione persa e ripresa: nessun salto
    a.relink();
    push({ speed: 20, cadence: 70, dist: 900, res: 4, kcal: 80, t: 50 });
    push({ speed: 20, cadence: 70, dist: 905, res: 4, kcal: 80, t: 51 });
    const s = a.summary();
    expect(s.distanceM).toBe(45 + 10 + 5);
    expect(s.avgCadence).toBe(70);
    expect(s.avgResistance).toBe(4);
  });

  it('riprende un riepilogo salvato', () => {
    const a = new FtmsAccumulator('bike', 'iConsole+0006');
    a.seed({ device: 'iConsole+0006', kind: 'bike', movingSec: 600, distanceM: 4000, kcal: 70, avgCadence: 80, avgResistance: 5, updatedAt: '' });
    a.push({ cadence: 60, resistance: 5, machineDistanceM: 10 }, 0);
    a.push({ cadence: 60, resistance: 5, machineDistanceM: 20 }, 1000);
    const s = a.summary();
    expect(s.distanceM).toBe(4010);
    expect(s.movingSec).toBe(601);
    expect(s.avgCadence).toBe(80); // (80*600 + 60*1)/601 ≈ 79.97
  });
});

describe('salvataggio nello storico', () => {
  const plan: CardioPlan = defaultPlanFor('treadmill_walk', { level: 'intermediate', injuries: [], age: 35 } as any);
  const m = { device: 'FS-505551', kind: 'treadmill' as const, movingSec: 1500, distanceM: 2480, kcal: 160, avgSpeedKmh: 5.95, avgIncline: 2.04, avgHr: null, updatedAt: '' };

  it('usa distanza, medie e calorie dell’attrezzo', () => {
    const a = applyMachineData(actualFromPlan(plan, 1520, 80), plan, m, 80);
    expect(a.durationSec).toBe(1520);
    expect(a.distanceKm).toBe(2.48);
    expect(a.speedKmh).toBe(6);
    expect(a.inclinePct).toBe(2);
    expect(a.kcal).toBe(160);
    expect(a.kcalFromMachine).toBe(true);
    expect(a.device).toBe('FS-505551');
  });

  it('senza timer usa il tempo in movimento; senza calorie dall’attrezzo resta la stima', () => {
    const a = applyMachineData(actualFromPlan(plan, 5, 80), plan, { ...m, kcal: 0 }, 80);
    expect(a.durationSec).toBe(1500);
    expect(a.kcalFromMachine).toBe(false);
    expect(a.kcal).toBeGreaterThan(0);
  });

  it('nessun dato: risultato invariato', () => {
    const base = actualFromPlan(plan, 600, 80);
    expect(applyMachineData(base, plan, null, 80)).toBe(base);
  });
});

describe('collegamento in sola lettura', () => {
  afterEach(() => { delete (navigator as any).bluetooth; });

  it('si iscrive solo ai dati di allenamento e non scrive mai', async () => {
    const calls: string[] = [];
    const listeners: ((ev: any) => void)[] = [];
    const mkChar = (uuid: string) => ({
      uuid, value: null as DataView | null,
      addEventListener: (_: string, fn: any) => { if (uuid === '2ad2') listeners.push(fn); },
      removeEventListener: () => undefined,
      startNotifications: async () => { calls.push(`notify:${uuid}`); },
      stopNotifications: async () => undefined,
      writeValue: async () => { calls.push('WRITE'); },
      writeValueWithResponse: async () => { calls.push('WRITE'); },
    });
    const chars = [mkChar('2ad9'), mkChar('2ad2'), mkChar('2ada')];
    const device = {
      name: 'iConsole+0006', addEventListener: () => undefined, removeEventListener: () => undefined,
      gatt: { connected: false, connect: async function () { return this; }, disconnect: () => calls.push('disconnect'),
        getPrimaryServices: async () => [{ uuid: '1826', getCharacteristics: async () => chars }] },
    };
    (navigator as any).bluetooth = { requestDevice: async (o: any) => { calls.push(`request:${JSON.stringify(o.filters)}`); return device; } };
    const { connectFtms, getFtmsState, liveMachineSummary, disconnectFtms, __resetFtms } = await import('@/lib/ble/ftms');
    __resetFtms();
    expect(await connectFtms('ex1')).toBe(true);
    expect(getFtmsState()).toMatchObject({ status: 'connected', kind: 'bike', device: 'iConsole+0006', ownerUid: 'ex1' });
    const ch = chars[1];
    ch.value = bike({ speed: 20, cadence: 70, dist: 10, res: 3, kcal: 1, t: 1 });
    listeners.forEach((fn) => fn({ target: ch }));
    expect(getFtmsState().live.cadence).toBe(70);
    expect(liveMachineSummary('ex1')?.device).toBe('iConsole+0006');
    expect(liveMachineSummary('other')).toBeNull();
    await disconnectFtms();
    expect(calls).not.toContain('WRITE');
    expect(calls.filter((c) => c.startsWith('notify:'))).toEqual(['notify:2ad2']);
    expect(getFtmsState().status).toBe('idle');
  });
});
