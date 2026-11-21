/**
 * Riquadro "Attrezzo collegato" dentro un'attività cardio: collega la cyclette o il tapis roulant
 * via Bluetooth e mostra i dati dal vivo. SOLO LETTURA: l'app non comanda l'attrezzo.
 */
import { useState } from 'react';
import { Bluetooth, BluetoothOff, RefreshCw, Unplug } from 'lucide-react';
import { connectFtms, disconnectFtms, ftmsSupported, moveFtmsTo, reconnectFtms, useFtms } from '@/lib/ble/ftms';
import { formatClock, fmtN } from '@/lib/util';
import type { CardioLogState, CardioMachine } from '@/lib/types';

/** Macchine che possono inviare dati FTMS. */
export const FTMS_MACHINES: CardioMachine[] = ['bike', 'treadmill'];

export function MachineLink({ uid, c, onStartTimer, canStart }: { uid: string; c: CardioLogState; onStartTimer: () => void; canStart: boolean }) {
  const s = useFtms();
  const [busy, setBusy] = useState(false);
  const mine = s.ownerUid === uid;
  const supported = ftmsSupported();

  async function connect() {
    setBusy(true);
    try { await connectFtms(uid, c.machine); } finally { setBusy(false); }
  }
  async function reconnect() {
    setBusy(true);
    try { await reconnectFtms(); } finally { setBusy(false); }
  }

  if (!supported) {
    return (
      <p className="tiny muted row" style={{ gap: 6, marginTop: 10 }}>
        <BluetoothOff size={13} /> Per leggere i dati della cyclette o del tapis usa l’app Forma per iPhone (Safari non supporta il Bluetooth).
      </p>
    );
  }

  // attrezzo già collegato a un'altra attività cardio della sessione
  if (s.ownerUid && !mine && (s.status === 'connected' || s.status === 'lost')) {
    return (
      <div className="machine-link row-between" style={{ gap: 8 }}>
        <span className="small text-2">“{s.device}” è collegato a un’altra attività cardio.</span>
        <button className="btn sm" onClick={() => moveFtmsTo(uid)}>Usa qui</button>
      </div>
    );
  }

  if (!mine || s.status === 'idle' || s.status === 'error') {
    const err = mine && s.status === 'error' ? s.error : null;
    return (
      <div className="machine-link">
        <button className="btn grow" style={{ width: '100%' }} onClick={connect} disabled={busy}>
          <Bluetooth size={16} /> {busy ? 'Ricerca…' : c.machine ? 'Ricollega l’attrezzo' : `Collega ${c.plan.machine === 'bike' ? 'la cyclette' : 'il tapis roulant'}`}
        </button>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          {c.plan.machine === 'bike' ? 'Accendi la cyclette e scegli “iConsole…”' : 'Accendi il tapis roulant e scegli “FS-…”'} nella lista. I dati vengono solo letti: l’app non comanda l’attrezzo.
        </p>
        {err && <p className="tiny" style={{ color: 'var(--danger)', marginTop: 4 }}>{err}</p>}
      </div>
    );
  }

  if (s.status === 'connecting') {
    return <div className="machine-link small text-2 row" style={{ gap: 8 }}><span className="dot" /> Collegamento a {s.device ?? 'l’attrezzo'}…</div>;
  }

  const L = s.live;
  const sum = s.summary;
  const wrong = s.kind && s.kind !== c.plan.machine;
  const tiles: [string, string, string?][] = [];
  if (L.speedKmh != null) tiles.push(['Velocità', fmtN(L.speedKmh, 1), 'km/h']);
  tiles.push(['Distanza', sum ? (sum.distanceM >= 1000 ? fmtN(sum.distanceM / 1000, 2) : fmtN(sum.distanceM)) : '0', sum && sum.distanceM >= 1000 ? 'km' : 'm']);
  tiles.push(['In movimento', formatClock(sum?.movingSec ?? 0)]);
  tiles.push(['Calorie', fmtN(sum?.kcal ?? 0), 'kcal']);
  if (s.kind === 'bike') {
    if (L.cadence != null) tiles.push(['Cadenza', fmtN(L.cadence), 'rpm']);
    if (L.resistance != null) tiles.push(['Resistenza', fmtN(L.resistance, 1)]);
  } else if (L.inclinePct != null) tiles.push(['Inclinazione', fmtN(L.inclinePct, 1), '%']);
  if (L.power != null && L.power > 0) tiles.push(['Potenza', fmtN(L.power), 'W']);
  if (L.hr != null) tiles.push(['Frequenza cardiaca', fmtN(L.hr), 'bpm']);
  if (L.machineElapsedSec != null) tiles.push(['Sul display', formatClock(L.machineElapsedSec)]);

  return (
    <div className="machine-link" aria-live="off">
      <div className="row-between" style={{ gap: 8 }}>
        <span className="row small" style={{ gap: 8, minWidth: 0 }}>
          <span className={`dot ${s.status === 'connected' ? 'on' : 'lost'}`} aria-hidden />
          <span className="ellipsis"><b>{s.device}</b> {s.status === 'connected' ? (s.moving ? '· in movimento' : '· fermo') : '· connessione persa'}</span>
        </span>
        <button className="icon-btn ghost" onClick={() => void disconnectFtms()} aria-label="Scollega l’attrezzo" title="Scollega"><Unplug size={17} /></button>
      </div>
      {s.status === 'lost' && (
        <div className="banner warn" style={{ marginTop: 8 }}>
          <span className="grow">Connessione persa. I dati raccolti finora restano salvati.</span>
          <button className="btn sm" onClick={reconnect} disabled={busy}><RefreshCw size={14} /> Ricollega</button>
        </div>
      )}
      {wrong && <p className="tiny" style={{ color: 'var(--warning)', marginTop: 6 }}>Questo attrezzo sembra {s.kind === 'bike' ? 'una cyclette' : 'un tapis roulant'}, ma l’attività è {c.plan.machine === 'bike' ? 'cyclette' : 'tapis roulant'}: controlla di aver scelto quello giusto.</p>}
      <div className="machine-tiles">
        {tiles.map(([l, v, u]) => <div className="m" key={l}><span className="l">{l}</span><span className="v">{v}{u && <small>{u}</small>}</span></div>)}
      </div>
      {s.status === 'connected' && s.moving && !c.timer.running && !c.done && (
        <div className="banner" style={{ marginTop: 8 }}>
          <span className="grow">L’attrezzo è in movimento ma il timer è fermo.</span>
          <button className="btn sm primary" onClick={onStartTimer} disabled={!canStart}>Avvia timer</button>
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: 6 }}>Distanza e calorie contano da quando hai collegato l’attrezzo. A fine attività vengono salvate nello storico.</p>
    </div>
  );
}
