// Adattatore Bluetooth dell'app nativa: stessa forma di Web Bluetooth, nessuna scrittura.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const calls: string[] = [];
let notify: ((dv: DataView) => void) | null = null;
let onDisc: (() => void) | null = null;

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: {
    initialize: vi.fn(async () => { calls.push('initialize'); }),
    isEnabled: vi.fn(async () => true),
    requestDevice: vi.fn(async (o: any) => { calls.push(`request:${JSON.stringify(o.services ?? null)}`); return { deviceId: 'ABC', name: 'iConsole+0006' }; }),
    connect: vi.fn(async (_id: string, cb: () => void) => { onDisc = cb; calls.push('connect'); }),
    disconnect: vi.fn(async () => { calls.push('disconnect'); }),
    getServices: vi.fn(async () => [
      { uuid: '00001826-0000-1000-8000-00805f9b34fb', characteristics: [
        { uuid: '2ad2', properties: { notify: true }, descriptors: [] },
        { uuid: '00002ad9-0000-1000-8000-00805f9b34fb', properties: { write: true, indicate: true }, descriptors: [] },
      ] },
    ]),
    read: vi.fn(async () => new DataView(new Uint8Array([1, 2]).buffer)),
    startNotifications: vi.fn(async (_d: string, s: string, c: string, cb: (dv: DataView) => void) => { calls.push(`notify:${s}:${c}`); notify = cb; }),
    stopNotifications: vi.fn(async () => undefined),
    write: vi.fn(async () => { calls.push('WRITE'); }),
    writeWithoutResponse: vi.fn(async () => { calls.push('WRITE'); }),
  },
}));

import { getBluetooth, toFullUuid } from '@/lib/ble';

describe('Bluetooth nativo (app iPhone)', () => {
  beforeEach(() => { calls.length = 0; });

  it('normalizza gli UUID nel formato a 128 bit richiesto dal plugin', () => {
    expect(toFullUuid('2AD2')).toBe('00002ad2-0000-1000-8000-00805f9b34fb');
    expect(toFullUuid('0x1826')).toBe('00001826-0000-1000-8000-00805f9b34fb');
    expect(toFullUuid(0xfff0)).toBe('0000fff0-0000-1000-8000-00805f9b34fb');
    expect(toFullUuid('02F00000-0000-0000-0000-00000000FE00')).toBe('02f00000-0000-0000-0000-00000000fe00');
  });

  it('cerca, si collega, elenca servizi e riceve notifiche come Web Bluetooth', async () => {
    const bt = getBluetooth()!;
    expect(bt.backend).toBe('native');
    const dev = await bt.requestDevice({ filters: [{ services: ['00001826-0000-1000-8000-00805f9b34fb'] }], optionalServices: [] });
    expect(dev.name).toBe('iConsole+0006');
    expect(calls).toContain('request:["00001826-0000-1000-8000-00805f9b34fb"]');

    const server = await dev.gatt.connect();
    expect(dev.gatt.connected).toBe(true);
    const [svc] = await server.getPrimaryServices();
    const chars = await svc.getCharacteristics();
    expect(chars.map((c: any) => c.uuid)).toEqual(['00002ad2-0000-1000-8000-00805f9b34fb', '00002ad9-0000-1000-8000-00805f9b34fb']);

    const got: DataView[] = [];
    chars[0].addEventListener('characteristicvaluechanged', (ev: any) => got.push(ev.target.value));
    await chars[0].startNotifications();
    notify!(new DataView(new Uint8Array([0x44, 0x02]).buffer));
    expect(got).toHaveLength(1);
    expect(got[0].getUint8(0)).toBe(0x44);

    let disconnected = false;
    dev.addEventListener('gattserverdisconnected', () => { disconnected = true; });
    onDisc!();
    expect(disconnected).toBe(true);
    expect(dev.gatt.connected).toBe(false);
  });

  it('scrive solo sul Control Point FTMS, mai sulle altre caratteristiche', async () => {
    const bt = getBluetooth()!;
    const dev = await bt.requestDevice({ acceptAllDevices: true });
    const server = await dev.gatt.connect();
    const [svc] = await server.getPrimaryServices();
    const chars = await svc.getCharacteristics();
    for (const c of chars) {
      expect(c.writeValue).toBeUndefined();
      expect(c.writeValueWithoutResponse).toBeUndefined();
      if (c.uuid === '00002ad9-0000-1000-8000-00805f9b34fb') expect(typeof c.writeValueWithResponse).toBe('function');
      else expect(c.writeValueWithResponse).toBeUndefined();
    }
    expect(calls).not.toContain('WRITE');
    const cp = chars.find((c: any) => c.uuid.startsWith('00002ad9'));
    await cp.writeValueWithResponse(new Uint8Array([0x00]));
    expect(calls).toContain('WRITE');
  });
});
