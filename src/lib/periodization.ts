/**
 * Programmi a più settimane (periodizzazione).
 *
 * Le schede del programma restano la "settimana tipo"; ogni settimana del blocco ne modifica
 * volume (serie), intensità (ripetizioni in riserva) e, nelle fasi di forza, il range di ripetizioni.
 * Al termine del blocco c'è sempre una settimana di scarico; se il ciclo si ripete, riparte con i
 * carichi aggiornati dalla progressione automatica.
 *
 * Riferimenti generali: progressione con scarico ogni 4–8 settimane (Helms et al., The Muscle and
 * Strength Pyramid; Israetel et al., Scientific Principles of Hypertrophy Training), RIR come misura
 * dello sforzo (Zourdos et al., 2016).
 */
import { getExercise } from '@/data/exercises';
import type { BlockModelId, BlockWeek, BlockWeekKind, CardioPlan, Profile, Program, ProgramBlock, SessionBlockInfo, TemplateExercise, WorkoutSession } from './types';
import { addDays, dayKey, fromKey, startOfWeek } from './util';
import { completedSessions } from './stats';
import { pastLogs } from './progression';

const W = (kind: BlockWeekKind, rir: number, o: Partial<BlockWeek> = {}): BlockWeek => ({ kind, rir, extraSets: 0, setsFactor: 1, load: 1, repShift: 0, ...o });
const DELOAD = (rir = 4): BlockWeek => W('deload', rir, { setsFactor: 0.6, load: 0.9 });

export interface BlockModel { id: BlockModelId; name: string; short: string; desc: string; who: string; weeks: BlockWeek[] }

export const BLOCK_MODELS: Record<BlockModelId, BlockModel> = {
  beginner6: {
    id: 'beginner6', name: 'Principiante · 6 settimane', short: '5 + 1 scarico',
    desc: 'Carichi che salgono un poco ogni seduta, sforzo che cresce gradualmente e una settimana di scarico alla fine.',
    who: 'Ideale per chi si allena da meno di un anno.',
    weeks: [W('base', 3), W('base', 3), W('accumulation', 2), W('accumulation', 2), W('intensification', 2), DELOAD()],
  },
  linear4: {
    id: 'linear4', name: 'Progressione lineare · 4 settimane', short: '3 + 1 scarico',
    desc: 'Tre settimane in cui lo sforzo aumenta (da 3 a 1 ripetizione in riserva), poi una settimana di scarico.',
    who: 'Adatto a quasi tutti gli obiettivi, semplice da seguire.',
    weeks: [W('accumulation', 3), W('accumulation', 2), W('intensification', 1), DELOAD()],
  },
  hyp6: {
    id: 'hyp6', name: 'Ipertrofia · 6 settimane', short: '5 + 1 scarico',
    desc: 'Il volume cresce di settimana in settimana (una serie in più per esercizio dalla terza), lo sforzo sale fino a 1 ripetizione in riserva, poi scarico.',
    who: 'Per chi punta alla massa muscolare con almeno qualche mese di esperienza.',
    weeks: [W('accumulation', 3), W('accumulation', 2), W('accumulation', 2, { extraSets: 1 }), W('intensification', 1, { extraSets: 1 }), W('overreach', 1, { extraSets: 1 }), DELOAD()],
  },
  strength8: {
    id: 'strength8', name: 'Forza a blocchi · 8 settimane', short: '3 + 1 + 3 + 1',
    desc: 'Blocco di accumulo (più ripetizioni, carichi moderati), scarico, blocco di intensificazione (meno ripetizioni, carichi più alti) e settimana di picco a volume ridotto.',
    who: 'Per chi vuole aumentare i massimali sui fondamentali.',
    weeks: [
      W('accumulation', 3, { repShift: 2 }), W('accumulation', 2, { repShift: 2 }), W('accumulation', 2, { repShift: 2, extraSets: 1 }), DELOAD(),
      W('intensification', 2, { repShift: -2 }), W('intensification', 1, { repShift: -2 }), W('intensification', 1, { repShift: -2, extraSets: 1 }),
      W('peak', 1, { repShift: -3, setsFactor: 0.6 }),
    ],
  },
};

export const WEEK_LABEL: Record<BlockWeekKind, string> = {
  base: 'Base', accumulation: 'Accumulo', intensification: 'Intensificazione', overreach: 'Sovraccarico', peak: 'Picco', deload: 'Scarico',
};

