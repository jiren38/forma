import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Play, Copy, Trash2, CalendarDays, History, TrendingUp, Bike, ChevronRight, MoreVertical, Dumbbell, Pencil, CheckCircle2, Timer } from 'lucide-react';
import { useActiveProgram, usePrograms, useSessions, useTemplates, saveTemplate, saveProgram, activateProgram } from '@/app/data';
import { PageHeader, Empty, Sheet, Confirm, useToast } from '@/components/ui';
import { DAY_SHORT } from '@/lib/labels';
import { getExercise } from '@/data/exercises';
import { completedSessions, sessionStats } from '@/lib/stats';
import { formatShortDate, uid, formatDuration, fmtN, weekdayIdx } from '@/lib/util';
import { activeSession, startSession } from './session';
import { store } from '@/db/store';
import type { Program, WorkoutTemplate } from '@/lib/types';

export function estimateMinutes(t: WorkoutTemplate) {
  return Math.max(5, Math.round(t.exercises.reduce((a, e) => a + e.sets * (e.restSec + 40), 0) / 60));
}

export default function WorkoutsPage() {
  const nav = useNavigate();
  const toast = useToast();
  const templates = useTemplates().slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const programs = usePrograms().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const program = useActiveProgram();
  const sessions = useSessions();
  const done = completedSessions(sessions).reverse();
  const active = sessions.find((s) => s.status === 'active');
  const [menu, setMenu] = useState<WorkoutTemplate | null>(null);
  const [del, setDel] = useState<WorkoutTemplate | null>(null);
  const [delProg, setDelProg] = useState<Program | null>(null);

  async function start(t: WorkoutTemplate | null) {
    if (activeSession()) { nav('/workout/live'); return; }
    await startSession(t);
    nav('/workout/live');
  }
  async function createTemplate() {
    const now = new Date().toISOString();
    const t: WorkoutTemplate = { id: uid('tpl_'), name: 'Nuova scheda', exercises: [], source: 'manual', createdAt: now, updatedAt: now, notes: '' };
    await saveTemplate(t);
    nav(`/workouts/template/${t.id}?new=1`);
  }
  async function duplicate(t: WorkoutTemplate) {
    const now = new Date().toISOString();
    const c: WorkoutTemplate = { ...t, id: uid('tpl_'), name: `${t.name} (copia)`, source: 'manual', programId: null, createdAt: now, updatedAt: now, exercises: t.exercises.map((e) => ({ ...e, uid: uid('te_') })) };
    await saveTemplate(c);
    toast('Scheda duplicata');
  }
  async function removeTemplate(t: WorkoutTemplate) {
    await store.remove('templates', t.id);
    for (const p of store.list<Program>('programs')) {
      if (p.schedule.includes(t.id)) await saveProgram({ ...p, schedule: p.schedule.map((x) => (x === t.id ? null : x)) });
    }
    toast('Scheda eliminata');
  }
  async function createProgram() {
    const p: Program = { id: uid('prg_'), name: 'Il mio programma', schedule: Array(7).fill(null), active: !program, source: 'manual', createdAt: new Date().toISOString() };
    await saveProgram(p);
    nav(`/workouts/program/${p.id}`);
  }
  async function removeProgram(p: Program) {
    await store.remove('programs', p.id);
    toast('Programma eliminato. Le schede restano disponibili.');
  }

  const todayIdx = weekdayIdx(new Date());

  return (
    <div className="page stack">
      <PageHeader title="Allenamenti" right={<Link to="/history" className="icon-btn" aria-label="Storico allenamenti"><History size={20} /></Link>} />

      {active && (
        <button className="card clickable row" style={{ width: '100%', textAlign: 'left', borderColor: 'var(--accent)', background: 'var(--accent-soft)' }} onClick={() => nav('/workout/live')}>
          <Timer size={22} className="accent" />
          <span className="grow"><b>Allenamento in corso: {active.name}</b><div className="small text-2">Tocca per riprendere</div></span>
          <ChevronRight />
        </button>
      )}

      <div className="grid-2">
        <button className="card clickable col" style={{ gap: 8, textAlign: 'left' }} onClick={() => start(null)}>
          <Play size={22} className="accent" /><b>Allenamento libero</b><span className="tiny muted">Parti da zero e aggiungi esercizi mentre ti alleni</span>
        </button>
        <Link to="/workouts/generate" className="card clickable col" style={{ gap: 8 }}>
          <Sparkles size={22} className="accent" /><b>Genera programma</b><span className="tiny muted">Su misura per obiettivi, livello, tempo e attrezzatura</span>
        </Link>
      </div>

      <div className="desk-2">
        <div className="stack">
          {/* Programma attivo */}
          <section>
            <div className="section-title">Programma attivo</div>
            {program ? (
              <div className="card">
                <div className="row-between">
                  <div style={{ minWidth: 0 }}><h3 className="ellipsis">{program.name}</h3>{program.description && <div className="tiny muted" style={{ marginTop: 2 }}>{program.description}</div>}</div>
                  <Link to={`/workouts/program/${program.id}`} className="btn sm"><Pencil size={15} /> Modifica</Link>
                </div>
                <div className="stack-sm" style={{ marginTop: 12 }}>
                  {program.schedule.map((tid, i) => {
                    const t = tid ? templates.find((x) => x.id === tid) : undefined;
                    return (
                      <div key={i} className="row" style={{ gap: 10, padding: '6px 0', borderBottom: i < 6 ? '1px solid var(--border)' : 0 }}>
                        <span className={`pill ${i === todayIdx ? 'accent' : ''}`} style={{ width: 46, justifyContent: 'center' }}>{DAY_SHORT[i]}</span>
                        {t ? (
                          <>
                            <Link to={`/workouts/template/${t.id}`} className="grow ellipsis" style={{ fontWeight: 600 }}>{t.name}<span className="tiny muted"> · {t.exercises.length} esercizi</span></Link>
                            <button className="btn sm soft" onClick={() => start(t)} aria-label={`Inizia ${t.name}`}><Play size={14} /> Inizia</button>
                          </>
                        ) : <span className="muted small grow">Riposo</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="card"><Empty icon={<CalendarDays />} title="Nessun programma attivo" text="Un programma assegna una scheda a ogni giorno della settimana." action={<div className="row wrap" style={{ justifyContent: 'center' }}><Link to="/workouts/generate" className="btn primary sm"><Sparkles size={16} /> Genera</Link><button className="btn sm" onClick={createProgram}><Plus size={16} /> Crea manualmente</button></div>} /></div>
            )}
          </section>

          {/* Schede */}
          <section>
            <div className="section-title">Le mie schede <button className="btn sm soft" onClick={createTemplate}><Plus size={15} /> Nuova</button></div>
            {templates.length === 0 ? (
              <div className="card"><Empty icon={<Dumbbell />} title="Nessuna scheda" text="Crea una scheda scegliendo gli esercizi dalla libreria, oppure genera un programma." action={<button className="btn primary sm" onClick={createTemplate}><Plus size={16} /> Crea scheda</button>} /></div>
            ) : (
              <div className="stack-sm">
                {templates.map((t) => (
                  <div key={t.id} className="card row" style={{ padding: 12 }}>
                    <Link to={`/workouts/template/${t.id}`} className="grow" style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 6 }}><b className="ellipsis">{t.name}</b>{t.source === 'generated' && <span className="pill accent"><Sparkles size={11} /> Generata</span>}</div>
                      <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>
                        {t.exercises.length ? `${t.exercises.length} esercizi · ~${estimateMinutes(t)} min · ${t.exercises.slice(0, 3).map((e) => getExercise(e.exerciseId)?.name).filter(Boolean).join(', ')}` : 'Vuota: aggiungi esercizi'}
                      </div>
                    </Link>
                    <button className="icon-btn soft" onClick={() => start(t)} aria-label={`Inizia ${t.name}`} disabled={!t.exercises.length}><Play size={18} /></button>
                    <button className="icon-btn ghost" onClick={() => setMenu(t)} aria-label={`Altre azioni per ${t.name}`}><MoreVertical size={18} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          {/* Programmi */}
          <section>
            <div className="section-title">Programmi settimanali <button className="btn sm soft" onClick={createProgram}><Plus size={15} /> Nuovo</button></div>
            {programs.length === 0 ? <p className="small muted">Nessun programma salvato.</p> : (
              <div className="settings-group">
                {programs.map((p) => (
                  <div key={p.id} className="list-item" style={{ cursor: 'default' }}>
                    <span className="li-icon">{p.active ? <CheckCircle2 size={20} className="accent" /> : <CalendarDays size={20} />}</span>
                    <Link to={`/workouts/program/${p.id}`} className="grow" style={{ minWidth: 0 }}>
                      <div className="li-title ellipsis">{p.name}</div>
                      <div className="li-sub">{p.schedule.filter(Boolean).length} giorni · {p.active ? 'Attivo' : 'Non attivo'}</div>
                    </Link>
                    {!p.active && <button className="btn sm" onClick={async () => { await activateProgram(p.id); toast('Programma attivato'); }}>Attiva</button>}
                    <button className="icon-btn ghost" onClick={() => setDelProg(p)} aria-label={`Elimina ${p.name}`}><Trash2 size={17} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Ultime sessioni */}
          <section>
            <div className="section-title">Ultimi allenamenti <Link to="/history" className="small accent" style={{ textTransform: 'none', letterSpacing: 0 }}>Vedi tutti</Link></div>
            {done.length === 0 ? <p className="small muted">Qui compariranno gli allenamenti completati.</p> : (
              <div className="settings-group">
                {done.slice(0, 5).map((s) => {
                  const st = sessionStats(s);
                  return (
                    <Link key={s.id} to={`/session/${s.id}`} className="list-item">
                      <span className="li-icon"><Dumbbell size={18} /></span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <div className="li-title ellipsis">{s.name}</div>
                        <div className="li-sub">{formatShortDate(s.startedAt)} · {formatDuration(st.durationMs)} · {st.sets} serie · {fmtN(st.volume)} kg</div>
                      </span>
                      {!!s.prs?.length && <span className="pr-badge">{s.prs.length} PR</span>}
                      <ChevronRight size={18} className="muted" />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid-3">
            <Link to="/progress" className="card clickable col center" style={{ alignItems: 'center', gap: 6, padding: 12 }}><TrendingUp size={20} /><span className="small" style={{ fontWeight: 600 }}>Progressi</span></Link>
            <Link to="/history" className="card clickable col center" style={{ alignItems: 'center', gap: 6, padding: 12 }}><History size={20} /><span className="small" style={{ fontWeight: 600 }}>Storico</span></Link>
            <Link to="/cardio" className="card clickable col center" style={{ alignItems: 'center', gap: 6, padding: 12 }}><Bike size={20} /><span className="small" style={{ fontWeight: 600 }}>Cardio</span></Link>
          </div>
        </div>
      </div>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name}>
        {menu && (
          <div className="settings-group">
            <button className="list-item" onClick={() => { const t = menu; setMenu(null); start(t); }} disabled={!menu.exercises.length}><span className="li-icon"><Play size={18} /></span><span className="li-title">Inizia allenamento</span></button>
            <button className="list-item" onClick={() => { nav(`/workouts/template/${menu.id}`); setMenu(null); }}><span className="li-icon"><Pencil size={18} /></span><span className="li-title">Modifica</span></button>
            <button className="list-item" onClick={() => { duplicate(menu); setMenu(null); }}><span className="li-icon"><Copy size={18} /></span><span className="li-title">Duplica</span></button>
            <button className="list-item" onClick={() => { setDel(menu); setMenu(null); }}><span className="li-icon"><Trash2 size={18} color="var(--danger)" /></span><span className="li-title danger-text">Elimina</span></button>
          </div>
        )}
      </Sheet>
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Elimina" title="Eliminare la scheda?" body={`“${del?.name}” verrà rimossa anche dai programmi. Lo storico degli allenamenti già svolti resta invariato.`} onConfirm={() => del && removeTemplate(del)} />
      <Confirm open={!!delProg} onClose={() => setDelProg(null)} danger confirmLabel="Elimina" title="Eliminare il programma?" body="Le schede collegate non verranno eliminate." onConfirm={() => delProg && removeProgram(delProg)} />
    </div>
  );
}
