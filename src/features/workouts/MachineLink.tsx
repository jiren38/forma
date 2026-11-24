/**
 * Riquadro "Attrezzo collegato" dentro un'attività cardio: collega la cyclette o il tapis roulant
 * via Bluetooth, mostra i dati dal vivo e (se l'utente li attiva) i comandi dell'attrezzo.
 */
import { useState } from 'react';
import { Bluetooth, BluetoothOff, Play, RefreshCw, Unplug } from 'lucide-react';
import { connectFtms, disconnectFtms, ftmsSupported, moveFtmsTo, reconnectFtms, useFtms } from '@/lib/ble/ftms';
import { formatClock, fmtN } from '@/lib/util';
import type { CardioLogState, CardioMachine, CardioPhase, Profile } from '@/lib/types';
import { MachineControl } from './MachineControl';

/** Macchine che possono inviare dati FTMS. */
export const FTMS_MACHINES: CardioMachine[] = ['bike', 'treadmill'];

export function MachineLink({ uid, c, onStartTimer, onPauseTimer, canStart, target, profile }: {
  uid: string; c: CardioLogState; onStartTimer: () => void; onPauseTimer: () => void; canStart: boolean; profile?: Profile;
  /** valori previsti nella fase in corso (o nel piano continuo) */
  target?: Pick<CardioPhase, 'speedKmh' | 'inclinePct' | 'resistance' | 'rpm'> | null;
}) {
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
          {c.plan.machine === 'bike' ? 'Accendi la cyclette e scegli “iConsole…”' : 'Accendi il tapis roulant e scegli “FS-…”'} nella lista. Dopo potrai anche comandarlo dall’app.
        </p>
        {err && <p className="tiny" style={{ color: 'var(--danger)', marginTop: 4 }}>{err}</p>}
      </div>
    );
  }

  if (s.status === 'connecting') {
    return <div className="machine-link small text-2 row" style={{ gap: 8 }}><span className="dot pulse" /> Collegamento in corso…</div>;
  }

  const L = s.live;
  const sum = s.summary;
  const kind = s.kind ?? (c.plan.machine === 'bike' ? 'bike' : 'treadmill');
  const wrong = s.kind && s.kind !== c.plan.machine;
  const live = s.status === 'connected';
  const dist = sum?.distanceM ?? 0;

  // i due dati principali, con il confronto con l'obiettivo della fase in corso
  const heroes: Hero[] = kind === 'bike'
    ? [
        { label: 'Cadenza', value: L.cadence, digits: 0, unit: 'rpm', target: target?.rpm, tol: 0.1 },
        { label: 'Resistenza', value: L.resistance, digits: 0, unit: c.plan.resistanceMax ? `/ ${c.plan.resistanceMax}` : 'livello', target: target?.resistance, tol: 0 },
      ]
    : [
        { label: 'Velocità', value: L.speedKmh, digits: 1, unit: 'km/h', target: target?.speedKmh, tol: 0.05 },
        { label: 'Inclinazione', value: L.inclinePct, digits: 1, unit: '%', target: target?.inclinePct, tol: 0, zeroOk: true },
      ];

  const totals: [string, string, string?][] = [
    ['Distanza', dist >= 1000 ? fmtN(dist / 1000, 2) : fmtN(dist), dist >= 1000 ? 'km' : 'm'],
    ['Calorie', fmtN(sum?.kcal ?? 0), 'kcal'],
    ['In movimento', formatClock(sum?.movingSec ?? 0)],
  ];

  const extras: [string, string][] = [];
  if (kind === 'bike' && L.speedKmh != null) extras.push(['Velocità', `${fmtN(L.speedKmh, 1)} km/h`]);
  if (L.power != null && L.power > 0) extras.push(['Potenza', `${fmtN(L.power)} W`]);
  if (L.hr != null) extras.push(['FC', `${fmtN(L.hr)} bpm`]);
  if (sum?.avgSpeedKmh != null && kind === 'treadmill') extras.push(['Media', `${fmtN(sum.avgSpeedKmh, 1)} km/h`]);
  if (sum?.avgCadence != null && kind === 'bike') extras.push(['Media', `${fmtN(sum.avgCadence)} rpm`]);
  if (L.machineElapsedSec != null) extras.push(['Display', formatClock(L.machineElapsedSec)]);

  return (
    <div className={`machine-panel ${live ? '' : 'is-lost'}`}>
      <div className="mp-head">
        <span className={`mp-status ${live ? (s.moving ? 'moving' : 'on') : 'lost'}`}>
          <span className="dot" aria-hidden />
          {live ? (s.moving ? 'Dal vivo' : 'Collegato') : 'Connessione persa'}
        </span>
        <span className="mp-device ellipsis"><Bluetooth size={12} /> {s.device}</span>
        <button className="icon-btn ghost sm" onClick={() => void disconnectFtms()} aria-label="Scollega l’attrezzo" title="Scollega"><Unplug size={16} /></button>
      </div>

      {s.status === 'lost' && (
        <div className="banner warn mp-banner">
          <span className="grow">I dati raccolti finora restano salvati.</span>
          <button className="btn sm" onClick={reconnect} disabled={busy}><RefreshCw size={14} /> Ricollega</button>
        </div>
      )}
      {wrong && <p className="tiny mp-warn">Questo attrezzo sembra {s.kind === 'bike' ? 'una cyclette' : 'un tapis roulant'}, ma l’attività è {c.plan.machine === 'bike' ? 'cyclette' : 'tapis roulant'}: controlla di aver scelto quello giusto.</p>}

      <div className="mp-hero">
        {heroes.map((h) => <HeroMetric key={h.label} h={h} />)}
      </div>

      <div className="mp-totals">
        {totals.map(([l, v, u]) => (
          <div key={l}><span className="v">{v}{u && <small>{u}</small>}</span><span className="l">{l}</span></div>
        ))}
      </div>

      {extras.length > 0 && (
        <div className="mp-extras">
          {extras.map(([l, v]) => <span key={l}><span className="muted">{l}</span> <b>{v}</b></span>)}
        </div>
      )}

      {live && <MachineControl profile={profile} timerRunning={c.timer.running} onStopTimer={onPauseTimer} />}

      {live && s.moving && !c.timer.running && !c.done && s.control.status !== 'on' && (
        <div className="banner mp-banner">
          <span className="grow">Ti stai allenando ma il timer è fermo.</span>
          <button className="btn sm primary" onClick={onStartTimer} disabled={!canStart}><Play size={14} fill="currentColor" /> Avvia timer</button>
        </div>
      )}
    </div>
  );
}

