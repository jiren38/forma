import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Info, Trash2, Plus, Pencil, CalendarRange, RotateCcw, BatteryLow, Repeat } from 'lucide-react';
import { useDoc, store } from '@/db/store';
import { activateProgram, saveProgram, saveTemplate, useProfile, useSessions, useTemplates } from '@/app/data';
import { PageHeader, Empty, Confirm, Switch, Sheet, useToast } from '@/components/ui';
import { DAY_LONG } from '@/lib/labels';
import { addDays, dayKey, formatShortDate, fromKey, uid } from '@/lib/util';
import type { BlockModelId, Program, WorkoutTemplate } from '@/lib/types';
import { estimateMinutes } from './WorkoutsPage';
import { BLOCK_MODELS, WEEK_HINT, WEEK_LABEL, blockPosition, createBlock, fatigueSignals, mondayOf, recommendedModel, repeatCurrentWeek, restartBlock, toggleDeloadNow, weekParams, weekTitle } from '@/lib/periodization';
import { BlockTimeline, ModelPicker, WeekPreview } from './block-ui';
import { getExercise } from '@/data/exercises';

export default function ProgramEditor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const p = useDoc<Program>('programs', id);
  const templates = useTemplates().slice().sort((a, b) => a.name.localeCompare(b.name));
  const [del, setDel] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [selWeek, setSelWeek] = useState<number | null>(null);
  const profile = useProfile();
  const sessions = useSessions();

  if (!p) return <div className="page"><PageHeader title="Programma" back="/workouts" /><Empty icon={<Info />} title="Programma non trovato" action={<Link to="/workouts" className="btn">Torna agli allenamenti</Link>} /></div>;
  const update = (x: Partial<Program>) => saveProgram({ ...p, ...x });
  const setDay = (i: number, tid: string | null) => update({ schedule: p.schedule.map((v, j) => (j === i ? tid : v)) });

  async function newTemplateFor(i: number) {
    const now = new Date().toISOString();
    const t: WorkoutTemplate = { id: uid('tpl_'), name: `Scheda ${DAY_LONG[i]}`, exercises: [], source: 'manual', programId: p!.id, createdAt: now, updatedAt: now };
    await saveTemplate(t);
    await setDay(i, t.id);
    nav(`/workouts/template/${t.id}?new=1`);
  }

  const days = p.schedule.filter(Boolean).length;
  const block = p.block ?? null;
  const pos = block ? blockPosition(block) : null;
  const progTemplates = Array.from(new Set(p.schedule.filter(Boolean) as string[])).map((tid) => templates.find((t) => t.id === tid)).filter(Boolean) as WorkoutTemplate[];
  const fatigue = block && pos?.started && !pos.finished && pos.info.kind !== 'deload'
    ? fatigueSignals(sessions, progTemplates.flatMap((t) => t.exercises.filter((e) => !e.cardio).map((e) => e.exerciseId))) : null;
  const rec = recommendedModel(profile ?? { level: 'intermediate', goals: [] });
  const shownWeek = selWeek ?? (pos?.started && !pos.finished ? pos.week : 0);
  function setModel(m: BlockModelId | null) {
    setModelOpen(false);
    setSelWeek(null);
    if (!m) { update({ block: null }); toast('Periodizzazione rimossa: le schede si ripetono uguali ogni settimana'); return; }
    update({ block: createBlock(m, block?.startDate ?? mondayOf(), block?.repeat ?? true) });
    toast(`${BLOCK_MODELS[m].name} impostato`);
  }

  return (
    <div className="page stack">
      <PageHeader title="Programma settimanale" back right={<button className="icon-btn ghost" onClick={() => setDel(true)} aria-label="Elimina programma"><Trash2 size={19} /></button>} />
      <div className="card stack-sm">
        <div className="field"><label htmlFor="pname">Nome</label><input id="pname" className="input" value={p.name} maxLength={60} onChange={(e) => update({ name: e.target.value })} /></div>
        <div className="field"><label htmlFor="pdesc">Descrizione</label><textarea id="pdesc" className="textarea" style={{ minHeight: 56 }} value={p.description ?? ''} onChange={(e) => update({ description: e.target.value })} /></div>
        <div className="row-between">
          <div><b>Programma attivo</b><div className="tiny muted">Il programma attivo decide l’allenamento del giorno in Home</div></div>
          <Switch label="Programma attivo" checked={p.active} onChange={async (v) => { if (v) { await activateProgram(p.id); toast('Programma attivato'); } else await update({ active: false }); }} />
        </div>
      </div>

      <section className="card stack-sm" aria-label="Programma a più settimane">
        <div className="card-title"><h3><CalendarRange size={18} /> Programma a più settimane</h3>{block && <button className="btn sm soft" onClick={() => setModelOpen(true)}>Cambia</button>}</div>
        {!block ? (
          <>
            <p className="small text-2">Trasforma la settimana tipo in un ciclo di più settimane: volume e intensità crescono gradualmente e una settimana di scarico ti fa recuperare. Le schede non cambiano: l’app adatta serie, ripetizioni e carichi a ogni seduta.</p>
            <button className="btn primary" onClick={() => setModelOpen(true)}><CalendarRange size={17} /> Imposta un ciclo</button>
          </>
        ) : (
          <>
            <div className="small"><b>{BLOCK_MODELS[block.model].name}</b> · {BLOCK_MODELS[block.model].short}</div>
            {pos && (pos.started
              ? pos.finished
                ? <div className="banner"><Info size={18} /><span>Ciclo completato il {formatShortDate(addDays(fromKey(block.startDate), pos.total * 7 - 1))}. Riparti per un nuovo ciclo con i carichi aggiornati.</span></div>
                : <div className="block-now"><span className={`pill ${pos.info.kind === 'deload' ? 'blue' : 'accent'}`}>{pos.overridden ? 'Scarico anticipato' : WEEK_LABEL[pos.info.kind]}</span><span className="small"><b>{weekTitle(pos, true).replace(` · ${WEEK_LABEL[pos.info.kind]}`, '')}</b></span></div>
              : <div className="block-now"><span className="pill">In arrivo</span><span className="small">Inizia lunedì {formatShortDate(block.startDate)}</span></div>)}
            <BlockTimeline weeks={block.weeks} startDate={pos?.started && !pos.finished ? dayKey(addDays(fromKey(block.startDate), (pos.cycle - 1) * pos.total * 7)) : block.startDate}
              current={pos?.started && !pos.finished ? pos.week : null} selected={shownWeek} onSelect={setSelWeek}
              overrides={pos ? (block.deloadOverrides ?? []).filter((a) => Math.floor(a / pos.total) === pos.cycle - 1).map((a) => a % pos.total) : []} />
            <p className="hint" style={{ margin: 0 }}>{WEEK_HINT[block.weeks[shownWeek].kind]}</p>
            {progTemplates.length > 0 && <WeekPreview week={block.weeks[shownWeek]} templates={progTemplates} index={shownWeek} />}
            {fatigue?.suggestDeload && (
              <div className="banner warn"><BatteryLow size={18} /><span><b>Segnali di fatica.</b> {fatigue.stalled.slice(0, 3).map((id) => getExercise(id)?.name).join(', ')} {fatigue.stalled.length === 1 ? 'è fermo' : 'sono fermi'} da tre sedute. Anticipare lo scarico questa settimana può aiutarti a ripartire.</span></div>
            )}
            <div className="row-between">
              <div><b className="small">Ripeti il ciclo</b><div className="tiny muted">Al termine riparte da capo con i carichi aggiornati</div></div>
              <Switch label="Ripeti il ciclo" checked={block.repeat} onChange={(v) => update({ block: { ...block, repeat: v } })} />
            </div>
            <div className="field"><label htmlFor="bstart">Prima settimana (lunedì)</label>
              <input id="bstart" type="date" className="input" value={block.startDate} onChange={(e) => { if (e.target.value) update({ block: { ...block, startDate: mondayOf(fromKey(e.target.value)), deloadOverrides: [] } }); }} />
            </div>
            {pos?.started && !pos.finished && (
              <div className="row wrap" style={{ gap: 6 }}>
                {pos.info.kind !== 'deload' || pos.overridden ? <button className="btn sm" onClick={() => { update({ block: toggleDeloadNow(block) }); toast(pos.overridden ? 'Scarico annullato' : 'Questa settimana diventa di scarico'); }}><BatteryLow size={15} /> {pos.overridden ? 'Annulla scarico' : 'Scarico questa settimana'}</button> : null}
                <button className="btn sm" onClick={() => { update({ block: repeatCurrentWeek(block) }); toast('La settimana in corso verrà ripetuta'); }}><Repeat size={15} /> Ripeti questa settimana</button>
                <button className="btn sm" onClick={() => { update({ block: restartBlock(block) }); setSelWeek(null); toast('Ciclo ripartito da questa settimana'); }}><RotateCcw size={15} /> Ricomincia</button>
              </div>
            )}
            {pos?.finished && <button className="btn primary" onClick={() => { update({ block: restartBlock(block) }); toast('Nuovo ciclo iniziato'); }}><RotateCcw size={16} /> Inizia un nuovo ciclo</button>}
            <p className="tiny muted" style={{ margin: 0 }}>Parametri: {weekParams(block.weeks[shownWeek])}.</p>
          </>
        )}
      </section>

      <div className="section-title">Calendario · {days} {days === 1 ? 'giorno' : 'giorni'} di allenamento</div>
      {templates.length === 0 && <div className="banner"><Info size={18} /><span>Non hai ancora schede: creane una per ogni giorno con “Nuova scheda”.</span></div>}
      <div className="stack-sm">
        {p.schedule.map((tid, i) => {
          const t = tid ? templates.find((x) => x.id === tid) : undefined;
          return (
            <div key={i} className="card" style={{ padding: 12 }}>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <b>{DAY_LONG[i]}</b>
                {t ? <span className="pill accent">{t.exercises.length} esercizi · ~{estimateMinutes(t)} min</span> : <span className="pill">Riposo</span>}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <select className="select grow" value={tid ?? ''} onChange={(e) => setDay(i, e.target.value || null)} aria-label={`Scheda di ${DAY_LONG[i]}`}>
                  <option value="">Riposo</option>
                  {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {t ? <Link to={`/workouts/template/${t.id}`} className="icon-btn" aria-label={`Modifica ${t.name}`}><Pencil size={17} /></Link>
                  : <button className="icon-btn" onClick={() => newTemplateFor(i)} aria-label={`Nuova scheda per ${DAY_LONG[i]}`}><Plus size={18} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      {!p.active && <button className="btn primary lg block" onClick={async () => { await activateProgram(p.id); toast('Programma attivato'); }}><CheckCircle2 size={18} /> Attiva questo programma</button>}
      <Sheet open={modelOpen} onClose={() => setModelOpen(false)} title="Tipo di programma" wide>
        <div className="stack-sm">
          <p className="small text-2">Scegli come far evolvere le settimane. Puoi cambiarlo quando vuoi: lo storico resta invariato.</p>
          <ModelPicker value={block?.model ?? null} recommended={rec} onChange={setModel} />
        </div>
      </Sheet>
      <Confirm open={del} onClose={() => setDel(false)} danger confirmLabel="Elimina" title="Eliminare il programma?" body="Le schede collegate restano disponibili tra le tue schede." onConfirm={async () => { await store.remove('programs', p.id); toast('Programma eliminato'); nav('/workouts', { replace: true }); }} />
    </div>
  );
}
