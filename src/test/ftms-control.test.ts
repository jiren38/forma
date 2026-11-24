// Comandi FTMS a tapis e cyclette: pacchetti, limiti di sicurezza, percorsi e flusso dei comandi.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampTarget, cmd, effectiveLimits, parseCpResponse, parseMachineStatus, parseRange } from '@/lib/ftms-control';
import { routesFor, routeStats, guessLevel, blankRoutePlan } from '@/lib/routes';
import { expandPhases } from '@/lib/cardio';

const dv = (...b: number[]) => new DataView(new Uint8Array(b).buffer);
const arr = (u: Uint8Array) => [...u];

describe('pacchetti dei comandi', () => {
  it('codifica secondo FTMS', () => {
    expect(arr(cmd.requestControl())).toEqual([0x00]);
    expect(arr(cmd.start())).toEqual([0x07]);
    expect(arr(cmd.stop())).toEqual([0x08, 0x01]);
    expect(arr(cmd.pause())).toEqual([0x08, 0x02]);
    expect(arr(cmd.speed(5.5))).toEqual([0x02, 0x26, 0x02]); // 550
    expect(arr(cmd.incline(6))).toEqual([0x03, 0x3c, 0x00]); // 60
    expect(arr(cmd.incline(-1.5))).toEqual([0x03, 0xf1, 0xff]); // -15
    expect(arr(cmd.resistance(12))).toEqual([0x04, 120]);
  });
  it('interpreta risposte e stato macchina', () => {
    expect(parseCpResponse(dv(0x80, 0x02, 0x01))).toMatchObject({ request: 0x02, ok: true });
    expect(parseCpResponse(dv(0x80, 0x07, 0x05))).toMatchObject({ ok: false, message: expect.stringContaining('non accetta') });
    expect(parseCpResponse(dv(0x07))).toBeNull();
    expect(parseMachineStatus(dv(0x03))).toBe('safety_key');
    expect(parseMachineStatus(dv(0x02, 0x01))).toBe('stopped');
    expect(parseMachineStatus(dv(0x02, 0x02))).toBe('paused');
    expect(parseMachineStatus(dv(0xff))).toBe('control_lost');
  });
  it('legge gli intervalli supportati', () => {
    // velocità 0,8–16 km/h passo 0,1
    expect(parseRange('speed', dv(80, 0, 0x40, 0x06, 10, 0))).toEqual({ min: 0.8, max: 16, step: 0.1, perKmh: 100 });
    // pendenza 0–12 % passo 1
    expect(parseRange('incline', dv(0, 0, 120, 0, 10, 0))).toEqual({ min: 0, max: 12, step: 1 });
  });
  it('TFK 495: velocità in 0,1 km/h (dichiara 8–160) → 5 km/h si invia come 50', () => {
    const r = parseRange('speed', dv(8, 0, 160, 0, 1, 0))!;
    expect(r).toEqual({ min: 0.8, max: 16, step: 0.1, perKmh: 10 });
    const L = effectiveLimits({ maxSpeed: 12 }, { speed: r });
    expect(L.speed).toMatchObject({ max: 12, perKmh: 10 });
    expect(arr(cmd.speed(clampTarget(5, L.speed), L.speed.perKmh))).toEqual([0x02, 50, 0]);
    expect(arr(cmd.speed(3.5, 10))).toEqual([0x02, 35, 0]);
  });
});

describe('limiti di sicurezza', () => {
  it('usa il limite più basso tra utente e attrezzo', () => {
    const L = effectiveLimits({ maxSpeed: 10, maxIncline: 8 }, { speed: { min: 0.8, max: 16, step: 0.1 }, incline: { min: 0, max: 12, step: 1 } });
    expect(L.speed.max).toBe(10);
    expect(L.incline.max).toBe(8);
    expect(clampTarget(14, L.speed)).toBe(10);
    expect(clampTarget(0.2, L.speed)).toBe(0.8);
    expect(clampTarget(5.55, L.speed)).toBe(5.6);
    expect(clampTarget(11, L.incline)).toBe(8);
    expect(clampTarget(-3, L.incline)).toBe(0);
  });
  it('senza dati dall’attrezzo resta prudente (max 12 km/h)', () => {
    const L = effectiveLimits(undefined, {});
    expect(L.speed.max).toBe(12);
    expect(L.incline.max).toBe(12);
  });
});