export const WEEK_HINT: Record<BlockWeekKind, string> = {
  base: 'Impara i movimenti e costruisci la routine.',
  accumulation: 'Volume pieno con carichi gestibili.',
  intensification: 'Sforzo più alto, ogni serie conta.',
  overreach: 'Settimana più impegnativa del blocco: poi si recupera.',
  peak: 'Poche serie pesanti, volume ridotto: buon momento per un nuovo record.',
  deload: 'Meno serie e carichi più leggeri per recuperare e ripartire più forte.',
};

/** Modello consigliato in base a livello e obiettivi. */
export function recommendedModel(p: Pick<Profile, 'level' | 'goals'>): BlockModelId {
  if (p.level === 'beginner') return 'beginner6';
  if (p.goals.includes('strength')) return 'strength8';
  if (p.goals.includes('hypertrophy') || p.goals.includes('recomp')) return 'hyp6';
  return 'linear4';
}

/** Lunedì della settimana di una data (YYYY-MM-DD). */
export const mondayOf = (d: Date = new Date()) => dayKey(startOfWeek(d));

export function createBlock(model: BlockModelId, startDate = mondayOf(), repeat = true): ProgramBlock {
  return { model, weeks: BLOCK_MODELS[model].weeks.map((w) => ({ ...w })), startDate, repeat, deloadOverrides: [] };
}

export interface BlockPosition {
  /** false se il blocco inizia in una settimana futura */
  started: boolean;
  /** settimane intere dalla partenza (può essere negativo prima dell'inizio) */
  absWeek: number;
  /** ciclo in corso (da 1) */
  cycle: number;
  /** settimana nel ciclo (0-based) */
  week: number;
  total: number;
  info: BlockWeek;
  /** il blocco non si ripete ed è terminato */
  finished: boolean;
  /** la settimana è uno scarico deciso dall'utente */
  overridden: boolean;
}

export function blockPosition(block: ProgramBlock, date: Date = new Date()): BlockPosition {
  const total = Math.max(1, block.weeks.length);
  const start = fromKey(block.startDate);
  const abs = Math.floor(Math.round((startOfWeek(date).getTime() - startOfWeek(start).getTime()) / 86400000) / 7);
  const started = abs >= 0;
  const finished = started && !block.repeat && abs >= total;
  const a = Math.max(0, abs);
  const week = finished ? total - 1 : a % total;
  const cycle = finished ? Math.ceil(a / total) : Math.floor(a / total) + 1;
  const overridden = started && !finished && !!block.deloadOverrides?.includes(abs);
  const info = overridden ? { ...DELOAD(), } : block.weeks[week];
  return { started, absWeek: abs, cycle, week: started ? week : 0, total, info: started ? info : block.weeks[0], finished, overridden };
}

/** Settimana attiva (null se il blocco non è iniziato o è finito). */
export function activeWeek(program: Program | undefined | null, date = new Date()): (BlockPosition & { programId: string }) | null {
  if (!program?.block) return null;
  const pos = blockPosition(program.block, date);
  if (!pos.started || pos.finished) return null;
  return { ...pos, programId: program.id };
}

export function sessionBlockInfo(program: Program, pos: BlockPosition): SessionBlockInfo {
  return { programId: program.id, model: program.block!.model, cycle: pos.cycle, week: pos.week, weeks: pos.total, kind: pos.info.kind, rir: pos.info.rir, load: pos.info.load };
}

/** Serie della seduta per la settimana: serie extra e riduzione dello scarico (mai sotto 1). */
export function weekSets(sets: number, week: BlockWeek | null | undefined, exerciseId: string): number {
  if (!week) return sets;
  const e = getExercise(exerciseId);
  const timed = e?.kind === 'mobility';
  let n = sets + (timed ? 0 : week.extraSets);
  if (week.setsFactor !== 1) n = Math.round(n * week.setsFactor);
  return Math.max(1, Math.min(12, n));
}

/** Cardio nello scarico: tre quarti della durata, nessun intervallo in più. */
export function weekCardio(plan: CardioPlan, week: BlockWeek | null | undefined): CardioPlan {
  if (!week || week.kind !== 'deload') return plan;
  if (plan.mode === 'intervals' && plan.repeat && plan.repeat > 2) return { ...plan, repeat: Math.max(2, Math.round(plan.repeat * 0.67)), progression: null };
  if (plan.mode === 'steady') return { ...plan, durationMin: Math.max(10, Math.round((plan.durationMin * 0.75) / 5) * 5), progression: null };
  return { ...plan, progression: null };
}

/** Anteprima di un esercizio della scheda nella settimana scelta. */
export function weekPrescription(te: TemplateExercise, week: BlockWeek | null | undefined) {
  const e = getExercise(te.exerciseId);
  let { repMin, repMax } = te;
  if (week?.repShift && e?.tracking === 'weight_reps' && e.mechanic === 'compound') {
    repMin = Math.max(2, repMin + week.repShift);
    repMax = Math.max(repMin, repMax + week.repShift);
  }
  return { sets: weekSets(te.sets, week, te.exerciseId), repMin, repMax };
}

