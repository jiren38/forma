/**
 * Applica allo store i dati arrivati da Apple Salute tramite Comandi Rapidi.
 * La logica (cosa scrivere, senza doppioni) è in lib/health.ts; qui ci sono solo le scritture.
 */
import { store } from '@/db/store';
import { patchMeta, patchProfile, type HealthMeta, type Meta } from '@/app/data';
import { parseHealthPayload, planHealthImport, type HealthImportSummary } from '@/lib/health';
import type { Measurement, Profile, WellnessDay } from '@/lib/types';

export interface HealthImportResult { ok: boolean; summary: HealthImportSummary | null; error?: string }

export async function applyHealthPayload(text: string, now = new Date()): Promise<HealthImportResult> {
  const prev = store.get<Meta>('meta', 'me')?.health;
  const parsed = parseHealthPayload(text, now);
  const saveMeta = (h: Partial<HealthMeta>) =>
    patchMeta({ health: { lastImportAt: now.toISOString(), summary: null, weightCursor: prev?.weightCursor ?? null, ...h } });

  if (!parsed.samples.length) {
    const error = !text.trim()
      ? 'Il comando non ha passato dati: controlla che "Apri URL" contenga il testo codificato.'
      : 'Nessuna riga riconosciuta: controlla il testo dentro "Ripeti" (es. passi;Data di inizio;Data di fine;Valore).';
    await saveMeta({ error, invalid: parsed.invalid, summary: prev?.summary ?? null, lastImportAt: prev?.lastImportAt ?? now.toISOString() });
    return { ok: false, summary: null, error };
  }

  const plan = planHealthImport(parsed, {
    wellness: store.list<WellnessDay>('wellness'),
    measurements: store.list<Measurement>('measurements'),
    weightCursor: prev?.weightCursor ?? null,
    now,
  });

  for (const w of plan.wellness) {
    // rilegge il giorno subito prima di scrivere: non perde acqua, check-in ecc. inseriti nel frattempo
    const cur = store.get<WellnessDay>('wellness', w.date);
    const patch: Partial<WellnessDay> = { steps: w.steps };
    if (w.sleepSource === 'health' && (cur?.sleepSource === 'health' || !cur?.sleepHours)) {
      Object.assign(patch, { sleepHours: w.sleepHours, bedTime: w.bedTime, wakeTime: w.wakeTime, sleepSource: 'health' });
    }
    await store.put('wellness', w.date, { waterMl: 0, ...(cur ?? {}), ...patch, id: w.date, date: w.date });
  }
  for (const m of plan.measurements) await store.put('measurements', m.id, m);

  if (plan.measurements.length) {
    // come quando si salva una misura a mano: il profilo segue l'ultima pesata (serve a calorie e stime)
    const lastW = store.list<Measurement>('measurements').filter((x) => x.weightKg).sort((a, b) => a.date.localeCompare(b.date)).pop();
    const profile = store.get<Profile>('profile', 'me');
    if (profile && lastW?.weightKg && lastW.weightKg !== profile.weightKg) await patchProfile({ weightKg: lastW.weightKg });
  }

  await saveMeta({ summary: plan.summary, weightCursor: plan.weightCursor, error: null, invalid: parsed.invalid });
  return { ok: true, summary: plan.summary };
}
