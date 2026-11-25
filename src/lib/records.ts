/**
 * Record personali: massimali per esercizio, record per numero di ripetizioni, storico dei record
 * e rilevamento in tempo reale durante l'allenamento.
 *
 * Regole:
 * - contano solo le serie completate e allenanti (le serie di riscaldamento sono escluse);
 * - la prima volta che si esegue un esercizio fissa il punto di partenza e non è un record;
 * - il 1RM è stimato con la formula di Epley, affidabile fino a circa 12 ripetizioni.
 */
import { getExercise } from '@/data/exercises';
import type { ExerciseLog, PRRecord, RecordKind, SetLog, WorkoutSession } from './types';
import { completedSessions, e1rm } from './stats';
import { round } from './util';

/** Ripetizioni coperte dalla tabella dei massimali per ripetizioni. */
export const RM_REPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15] as const;

export interface RecordEntry { value: number; reps?: number; date: string; sessionId: string }

export interface RecordBook {
  exerciseId: string;
  /** carico più alto sollevato (con le ripetizioni fatte) */
  weight?: RecordEntry;
  /** miglior 1RM stimato */
  e1rm?: RecordEntry;
  /** carico migliore per almeno N ripetizioni (N di RM_REPS) */
  rm: Partial<Record<number, RecordEntry>>;
  /** ripetizioni massime in una serie (esercizi a corpo libero) */
  reps?: RecordEntry;
  /** tenuta più lunga in secondi (esercizi a tempo) */
  time?: RecordEntry;
  /** volume più alto in una seduta (kg × ripetizioni) */
  volume?: RecordEntry;
  /** sedute in cui l'esercizio è stato svolto */
  sessions: number;
}

const EPS = 1e-6;

export const isWorkingSet = (s: SetLog) => s.done && s.type !== 'warmup';
export const workingSets = (ex: Pick<ExerciseLog, 'sets'>) => ex.sets.filter(isWorkingSet);

export function emptyBook(exerciseId: string): RecordBook { return { exerciseId, rm: {}, sessions: 0 }; }

function tracking(exerciseId: string) { return getExercise(exerciseId)?.tracking ?? 'weight_reps'; }

/** Chiave della tabella RM a cui appartiene una serie da r ripetizioni (la più alta ≤ r). */
function rmKeys(r: number): number[] { return RM_REPS.filter((k) => k <= r); }

export interface RecordHit { kind: RecordKind; value: number; reps?: number; previous: number | null }

/**
 * Applica una serie al libro dei record e restituisce i record battuti.
 * `baseline` = nessuno storico precedente: aggiorna senza segnalare record.
 */
function applySet(book: RecordBook, st: SetLog, date: string, sessionId: string, track: string, baseline: boolean): RecordHit[] {
  const hits: RecordHit[] = [];
  const w = st.weight ?? 0, r = st.reps ?? 0;
  if (r <= 0) return hits;
  const set = (k: 'weight' | 'e1rm' | 'reps' | 'time', v: number, reps?: number) => {
    const prev = book[k];
    if (!prev || v > prev.value + EPS) {
      if (!baseline && prev) hits.push({ kind: k, value: v, reps, previous: prev.value });
      book[k] = { value: v, reps, date, sessionId };
    }
  };
  if (track === 'weight_reps') {
    if (w <= 0) return hits;
    set('weight', w, r);
    set('e1rm', round(e1rm(w, r), 1));
    for (const k of rmKeys(r)) {
      const prev = book.rm[k];
      if (!prev || w > prev.value + EPS) {
        // anche la prima volta a quel numero di ripetizioni è un record (se l'esercizio ha già uno storico)
        if (!baseline) hits.push({ kind: 'rm', value: w, reps: k, previous: prev?.value ?? null });
        book.rm[k] = { value: w, reps: r, date, sessionId };
      }
    }
  } else if (track === 'time') set('time', r);
  else set('reps', r, undefined);
  return hits;
}

/** Libro dei record di un esercizio, opzionalmente solo con le sedute iniziate prima di `beforeIso`. */
export function recordBook(sessions: WorkoutSession[], exerciseId: string, opts: { beforeIso?: string; excludeId?: string } = {}): RecordBook {
  const book = emptyBook(exerciseId);
  const track = tracking(exerciseId);
  for (const s of completedSessions(sessions)) {
    if (opts.excludeId && s.id === opts.excludeId) continue;
    if (opts.beforeIso && s.startedAt >= opts.beforeIso) continue;
    const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap(workingSets);
    if (!sets.length) continue;
    book.sessions++;
    for (const st of sets) applySet(book, st, s.startedAt, s.id, track, true);
    const vol = sets.reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0);
    if (track === 'weight_reps' && vol > 0 && (!book.volume || vol > book.volume.value)) book.volume = { value: vol, date: s.startedAt, sessionId: s.id };
  }
  return book;
}

