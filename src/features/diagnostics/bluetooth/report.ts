// Bluetooth Device Diagnostics: modello dei dati raccolti e rapporto tecnico (funzioni pure).
import { fmtUuid, shortOf, type Decoded, type MachineFeatures } from './gatt';

export type MachineKind = 'bike' | 'treadmill' | 'other';
export const KIND_LABEL: Record<MachineKind, string> = {
  bike: 'Cyclette (JK Fitness JK 564)',
  treadmill: 'Tapis roulant (Everfit TFK 495 Slim)',
  other: 'Altro dispositivo',
};

export type LogEntry = { t: number; level: 'info' | 'ok' | 'warn' | 'error' | 'data'; msg: string };

export type CharInfo = {
  uuid: string;
  serviceUuid: string;
  name: string | null;
  props: string[];
  read?: { hex: string; decoded: Decoded | null };
  readError?: string;
  subscribed?: boolean;
  subscribeError?: string;
  skippedReason?: string;
  notifications: number;
  last?: { hex: string; decoded: Decoded | null; t: number };
};

export type ServiceInfo = { uuid: string; name: string | null; chars: CharInfo[]; error?: string };

export type DeviceRecord = {
  id: string;
  name: string;
  kind: MachineKind;
  /** Trovato con il filtro "solo FTMS": l'attrezzo pubblicizza il servizio 0x1826. */
  foundWithFtmsFilter: boolean;
  firstSeen: number;
  connected: boolean;
  everConnected: boolean;
  connectError?: string;
  servicesError?: string;
  services: ServiceInfo[];
  /** Ultimo valore visto per ogni campo decodificato (chiave = `${charShort}:${field}`). */
  seen: Record<string, { label: string; value: number | string; unit?: string; source: string; t: number }>;
  features?: MachineFeatures;
  /** Tipo corretto in automatico in base ai dati FTMS trasmessi (era stato scelto un altro tipo). */
  kindCorrectedFrom?: MachineKind;
  log: LogEntry[];
  platform: string;
};

export function newDevice(id: string, name: string, kind: MachineKind, ftmsFilter: boolean, platform: string): DeviceRecord {
  return { id, name, kind, foundWithFtmsFilter: ftmsFilter, firstSeen: Date.now(), connected: false, everConnected: false, services: [], seen: {}, log: [], platform };
}

/** Le caratteristiche che inviano dati da sole (notify/indicate) o si possono leggere. */
export function isDataChar(c: CharInfo) { return c.props.includes('notify') || c.props.includes('indicate') || c.props.includes('read'); }
/** Le caratteristiche che accettano scritture, cioè potenziali comandi. */
export function isWritableChar(c: CharInfo) { return c.props.includes('write') || c.props.includes('writeWithoutResponse') || c.props.includes('reliableWrite'); }

type Expect = { label: string; keys: string[]; featureBit?: number; mandatory?: boolean };

// Chiavi dei campi decodificati in gatt.ts. featureBit = bit in Fitness Machine Feature (FTMS 4.3.1.1).
const EXPECT: Record<'bike' | 'treadmill', Expect[]> = {
  bike: [
    { label: 'Velocità', keys: ['speed'], mandatory: true },
    { label: 'Cadenza (RPM)', keys: ['cadence'], featureBit: 1 },
    { label: 'Potenza (watt)', keys: ['power'], featureBit: 14 },
    { label: 'Distanza', keys: ['distance'], featureBit: 2 },
    { label: 'Calorie', keys: ['kcal'], featureBit: 9 },
    { label: 'Resistenza', keys: ['resistance'], featureBit: 7 },
  ],
  treadmill: [
    { label: 'Velocità', keys: ['speed'], mandatory: true },
    { label: 'Distanza', keys: ['distance'], featureBit: 2 },
    { label: 'Inclinazione', keys: ['incline'], featureBit: 3 },
    { label: 'Tempo', keys: ['elapsed'], featureBit: 12 },
    { label: 'Calorie', keys: ['kcal'], featureBit: 9 },
  ],
};

