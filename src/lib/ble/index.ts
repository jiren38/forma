// Bluetooth LE unico per web e app nativa.
//
// Nel browser (Chrome/Edge, Bluefy) si usa Web Bluetooth (`navigator.bluetooth`).
// Nell'app nativa iPhone, dove Web Bluetooth non esiste, si usa il plugin Capacitor
// @capacitor-community/bluetooth-le, presentato con la STESSA forma di Web Bluetooth
// (requestDevice → device.gatt.connect → getPrimaryServices → getCharacteristics → readValue/startNotifications).
// Così le schermate che parlano Bluetooth funzionano uguali in entrambi i casi.
//
// Sicurezza: l'adattatore nativo espone la scrittura SOLO sul Fitness Machine Control Point (0x2AD9),
// l'unico punto usato per comandare tapis e cyclette (avvio, stop, velocità, pendenza, resistenza).
// Tutte le altre caratteristiche restano in sola lettura.
import { isNativeApp } from '@/lib/native';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type BleRequestOptions = {
  filters?: { services?: string[]; namePrefix?: string; name?: string }[];
  acceptAllDevices?: boolean;
  optionalServices?: string[];
};

/** Sottoinsieme di Web Bluetooth usato dall'app. */
export interface BluetoothLike {
  /** 'web' = Web Bluetooth del browser, 'native' = plugin dell'app iPhone. */
  readonly backend: 'web' | 'native';
  requestDevice(opts: BleRequestOptions): Promise<any>;
  getAvailability?(): Promise<boolean>;
  getDevices?(): Promise<any[]>;
}

const BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';

/** UUID nel formato richiesto dal plugin: 128 bit, minuscolo. Accetta "2ad2", "0x2AD2", "00002ad2" o 128 bit. */
export function toFullUuid(uuid: string | number): string {
  if (typeof uuid === 'number') return `0000${uuid.toString(16).padStart(4, '0')}${BASE_SUFFIX}`;
  const u = uuid.trim().toLowerCase().replace(/^0x/, '');
  if (/^[0-9a-f]{4}$/.test(u)) return `0000${u}${BASE_SUFFIX}`;
  if (/^[0-9a-f]{8}$/.test(u)) return `${u}${BASE_SUFFIX}`;
  return u;
}

type Listener = (ev: any) => void;

/** Mini EventTarget (addEventListener/removeEventListener/dispatch) come quello di Web Bluetooth. */
class Emitter {
  private ls = new Map<string, Set<{ fn: Listener; once: boolean }>>();
  addEventListener(type: string, fn: Listener, opts?: { once?: boolean } | boolean) {
    const once = typeof opts === 'object' && !!opts?.once;
    if (!this.ls.has(type)) this.ls.set(type, new Set());
    this.ls.get(type)!.add({ fn, once });
  }
  removeEventListener(type: string, fn: Listener) {
    const set = this.ls.get(type);
    if (!set) return;
    for (const l of set) if (l.fn === fn) set.delete(l);
  }
  protected emit(type: string, ev: any) {
    const set = this.ls.get(type);
    if (!set) return;
    for (const l of [...set]) {
      if (l.once) set.delete(l);
      try { l.fn(ev); } catch (e) { console.error(e); }
    }
  }
}

type Plugin = typeof import('@capacitor-community/bluetooth-le');
let pluginP: Promise<Plugin['BleClient']> | null = null;

/** Carica e inizializza il plugin una sola volta (la prima volta iOS chiede il permesso Bluetooth). */
function client(): Promise<Plugin['BleClient']> {
  if (!pluginP) {
    pluginP = import('@capacitor-community/bluetooth-le').then(async (m) => {
      await m.BleClient.initialize();
      return m.BleClient;
    });
    pluginP.catch(() => { pluginP = null; });
  }
  return pluginP;
}

class NativeCharacteristic extends Emitter {
  value: DataView | null = null;
  constructor(
    private deviceId: string,
    readonly service: NativeService,
    readonly uuid: string,
    readonly properties: Record<string, boolean>,
  ) { super(); }

  async readValue(): Promise<DataView> {
    const c = await client();
    const dv = await c.read(this.deviceId, this.service.uuid, this.uuid);
    this.value = dv;
    return dv;
  }

