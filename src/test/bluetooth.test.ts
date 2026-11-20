import { describe, it, expect } from 'vitest';
import { decodeIndoorBikeData, decodeTreadmillData, parseMachineFeature, decodeValue, fmtUuid, fullUuid, parseUserUuid, shortOf, isControlPoint, STANDARD_SERVICE_UUIDS } from '@/features/diagnostics/bluetooth/gatt';
import { buildReport, detectKind, newDevice } from '@/features/diagnostics/bluetooth/report';

const dv = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);
const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const val = (d: { fields: { key: string; value: unknown }[] }, k: string) => d.fields.find((f) => f.key === k)?.value;

describe('UUID', () => {
  it('converte alias SIG a 16 bit e ritorno', () => {
    expect(fullUuid(0x1826)).toBe('00001826-0000-1000-8000-00805f9b34fb');
    expect(shortOf('00002AD2-0000-1000-8000-00805F9B34FB')).toBe(0x2ad2);
    expect(fmtUuid(fullUuid(0x2ad9))).toBe('0x2AD9');
    expect(shortOf('6e400001-b5a3-f393-e0a9-e50e24dcca9e')).toBeNull();
  });
  it('accetta UUID inseriti a mano e rifiuta testo non valido', () => {
    expect(parseUserUuid('0x1826')).toBe(fullUuid(0x1826));
    expect(parseUserUuid('ABCD')).toBe(fullUuid(0xabcd));
    expect(parseUserUuid('6E400001-B5A3-F393-E0A9-E50E24DCCA9E')).toBe('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
    expect(parseUserUuid('ciao')).toBeNull();
  });
  it('include FTMS tra i servizi richiesti e riconosce i Control Point', () => {
    expect(STANDARD_SERVICE_UUIDS).toContain(fullUuid(0x1826));
    expect(isControlPoint(fullUuid(0x2ad9))).toBe(true);
    expect(isControlPoint(fullUuid(0x2ad2))).toBe(false);
  });
});

describe('FTMS Indoor Bike Data', () => {
  it('decodifica velocità, cadenza, distanza, resistenza, potenza, energia, FC e tempo', () => {
    // flags: cadence(2) distance(4) resistance(5) power(6) energy(8) hr(9) elapsed(11); bit0=0 => velocità presente
    const flags = (1 << 2) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 8) | (1 << 9) | (1 << 11);
    const d = decodeIndoorBikeData(dv([...u16(flags), ...u16(2534), ...u16(170), ...u24(1234), ...u16(12), ...u16(180), ...u16(55), ...u16(600), 10, 132, ...u16(900)]));
    expect(val(d, 'speed')).toBe(25.34);
    expect(val(d, 'cadence')).toBe(85);
    expect(val(d, 'distance')).toBe(1234);
    expect(val(d, 'resistance')).toBe(12);
    expect(val(d, 'power')).toBe(180);
    expect(val(d, 'kcal')).toBe(55);
    expect(val(d, 'hr')).toBe(132);
    expect(val(d, 'elapsed')).toBe(900);
  });
  it('con "More Data" la velocità non è nel pacchetto', () => {
    const d = decodeIndoorBikeData(dv([...u16(1 | (1 << 6)), ...u16(200)]));
    expect(val(d, 'speed')).toBeUndefined();
    expect(val(d, 'power')).toBe(200);
    expect(d.note).toBeTruthy();
  });
});

describe('FTMS Treadmill Data', () => {
  it('decodifica velocità, distanza, inclinazione, energia e tempo', () => {
    const flags = (1 << 2) | (1 << 3) | (1 << 7) | (1 << 10);
    const d = decodeTreadmillData(dv([...u16(flags), ...u16(850), ...u24(2500), ...u16(45), ...u16(26), ...u16(120), ...u16(400), 7, ...u16(1200)]));
    expect(val(d, 'speed')).toBe(8.5);
    expect(val(d, 'distance')).toBe(2500);
    expect(val(d, 'incline')).toBe(4.5);
    expect(val(d, 'rampAngle')).toBe(2.6);
    expect(val(d, 'kcal')).toBe(120);
    expect(val(d, 'elapsed')).toBe(1200);
  });
  it('inclinazione negativa', () => {
    const d = decodeTreadmillData(dv([...u16(1 << 3), ...u16(500), ...u16(0xffec), ...u16(0)]));
    expect(val(d, 'incline')).toBe(-2);
  });
});