const FTMS = 0x1826;
const CP = 0x2ad9;

/** Tipo di attrezzo dedotto dalla caratteristica dati FTMS presente (Indoor Bike Data o Treadmill Data). */
export function detectKind(d: DeviceRecord): MachineKind | null {
  const shorts = new Set(d.services.flatMap((s) => s.chars.map((c) => shortOf(c.uuid))));
  if (shorts.has(0x2ad2) && !shorts.has(0x2acd)) return 'bike';
  if (shorts.has(0x2acd) && !shorts.has(0x2ad2)) return 'treadmill';
  return null;
}

function hasService(d: DeviceRecord, short: number) { return d.services.some((s) => shortOf(s.uuid) === short); }
function allChars(d: DeviceRecord) { return d.services.flatMap((s) => s.chars); }
function findChar(d: DeviceRecord, short: number) { return allChars(d).find((c) => shortOf(c.uuid) === short); }

export type Verdict = 'si' | 'no' | 'parziale' | 'non-verificato';
export type ReportItem = { title: string; verdict: Verdict; lines: string[] };

export function buildReport(d: DeviceRecord): ReportItem[] {
  const items: ReportItem[] = [];
  const chars = allChars(d);

  items.push({
    title: 'Bluetooth rilevato',
    verdict: 'si',
    lines: [
      `Nome annunciato: "${d.name || '(senza nome)'}"`,
      d.foundWithFtmsFilter
        ? 'Trovato con il filtro "solo FTMS": l’attrezzo pubblicizza il servizio Fitness Machine (0x1826).'
        : 'Trovato nella ricerca completa (non è stato provato con il filtro "solo FTMS").',
    ],
  });

  items.push({
    title: 'Connessione riuscita',
    verdict: d.everConnected ? 'si' : 'no',
    lines: d.everConnected ? ['Connessione GATT stabilita.'] : [d.connectError ? `Errore: ${d.connectError}` : 'Connessione non ancora tentata.'],
  });

  const std = d.services.filter((s) => s.name).map((s) => `${s.name} (${fmtUuid(s.uuid)})`);
  const other = d.services.filter((s) => !s.name).map((s) => fmtUuid(s.uuid));
  const ftms = hasService(d, FTMS);
  const protoLines: string[] = [];
  if (!d.everConnected) protoLines.push('Non determinabile senza connessione.');
  else {
    protoLines.push(ftms ? 'FTMS (Fitness Machine Service 0x1826) PRESENTE.' : 'FTMS (0x1826) NON presente tra i servizi accessibili.');
    const det = detectKind(d);
    if (det === 'bike') protoLines.push('Trasmette "Indoor Bike Data" (0x2AD2): per FTMS è una CYCLETTE.');
    if (det === 'treadmill') protoLines.push('Trasmette "Treadmill Data" (0x2ACD): per FTMS è un TAPIS ROULANT.');
    if (d.kindCorrectedFrom) protoLines.push(`Tipo corretto in automatico: era stato scelto "${KIND_LABEL[d.kindCorrectedFrom]}".`);
    if (std.length) protoLines.push(`Servizi standard trovati: ${std.join(', ')}`);
    if (other.length) protoLines.push(`Servizi non standard (proprietari) trovati: ${other.join(', ')}`);
    if (!ftms) protoLines.push('Web Bluetooth mostra solo i servizi dichiarati: eventuali servizi proprietari vanno cercati con nRF Connect e aggiunti a mano.');
    if (d.servicesError) protoLines.push(`Errore nella lettura dei servizi: ${d.servicesError}`);
  }
  items.push({ title: 'Protocollo identificato', verdict: !d.everConnected ? 'non-verificato' : ftms ? 'si' : std.length > 2 ? 'parziale' : 'no', lines: protoLines });

  // Dati ricevuti
  const dataLines: string[] = [];
  const notifying = chars.filter((c) => c.notifications > 0);
  for (const c of notifying) dataLines.push(`${c.name ?? fmtUuid(c.uuid)}: ${c.notifications} pacchetti ricevuti${c.last?.decoded ? ` (ultimo: ${c.last.decoded.summary})` : c.last ? ` (byte: ${c.last.hex})` : ''}`);
  let dataVerdict: Verdict = notifying.length ? 'parziale' : d.everConnected ? 'no' : 'non-verificato';
  if (d.kind !== 'other') {
    const seenKeys = new Set(Object.keys(d.seen).map((k) => k.split(':')[1]));
    let got = 0;
    for (const e of EXPECT[d.kind]) {
      const ok = e.keys.some((k) => seenKeys.has(k));
      if (ok) got++;
      const declared = e.mandatory ? 'obbligatorio in FTMS' : d.features ? (((d.features.machineBits >>> (e.featureBit ?? 99)) & 1) ? 'dichiarato dall’attrezzo' : 'NON dichiarato dall’attrezzo') : 'dichiarazione non letta';
      const value = ok ? Object.entries(d.seen).find(([k]) => e.keys.includes(k.split(':')[1]))?.[1] : undefined;
      dataLines.push(`${ok ? '✓' : '✗'} ${e.label}: ${ok ? `ricevuto (ultimo ${value?.value}${value?.unit ? ` ${value.unit}` : ''})` : 'non ricevuto'} · ${declared}`);
    }
    if (got === EXPECT[d.kind].length) dataVerdict = 'si';
    else if (got > 0) dataVerdict = 'parziale';
    dataLines.push('Nota: confronta i valori con il display dell’attrezzo mentre ti alleni; un campo presente ma sempre a 0 non è un dato utile.');
  }
  if (!notifying.length && d.everConnected) dataLines.unshift('Nessuna notifica ricevuta. Prova a pedalare / avviare il nastro dopo la connessione.');
  items.push({ title: 'Dati ricevuti', verdict: dataVerdict, lines: dataLines });

  // Comandi disponibili
  const cmdLines: string[] = [];
  const cp = findChar(d, CP);
  if (cp) cmdLines.push(`Fitness Machine Control Point (0x2AD9) presente, proprietà: ${cp.props.join(', ')}.`);
  else if (d.everConnected) cmdLines.push('Fitness Machine Control Point (0x2AD9) NON trovato.');
  if (d.features) cmdLines.push(`Impostazioni dichiarate (Target Setting Features): ${d.features.targets.join(', ') || 'nessuna'}.`);
  if (d.kind === 'bike' && d.features) cmdLines.push(((d.features.targetBits >>> 2) & 1) ? 'Regolazione resistenza: DICHIARATA (bit "Resistance Target Setting").' : 'Regolazione resistenza: NON dichiarata.');
  if (d.kind === 'bike' && d.features) cmdLines.push(((d.features.targetBits >>> 3) & 1) ? 'Modalità ERG (potenza obiettivo): DICHIARATA.' : 'Modalità ERG (potenza obiettivo): NON dichiarata.');
  if (d.kind === 'bike' && d.features) cmdLines.push(((d.features.targetBits >>> 13) & 1) ? 'Simulazione pendenza (Indoor Bike Simulation): DICHIARATA.' : 'Simulazione pendenza: NON dichiarata.');
  if (d.kind === 'treadmill' && d.features) cmdLines.push(((d.features.targetBits >>> 1) & 1) ? 'Regolazione inclinazione: DICHIARATA (bit "Inclination Target Setting").' : 'Regolazione inclinazione: NON dichiarata.');
  if (d.kind === 'treadmill' && d.features) cmdLines.push(((d.features.targetBits >>> 0) & 1) ? 'Regolazione velocità: DICHIARATA.' : 'Regolazione velocità: NON dichiarata.');
  const writable = chars.filter((c) => isWritableChar(c) && shortOf(c.uuid) !== CP);
  for (const c of writable) cmdLines.push(`Altra caratteristica scrivibile: ${c.name ?? fmtUuid(c.uuid)} (${c.props.join(', ')})${c.name ? '' : ' – formato proprietario sconosciuto'}.`);
  if (!d.everConnected) cmdLines.push('Non determinabile senza connessione.');
  items.push({ title: 'Comandi disponibili', verdict: !d.everConnected ? 'non-verificato' : cp ? 'si' : writable.length ? 'parziale' : 'no', lines: cmdLines });

  items.push({
    title: 'Controllo remoto verificato',
    verdict: 'non-verificato',
    lines: [
      'NO: in questa fase la diagnostica non invia alcun comando all’attrezzo (sola lettura).',
      'Le capacità di controllo sopra sono solo DICHIARATE dall’attrezzo. Si verificheranno nella fase successiva con un test controllato.',
    ],
  });

  const nv: string[] = [
    'Effettiva esecuzione dei comandi (resistenza / inclinazione / velocità): richiede l’invio di comandi, escluso in questa fase.',
    'Accuratezza dei valori rispetto al display: va confrontata a occhio durante l’allenamento.',
  ];
  if (!ftms) nv.push('Eventuale protocollo proprietario: Web Bluetooth non elenca servizi non dichiarati; usa nRF Connect per vederli tutti.');
  nv.push('Comportamento su iPhone: Safari e la PWA installata non hanno Web Bluetooth, quindi il test va fatto da PC/Android o con nRF Connect / Bluefy.');
  items.push({ title: 'Funzionalità non verificabili', verdict: 'non-verificato', lines: nv });

  return items;
}