  async startNotifications(): Promise<this> {
    const c = await client();
    await c.startNotifications(this.deviceId, this.service.uuid, this.uuid, (dv) => {
      this.value = dv;
      this.emit('characteristicvaluechanged', { target: this });
    });
    return this;
  }

  async stopNotifications(): Promise<this> {
    const c = await client();
    await c.stopNotifications(this.deviceId, this.service.uuid, this.uuid);
    return this;
  }
  // Nessun writeValue / writeValueWithoutResponse, di proposito: si scrive solo con risposta e solo
  // sul Control Point FTMS (vedi NativeService.getCharacteristics / withControlWrite).
}

const CONTROL_POINT_UUID = toFullUuid('2ad9');

/** Aggiunge writeValueWithResponse solo al Fitness Machine Control Point. */
function withControlWrite(ch: NativeCharacteristic, deviceId: string): NativeCharacteristic {
  if (ch.uuid !== CONTROL_POINT_UUID) return ch;
  (ch as any).writeValueWithResponse = async (value: BufferSource) => {
    const c = await client();
    const bytes = value instanceof DataView ? value : ArrayBuffer.isView(value)
      ? new DataView(value.buffer, value.byteOffset, value.byteLength) : new DataView(value as ArrayBuffer);
    await c.write(deviceId, ch.service.uuid, ch.uuid, bytes);
  };
  return ch;
}

class NativeService {
  chars: NativeCharacteristic[] = [];
  constructor(readonly uuid: string) {}
  async getCharacteristics(): Promise<NativeCharacteristic[]> { return this.chars; }
}

class NativeGatt {
  connected = false;
  constructor(private device: NativeDevice) {}

  async connect(): Promise<this> {
    const c = await client();
    await c.connect(this.device.id, () => {
      this.connected = false;
      this.device.notifyDisconnected();
    });
    this.connected = true;
    return this;
  }

  disconnect() {
    void client().then((c) => c.disconnect(this.device.id)).catch(() => undefined);
  }

  async getPrimaryServices(): Promise<NativeService[]> {
    const c = await client();
    const list = await c.getServices(this.device.id);
    return list.map((s) => {
      const svc = new NativeService(toFullUuid(s.uuid));
      svc.chars = s.characteristics.map((ch) => withControlWrite(new NativeCharacteristic(this.device.id, svc, toFullUuid(ch.uuid), { ...ch.properties } as any), this.device.id));
      return svc;
    });
  }
}

class NativeDevice extends Emitter {
  readonly gatt: NativeGatt;
  constructor(readonly id: string, readonly name: string | undefined) {
    super();
    this.gatt = new NativeGatt(this);
  }
  notifyDisconnected() { this.emit('gattserverdisconnected', { target: this }); }
}

const nativeBluetooth: BluetoothLike = {
  backend: 'native',
  async requestDevice(opts) {
    const c = await client();
    const services = (opts.filters ?? []).flatMap((f) => f.services ?? []).map(toFullUuid);
    const namePrefix = opts.filters?.find((f) => f.namePrefix)?.namePrefix;
    try {
      const d = await c.requestDevice({
        services: opts.acceptAllDevices ? undefined : services,
        namePrefix,
        optionalServices: (opts.optionalServices ?? []).map(toFullUuid),
        displayMode: 'list',
      } as any);
      return new NativeDevice(d.deviceId, d.name);
    } catch (e: any) {
      // Stesso nome d'errore di Web Bluetooth quando l'utente chiude la lista senza scegliere
      const msg = String(e?.message ?? e);
      if (/cancel|no device/i.test(msg)) { const err = new Error(msg); err.name = 'NotFoundError'; throw err; }
      throw e;
    }
  },
  async getAvailability() {
    const c = await client();
    return c.isEnabled();
  },
};

/**
 * Il Bluetooth disponibile qui: plugin nativo nell'app iPhone, Web Bluetooth nel browser,
 * undefined se nessuno dei due (es. Safari su iPhone).
 */
export function getBluetooth(): BluetoothLike | undefined {
  if (isNativeApp()) return nativeBluetooth;
  const web = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : undefined;
  if (!web) return undefined;
  return {
    backend: 'web',
    requestDevice: (o) => web.requestDevice(o),
    getAvailability: web.getAvailability ? () => web.getAvailability() : undefined,
    getDevices: web.getDevices ? () => web.getDevices() : undefined,
  };
}