describe('percorsi', () => {
  it('tapis: almeno un percorso per livello, valori dentro i limiti del TFK 495', () => {
    const rs = routesFor('treadmill');
    for (const lv of ['easy', 'medium', 'hard']) expect(rs.some((r) => r.level === lv)).toBe(true);
    for (const r of rs) {
      const st = routeStats(r.plan);
      expect(st.minutes).toBeGreaterThanOrEqual(15);
      expect(st.maxSpeed!).toBeLessThanOrEqual(12);
      expect(st.maxIncline!).toBeLessThanOrEqual(12);
      for (const p of expandPhases(r.plan)) expect(p.speedKmh!).toBeGreaterThanOrEqual(0.8);
    }
  });
  it('cyclette: resistenza scalata sui livelli dell’utente', () => {
    const rs = routesFor('bike', { cardioMachines: { bike: { maxResistance: 16 } } });
    for (const r of rs) {
      expect(r.plan.resistanceMax).toBe(16);
      for (const p of expandPhases(r.plan)) { expect(p.resistance!).toBeGreaterThanOrEqual(1); expect(p.resistance!).toBeLessThanOrEqual(16); }
    }
  });
  it('percorsi personalizzati dopo quelli predefiniti, con difficoltà stimata', () => {
    const plan = blankRoutePlan('treadmill');
    const rs = routesFor('treadmill', { cardioRoutes: [{ id: 'x', name: 'Mio', machine: 'treadmill', plan, createdAt: '' }] });
    expect(rs[rs.length - 1]).toMatchObject({ id: 'x', custom: true, name: 'Mio' });
    expect(['easy', 'medium', 'hard']).toContain(guessLevel(plan));
  });
});

