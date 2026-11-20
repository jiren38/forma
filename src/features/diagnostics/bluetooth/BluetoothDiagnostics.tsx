// Bluetooth Device Diagnostics (schermata temporanea, sola lettura).
//
// Cosa fa: cerca dispositivi BLE, si collega, elenca servizi/caratteristiche con UUID e proprietà,
// legge i valori leggibili, si iscrive alle notifiche e mostra i dati in tempo reale.
// Cosa NON fa: non scrive mai su nessuna caratteristica (nessun comando all'attrezzo) e non salva nulla
// nel database dell'app. Le iscrizioni ai Control Point vengono saltate di proposito.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bluetooth, BluetoothSearching, Plug, Unplug, Copy, Download, AlertTriangle, Info, Radio, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader, Segmented, useToast } from '@/components/ui';
import { downloadFile } from '@/lib/util';
import { getBluetooth, type BluetoothLike } from '@/lib/ble';
import { isNativeApp } from '@/lib/native';
import {
  STANDARD_SERVICE_UUIDS, charName, decodeValue, fmtUuid, fullUuid, hex, isControlPoint, parseMachineFeature,
  parseUserUuid, serviceName, shortOf,
} from './gatt';
import {
  KIND_LABEL, buildReport, detectKind, isDataChar, isWritableChar, newDevice, reportMarkdown, verdictLabel,
  type CharInfo, type DeviceRecord, type LogEntry, type MachineKind, type Verdict,
} from './report';
import './bluetooth.css';

/* eslint-disable @typescript-eslint/no-explicit-any */
type BtDevice = any;
type BtChar = any;

const PROP_NAMES = ['broadcast', 'read', 'writeWithoutResponse', 'write', 'notify', 'indicate', 'authenticatedSignedWrites', 'reliableWrite', 'writableAuxiliaries'];
const PROP_IT: Record<string, string> = {
  read: 'lettura', write: 'scrittura', writeWithoutResponse: 'scrittura senza risposta', notify: 'notifiche', indicate: 'indicazioni',
  broadcast: 'broadcast', authenticatedSignedWrites: 'scrittura firmata', reliableWrite: 'scrittura affidabile', writableAuxiliaries: 'ausiliari scrivibili',
};

function errText(e: any): string {
  if (!e) return 'errore sconosciuto';
  const name = e.name ? `${e.name}: ` : '';
  return `${name}${e.message ?? String(e)}`;
}

function detectPlatform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const native = isNativeApp();
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  const os = ios ? 'iOS/iPadOS' : android ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux|CrOS/.test(ua) ? 'Linux/ChromeOS' : 'sconosciuto';
  const browser = native ? 'app nativa Forma' : /Bluefy/i.test(ua) ? 'Bluefy' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'sconosciuto';
  const mode = native ? '' : standalone ? ' · app installata (PWA)' : ' · browser';
  return { ios, android, standalone, native, os, browser, label: `${os} · ${browser}${mode}` };
}

const VERDICT_CLASS: Record<Verdict, string> = { si: 'success', no: 'danger', parziale: 'orange', 'non-verificato': '' };

