import { useMemo } from 'react';
import { useActiveProgram, useCardio, useDiary, useMeasurements, useProfile, useSessions, useSettings, useTemplates, useWellness } from '@/app/data';
import { useEnergyIndex } from '@/features/energy/EnergyPage';
import type { WeeklyInput } from '@/lib/weekly';

/** Tutti i dati che servono al riepilogo settimanale, letti dalle collezioni già sincronizzate. */
export function useWeeklyInput(now: Date): WeeklyInput | null {
  const profile = useProfile();
  const settings = useSettings();
  const program = useActiveProgram();
  const templates = useTemplates();
  const sessions = useSessions();
  const cardio = useCardio();
  const diary = useDiary();
  const wellness = useWellness();
  const measurements = useMeasurements();
  const energy = useEnergyIndex();
  const minute = Math.floor(now.getTime() / 60_000);
  return useMemo(
    () => (profile && energy ? { now, profile, settings, program, templates, sessions, cardio, diary, wellness, measurements, energy } : null),
    // l'ora conta al minuto: evita ricalcoli a ogni render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minute, profile, settings, program, templates, sessions, cardio, diary, wellness, measurements, energy],
  );
}