describe('flusso dei comandi (attrezzo simulato)', () => {
  it('comandi del tapis sospesi: nessun comando inviato', async () => {
    const { writes } = fakeTreadmill();
    const f = await import('@/lib/ble/ftms');
    f.__resetFtms();
    f.__setTreadmillControlSuspended(true);
    await f.connectFtms('ex1');
    expect(await f.takeFtmsControl({ maxSpeed: 9 })).toBe(false);
    expect(await f.startFtms()).toBe(false);
    expect(await f.setFtmsSpeed(5)).toBeNull();
    expect(writes).toEqual([]);
    await f.disconnectFtms();
  });

  afterEach(() => { delete (navigator as any).bluetooth; });

  function fakeTreadmill(opts: { refuse?: boolean } = {}) {
    const writes: number[][] = [];
    const cpListeners: ((ev: any) => void)[] = [];
    const statusListeners: ((ev: any) => void)[] = [];
    const ch = (uuid: string, extra: any = {}) => ({ uuid, value: null as DataView | null, addEventListener() {}, removeEventListener() {}, async startNotifications() {}, async stopNotifications() {}, ...extra });
    const cp: any = ch('2ad9', {
      addEventListener: (_: string, f: any) => cpListeners.push(f),
      async writeValueWithResponse(b: Uint8Array) {
        writes.push([...b]);
        const ok = opts.refuse && b[0] === 0x00 ? 0x05 : 0x01;
        setTimeout(() => { cp.value = dv(0x80, b[0], ok); cpListeners.forEach((f) => f({ target: cp })); }, 1);
      },
    });
    const status: any = ch('2ada', { addEventListener: (_: string, f: any) => statusListeners.push(f) });
    const dataListeners: ((ev: any) => void)[] = [];
    const data: any = ch('2acd', { addEventListener: (_: string, f: any) => dataListeners.push(f) });
    const chars = [data, cp, status,
      ch('2ad4', { readValue: async () => dv(80, 0, 0x40, 0x06, 10, 0) }),
      ch('2ad5', { readValue: async () => dv(0, 0, 120, 0, 10, 0) })];
    const device = { name: 'FS-505551', addEventListener() {}, removeEventListener() {},
      gatt: { connected: false, async connect() { return this; }, disconnect() {}, async getPrimaryServices() { return [{ uuid: '1826', getCharacteristics: async () => chars }]; } } };
    (navigator as any).bluetooth = { requestDevice: async () => device };
    const emitStatus = (...b: number[]) => { status.value = dv(...b); statusListeners.forEach((f) => f({ target: status })); };
    /** pacchetto dati del tapis con la sola velocità istantanea */
    const emitSpeed = (kmh: number) => { const v = Math.round(kmh * 100); data.value = dv(0, 0, v & 255, v >> 8); dataListeners.forEach((f) => f({ target: data })); };
    return { writes, emitStatus, emitSpeed };
  }

  it('richiesta controllo, avvio, velocità limitata, STOP', async () => {
    const { writes, emitStatus } = fakeTreadmill();
    const f = await import('@/lib/ble/ftms');
    f.__resetFtms();
    f.__setTreadmillControlSuspended(false);
    expect(await f.connectFtms('ex1')).toBe(true);
    expect(f.getFtmsState().control.status).toBe('off');
    expect(writes).toEqual([]); // collegarsi non invia nulla
    expect(await f.takeFtmsControl({ maxSpeed: 9, maxIncline: 6 })).toBe(true);
    expect(f.getFtmsState().control).toMatchObject({ status: 'on', limits: { speed: { max: 9 }, incline: { max: 6 } } });
    expect(await f.startFtms()).toBe(true);
    expect(await f.setFtmsSpeed(15)).toBe(9);
    expect(await f.setFtmsIncline(10)).toBe(6);
    expect(await f.setFtmsResistance(5)).toBeNull(); // il tapis non ha resistenza
    let stopped = false;
    const off = f.onFtmsMachineEvent((e) => { if (e === 'safety_key') stopped = true; });
    emitStatus(0x03);
    expect(stopped).toBe(true);
    expect(f.getFtmsState().control.running).toBe(false);
    off();
    expect(await f.stopFtms()).toBe(true);
    expect(writes).toEqual([[0x00], [0x07], [0x02, 0x84, 0x03], [0x03, 0x3c, 0x00], [0x08, 0x01]]);
    await f.disconnectFtms();
  });

  it('controllo di sicurezza: nastro troppo veloce → ripete la velocità, poi STOP', async () => {
    const { writes, emitSpeed } = fakeTreadmill();
    const f = await import('@/lib/ble/ftms');
    f.__resetFtms();
    f.__setTreadmillControlSuspended(false);
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      await f.connectFtms('ex1');
      await f.takeFtmsControl({ maxSpeed: 12 });
      expect(await f.setFtmsSpeed(5)).toBe(5);
      expect(await f.startFtms()).toBe(true);
      // durante l'avvio il nastro può accelerare: nessun intervento
      emitSpeed(12); now += 3000; emitSpeed(12);
      expect(writes.filter((w) => w[0] === 0x08)).toEqual([]);
      // a regime è ancora a 12 km/h invece di 5: si ripete la velocità
      now += 8000; emitSpeed(12); now += 3000; emitSpeed(12); now += 3000; emitSpeed(12);
      await new Promise((r) => setTimeout(r, 20));
      expect(writes[writes.length - 1]).toEqual([0x02, 0xf4, 0x01]);
      // continua: STOP
      now += 12000; emitSpeed(12); now += 3000; emitSpeed(12); now += 3000; emitSpeed(12);
      await new Promise((r) => setTimeout(r, 20));
      expect(writes[writes.length - 1]).toEqual([0x08, 0x01]);
      expect(f.getFtmsState().control.error).toMatch(/fermato per sicurezza/);
      expect(f.getFtmsState().control.log.some((l) => l.includes('STOP'))).toBe(true);
    } finally { spy.mockRestore(); await f.disconnectFtms(); }
  });

  it('alla velocità giusta il controllo non interviene', async () => {
    const { writes, emitSpeed } = fakeTreadmill();
    const f = await import('@/lib/ble/ftms');
    f.__resetFtms();
    f.__setTreadmillControlSuspended(false);
    let now = 2_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      await f.connectFtms('ex1');
      await f.takeFtmsControl({ maxSpeed: 12 });
      await f.setFtmsSpeed(5);
      await f.startFtms();
      for (let i = 0; i < 20; i++) { now += 1000; emitSpeed(5.2); }
      await new Promise((r) => setTimeout(r, 20));
      expect(writes).toEqual([[0x00], [0x02, 0xf4, 0x01], [0x07]]);
    } finally { spy.mockRestore(); await f.disconnectFtms(); }
  });

  it('se l’attrezzo rifiuta il controllo non invia altri comandi', async () => {
    const { writes } = fakeTreadmill({ refuse: true });
    const f = await import('@/lib/ble/ftms');
    f.__resetFtms();
    f.__setTreadmillControlSuspended(false);
    await f.connectFtms('ex1');
    expect(await f.takeFtmsControl()).toBe(false);
    expect(f.getFtmsState().control.status).toBe('error');
    expect(await f.startFtms()).toBe(false);
    expect(await f.setFtmsSpeed(5)).toBeNull();
    expect(writes).toEqual([[0x00]]);
    await f.disconnectFtms();
  });
});
