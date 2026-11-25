/** Componenti dei programmi a più settimane: timeline delle settimane, scelta del modello, anteprima. */
import { CalendarRange, Check, Star } from 'lucide-react';
import type { BlockModelId, BlockWeek, ProgramBlock, WorkoutTemplate } from '@/lib/types';
import { BLOCK_MODELS, WEEK_LABEL, blockPosition, weekLoadIndex, weekParams, weekPrescription, weekTitle } from '@/lib/periodization';
import { getExercise } from '@/data/exercises';
import { addDays, formatShortDate, fromKey } from '@/lib/util';

/** Barre delle settimane del blocco: altezza = carico di lavoro, colore = fase. */
export function BlockTimeline({ weeks, current, selected, onSelect, startDate, overrides }: {
  weeks: BlockWeek[]; current?: number | null; selected?: number | null; onSelect?: (i: number) => void; startDate?: string; overrides?: number[];
}) {
  return (
    <div className="stack-sm">
      <div className="bweeks" role={onSelect ? 'tablist' : 'list'} aria-label="Settimane del programma">
        {weeks.map((w, i) => {
          const k = overrides?.includes(i) ? 'deload' : w.kind;
          const cls = `bweek k-${k} ${current === i ? 'now' : ''} ${current != null && i < current ? 'past' : ''} ${selected === i ? 'sel' : ''}`;
          const label = `Settimana ${i + 1}: ${WEEK_LABEL[k]}${startDate ? `, dal ${formatShortDate(addDays(fromKey(startDate), i * 7))}` : ''}${current === i ? ' (in corso)' : ''}`;
          const inner = (
            <>
              <span className="bar-wrap"><span className="bar" style={{ height: `${Math.round(weekLoadIndex(k === 'deload' && w.kind !== 'deload' ? { ...w, setsFactor: 0.6, rir: 4 } : w) * 100)}%` }} /></span>
              <span className="wn">{current === i ? 'Ora' : `S${i + 1}`}</span>
            </>
          );
          return onSelect
            ? <button key={i} type="button" role="tab" aria-selected={selected === i} className={cls} onClick={() => onSelect(i)} aria-label={label}>{inner}</button>
            : <span key={i} role="listitem" className={cls} aria-label={label}>{inner}</span>;
        })}
      </div>
      <div className="block-legend" aria-hidden>
        <span><i style={{ background: 'color-mix(in srgb, var(--c-training) 38%, var(--surface-3))' }} />Accumulo</span>
        <span><i style={{ background: 'color-mix(in srgb, var(--orange) 55%, var(--surface-3))' }} />Intensità alta</span>
        <span><i style={{ background: 'color-mix(in srgb, var(--blue) 45%, var(--surface-3))' }} />Scarico</span>
      </div>
    </div>
  );
}

/** Riquadro con la settimana in corso (usato nella pagina Allenamento). */
export function BlockNow({ block, compact }: { block: ProgramBlock; compact?: boolean }) {
  const pos = blockPosition(block);
  const model = BLOCK_MODELS[block.model];
  if (!pos.started) return <div className="block-now"><CalendarRange size={16} /><span className="grow small">{model.name}: inizia {formatShortDate(block.startDate)}</span></div>;
  if (pos.finished) return <div className="block-now"><CalendarRange size={16} /><span className="grow small">{model.name} completato. Riparti dal programma per un nuovo ciclo.</span></div>;
  return (
    <div className="stack-sm" style={{ marginBottom: 10 }}>
      <div className="block-now">
        <span className={`pill ${pos.info.kind === 'deload' ? 'blue' : pos.info.kind === 'accumulation' || pos.info.kind === 'base' ? 'accent' : 'orange'}`}>{WEEK_LABEL[pos.info.kind]}</span>
        <span className="grow small" style={{ minWidth: 0 }}><b>{weekTitle(pos, true).replace(` · ${WEEK_LABEL[pos.info.kind]}`, '')}</b>{!compact && <span className="tiny muted" style={{ display: 'block' }}>{weekParams(pos.info)}</span>}</span>
      </div>
      {!compact && <BlockTimeline weeks={block.weeks} current={pos.week} overrides={(block.deloadOverrides ?? []).filter((a) => Math.floor(a / pos.total) === pos.cycle - 1).map((a) => a % pos.total)} />}
    </div>
  );
}

/** Scelta del modello di periodizzazione (con opzione "nessuna"). */
export function ModelPicker({ value, onChange, recommended }: { value: BlockModelId | null; onChange: (m: BlockModelId | null) => void; recommended: BlockModelId }) {
  const ids = Object.keys(BLOCK_MODELS) as BlockModelId[];
  return (
    <div className="model-grid" role="radiogroup" aria-label="Tipo di programma">
      {ids.map((id) => {
        const m = BLOCK_MODELS[id];
        return (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`model-opt ${value === id ? 'on' : ''}`} onClick={() => onChange(id)}>
            <span className="mo-head">{value === id ? <Check size={16} className="accent" /> : <CalendarRange size={16} />}<span className="grow">{m.name}</span>{id === recommended && <span className="pill accent"><Star size={11} /> Consigliato</span>}</span>
            <span className="mo-desc">{m.desc}</span>
            <span className="tiny muted">{m.who}</span>
          </button>
        );
      })}
      <button type="button" role="radio" aria-checked={value === null} className={`model-opt ${value === null ? 'on' : ''}`} onClick={() => onChange(null)}>
        <span className="mo-head">{value === null ? <Check size={16} className="accent" /> : <CalendarRange size={16} />}<span className="grow">Solo settimana tipo</span></span>
        <span className="mo-desc">Le stesse schede ogni settimana, senza fasi né scarichi programmati. La progressione dei carichi resta attiva.</span>
      </button>
    </div>
  );
}

/** Anteprima delle schede nella settimana scelta (serie × ripetizioni, RIR). */
export function WeekPreview({ week, templates, index }: { week: BlockWeek; templates: WorkoutTemplate[]; index: number }) {
  return (
    <div className="stack-sm">
      <div className="small"><b>Settimana {index + 1} · {WEEK_LABEL[week.kind]}</b><div className="tiny muted">{weekParams(week)}</div></div>
      {templates.map((t) => (
        <div key={t.id} className="stat-tile" style={{ padding: 10 }}>
          <b className="small">{t.name}</b>
          <div className="stack-sm" style={{ marginTop: 6, gap: 4 }}>
            {t.exercises.filter((te) => !te.cardio).slice(0, 8).map((te) => {
              const e = getExercise(te.exerciseId);
              const p = weekPrescription(te, week);
              const changed = p.sets !== te.sets || p.repMin !== te.repMin;
              return (
                <div key={te.uid} className="row-between tiny" style={{ gap: 8 }}>
                  <span className="ellipsis grow">{e?.name}</span>
                  <span className="num" style={{ fontWeight: 700, color: changed ? 'var(--text)' : 'var(--text-2)' }}>{p.sets} × {p.repMin}{p.repMax !== p.repMin ? `–${p.repMax}` : ''}{e?.tracking === 'time' ? ' s' : ''}</span>
                </div>
              );
            })}
            {t.exercises.some((te) => te.cardio) && <div className="tiny muted">+ cardio{week.kind === 'deload' ? ' più breve' : ''}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
