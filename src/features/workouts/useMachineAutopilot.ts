/**
 * Pilota automatico: quando l'app comanda l'attrezzo, il timer dell'attività cardio e le fasi
 * del percorso guidano tapis o cyclette.
 *
 * - Avvia il timer → avvia l'attrezzo e imposta i valori della fase.
 * - Pausa del timer → pausa dell'attrezzo.
 * - Cambio di fase → nuovi valori (velocità e pendenza, o resistenza).
 * - Fine del percorso → STOP.
 * - L'attrezzo si ferma da solo (pulsante, chiave di sicurezza) → il timer va in pausa.
 */
import { useEffect, useRef } from 'react';
import {
  getFtmsState, onFtmsMachineEvent, pauseFtms, setFtmsIncline, setFtmsResistance, setFtmsSpeed, startFtms, stopFtms, useFtms,
} from '@/lib/ble/ftms';
import type { CardioPhase, CardioPlan } from '@/lib/types';

/** Il tapis fa il conto alla rovescia prima di partire: i valori si mandano dopo. */
const TREADMILL_START_DELAY_MS = 3500;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function applyPhaseTargets(phase: Pick<CardioPhase, 'speedKmh' | 'inclinePct' | 'resistance'> | null, plan: CardioPlan) {
  const s = getFtmsState();
  if (s.control.status !== 'on') return;
  if (s.kind === 'treadmill') {
    const sp = phase?.speedKmh ?? plan.speedKmh;
    const inc = phase?.inclinePct ?? plan.inclinePct;
    // prima la pendenza e poi la velocità: sul TFK 495 un cambio di pendenza subito dopo la
    // velocità può annullare il nuovo obiettivo di velocità
    if (inc != null) await setFtmsIncline(inc);
    if (sp != null && sp > 0) await setFtmsSpeed(sp);
  } else if (s.kind === 'bike') {
    const r = phase?.resistance ?? plan.resistance;
    if (r != null && r > 0) await setFtmsResistance(r);
  }
}

export function useMachineAutopilot({ uid, plan, running, phase, phaseIndex, finished, onMachineStopped }: {
  uid: string; plan: CardioPlan; running: boolean; phase: CardioPhase | null; phaseIndex: number; finished: boolean;
  /** l'attrezzo si è fermato da solo: mettere in pausa il timer */
  onMachineStopped: () => void;
}) {
  const s = useFtms();
  const active = s.ownerUid === uid && s.control.status === 'on';
  const prev = useRef({ running, phaseIndex, active, finished });
  const latest = useRef({ plan, phase, onMachineStopped, running });
  latest.current = { plan, phase, onMachineStopped, running };

  useEffect(() => {
    const p = prev.current;
    prev.current = { running, phaseIndex, active, finished };
    if (!active) return;
    // fine del percorso: si ferma l'attrezzo una volta sola
    if (finished && !p.finished && running) { void stopFtms(); return; }
    if (finished) return;
    const started = running && (!p.running || !p.active);
    if (started) {
      void (async () => {
        const kind = getFtmsState().kind;
        const already = getFtmsState().control.running;
        // Prima dell'avvio si imposta già la velocità del programma: alcuni tapis, avviati senza
        // una velocità obiettivo, partono al massimo.
        if (!already && kind === 'treadmill') await applyPhaseTargets(latest.current.phase, latest.current.plan);
        const ok = already || (await startFtms());
        if (!ok) return;
        if (kind === 'treadmill') await wait(TREADMILL_START_DELAY_MS);
        if (!latest.current.running) return;
        // e la si ripete dopo il conto alla rovescia, quando il nastro è partito
        await applyPhaseTargets(latest.current.phase, latest.current.plan);
      })();
      return;
    }
    if (!running && p.running && getFtmsState().control.running) { void pauseFtms(); return; }
    if (running && phaseIndex !== p.phaseIndex) void applyPhaseTargets(phase, plan);
  }, [running, phaseIndex, active, finished, phase, plan]);

  useEffect(() => {
    if (!active) return;
    return onFtmsMachineEvent((e) => {
      if ((e === 'stopped' || e === 'paused' || e === 'safety_key' || e === 'control_lost') && latest.current.running) latest.current.onMachineStopped();
    });
  }, [active]);
}
