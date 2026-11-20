// Bluetooth Device Diagnostics: tabelle e decodificatori puri (nessun accesso al Bluetooth qui).
//
// Si usano SOLO identificativi assegnati dal Bluetooth SIG (documento "Assigned Numbers")
// e i formati descritti nelle specifiche pubbliche (FTMS 1.0, Heart Rate, CSC, Cycling Power, RSC,
// Device Information). Un UUID che non è in questa tabella viene mostrato come "non standard":
// non proviamo a indovinare a cosa serva.

const BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';

/** UUID a 128 bit (minuscolo) da un alias SIG a 16 bit. */
export function fullUuid(short: number): string {
  return `0000${short.toString(16).padStart(4, '0')}${BASE_SUFFIX}`;
}

/** Alias a 16 bit se l'UUID è basato sulla Base UUID del SIG, altrimenti null. */
export function shortOf(uuid: string): number | null {
  const u = uuid.toLowerCase();
  if (u.length === 36 && u.startsWith('0000') && u.endsWith(BASE_SUFFIX)) return parseInt(u.slice(4, 8), 16);
  return null;
}

export function fmtUuid(uuid: string): string {
  const s = shortOf(uuid);
  return s == null ? uuid.toLowerCase() : `0x${s.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Servizi GATT assegnati dal SIG che interessano gli attrezzi cardio. */
export const SERVICES: Record<number, string> = {
  0x1800: 'Generic Access',
  0x1801: 'Generic Attribute',
  0x180a: 'Device Information',
  0x180d: 'Heart Rate',
  0x180f: 'Battery',
  0x1814: 'Running Speed and Cadence',
  0x1816: 'Cycling Speed and Cadence',
  0x1818: 'Cycling Power',
  0x1826: 'Fitness Machine (FTMS)',
};

/** Caratteristiche GATT assegnate dal SIG. */
export const CHARACTERISTICS: Record<number, string> = {
  0x2a00: 'Device Name',
  0x2a01: 'Appearance',
  0x2a04: 'Peripheral Preferred Connection Parameters',
  0x2a05: 'Service Changed',
  0x2a19: 'Battery Level',
  0x2a23: 'System ID',
  0x2a24: 'Model Number String',
  0x2a25: 'Serial Number String',
  0x2a26: 'Firmware Revision String',
  0x2a27: 'Hardware Revision String',
  0x2a28: 'Software Revision String',
  0x2a29: 'Manufacturer Name String',
  0x2a37: 'Heart Rate Measurement',
  0x2a38: 'Body Sensor Location',
  0x2a39: 'Heart Rate Control Point',
  0x2a53: 'RSC Measurement',
  0x2a54: 'RSC Feature',
  0x2a55: 'SC Control Point',
  0x2a5b: 'CSC Measurement',
  0x2a5c: 'CSC Feature',
  0x2a5d: 'Sensor Location',
  0x2a63: 'Cycling Power Measurement',
  0x2a65: 'Cycling Power Feature',
  0x2a66: 'Cycling Power Control Point',
  0x2acc: 'Fitness Machine Feature',
  0x2acd: 'Treadmill Data',
  0x2ace: 'Cross Trainer Data',
  0x2acf: 'Step Climber Data',
  0x2ad0: 'Stair Climber Data',
  0x2ad1: 'Rower Data',
  0x2ad2: 'Indoor Bike Data',
  0x2ad3: 'Training Status',
  0x2ad4: 'Supported Speed Range',
  0x2ad5: 'Supported Inclination Range',
  0x2ad6: 'Supported Resistance Level Range',
  0x2ad7: 'Supported Heart Rate Range',
  0x2ad8: 'Supported Power Range',
  0x2ad9: 'Fitness Machine Control Point',
  0x2ada: 'Fitness Machine Status',
};

/**
 * Caratteristiche "di controllo": possono far cambiare stato all'attrezzo.
 * La diagnostica non ci scrive mai e non attiva neppure le loro indicazioni.
 */
export const CONTROL_POINTS = new Set([0x2ad9, 0x2a66, 0x2a55, 0x2a39]);

/** Servizi richiesti al browser come `optionalServices` (Web Bluetooth mostra solo quelli dichiarati). */
export const STANDARD_SERVICE_UUIDS = Object.keys(SERVICES).map((k) => fullUuid(Number(k)));

export function serviceName(uuid: string): string | null {
  const s = shortOf(uuid);
  return s == null ? null : SERVICES[s] ?? null;
}
export function charName(uuid: string): string | null {
  const s = shortOf(uuid);
  return s == null ? null : CHARACTERISTICS[s] ?? null;
}
export function isControlPoint(uuid: string): boolean {
  const s = shortOf(uuid);
  return s != null && CONTROL_POINTS.has(s);
}

/** Normalizza un UUID inserito a mano: "0x1826", "1826", "fff0" o 128 bit. Null se non valido. */
export function parseUserUuid(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/^0x/, '');
  if (/^[0-9a-f]{4}$/.test(t)) return fullUuid(parseInt(t, 16));
  if (/^[0-9a-f]{8}$/.test(t)) return `${t}${BASE_SUFFIX}`;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t)) return t;
  return null;
}

// ---------------------------------------------------------------- decodifica

export type Field = { key: string; label: string; value: number | string; unit?: string };
export type Decoded = { summary: string; fields: Field[]; note?: string };

export function hex(dv: DataView): string {
  const out: string[] = [];
  for (let i = 0; i < dv.byteLength; i++) out.push(dv.getUint8(i).toString(16).padStart(2, '0'));
  return out.join(' ');
}

class Reader {
  o = 0;
  constructor(private dv: DataView) {}
  left() { return this.dv.byteLength - this.o; }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  s16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
  u24() { const v = this.dv.getUint8(this.o) | (this.dv.getUint8(this.o + 1) << 8) | (this.dv.getUint8(this.o + 2) << 16); this.o += 3; return v; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
}

const r1 = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function summarize(fields: Field[]): string {
  return fields.map((f) => `${f.label} ${f.value}${f.unit ? ` ${f.unit}` : ''}`).join(' · ');
}

/** FTMS 4.9 Indoor Bike Data (0x2AD2). */
export function decodeIndoorBikeData(dv: DataView): Decoded {
  const r = new Reader(dv);
  const flags = r.u16();
  const f: Field[] = [];
  const has = (b: number) => (flags & (1 << b)) !== 0;
  if (!has(0)) f.push({ key: 'speed', label: 'Velocità', value: r1(r.u16() / 100, 2), unit: 'km/h' });
  if (has(1)) f.push({ key: 'avgSpeed', label: 'Velocità media', value: r1(r.u16() / 100, 2), unit: 'km/h' });
  if (has(2)) f.push({ key: 'cadence', label: 'Cadenza', value: r1(r.u16() / 2), unit: 'rpm' });
  if (has(3)) f.push({ key: 'avgCadence', label: 'Cadenza media', value: r1(r.u16() / 2), unit: 'rpm' });
  if (has(4)) f.push({ key: 'distance', label: 'Distanza', value: r.u24(), unit: 'm' });
  if (has(5)) f.push({ key: 'resistance', label: 'Livello resistenza', value: r.s16(), unit: '(valore grezzo)' });
  if (has(6)) f.push({ key: 'power', label: 'Potenza', value: r.s16(), unit: 'W' });
  if (has(7)) f.push({ key: 'avgPower', label: 'Potenza media', value: r.s16(), unit: 'W' });
  if (has(8)) {
    f.push({ key: 'kcal', label: 'Energia totale', value: r.u16(), unit: 'kcal' });
    f.push({ key: 'kcalH', label: 'Energia/ora', value: r.u16(), unit: 'kcal/h' });
    f.push({ key: 'kcalMin', label: 'Energia/min', value: r.u8(), unit: 'kcal/min' });
  }
  if (has(9)) f.push({ key: 'hr', label: 'Frequenza cardiaca', value: r.u8(), unit: 'bpm' });
  if (has(10)) f.push({ key: 'met', label: 'MET', value: r1(r.u8() / 10) });
  if (has(11)) f.push({ key: 'elapsed', label: 'Tempo trascorso', value: r.u16(), unit: 's' });
  if (has(12)) f.push({ key: 'remaining', label: 'Tempo rimanente', value: r.u16(), unit: 's' });
  return { summary: summarize(f), fields: f, note: has(0) ? 'Pacchetto parziale ("More Data"): la velocità arriva nel pacchetto successivo.' : undefined };
}

/** FTMS 4.4 Treadmill Data (0x2ACD). */
export function decodeTreadmillData(dv: DataView): Decoded {
  const r = new Reader(dv);
  const flags = r.u16();
  const f: Field[] = [];
  const has = (b: number) => (flags & (1 << b)) !== 0;
  if (!has(0)) f.push({ key: 'speed', label: 'Velocità', value: r1(r.u16() / 100, 2), unit: 'km/h' });
  if (has(1)) f.push({ key: 'avgSpeed', label: 'Velocità media', value: r1(r.u16() / 100, 2), unit: 'km/h' });
  if (has(2)) f.push({ key: 'distance', label: 'Distanza', value: r.u24(), unit: 'm' });
  if (has(3)) {
    f.push({ key: 'incline', label: 'Inclinazione', value: r1(r.s16() / 10), unit: '%' });
    f.push({ key: 'rampAngle', label: 'Angolo rampa', value: r1(r.s16() / 10), unit: '°' });
  }
  if (has(4)) {
    f.push({ key: 'elevUp', label: 'Dislivello +', value: r1(r.u16() / 10), unit: 'm' });
    f.push({ key: 'elevDown', label: 'Dislivello −', value: r1(r.u16() / 10), unit: 'm' });
  }
  if (has(5)) f.push({ key: 'pace', label: 'Passo istantaneo', value: r1(r.u8() / 10), unit: 'km/min' });
  if (has(6)) f.push({ key: 'avgPace', label: 'Passo medio', value: r1(r.u8() / 10), unit: 'km/min' });
  if (has(7)) {
    f.push({ key: 'kcal', label: 'Energia totale', value: r.u16(), unit: 'kcal' });
    f.push({ key: 'kcalH', label: 'Energia/ora', value: r.u16(), unit: 'kcal/h' });
    f.push({ key: 'kcalMin', label: 'Energia/min', value: r.u8(), unit: 'kcal/min' });
  }
  if (has(8)) f.push({ key: 'hr', label: 'Frequenza cardiaca', value: r.u8(), unit: 'bpm' });
  if (has(9)) f.push({ key: 'met', label: 'MET', value: r1(r.u8() / 10) });
  if (has(10)) f.push({ key: 'elapsed', label: 'Tempo trascorso', value: r.u16(), unit: 's' });
  if (has(11)) f.push({ key: 'remaining', label: 'Tempo rimanente', value: r.u16(), unit: 's' });
  if (has(12)) {
    f.push({ key: 'force', label: 'Forza sul nastro', value: r.s16(), unit: 'N' });
    f.push({ key: 'power', label: 'Potenza', value: r.s16(), unit: 'W' });
  }
  return { summary: summarize(f), fields: f, note: has(0) ? 'Pacchetto parziale ("More Data"): la velocità arriva nel pacchetto successivo.' : undefined };
}

export const MACHINE_FEATURES = [
  'Velocità media', 'Cadenza', 'Distanza totale', 'Inclinazione', 'Dislivello', 'Passo', 'Conteggio passi',
  'Livello di resistenza', 'Conteggio falcate', 'Energia spesa', 'Frequenza cardiaca', 'MET', 'Tempo trascorso',
  'Tempo rimanente', 'Potenza', 'Forza sul nastro e potenza', 'Conservazione dati utente',
];
export const TARGET_FEATURES = [
  'Impostazione velocità', 'Impostazione inclinazione', 'Impostazione resistenza', 'Impostazione potenza (ERG)',
  'Impostazione frequenza cardiaca', 'Obiettivo energia', 'Obiettivo passi', 'Obiettivo falcate', 'Obiettivo distanza',
  'Obiettivo tempo', 'Tempo in 2 zone FC', 'Tempo in 3 zone FC', 'Tempo in 5 zone FC', 'Simulazione percorso (pendenza)',
  'Circonferenza ruota', 'Spin down', 'Obiettivo cadenza',
];

export type MachineFeatures = { machine: string[]; targets: string[]; machineBits: number; targetBits: number };

/** FTMS 4.3 Fitness Machine Feature (0x2ACC): 2 × uint32. */
export function parseMachineFeature(dv: DataView): MachineFeatures {
  const r = new Reader(dv);
  const machineBits = r.left() >= 4 ? r.u32() : 0;
  const targetBits = r.left() >= 4 ? r.u32() : 0;
  const pick = (bits: number, names: string[]) => names.filter((_, i) => (bits >>> i) & 1);
  return { machine: pick(machineBits, MACHINE_FEATURES), targets: pick(targetBits, TARGET_FEATURES), machineBits, targetBits };
}

export function decodeMachineFeature(dv: DataView): Decoded {
  const p = parseMachineFeature(dv);
  return {
    summary: `Dati: ${p.machine.join(', ') || 'nessuno'} · Impostazioni accettate: ${p.targets.join(', ') || 'nessuna'}`,
    fields: [
      { key: 'machine', label: 'Dati dichiarati', value: p.machine.join(', ') || 'nessuno' },
      { key: 'targets', label: 'Impostazioni dichiarate', value: p.targets.join(', ') || 'nessuna' },
    ],
    note: 'Sono le capacità DICHIARATE dall’attrezzo, non ancora verificate con un comando.',
  };
}

function decodeRange(dv: DataView, label: string, unit: string, scale: number, signed: boolean): Decoded {
  const r = new Reader(dv);
  const rd = () => (signed ? r.s16() : r.u16());
  const min = r1(rd() / scale, 2), max = r1(rd() / scale, 2), inc = r1(r.u16() / scale, 2);
  const fields: Field[] = [
    { key: 'min', label: `${label} min`, value: min, unit },
    { key: 'max', label: `${label} max`, value: max, unit },
    { key: 'inc', label: 'Passo', value: inc, unit },
  ];
  return { summary: summarize(fields), fields };
}

const TRAINING_STATUS = [
  'Altro', 'Inattivo', 'Riscaldamento', 'Intervallo bassa intensità', 'Intervallo alta intensità', 'Recupero',
  'Isometrico', 'Controllo frequenza cardiaca', 'Test', 'Velocità sotto la zona', 'Velocità sopra la zona',
  'Defaticamento', 'Controllo watt', 'Modalità manuale', 'Pre-allenamento', 'Post-allenamento',
];

const MACHINE_STATUS: Record<number, string> = {
  0x01: 'Reset', 0x02: 'Fermato o in pausa dall’utente', 0x03: 'Fermato dalla chiave di sicurezza',
  0x04: 'Avviato o ripreso dall’utente', 0x05: 'Velocità obiettivo cambiata', 0x06: 'Inclinazione obiettivo cambiata',
  0x07: 'Resistenza obiettivo cambiata', 0x08: 'Potenza obiettivo cambiata', 0x09: 'Frequenza cardiaca obiettivo cambiata',
  0xff: 'Permesso di controllo perso',
};

function decodeHeartRate(dv: DataView): Decoded {
  const r = new Reader(dv);
  const flags = r.u8();
  const bpm = flags & 1 ? r.u16() : r.u8();
  const f: Field[] = [{ key: 'hr', label: 'Frequenza cardiaca', value: bpm, unit: 'bpm' }];
  return { summary: summarize(f), fields: f };
}

function decodeCsc(dv: DataView): Decoded {
  const r = new Reader(dv);
  const flags = r.u8();
  const f: Field[] = [];
  if (flags & 1) {
    f.push({ key: 'wheelRevs', label: 'Giri ruota (cumulativi)', value: r.u32() });
    f.push({ key: 'wheelTime', label: 'Ultimo evento ruota', value: r.u16(), unit: '1/1024 s' });
  }
  if (flags & 2) {
    f.push({ key: 'crankRevs', label: 'Giri pedivella (cumulativi)', value: r.u16() });
    f.push({ key: 'crankTime', label: 'Ultimo evento pedivella', value: r.u16(), unit: '1/1024 s' });
  }
  return { summary: summarize(f), fields: f, note: 'Velocità e cadenza si ricavano dalla differenza tra due pacchetti.' };
}

function decodeCyclingPower(dv: DataView): Decoded {
  const r = new Reader(dv);
  r.u16();
  const f: Field[] = [{ key: 'power', label: 'Potenza', value: r.s16(), unit: 'W' }];
  return { summary: summarize(f), fields: f, note: 'Decodificata solo la potenza istantanea; i campi opzionali sono nei byte grezzi.' };
}

function decodeRsc(dv: DataView): Decoded {
  const r = new Reader(dv);
  r.u8();
  const f: Field[] = [
    { key: 'speed', label: 'Velocità', value: r1((r.u16() / 256) * 3.6, 2), unit: 'km/h' },
    { key: 'cadence', label: 'Cadenza', value: r.u8(), unit: 'passi/min' },
  ];
  return { summary: summarize(f), fields: f };
}

function decodeText(dv: DataView): Decoded {
  const s = new TextDecoder().decode(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)).replace(/\0+$/, '');
  return { summary: `"${s}"`, fields: [{ key: 'text', label: 'Testo', value: s }] };
}

const TEXT_CHARS = new Set([0x2a00, 0x2a24, 0x2a25, 0x2a26, 0x2a27, 0x2a28, 0x2a29]);

/** Decodifica un valore se il formato è standard; null se non sappiamo interpretarlo (si mostrano i byte). */
export function decodeValue(uuid: string, dv: DataView): Decoded | null {
  const s = shortOf(uuid);
  if (s == null) return null;
  try {
    if (TEXT_CHARS.has(s)) return decodeText(dv);
    switch (s) {
      case 0x2ad2: return decodeIndoorBikeData(dv);
      case 0x2acd: return decodeTreadmillData(dv);
      case 0x2acc: return decodeMachineFeature(dv);
      case 0x2ad4: return decodeRange(dv, 'Velocità', 'km/h', 100, false);
      case 0x2ad5: return decodeRange(dv, 'Inclinazione', '%', 10, true);
      case 0x2ad6: return decodeRange(dv, 'Resistenza', '', 10, true);
      case 0x2ad8: return decodeRange(dv, 'Potenza', 'W', 1, true);
      case 0x2ad7: {
        const f: Field[] = [
          { key: 'min', label: 'FC min', value: dv.getUint8(0), unit: 'bpm' },
          { key: 'max', label: 'FC max', value: dv.getUint8(1), unit: 'bpm' },
          { key: 'inc', label: 'Passo', value: dv.getUint8(2), unit: 'bpm' },
        ];
        return { summary: summarize(f), fields: f };
      }
      case 0x2ad3: {
        const st = dv.getUint8(1);
        return { summary: `Stato allenamento: ${TRAINING_STATUS[st] ?? `codice ${st}`}`, fields: [{ key: 'training', label: 'Stato', value: TRAINING_STATUS[st] ?? st }] };
      }
      case 0x2ada: {
        const op = dv.getUint8(0);
        const name = MACHINE_STATUS[op] ?? `codice 0x${op.toString(16)}`;
        return { summary: `Stato macchina: ${name}`, fields: [{ key: 'status', label: 'Stato', value: name }] };
      }
      case 0x2a37: return decodeHeartRate(dv);
      case 0x2a5b: return decodeCsc(dv);
      case 0x2a63: return decodeCyclingPower(dv);
      case 0x2a53: return decodeRsc(dv);
      case 0x2a19: return { summary: `Batteria ${dv.getUint8(0)} %`, fields: [{ key: 'battery', label: 'Batteria', value: dv.getUint8(0), unit: '%' }] };
      default: return null;
    }
  } catch {
    return { summary: 'Valore più corto del previsto dalla specifica: vedi byte grezzi', fields: [] };
  }
}