const VERDICT_TXT: Record<Verdict, string> = { si: 'SÌ', no: 'NO', parziale: 'PARZIALE', 'non-verificato': 'NON VERIFICATO' };
export const verdictLabel = (v: Verdict) => VERDICT_TXT[v];

/** Rapporto completo in Markdown, da copiare o scaricare. */
export function reportMarkdown(d: DeviceRecord): string {
  const out: string[] = [];
  out.push(`# Bluetooth Device Diagnostics – ${d.name || '(senza nome)'}`);
  out.push('');
  out.push(`- Attrezzo dichiarato: ${KIND_LABEL[d.kind]}`);
  out.push(`- Data: ${new Date().toLocaleString('it-IT')}`);
  out.push(`- Piattaforma: ${d.platform}`);
  out.push(`- ID Web Bluetooth (anonimo, varia per sito): ${d.id}`);
  out.push('');
  for (const it of buildReport(d)) {
    out.push(`## ${it.title}: ${VERDICT_TXT[it.verdict]}`);
    for (const l of it.lines) out.push(`- ${l}`);
    out.push('');
  }
  out.push('## Servizi e caratteristiche');
  for (const s of d.services) {
    out.push(`### ${s.name ?? 'Servizio non standard'} ${fmtUuid(s.uuid)}${s.error ? ` – errore: ${s.error}` : ''}`);
    for (const c of s.chars) {
      const role = [isDataChar(c) ? 'dati' : '', isWritableChar(c) ? 'comandi' : ''].filter(Boolean).join(' + ') || '—';
      out.push(`- ${c.name ?? 'Caratteristica non standard'} ${fmtUuid(c.uuid)} · proprietà: ${c.props.join(', ') || 'nessuna'} · ruolo: ${role}`);
      if (c.read) out.push(`  - lettura: ${c.read.decoded ? c.read.decoded.summary : ''} [${c.read.hex}]`);
      if (c.readError) out.push(`  - errore lettura: ${c.readError}`);
      if (c.skippedReason) out.push(`  - ${c.skippedReason}`);
      if (c.subscribeError) out.push(`  - errore notifiche: ${c.subscribeError}`);
      if (c.notifications) out.push(`  - notifiche: ${c.notifications}, ultima: ${c.last?.decoded?.summary ?? ''} [${c.last?.hex}]`);
    }
  }
  out.push('');
  out.push('## Registro');
  for (const l of d.log.slice(-200)) out.push(`- ${new Date(l.t).toLocaleTimeString('it-IT')} [${l.level}] ${l.msg}`);
  return out.join('\n');
}
