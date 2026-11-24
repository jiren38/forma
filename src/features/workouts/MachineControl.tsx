/**
 * Comandi dell'attrezzo dentro il riquadro "Dal vivo": attivazione con avvertenze di sicurezza,
 * STOP sempre a portata di mano, velocità e pendenza (tapis) o resistenza (cyclette).
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Gauge, Minus, Mountain, OctagonX, Plus, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react';
import { Sheet, NumberInput } from '@/components/ui';
import {
  isTreadmillControlSuspended, releaseFtmsControl, setFtmsIncline, setFtmsLimits, setFtmsResistance, setFtmsSpeed, stopFtms, takeFtmsControl, useFtms,
} from '@/lib/ble/ftms';
import { DEFAULT_LIMITS } from '@/lib/ftms-control';
import { patchProfile } from '@/app/data';
import { fmtN } from '@/lib/util';
import type { MachineSpec, Profile } from '@/lib/types';

export function MachineControl({ profile, onStopTimer, timerRunning }: { profile?: Profile; onStopTimer: () => void; timerRunning: boolean }) {
  const s = useFtms();
  const [sheet, setSheet] = useState(false);
  const kind = s.kind ?? 'treadmill';
  const ctl = s.control;
  if (ctl.status === 'unavailable') return null;
  if (kind === 'treadmill' && isTreadmillControlSuspended()) {
    return <p className="tiny muted" style={{ marginTop: 8 }}>Comandi del tapis dall’app sospesi per sicurezza: avvia, regola e ferma il tapis dalla sua console. I dati restano visibili qui.</p>;
  }

  async function stop() {
    await stopFtms();
    onStopTimer();
  }

  if (ctl.status !== 'on') {
    return (
      <div className="mp-control-off">
        <button className="btn grow" style={{ width: '100%' }} onClick={() => setSheet(true)} disabled={ctl.status === 'requesting'}>
          <Zap size={16} /> {ctl.status === 'requesting' ? 'Richiesta in corso…' : `Comanda ${kind === 'bike' ? 'la cyclette' : 'il tapis'} dall’app`}
        </button>
        {ctl.status === 'error' && ctl.error && <p className="tiny" style={{ color: 'var(--danger)', marginTop: 6 }}>{ctl.error}</p>}
        {sheet && <SafetySheet kind={kind} profile={profile} onClose={() => setSheet(false)} />}
      </div>
    );
  }

  const L = ctl.limits!;
  const t = ctl.targets;
  const curSpeed = t.speed ?? s.live.speedKmh ?? 0;
  const curIncline = t.incline ?? s.live.inclinePct ?? 0;
  const curRes = t.resistance ?? s.live.resistance ?? L.resistance.min;

  return (
    <div className="mp-control">
      <div className="mp-control-head">
        <span className="row small" style={{ gap: 6 }}><Zap size={14} /> <b>Comandi attivi</b></span>
        <button className="link small" onClick={() => releaseFtmsControl()} disabled={ctl.running}>Solo lettura</button>
      </div>
      {kind === 'treadmill' ? (
        <div className="mp-steppers">
          <Step icon={<Gauge size={14} />} label="Velocità" value={fmtN(curSpeed, 1)} unit="km/h" max={`max ${fmtN(L.speed.max, 1)}`}
            onMinus={() => void setFtmsSpeed(Math.max(L.speed.min, curSpeed - 0.5))} onPlus={() => void setFtmsSpeed(curSpeed + 0.5)}
            canMinus={curSpeed > L.speed.min} canPlus={curSpeed < L.speed.max} disabled={!ctl.running} />
          <Step icon={<Mountain size={14} />} label="Pendenza" value={fmtN(curIncline, 1)} unit="%" max={`max ${fmtN(L.incline.max)}`}
            onMinus={() => void setFtmsIncline(curIncline - 1)} onPlus={() => void setFtmsIncline(curIncline + 1)}
            canMinus={curIncline > L.incline.min} canPlus={curIncline < L.incline.max} disabled={!ctl.running} />
        </div>
      ) : (
        <div className="mp-steppers one">
          <Step icon={<SlidersHorizontal size={14} />} label="Resistenza" value={fmtN(curRes)} unit={`/ ${fmtN(L.resistance.max)}`} max=""
            onMinus={() => void setFtmsResistance(curRes - 1)} onPlus={() => void setFtmsResistance(curRes + 1)}
            canMinus={curRes > L.resistance.min} canPlus={curRes < L.resistance.max} disabled={false} />
        </div>
      )}
      {!ctl.running && <p className="tiny muted" style={{ marginTop: 8 }}>Premi <b>Avvia</b>: {kind === 'bike' ? 'la resistenza seguirà' : 'il tapis partirà e seguirà'} il percorso fase per fase. Puoi correggere con + e −.</p>}
      {ctl.error && <p className="tiny" style={{ color: 'var(--warning)', marginTop: 6 }}>{ctl.error}</p>}
      {kind === 'treadmill' && (
        <button className="btn mp-stop" onClick={stop}><OctagonX size={22} /> STOP</button>
      )}
      {ctl.log.length > 0 && (
        <details className="mp-log" style={{ marginTop: 10 }}>
          <summary className="tiny muted" style={{ cursor: 'pointer' }}>Registro comandi ({ctl.log.length})</summary>
          <pre className="tiny" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', maxHeight: 220, overflow: 'auto', fontSize: 11 }}>{ctl.log.slice().reverse().join('\n')}</pre>
        </details>
      )}
      {kind === 'treadmill' && (ctl.running || timerRunning) && createPortal(
        <button className="mp-stop-fab" onClick={stop} aria-label="STOP tapis roulant"><OctagonX size={26} /><span>STOP</span></button>,
        document.body,
      )}
    </div>
  );
}

function Step({ label, value, unit, max, onMinus, onPlus, canMinus, canPlus, disabled }: {
  icon?: React.ReactNode; label: string; value: string; unit: string; max: string;
  onMinus: () => void; onPlus: () => void; canMinus: boolean; canPlus: boolean; disabled: boolean;
}) {
  return (
    <div className="mp-step">
      <span className="l">{label}</span>
      <div className="row-between" style={{ gap: 6 }}>
        <button className="icon-btn" onClick={onMinus} disabled={disabled || !canMinus} aria-label={`Diminuisci ${label.toLowerCase()}`}><Minus size={18} /></button>
        <span className="v">{value}<small>{unit}</small></span>
        <button className="icon-btn" onClick={onPlus} disabled={disabled || !canPlus} aria-label={`Aumenta ${label.toLowerCase()}`}><Plus size={18} /></button>
      </div>
      {max && <span className="tiny muted">{max}</span>}
    </div>
  );
}

/** Avvertenze e limiti prima di dare i comandi all'app. */
function SafetySheet({ kind, profile, onClose }: { kind: 'bike' | 'treadmill'; profile?: Profile; onClose: () => void }) {
  const spec0: MachineSpec = profile?.cardioMachines?.[kind] ?? {};
  const [maxSpeed, setMaxSpeed] = useState<number | null>(spec0.maxSpeed ?? DEFAULT_LIMITS.treadmill.maxSpeed);
  const [maxIncline, setMaxIncline] = useState<number | null>(spec0.maxIncline ?? DEFAULT_LIMITS.treadmill.maxIncline);
  const [maxRes, setMaxRes] = useState<number | null>(spec0.maxResistance ?? DEFAULT_LIMITS.bike.maxResistance);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const spec: MachineSpec = kind === 'treadmill'
      ? { ...spec0, maxSpeed: maxSpeed ?? DEFAULT_LIMITS.treadmill.maxSpeed, maxIncline: maxIncline ?? DEFAULT_LIMITS.treadmill.maxIncline }
      : { ...spec0, maxResistance: maxRes ?? DEFAULT_LIMITS.bike.maxResistance };
    if (profile) { try { await patchProfile({ cardioMachines: { ...(profile.cardioMachines ?? {}), [kind]: spec } }); } catch { /* resta valido per questa sessione */ } }
    const done = await takeFtmsControl(spec);
    setFtmsLimits(spec);
    setBusy(false);
    if (done) onClose();
  }

  const s = useFtms();
  return (
    <Sheet open onClose={onClose} title={kind === 'bike' ? 'Comandare la cyclette' : 'Comandare il tapis roulant'} footer={
      <button className="btn primary grow" disabled={!ok || busy} onClick={confirm}><ShieldCheck size={17} /> {busy ? 'Collegamento comandi…' : 'Attiva i comandi'}</button>
    }>
      <div className="stack-sm">
        {kind === 'treadmill' ? (
          <ul className="safety-list">
            <li>Aggancia la <b>chiave di sicurezza</b> del tapis ai vestiti: se cadi, il tapis si ferma.</li>
            <li>Sali sul nastro solo dopo il conto alla rovescia e tieniti ai corrimano quando cambia la velocità.</li>
            <li>Il pulsante <b>STOP</b> resta sempre in basso a destra. Anche il pulsante stop del tapis funziona sempre.</li>
            <li>Se il telefono perde la connessione il tapis potrebbe continuare: fermalo dal tapis.</li>
          </ul>
        ) : (
          <ul className="safety-list">
            <li>L’app cambierà la resistenza da sola seguendo il percorso.</li>
            <li>Puoi sempre correggerla con + e − o dalla console della cyclette.</li>
          </ul>
        )}
        <div className="grid-2">
          {kind === 'treadmill' ? (
            <>
              <div className="field"><label>Velocità massima</label><NumberInput value={maxSpeed} min={1} max={16} suffix="km/h" ariaLabel="Velocità massima consentita" onChange={setMaxSpeed} /></div>
              <div className="field"><label>Pendenza massima</label><NumberInput value={maxIncline} min={0} max={12} suffix="%" ariaLabel="Pendenza massima consentita" onChange={setMaxIncline} /></div>
            </>
          ) : (
            <div className="field"><label>Resistenza massima</label><NumberInput value={maxRes} min={1} max={100} suffix="livello" ariaLabel="Resistenza massima consentita" onChange={setMaxRes} /></div>
          )}
        </div>
        <p className="hint">L’app non supererà mai questi limiti, qualunque sia il percorso. Puoi cambiarli ogni volta che attivi i comandi.</p>
        <label className="row" style={{ gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
          <span className="small">{kind === 'treadmill' ? 'Ho agganciato la chiave di sicurezza e ho letto le avvertenze.' : 'Ho letto le avvertenze.'}</span>
        </label>
        {s.control.status === 'error' && s.control.error && <p className="tiny" style={{ color: 'var(--danger)' }}>{s.control.error}</p>}
      </div>
    </Sheet>
  );
}