type Hero = { label: string; value?: number; digits: number; unit: string; target?: number | null; tol: number; zeroOk?: boolean };

/** Dato principale: numero grande e confronto con l'obiettivo (in linea, sotto, sopra). */
function HeroMetric({ h }: { h: Hero }) {
  const has = h.value != null;
  let state: 'ok' | 'low' | 'high' | '' = '';
  const tg = h.target ?? 0;
  const hasTarget = h.target != null && (tg > 0 || !!h.zeroOk);
  if (has && hasTarget) {
    const margin = Math.max(h.tol * tg, h.digits ? 0.05 : 0.5);
    state = h.value! < tg - margin ? 'low' : h.value! > tg + margin ? 'high' : 'ok';
  }
  const scale = Math.max(tg * 1.5, h.zeroOk ? 4 : 1);
  const pct = has ? Math.max(0, Math.min(1, h.value! / scale)) : 0;
  return (
    <div className={`mp-metric ${state}`}>
      <span className="l">{h.label}</span>
      <span className="v">{has ? fmtN(h.value!, h.digits) : '–'}<small>{h.unit}</small></span>
      {hasTarget ? (
        <>
          <span className="gauge" aria-hidden><i style={{ width: `${pct * 100}%` }} /><b style={{ left: `${(tg / scale) * 100}%` }} /></span>
          <span className="t">
            Obiettivo {fmtN(tg, h.digits)}{state === 'ok' ? ' · in linea' : state === 'low' ? ' · aumenta' : state === 'high' ? ' · riduci' : ''}
          </span>
        </>
      ) : <span className="t muted">Nessun obiettivo</span>}
    </div>
  );
}
