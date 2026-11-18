import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Info, Trash2, Plus, Pencil } from 'lucide-react';
import { useDoc, store } from '@/db/store';
import { activateProgram, saveProgram, saveTemplate, useTemplates } from '@/app/data';
import { PageHeader, Empty, Confirm, Switch, useToast } from '@/components/ui';
import { DAY_LONG } from '@/lib/labels';
import { uid } from '@/lib/util';
import type { Program, WorkoutTemplate } from '@/lib/types';
import { estimateMinutes } from './WorkoutsPage';

export default function ProgramEditor() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const p = useDoc<Program>('programs', id);
  const templates = useTemplates().slice().sort((a, b) => a.name.localeCompare(b.name));
  const [del, setDel] = useState(false);

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
      <Confirm open={del} onClose={() => setDel(false)} danger confirmLabel="Elimina" title="Eliminare il programma?" body="Le schede collegate restano disponibili tra le tue schede." onConfirm={async () => { await store.remove('programs', p.id); toast('Programma eliminato'); nav('/workouts', { replace: true }); }} />
    </div>
  );
}