/** Ripete la settimana corrente (sposta la partenza di una settimana). */
export function repeatCurrentWeek(block: ProgramBlock): ProgramBlock {
  return { ...block, startDate: dayKey(addDays(fromKey(block.startDate), 7)), deloadOverrides: (block.deloadOverrides ?? []).map((x) => x + 1) };
}

/** Trasforma la settimana corrente in scarico (anticipa lo scarico) oppure annulla la scelta. */
export function toggleDeloadNow(block: ProgramBlock, date = new Date()): ProgramBlock {
  const pos = blockPosition(block, date);
  const cur = new Set(block.deloadOverrides ?? []);
  if (cur.has(pos.absWeek)) cur.delete(pos.absWeek); else cur.add(pos.absWeek);
  return { ...block, deloadOverrides: [...cur].sort((a, b) => a - b) };
}

/** Ricomincia il blocco dalla settimana corrente. */
export function restartBlock(block: ProgramBlock, date = new Date()): ProgramBlock {
  return { ...block, startDate: mondayOf(date), deloadOverrides: [] };
}

/** Intensità relativa della settimana per i grafici (volume × sforzo), da 0 a 1. */
export function weekLoadIndex(w: BlockWeek, baseSets = 3): number {
  const vol = ((baseSets + w.extraSets) * w.setsFactor) / (baseSets + 1);
  const eff = (5 - Math.min(5, w.rir)) / 5;
  return Math.max(0.12, Math.min(1, vol * 0.6 + eff * 0.4 + (w.repShift < 0 ? 0.08 : 0)));
}

/**
 * Segnali di fatica: esercizi fermi (stesso carico e nessuna ripetizione in più per 3 sedute)
 * o in calo. Con almeno 2 esercizi in stallo conviene anticipare lo scarico.
 */
export function fatigueSignals(sessions: WorkoutSession[], exerciseIds: string[]): { stalled: string[]; suggestDeload: boolean } {
  const stalled: string[] = [];
  for (const id of Array.from(new Set(exerciseIds))) {
    const e = getExercise(id);
    if (e?.tracking !== 'weight_reps') continue;
    const past = pastLogs(sessions, id).slice(0, 3);
    if (past.length < 3) continue;
    const pts = past.map((p) => {
      const ws = p.log.sets.filter((s) => s.done && s.type !== 'warmup');
      return { w: Math.max(0, ...ws.map((s) => s.weight ?? 0)), r: ws.reduce((a, s) => a + (s.reps ?? 0), 0) };
    });
    const [now, b1, b2] = pts;
    if (now.w > 0 && now.w <= b1.w && now.w <= b2.w && now.r <= b1.r && now.r <= b2.r) stalled.push(id);
  }
  // solo se l'ultimo scarico non è recente
  const recentDeload = completedSessions(sessions).some((s) => s.block?.kind === 'deload' && new Date(s.startedAt) >= addDays(new Date(), -21));
  return { stalled, suggestDeload: stalled.length >= 2 && !recentDeload };
}

/** "Settimana 3 di 6 · Accumulo" */
export function weekTitle(pos: Pick<BlockPosition, 'week' | 'total' | 'info' | 'cycle'>, withCycle = false) {
  return `${withCycle && pos.cycle > 1 ? `Ciclo ${pos.cycle} · ` : ''}Settimana ${pos.week + 1} di ${pos.total} · ${WEEK_LABEL[pos.info.kind]}`;
}

/** Riga breve dei parametri della settimana: "RIR 2 · +1 serie · ripetizioni −2". */
export function weekParams(w: BlockWeek): string {
  const parts = [`${w.rir} ${w.rir === 1 ? 'ripetizione' : 'ripetizioni'} in riserva`];
  if (w.extraSets) parts.push(`${w.extraSets > 0 ? '+' : ''}${w.extraSets} ${Math.abs(w.extraSets) === 1 ? 'serie' : 'serie'} per esercizio`);
  if (w.setsFactor < 1) parts.push(`${Math.round((1 - w.setsFactor) * 100)}% di serie in meno`);
  if (w.load < 1) parts.push(`carichi −${Math.round((1 - w.load) * 100)}%`);
  if (w.repShift) parts.push(`ripetizioni ${w.repShift > 0 ? '+' : '−'}${Math.abs(w.repShift)} sui multiarticolari`);
  return parts.join(' · ');
}