const PRIORITY: RecordKind[] = ['weight', 'e1rm', 'rm', 'reps', 'time', 'volume'];

/** Riduce una lista di record a quello principale (in ordine di importanza) più gli altri. */
function primaryOf(hits: RecordHit[]): { main: RecordHit; also: RecordHit[] } | null {
  if (!hits.length) return null;
  // per i record per ripetizioni teniamo solo il più significativo (più ripetizioni) per carico
  const best = new Map<string, RecordHit>();
  for (const h of hits) {
    const key = h.kind === 'rm' ? 'rm' : h.kind;
    const cur = best.get(key);
    if (!cur || h.value > cur.value || (h.kind === 'rm' && h.value === cur.value && (h.reps ?? 0) > (cur.reps ?? 0))) best.set(key, h);
  }
  const list = [...best.values()].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
  return { main: list[0], also: list.slice(1) };
}

/**
 * Record battuti da una seduta rispetto allo storico precedente: uno per esercizio (il più importante),
 * con gli altri record dello stesso esercizio in `also`.
 */
export function sessionRecords(sessions: WorkoutSession[], session: WorkoutSession): PRRecord[] {
  const out: PRRecord[] = [];
  const ids = Array.from(new Set(session.exercises.filter((e) => !e.cardio).map((e) => e.exerciseId)));
  for (const id of ids) {
    const book = recordBook(sessions, id, { beforeIso: session.startedAt, excludeId: session.id });
    if (!book.sessions) continue; // la prima volta non è un record
    const track = tracking(id);
    const sets = session.exercises.filter((e) => e.exerciseId === id).flatMap(workingSets);
    if (!sets.length) continue;
    const hits: RecordHit[] = [];
    for (const st of sets) hits.push(...applySet(book, st, session.startedAt, session.id, track, false));
    if (track === 'weight_reps') {
      const vol = sets.reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0);
      if (book.volume && vol > book.volume.value + EPS) hits.push({ kind: 'volume', value: vol, previous: book.volume.value });
    }
    // per carico/1RM teniamo il valore finale (il migliore della seduta) con il precedente storico
    const merged = mergeHits(hits);
    const p = primaryOf(merged);
    if (!p) continue;
    out.push({
      exerciseId: id, kind: p.main.kind, value: p.main.value, reps: p.main.reps, previous: p.main.previous, date: session.startedAt, sessionId: session.id,
      also: p.also.length ? p.also.map((h) => ({ kind: h.kind, value: h.value, reps: h.reps, previous: h.previous })) : undefined,
    });
  }
  return out;
}

/** Più serie della stessa seduta possono battere lo stesso record: tiene il valore migliore e il precedente storico. */
function mergeHits(hits: RecordHit[]): RecordHit[] {
  const m = new Map<string, RecordHit>();
  for (const h of hits) {
    const key = h.kind === 'rm' ? `rm${h.reps}` : h.kind;
    const cur = m.get(key);
    if (!cur) m.set(key, { ...h });
    else m.set(key, { ...h, value: Math.max(cur.value, h.value), previous: cur.previous });
  }
  return [...m.values()];
}

/**
 * Rilevamento dal vivo: record battuti da una serie appena completata, considerando lo storico
 * (`before`) e le serie già completate nella seduta in corso.
 */
export function liveSetRecords(before: RecordBook, earlier: SetLog[], st: SetLog): RecordHit[] {
  if (!before.sessions || !isWorkingSet(st)) return [];
  const track = tracking(before.exerciseId);
  const book: RecordBook = { ...before, rm: { ...before.rm } };
  for (const x of earlier) if (isWorkingSet(x) && x.uid !== st.uid) applySet(book, x, '', '', track, true);
  const prevBook: RecordBook = { ...book, rm: { ...book.rm } };
  const hits = applySet(book, st, '', '', track, false);
  // il precedente mostrato è quello storico, non quello di una serie appena fatta
  return hits.map((h) => {
    const hist = h.kind === 'rm' ? before.rm[h.reps!]?.value : (before as any)[h.kind]?.value;
    return { ...h, previous: hist ?? (h.kind === 'rm' ? prevBook.rm[h.reps!]?.value : (prevBook as any)[h.kind]?.value) ?? null };
  });
}

