/** Record personali e prossimo obiettivo di un esercizio (scheda "I tuoi progressi"). */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import type { Exercise } from '@/data/exercises';
import type { Profile, Units, WorkoutSession, WorkoutTemplate } from '@/lib/types';
import { RECORD_LABEL, RM_REPS, recordBook, recordDeltaText, recordTimeline, recordValueText } from '@/lib/records';
import { planNextLoad, targetDelta } from '@/lib/progression';
import { fmtW, formatShortDate, addDays } from '@/lib/util';

export function ExerciseRecords({ e, sessions, units, templates, profile }: { e: Exercise; sessions: WorkoutSession[]; units: Units; templates: WorkoutTemplate[]; profile?: Profile }) {
  const [all, setAll] = useState(false);
  const fw = (kg: number) => fmtW(kg, units);
  const book = useMemo(() => recordBook(sessions, e.id), [sessions, e.id]);
  const timeline = useMemo(() => recordTimeline(sessions, e.id).reverse(), [sessions, e.id]);
  // range della scheda che contiene l'esercizio (altrimenti quello dell'ultima esecuzione)
  const te = templates.flatMap((t) => t.exercises).find((x) => x.exerciseId === e.id && !x.cardio);
  const next = useMemo(() => {
    if (!book.sessions) return null;
    const last = [...sessions].filter((s) => s.status === 'completed').sort((a, b) => b.startedAt.localeCompare(a.startedAt)).flatMap((s) => s.exercises).find((x) => x.exerciseId === e.id);
    return planNextLoad({ exerciseId: e.id, sessions, repMin: te?.repMin ?? last?.repMin ?? 8, repMax: te?.repMax ?? last?.repMax ?? 12, units, profile, templateWeight: te?.targetWeight });
  }, [sessions, e.id, te?.repMin, te?.repMax, units, profile, book.sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!book.sessions) return null;
  const weighted = e.tracking === 'weight_reps';
  const recent = addDays(new Date(), -30).toISOString();
  const nRecords = timeline.filter((x) => !x.baseline).length;
  const delta = next ? targetDelta(next, units) : null;

  return (
    <div className="stack-sm">
      {next && (
        <div className="card stack-sm" style={{ padding: 14 }}>
          <div className="row" style={{ gap: 8 }}><Target size={17} className="accent" /><b className="grow">Prossima seduta</b>{delta && <span className={`pill ${next.kind === 'increase' ? 'success' : next.kind === 'decrease' ? 'orange' : ''}`}>{delta}</span>}</div>
          <div className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24 }}>
            {weighted && next.weight != null ? `${fw(next.weight)} × ${next.aimReps ?? `${next.repMin}–${next.repMax}`}` : next.aimReps ? `${next.aimReps} ${e.tracking === 'time' ? 's' : 'rip.'}` : `${next.repMin}–${next.repMax} ${e.tracking === 'time' ? 's' : 'rip.'}`}
            {next.rir != null && <span className="small muted" style={{ fontFamily: 'inherit', fontWeight: 600 }}> · {next.rir} in riserva</span>}
          </div>
          <p className="small text-2" style={{ margin: 0 }}>{next.reason}</p>
        </div>
      )}

      <div className="rec-hero">
        {weighted && book.weight && <Tile l="Carico massimo" v={fw(book.weight.value)} s={`× ${book.weight.reps} · ${formatShortDate(book.weight.date)}`} />}
        {weighted && book.e1rm && <Tile l="1RM stimato" v={fw(book.e1rm.value)} s={`Epley · ${formatShortDate(book.e1rm.date)}`} />}
        {!weighted && book.reps && <Tile l="Ripetizioni massime" v={String(book.reps.value)} s={formatShortDate(book.reps.date)} />}
        {!weighted && book.time && <Tile l="Tempo massimo" v={`${book.time.value} s`} s={formatShortDate(book.time.date)} />}
        {weighted && book.volume && <Tile l="Volume in una seduta" v={fw(book.volume.value)} s={formatShortDate(book.volume.date)} />}
        <Tile l="Record battuti" v={String(nRecords)} s={`in ${book.sessions} ${book.sessions === 1 ? 'seduta' : 'sedute'}`} />
      </div>

      {weighted && (
        <div className="card stack-sm" style={{ padding: 14 }}>
          <div className="card-title" style={{ margin: 0 }}><h3 style={{ fontSize: 15 }}>Massimali per ripetizioni</h3><span className="tiny muted">carico migliore</span></div>
          <div className="rm-table">
            {RM_REPS.map((r) => {
              const x = book.rm[r];
              return (
                <div key={r} className={`rm-cell ${x ? '' : 'empty'} ${x && x.date >= recent ? 'fresh' : ''}`} title={x ? `${fw(x.value)} per ${x.reps} ripetizioni, ${formatShortDate(x.date)}` : 'Nessuna serie'}>
                  <span className="k">{r}RM</span><span className="v">{x ? fw(x.value).replace(` ${units}`, '') : '–'}</span>
                </div>
              );
            })}
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>Carico più alto sollevato per almeno quel numero di ripetizioni ({units}). In evidenza i record degli ultimi 30 giorni.</p>
        </div>
      )}

      {timeline.length > 0 && (
        <div className="card stack-sm" style={{ padding: 14 }}>
          <div className="card-title" style={{ margin: 0 }}><h3 style={{ fontSize: 15 }}><Trophy size={16} color="#ffb020" /> Storico dei record</h3></div>
          <ol className="rec-tl">
            {(all ? timeline : timeline.slice(0, 6)).map((r) => (
              <li key={r.sessionId} className={r.baseline ? 'base' : ''}>
                <div className="rt-top"><span className="rt-v">{r.baseline ? `Punto di partenza: ${recordValueText(r, fw)}` : recordValueText(r, fw)}</span>{!r.baseline && recordDeltaText(r, fw) && <span className="rt-d">{recordDeltaText(r, fw)}</span>}</div>
                <div className="tiny muted"><Link to={`/session/${r.sessionId}`}>{formatShortDate(r.date)} · {r.name}</Link>{r.also?.length ? ` · anche ${r.also.map((a) => RECORD_LABEL[a.kind].toLowerCase()).join(', ')}` : ''}</div>
              </li>
            ))}
          </ol>
          {timeline.length > 6 && <button className="btn sm ghost" onClick={() => setAll(!all)}>{all ? <><ChevronUp size={15} /> Mostra meno</> : <><ChevronDown size={15} /> Tutti i {timeline.length}</>}</button>}
        </div>
      )}
    </div>
  );
}

function Tile({ l, v, s }: { l: string; v: string; s?: string }) {
  return <div className="stat-tile"><div className="stat"><span className="l">{l}</span><span className="v">{v}</span>{s && <span className="tiny muted">{s}</span>}</div></div>;
}