describe('Fitness Machine Feature', () => {
  it('distingue dati dichiarati e impostazioni accettate', () => {
    const machine = (1 << 1) | (1 << 2) | (1 << 7) | (1 << 14);
    const target = (1 << 2) | (1 << 3) | (1 << 13);
    const p = parseMachineFeature(dv([...u32(machine), ...u32(target)]));
    expect(p.machine).toEqual(['Cadenza', 'Distanza totale', 'Livello di resistenza', 'Potenza']);
    expect(p.targets).toEqual(['Impostazione resistenza', 'Impostazione potenza (ERG)', 'Simulazione percorso (pendenza)']);
  });
  it('intervallo di inclinazione supportato', () => {
    const d = decodeValue(fullUuid(0x2ad5), dv([...u16(0), ...u16(120), ...u16(10)]))!;
    expect(d.summary).toContain('Inclinazione max 12');
  });
  it('valore troncato non fa crashare', () => {
    expect(decodeValue(fullUuid(0x2ad2), dv([0x00]))?.summary).toMatch(/più corto/);
  });
  it('UUID proprietario non viene interpretato', () => {
    expect(decodeValue('6e400003-b5a3-f393-e0a9-e50e24dcca9e', dv([1, 2]))).toBeNull();
  });
});

describe('Rapporto', () => {
  it('senza connessione: rilevato sì, connessione no, controllo mai verificato', () => {
    const d = newDevice('x', 'JK564', 'bike', false, 'test');
    const r = buildReport(d);
    expect(r.find((i) => i.title === 'Bluetooth rilevato')!.verdict).toBe('si');
    expect(r.find((i) => i.title === 'Connessione riuscita')!.verdict).toBe('no');
    expect(r.find((i) => i.title === 'Controllo remoto verificato')!.verdict).toBe('non-verificato');
  });
  it('cyclette FTMS con resistenza dichiarata: comandi disponibili ma controllo NON verificato', () => {
    const d = newDevice('x', 'Bike', 'bike', true, 'test');
    d.everConnected = true;
    d.services = [{ uuid: fullUuid(0x1826), name: 'Fitness Machine (FTMS)', chars: [
      { uuid: fullUuid(0x2ad2), serviceUuid: fullUuid(0x1826), name: 'Indoor Bike Data', props: ['notify'], notifications: 3 },
      { uuid: fullUuid(0x2ad9), serviceUuid: fullUuid(0x1826), name: 'Fitness Machine Control Point', props: ['write', 'indicate'], notifications: 0 },
    ] }];
    d.features = parseMachineFeature(dv([...u32((1 << 1) | (1 << 7) | (1 << 14)), ...u32(1 << 2)]));
    for (const k of ['speed', 'cadence', 'power', 'distance', 'kcal', 'resistance']) d.seen[`2ad2:${k}`] = { label: k, value: 1, source: 'Indoor Bike Data', t: 0 };
    const r = buildReport(d);
    expect(r.find((i) => i.title === 'Protocollo identificato')!.verdict).toBe('si');
    expect(r.find((i) => i.title === 'Dati ricevuti')!.verdict).toBe('si');
    const cmd = r.find((i) => i.title === 'Comandi disponibili')!;
    expect(cmd.verdict).toBe('si');
    expect(cmd.lines.join(' ')).toContain('Regolazione resistenza: DICHIARATA');
    expect(r.find((i) => i.title === 'Controllo remoto verificato')!.verdict).toBe('non-verificato');
  });
});

describe('UUID in forma corta (Bluefy su iPhone)', () => {
  it('riconosce 1826 / 2ad2 / 0x2ACC e decodifica il pacchetto reale della JK 564', () => {
    expect(shortOf('1826')).toBe(0x1826);
    expect(shortOf('0x2ACC')).toBe(0x2acc);
    expect(shortOf('02f00000-0000-0000-0000-00000000fe00')).toBeNull();
    // Pacchetto ricevuto dall'utente il 2026-11-20 da "iConsole+0006"
    const bytes = 'fe 1f 00 00 00 00 00 00 00 00 2e 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00 8d 00 00 00'.split(' ').map((h) => parseInt(h, 16));
    const d = decodeValue('2ad2', dv(bytes))!;
    expect(val(d, 'speed')).toBe(0);
    expect(val(d, 'distance')).toBe(46);
    expect(val(d, 'resistance')).toBe(1);
    expect(val(d, 'elapsed')).toBe(141);
  });
  it('rapporto: FTMS presente e tipo dedotto cyclette anche con UUID corti', () => {
    const d = newDevice('x', 'iConsole+0006', 'treadmill', false, 'test');
    d.everConnected = true;
    d.services = [{ uuid: '1826', name: null, chars: [{ uuid: '2ad2', serviceUuid: '1826', name: null, props: ['notify'], notifications: 1 }] }];
    expect(detectKind(d)).toBe('bike');
    const p = buildReport(d).find((i) => i.title === 'Protocollo identificato')!;
    expect(p.verdict).toBe('si');
  });
});