export default function BluetoothDiagnostics() {
  const toast = useToast();
  // Web Bluetooth nel browser, plugin nativo nell'app iPhone (stessa interfaccia, nessuna scrittura).
  const bt = useMemo(getBluetooth, []);
  const platform = useMemo(detectPlatform, []);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [kind, setKind] = useState<MachineKind>('bike');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [globalLog, setGlobalLog] = useState<LogEntry[]>([]);
  const [stream, setStream] = useState<{ t: number; dev: string; char: string; hex: string; summary?: string }[]>([]);
  const [, setTick] = useState(0);

  const records = useRef(new Map<string, DeviceRecord>());
  const handles = useRef(new Map<string, BtDevice>());
  const subs = useRef(new Map<string, { ch: BtChar; fn: (ev: any) => void }[]>());
  const pending = useRef(false);

  // Ridisegno limitato (le notifiche possono arrivare molte volte al secondo).
  const refresh = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    setTimeout(() => { pending.current = false; setTick((n) => n + 1); }, 200);
  }, []);

  const log = useCallback((devId: string | null, level: LogEntry['level'], msg: string) => {
    const e = { t: Date.now(), level, msg };
    if (devId) { const r = records.current.get(devId); if (r) r.log.push(e); }
    setGlobalLog((l) => [...l.slice(-299), { ...e, msg: devId ? `${records.current.get(devId)?.name || devId}: ${msg}` : msg }]);
    refresh();
  }, [refresh]);

  const extraUuids = useMemo(() => extra.split(/[\s,;]+/).filter(Boolean).map((t) => ({ t, u: parseUserUuid(t) })), [extra]);
  const badExtra = extraUuids.filter((x) => !x.u).map((x) => x.t);

  useEffect(() => {
    if (!bt) return;
    bt.getAvailability?.().then((v: boolean) => setAvailable(v)).catch(() => setAvailable(null));
    // Dispositivi già autorizzati in precedenza (solo dove il browser lo supporta).
    bt.getDevices?.().then((list: BtDevice[]) => {
      for (const d of list) if (!records.current.has(d.id)) { handles.current.set(d.id, d); records.current.set(d.id, newDevice(d.id, d.name ?? '', 'other', false, platform.label)); }
      if (list.length) refresh();
    }).catch(() => undefined);
    return () => {
      for (const d of handles.current.values()) { try { d.gatt?.connected && d.gatt.disconnect(); } catch { /* ignore */ } }
    };
  }, [bt, platform.label, refresh]);

  async function search(ftmsOnly: boolean) {
    if (!bt) return;
    const optionalServices = [...STANDARD_SERVICE_UUIDS, ...extraUuids.flatMap((x) => (x.u ? [x.u] : []))];
    setBusy('search');
    log(null, 'info', ftmsOnly ? 'Ricerca dispositivi che pubblicizzano FTMS (0x1826)…' : 'Ricerca di tutti i dispositivi Bluetooth LE nelle vicinanze…');
    try {
      const opts: Parameters<BluetoothLike['requestDevice']>[0] = ftmsOnly
        ? { filters: [{ services: [fullUuid(0x1826)] }], optionalServices }
        : { acceptAllDevices: true, optionalServices };
      const dev: BtDevice = await bt.requestDevice(opts);
      handles.current.set(dev.id, dev);
      const prev = records.current.get(dev.id);
      const rec = prev ?? newDevice(dev.id, dev.name ?? '', kind, ftmsOnly, platform.label);
      if (ftmsOnly) rec.foundWithFtmsFilter = true;
      if (!prev) rec.kind = kind;
      records.current.set(dev.id, rec);
      setSelected(dev.id);
      log(dev.id, 'ok', `Rilevato "${dev.name ?? '(senza nome)'}"${ftmsOnly ? ' con il filtro FTMS: pubblicizza il servizio Fitness Machine' : ''}`);
      dev.addEventListener?.('gattserverdisconnected', () => {
        const r = records.current.get(dev.id);
        if (r) r.connected = false;
        subs.current.delete(dev.id);
        log(dev.id, 'warn', 'Disconnesso (spento, fuori portata o collegato a un’altra app?)');
      });
      // Potenza del segnale e dati pubblicitari, dove il browser lo consente (in Chrome è sperimentale).
      if (dev.watchAdvertisements) {
        dev.addEventListener('advertisementreceived', (ev: any) => {
          const m: string[] = [];
          if (ev.rssi != null) m.push(`RSSI ${ev.rssi} dBm`);
          if (ev.uuids?.length) m.push(`servizi annunciati ${ev.uuids.map(fmtUuid).join(', ')}`);
          ev.manufacturerData?.forEach((v: DataView, k: number) => m.push(`dati produttore 0x${k.toString(16).padStart(4, '0')}: ${hex(v)}`));
          if (m.length) log(dev.id, 'info', `Annuncio: ${m.join(' · ')}`);
        }, { once: true });
        dev.watchAdvertisements().catch(() => undefined);
      }
    } catch (e: any) {
      if (e?.name === 'NotFoundError') log(null, 'warn', 'Nessun dispositivo scelto (finestra chiusa o nessun dispositivo trovato).');
      else log(null, 'error', `Ricerca non riuscita: ${errText(e)}`);
    } finally { setBusy(null); }
  }

  async function connect(id: string) {
    const dev = handles.current.get(id);
    const rec = records.current.get(id);
    if (!dev || !rec) return;
    setBusy(`connect:${id}`);
    rec.connectError = undefined;
    log(id, 'info', 'Connessione GATT in corso…');
    let server: any;
    try {
      server = await dev.gatt.connect();
      rec.connected = true; rec.everConnected = true;
      log(id, 'ok', 'Connessione riuscita');
    } catch (e) {
      rec.connectError = errText(e);
      log(id, 'error', `Connessione non riuscita: ${rec.connectError}`);
      setBusy(null);
      return;
    }

    // Servizi e caratteristiche
    try {
      const services = await server.getPrimaryServices();
      rec.services = [];
      rec.servicesError = undefined;
      log(id, 'info', `Servizi accessibili: ${services.length}`);
      for (const s of services) {
        const si = { uuid: s.uuid, name: serviceName(s.uuid), chars: [] as CharInfo[], error: undefined as string | undefined };
        rec.services.push(si);
        try {
          const chars = await s.getCharacteristics();
          for (const c of chars) {
            const props = PROP_NAMES.filter((p) => c.properties?.[p]);
            si.chars.push({ uuid: c.uuid, serviceUuid: s.uuid, name: charName(c.uuid), props, notifications: 0 });
            await inspectChar(id, c, si.chars[si.chars.length - 1]);
          }
        } catch (e) {
          si.error = errText(e);
          log(id, 'error', `Caratteristiche di ${fmtUuid(s.uuid)} non leggibili: ${si.error}`);
        }
      }
      const det = detectKind(rec);
      if (det && det !== rec.kind) {
        rec.kindCorrectedFrom = rec.kind;
        rec.kind = det;
        log(id, 'warn', `Tipo corretto: l’attrezzo trasmette dati da ${det === 'bike' ? 'cyclette (Indoor Bike Data)' : 'tapis roulant (Treadmill Data)'}`);
      }
      if (!rec.services.some((s) => shortOf(s.uuid) === 0x1826)) log(id, 'warn', 'Servizio FTMS (0x1826) non presente tra quelli accessibili');
      else log(id, 'ok', 'Servizio FTMS (0x1826) presente');
    } catch (e) {
      rec.servicesError = errText(e);
      log(id, e && (e as any).name === 'NotFoundError' ? 'warn' : 'error', `Lettura servizi: ${rec.servicesError}`);
    } finally { setBusy(null); refresh(); }
  }

  async function inspectChar(id: string, c: BtChar, info: CharInfo) {
    const rec = records.current.get(id)!;
    const label = info.name ?? fmtUuid(info.uuid);
    // 1) Lettura (non modifica l'attrezzo)
    if (info.props.includes('read')) {
      try {
        const dv: DataView = await c.readValue();
        info.read = { hex: hex(dv), decoded: decodeValue(info.uuid, dv) };
        if (shortOf(info.uuid) === 0x2acc) rec.features = parseMachineFeature(dv);
        log(id, 'data', `Letto ${label}: ${info.read.decoded?.summary ?? info.read.hex}`);
      } catch (e) { info.readError = errText(e); log(id, 'warn', `Lettura ${label} non riuscita: ${info.readError}`); }
    }
    // 2) Notifiche / indicazioni (mai sui Control Point)
    if (info.props.includes('notify') || info.props.includes('indicate')) {
      if (isControlPoint(info.uuid)) {
        info.skippedReason = 'Iscrizione saltata: è un Control Point (canale comandi). In questa fase non lo tocchiamo.';
        return;
      }
      const fn = (ev: any) => {
        const dv: DataView = ev.target.value;
        const decoded = decodeValue(info.uuid, dv);
        info.notifications++;
        info.last = { hex: hex(dv), decoded, t: Date.now() };
        const sh = shortOf(info.uuid);
        if (decoded) for (const f of decoded.fields) rec.seen[`${sh?.toString(16) ?? info.uuid}:${f.key}`] = { label: f.label, value: f.value, unit: f.unit, source: label, t: Date.now() };
        setStream((s) => [{ t: Date.now(), dev: rec.name || id, char: label, hex: info.last!.hex, summary: decoded?.summary }, ...s].slice(0, 60));
        refresh();
      };
      try {
        c.addEventListener('characteristicvaluechanged', fn);
        await c.startNotifications();
        info.subscribed = true;
        const list = subs.current.get(id) ?? [];
        list.push({ ch: c, fn });
        subs.current.set(id, list);
        log(id, 'ok', `In ascolto su ${label}`);
      } catch (e) {
        c.removeEventListener('characteristicvaluechanged', fn);
        info.subscribeError = errText(e);
        log(id, 'warn', `Notifiche ${label} non attivate: ${info.subscribeError}`);
      }
    }
  }

  async function disconnect(id: string) {
    const dev = handles.current.get(id);
    for (const s of subs.current.get(id) ?? []) { try { s.ch.removeEventListener('characteristicvaluechanged', s.fn); await s.ch.stopNotifications(); } catch { /* ignore */ } }
    subs.current.delete(id);
    try { dev?.gatt?.disconnect(); } catch { /* ignore */ }
    const r = records.current.get(id); if (r) r.connected = false;
    log(id, 'info', 'Disconnessione richiesta dall’utente');
  }

  function forget(id: string) {
    void disconnect(id);
    handles.current.get(id)?.forget?.().catch(() => undefined);
    handles.current.delete(id);
    records.current.delete(id);
    if (selected === id) setSelected(null);
    refresh();
  }

  async function copyReport(rec: DeviceRecord) {
    const md = reportMarkdown(rec);
    try { await navigator.clipboard.writeText(md); toast('Rapporto copiato'); }
    catch { downloadFile(fileName(rec), md, 'text/markdown'); toast('Copia non consentita: rapporto scaricato', 'info'); }
  }
  const fileName = (rec: DeviceRecord) => `diagnostica-bluetooth-${(rec.name || 'dispositivo').replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`;

  const list = [...records.current.values()];
  const cur = selected ? records.current.get(selected) : list[0];

  return (
    <div className="page stack bt-diag">
      <PageHeader title="Bluetooth Device Diagnostics" back sub="Strumento temporaneo in sola lettura per verificare cosa espongono davvero cyclette e tapis roulant." />

      <div className="banner"><ShieldCheck size={18} /><span><b>Sola lettura.</b> Questa schermata legge servizi e dati ma non invia nessun comando agli attrezzi e non salva nulla nei tuoi dati. Tieni l’attrezzo fermo o a bassa velocità e scollegalo da altre app (Kinomap, Zwift) prima del test: molti attrezzi accettano una sola connessione alla volta.</span></div>

      <Environment bt={bt} available={available} platform={platform} />

      {bt && (
        <section className="card stack-sm">
          <div className="card-title" style={{ marginBottom: 4 }}><h3><BluetoothSearching size={18} /> 1. Cerca un dispositivo</h3></div>
          <div className="field"><label>Che attrezzo stai provando?</label>
            <Segmented label="Attrezzo" value={kind} onChange={setKind} options={[{ value: 'bike', label: 'Cyclette' }, { value: 'treadmill', label: 'Tapis roulant' }, { value: 'other', label: 'Altro' }]} />
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn primary" disabled={!!busy} onClick={() => search(false)}><Bluetooth size={16} /> Cerca tutti i dispositivi</button>
            <button className="btn" disabled={!!busy} onClick={() => search(true)}><Radio size={16} /> Cerca solo FTMS</button>
          </div>
          <p className="hint">{bt.backend === 'native' ? 'Si apre un elenco con i dispositivi nelle vicinanze (la ricerca dura fino a 30 secondi): scegli il tuo attrezzo.' : 'Il browser apre una finestra con i dispositivi nelle vicinanze: scegli il tuo attrezzo.'} Prova prima “Cerca solo FTMS”: se l’attrezzo compare anche lì, pubblicizza il protocollo standard Fitness Machine. Se non compare, usa “Cerca tutti”.</p>
          <details>
            <summary className="small">UUID aggiuntivi da esplorare (facoltativo)</summary>
            <div className="stack-sm" style={{ marginTop: 8 }}>
              {bt.backend === 'native' && <p className="hint">Nell’app iPhone vengono già mostrati tutti i servizi dell’attrezzo, anche quelli proprietari: di solito questo campo non serve.</p>}
              <p className="hint">Web Bluetooth mostra solo i servizi dichiarati prima della ricerca. Qui sono già inclusi tutti i servizi standard per il fitness. Se nRF Connect mostra sull’attrezzo un servizio proprietario, scrivi qui il suo UUID (es. quello a 16 o 128 bit che vedi in nRF Connect) e ripeti la ricerca.</p>
              <input className={`input ${badExtra.length ? 'invalid' : ''}`} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="UUID separati da virgola" aria-label="UUID aggiuntivi" />
              {badExtra.length > 0 && <div className="tiny danger-text">Non validi: {badExtra.join(', ')}</div>}
            </div>
          </details>
        </section>
      )}

      {list.length > 0 && (
        <section className="card stack-sm">
          <div className="card-title" style={{ marginBottom: 4 }}><h3>2. Dispositivi rilevati</h3></div>
          {list.map((r) => (
            <div key={r.id} className={`bt-dev ${cur?.id === r.id ? 'on' : ''}`}>
              <button className="bt-dev-main" onClick={() => setSelected(r.id)}>
                <span className="li-icon"><Bluetooth size={18} /></span>
                <span className="grow">
                  <div className="li-title">{r.name || '(senza nome)'}</div>
                  <div className="li-sub">{KIND_LABEL[r.kind]} · {r.connected ? 'connesso' : r.everConnected ? 'disconnesso' : 'non connesso'}{r.foundWithFtmsFilter ? ' · pubblicizza FTMS' : ''}</div>
                </span>
              </button>
              <div className="row" style={{ gap: 6 }}>
                {r.connected
                  ? <button className="btn sm" onClick={() => disconnect(r.id)}><Unplug size={15} /> Scollega</button>
                  : <button className="btn sm primary" disabled={!!busy} onClick={() => { setSelected(r.id); void connect(r.id); }}><Plug size={15} /> {busy === `connect:${r.id}` ? 'Connessione…' : 'Collega'}</button>}
                <button className="icon-btn" aria-label="Rimuovi" onClick={() => forget(r.id)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </section>
      )}

      {cur && <DevicePanel rec={cur} onKind={(k) => { cur.kind = k; refresh(); }} onCopy={() => copyReport(cur)} onDownload={() => downloadFile(fileName(cur), reportMarkdown(cur), 'text/markdown')} />}

      {stream.length > 0 && (
        <section className="card">
          <div className="card-title"><h3><Radio size={18} /> Dati in tempo reale</h3><button className="link" onClick={() => setStream([])}>Svuota</button></div>
          <div className="bt-stream">
            {stream.map((s, i) => (
              <div key={i} className="bt-stream-row">
                <span className="tiny muted">{new Date(s.t).toLocaleTimeString('it-IT')}</span>
                <span className="small"><b>{s.char}</b> {s.summary && <span className="text-2">· {s.summary}</span>}</span>
                <code className="bt-hex">{s.hex}</code>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-title"><h3>Registro ed errori</h3>{globalLog.length > 0 && <button className="link" onClick={() => setGlobalLog([])}>Svuota</button>}</div>
        {globalLog.length === 0 ? <p className="hint">Ancora nessun evento.</p> : (
          <div className="bt-log">
            {[...globalLog].reverse().map((l, i) => (
              <div key={i} className={`bt-log-row ${l.level}`}><span className="tiny muted">{new Date(l.t).toLocaleTimeString('it-IT')}</span><span className="small">{l.msg}</span></div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Environment({ bt, available, platform }: { bt: BluetoothLike | undefined; available: boolean | null; platform: ReturnType<typeof detectPlatform> }) {
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  return (
    <section className="card stack-sm">
      <div className="card-title" style={{ marginBottom: 4 }}><h3><Info size={18} /> Questo dispositivo</h3></div>
      <div className="bt-kv"><span>Sistema e browser</span><b>{platform.label}</b></div>
      <div className="bt-kv"><span>{bt?.backend === 'native' ? 'Bluetooth' : 'Web Bluetooth'}</span><b className={bt ? 'success-text' : 'danger-text'}>{bt ? (bt.backend === 'native' ? 'disponibile (nativo, app iPhone)' : 'disponibile') : 'NON disponibile'}</b></div>
      <div className="bt-kv"><span>Connessione sicura (https)</span><b>{secure ? 'sì' : 'no'}</b></div>
      {bt && <div className="bt-kv"><span>Adattatore Bluetooth</span><b>{available == null ? 'non rilevabile' : available ? 'presente' : 'assente o spento'}</b></div>}
      {!bt && (
        <div className="banner warn"><AlertTriangle size={18} /><span>
          {platform.ios
            ? <>Su iPhone e iPad <b>Safari, Chrome e l’app installata nella schermata Home non supportano Web Bluetooth</b> (Apple non lo consente a nessun browser basato su WebKit). Usa l’<b>app nativa Forma</b> (installata con SideStore), oppure apri questa pagina nel browser <b>Bluefy</b> o prova con l’app gratuita <b>nRF Connect</b>. In alternativa fai il test da PC con Chrome/Edge o da Android con Chrome.</>
            : platform.browser === 'Firefox'
              ? <>Firefox non supporta Web Bluetooth. Apri questa pagina con <b>Chrome</b> o <b>Edge</b>.</>
              : platform.browser === 'Safari'
                ? <>Safari non supporta Web Bluetooth. Apri questa pagina con <b>Chrome</b> o <b>Edge</b>.</>
                : !secure
                  ? <>Web Bluetooth funziona solo su https o localhost.</>
                  : <>Questo browser non espone Web Bluetooth. Usa <b>Chrome</b> o <b>Edge</b> aggiornati (Windows, macOS, Android, ChromeOS). Su Linux può servire attivare il flag “Experimental Web Platform features”.</>}
        </span></div>
      )}
    </section>
  );
}

function DevicePanel({ rec, onKind, onCopy, onDownload }: { rec: DeviceRecord; onKind: (k: MachineKind) => void; onCopy: () => void; onDownload: () => void }) {
  const report = buildReport(rec);
  const seen = Object.entries(rec.seen);
  return (
    <>
      <section className="card stack-sm">
        <div className="card-title" style={{ marginBottom: 4 }}><h3>3. Rapporto: {rec.name || '(senza nome)'}</h3></div>
        <div className="field"><label>Questo dispositivo è</label>
          <Segmented label="Tipo di attrezzo" value={rec.kind} onChange={onKind} options={[{ value: 'bike', label: 'Cyclette' }, { value: 'treadmill', label: 'Tapis roulant' }, { value: 'other', label: 'Altro' }]} />
        </div>
        {report.map((it) => (
          <div key={it.title} className="bt-rep">
            <div className="row-between"><b>{it.title}</b><span className={`pill ${VERDICT_CLASS[it.verdict]}`}>{verdictLabel(it.verdict)}</span></div>
            <ul>{it.lines.map((l, i) => <li key={i} className="small text-2">{l}</li>)}</ul>
          </div>
        ))}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={onCopy}><Copy size={15} /> Copia rapporto</button>
          <button className="btn sm" onClick={onDownload}><Download size={15} /> Scarica rapporto</button>
        </div>
      </section>

      {seen.length > 0 && (
        <section className="card">
          <div className="card-title"><h3>Ultimi valori decodificati</h3></div>
          <div className="bt-values">
            {seen.map(([k, v]) => (
              <div key={k} className="bt-value"><div className="tiny muted">{v.label}</div><div className="bt-num">{v.value}<span className="tiny muted"> {v.unit}</span></div><div className="tiny muted">{v.source}</div></div>
            ))}
          </div>
        </section>
      )}

      {rec.services.length > 0 && (
        <section className="card stack-sm">
          <div className="card-title" style={{ marginBottom: 4 }}><h3>Servizi e caratteristiche</h3></div>
          <p className="hint"><span className="pill blue">dati</span> = l’attrezzo invia o espone valori (lettura/notifiche). <span className="pill orange">comandi</span> = accetta scritture, cioè potenziali comandi: qui non vengono mai usate.</p>
          {rec.services.map((s) => (
            <div key={s.uuid} className="bt-svc">
              <div className="bt-svc-head"><b>{s.name ?? 'Servizio non standard'}</b> <code className="bt-hex">{fmtUuid(s.uuid)}</code></div>
              {s.error && <div className="tiny danger-text">{s.error}</div>}
              {s.chars.map((c) => (
                <div key={c.uuid} className="bt-char">
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <span className="small"><b>{c.name ?? 'Caratteristica non standard'}</b></span>
                    <code className="bt-hex">{fmtUuid(c.uuid)}</code>
                    {isDataChar(c) && <span className="pill blue">dati</span>}
                    {isWritableChar(c) && <span className="pill orange">comandi</span>}
                    {c.subscribed && <span className="pill success">in ascolto</span>}
                  </div>
                  <div className="tiny muted">Proprietà: {c.props.map((p) => PROP_IT[p] ?? p).join(', ') || 'nessuna'} · UUID completo {c.uuid}</div>
                  {c.read && <div className="tiny">Valore letto: {c.read.decoded?.summary ?? ''} <code className="bt-hex">{c.read.hex || '(vuoto)'}</code></div>}
                  {c.notifications > 0 && <div className="tiny">Notifiche: {c.notifications} · ultima {c.last?.decoded?.summary ?? ''} <code className="bt-hex">{c.last?.hex}</code></div>}
                  {c.last?.decoded?.note && <div className="tiny muted">{c.last.decoded.note}</div>}
                  {c.read?.decoded?.note && <div className="tiny muted">{c.read.decoded.note}</div>}
                  {c.skippedReason && <div className="tiny muted">{c.skippedReason}</div>}
                  {c.readError && <div className="tiny danger-text">Lettura: {c.readError}</div>}
                  {c.subscribeError && <div className="tiny danger-text">Notifiche: {c.subscribeError}</div>}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