/** Il record più importante di una serie (per il badge nella tabella). */
export function mainHit(hits: RecordHit[]): RecordHit | null { return primaryOf(hits)?.main ?? null; }

export interface RecordEvent extends PRRecord { name: string; baseline?: boolean }

/** Cronologia dei record di un esercizio (dalla più vecchia), con il punto di partenza come primo evento. */
export function recordTimeline(sessions: WorkoutSession[], exerciseId: string): RecordEvent[] {
  const out: RecordEvent[] = [];
  const done = completedSessions(sessions);
  const track = tracking(exerciseId);
  const book = emptyBook(exerciseId);
  for (const s of done) {
    const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap(workingSets);
    if (!sets.length) continue;
    const baseline = book.sessions === 0;
    const prevVol = book.volume?.value;
    const hits: RecordHit[] = [];
    for (const st of sets) hits.push(...applySet(book, st, s.startedAt, s.id, track, baseline));
    book.sessions++;
    const vol = sets.reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0);
    if (track === 'weight_reps' && vol > 0 && (!book.volume || vol > book.volume.value)) {
      if (!baseline && prevVol != null) hits.push({ kind: 'volume', value: vol, previous: prevVol });
      book.volume = { value: vol, date: s.startedAt, sessionId: s.id };
    }
    if (baseline) {
      const main: RecordKind = track === 'weight_reps' ? 'weight' : track === 'time' ? 'time' : 'reps';
      const e = book[main];
      if (e) out.push({ exerciseId, kind: main, value: e.value, reps: e.reps, date: s.startedAt, sessionId: s.id, name: s.name, baseline: true, previous: null });
      continue;
    }
    const p = primaryOf(mergeHits(hits));
    if (p) out.push({ exerciseId, kind: p.main.kind, value: p.main.value, reps: p.main.reps, previous: p.main.previous, date: s.startedAt, sessionId: s.id, name: s.name, also: p.also.length ? p.also : undefined });
  }
  return out;
}

/** Tutti i record di tutte le sedute (dal più recente), con il nome della seduta. */
export function recentRecords(sessions: WorkoutSession[], limit = 30): (PRRecord & { name: string })[] {
  return completedSessions(sessions).flatMap((s) => (s.prs ?? []).map((p) => ({ ...p, name: s.name }))).reverse().slice(0, limit);
}

/** Numero di record per mese (ultimi n mesi), per il grafico della sezione Record. */
export function recordsPerMonth(sessions: WorkoutSession[], months = 6) {
  const now = new Date();
  const out: { label: string; count: number }[] = [];
  const done = completedSessions(sessions);
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const n = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    out.push({ label: m.toLocaleDateString('it-IT', { month: 'short' }), count: done.filter((s) => { const d = new Date(s.startedAt); return d >= m && d < n; }).reduce((a, s) => a + (s.prs?.length ?? 0), 0) });
  }
  return out;
}

// ---------------- Testi ----------------
type Fmt = (kg: number) => string;

export const RECORD_LABEL: Record<RecordKind, string> = {
  weight: 'Carico massimo', e1rm: '1RM stimato', rm: 'Record per ripetizioni', reps: 'Ripetizioni massime', time: 'Tempo massimo', volume: 'Volume in una seduta',
};

/** "100 kg × 5", "1RM stimato 112,5 kg", "5RM 95 kg", "18 ripetizioni", "60 s", "volume 4.200 kg". */
export function recordValueText(r: { kind: RecordKind; value: number; reps?: number }, fw: Fmt): string {
  switch (r.kind) {
    case 'weight': return r.reps ? `${fw(r.value)} × ${r.reps}` : fw(r.value);
    case 'e1rm': return `1RM stimato ${fw(r.value)}`;
    case 'rm': return `${r.reps}RM ${fw(r.value)}`;
    case 'reps': return `${r.value} ripetizioni`;
    case 'time': return `${r.value} s`;
    case 'volume': return `volume ${fw(r.value)}`;
  }
}

/** Miglioramento rispetto al record precedente: "+2,5 kg", "+3 rip.", "+10 s". */
export function recordDeltaText(r: { kind: RecordKind; value: number; previous?: number | null }, fw: Fmt): string | null {
  if (r.previous == null) return null;
  const d = r.value - r.previous;
  if (d <= 0) return null;
  if (r.kind === 'reps') return `+${Math.round(d)} rip.`;
  if (r.kind === 'time') return `+${Math.round(d)} s`;
  return `+${fw(d)}`;
}
