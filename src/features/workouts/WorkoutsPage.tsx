import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SectionHero } from '@/design/SectionHero';
import { ArtPanel } from '@/design/Art';
import { Plus, Sparkles, Play, Copy, Trash2, CalendarDays, History, TrendingUp, Bike, ChevronRight, MoreVertical, Dumbbell, Pencil, CheckCircle2, Timer, Library } from 'lucide-react';
import { useActiveProgram, usePrograms, useSessions, useTemplates, saveTemplate, saveProgram, activateProgram } from '@/app/data';
import { Empty, Sheet, Confirm, useToast } from '@/components/ui';
import { DAY_SHORT, MUSCLE_LABEL } from '@/lib/labels';
import { getExercise } from '@/data/exercises';
import { completedSessions, sessionStats } from '@/lib/stats';
import { formatShortDate, uid, formatDuration, fmtN, weekdayIdx } from '@/lib/util';
import { activeSession, startSession } from './session';
import { store } from '@/db/store';
import type { MuscleGroup, Program, WorkoutTemplate } from '@/lib/types';
import { cardioMinutesOf, templateMinutesExact } from '@/lib/cardio';
import { sessionCardioStats } from '@/lib/cardio';
import { BlockNow } from './block-ui';
import { BLOCK_MODELS } from '@/lib/periodization';

/** Durata stimata della scheda: pesi (serie × recupero) + durata prevista del cardio. */
export function estimateMinutes(t: Pick<WorkoutTemplate, 'exercises'>) {
  return Math.max(5, Math.round(templateMinutesExact(t)));
}

/** "4 esercizi + 15 min cardio" */
export function templateParts(t: Pick<WorkoutTemplate, 'exercises'>) {
  const c = t.exercises.filter((e) => e.cardio).length;
  const n = t.exercises.length - c;
  const parts = [];
  if (n) parts.push(`${n} esercizi`);
  if (c) parts.push(`${Math.round(cardioMinutesOf(t))} min cardio`);
  return parts.join(' + ') || 'vuota';
}
/** Muscoli principali della scheda (in ordine di frequenza) e soggetto dell'illustrazione. */
export function templateFocus(t: WorkoutTemplate) {
  const count = new Map<MuscleGroup, number>();
  let lead: { pattern: string; muscles: MuscleGroup[] } | null = null;
  for (const te of t.exercises) {
    const e = getExercise(te.exerciseId);
    if (!e || te.cardio) continue;
    if (!lead) lead = { pattern: e.pattern, muscles: e.primary };
    e.primary.forEach((m) => count.set(m, (count.get(m) ?? 0) + 1));
  }
  const muscles = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m).filter((m) => m !== 'cardio' && m !== 'full_body');
  if (!lead) {
    const c = t.exercises.find((x) => x.cardio);
    const e = c ? getExercise(c.exerciseId) : undefined;
    lead = { pattern: e?.pattern ?? 'run', muscles: ['calves', 'quads'] };
  }
  return { muscles, lead };
}

function cardioText(s: Parameters<typeof sessionCardioStats>[0]) {
  const c = sessionCardioStats(s);
  return c.activities ? ` · ${Math.round(c.minutes)} min cardio` : '';
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

  const [sp, setSp] = useSearchParams();
  const programsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sp.get('new') === '1') { setSp({}, { replace: true }); void createTemplate(); }
    else if (sp.get('focus') === 'programs') programsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const todayT = program?.schedule[todayIdx] ? templates.find((t) => t.id === program.schedule[todayIdx]) : undefined;

  return (
    <div className="page stack">
      <SectionHero section="training" title="Allenamento" desc="Le tue schede, il programma della settimana e le sessioni completate."
        right={<Link to="/history" className="icon-btn" aria-label="Storico allenamenti"><History size={20} /></Link>}
        actions={<>
          {active ? <button className="btn primary" onClick={() => nav('/workout/live')}><Timer size={18} /> Riprendi</button>
            : todayT ? <button className="btn primary" onClick={() => start(todayT)}><Play size={18} fill="currentColor" /> {todayT.name}</button>
            : <button className="btn primary" onClick={() => start(null)}><Play size={18} fill="currentColor" /> Allenamento libero</button>}
          <Link to="/workouts/generate" className="btn"><Sparkles size={17} /> Genera</Link>
        </>} />

      {active && (
        <button className="live-banner" onClick={() => nav('/workout/live')}>
          <span className="live-ic"><Timer size={20} /></span>
          <span className="grow"><b>Allenamento in corso: {active.name}</b><span className="small">Tocca per riprendere</span></span>
          <ChevronRight />
        </button>
      )}

      <div className="mode-grid">
        <button className="mode-tile" onClick={() => start(null)}>
          <span className="mode-ic"><Play size={20} /></span><b>Allenamento libero</b><span>Parti da zero e aggiungi esercizi mentre ti alleni</span>
        </button>
        <Link to="/workouts/generate" className="mode-tile">
          <span className="mode-ic"><Sparkles size={20} /></span><b>Schede automatiche</b><span>Su misura per obiettivi, livello, tempo e attrezzatura</span>
        </Link>
        <button className="mode-tile" onClick={createTemplate}>
          <span className="mode-ic"><Plus size={20} /></span><b>Crea workout</b><span>Scegli tu gli esercizi dalla libreria</span>
        </button>
      </div>

      <div className="desk-2">
        <div className="stack">
          {/* Programma attivo */}
          <section>
            <div className="section-title">Questa settimana {program && <Link to={`/workouts/program/${program.id}`}><Pencil size={14} /> Modifica</Link>}</div>
            {program ? (
              <div className="card plan">
                <div className="plan-head"><CalendarDays size={18} /><b className="ellipsis grow">{program.name}</b><span className="pill accent">{program.schedule.filter(Boolean).length} giorni</span></div>
                {program.description && <div className="tiny muted" style={{ margin: '-4px 0 8px' }}>{program.description}</div>}
                {program.block && <Link to={`/workouts/program/${program.id}`} style={{ display: 'block', color: 'inherit' }} aria-label="Dettagli del programma a più settimane"><BlockNow block={program.block} /></Link>}
                <div className="plan-days">
                  {program.schedule.map((tid, i) => {
                    const t = tid ? templates.find((x) => x.id === tid) : undefined;
                    return (
                      <div key={i} className={`plan-day ${i === todayIdx ? 'now' : ''} ${t ? '' : 'rest'}`}>
                        <span className="pd-day">{DAY_SHORT[i]}</span>
                        {t ? (
                          <>
                            <Link to={`/workouts/template/${t.id}`} className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 650 }}>{t.name}</div><div className="tiny muted ellipsis">{templateParts(t)} · ~{estimateMinutes(t)} min</div></Link>
                            <button className={`btn sm ${i === todayIdx ? 'primary' : 'soft'}`} onClick={() => start(t)} aria-label={`Inizia ${t.name}`}><Play size={14} fill="currentColor" />{i === todayIdx ? ' Inizia' : ''}</button>
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
              <div className="tpl-list">
                {templates.map((t) => {
                  const f = templateFocus(t);
                  const hasCardio = t.exercises.some((e) => e.cardio);
                  return (
                    <div key={t.id} className="tpl-card">
                      <Link to={`/workouts/template/${t.id}`} className="tpl-art" aria-hidden tabIndex={-1}>
                        <ArtPanel spec={{ kind: 'figure', pattern: f.lead.pattern, muscles: f.lead.muscles, phase: 0.5 }} color={hasCardio && !f.muscles.length ? 'var(--c-cardio)' : 'var(--c-training)'} color2="#22300a" />
                      </Link>
                      <Link to={`/workouts/template/${t.id}`} className="grow" style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}><b className="ellipsis">{t.name}</b>{t.source === 'generated' && <span className="pill accent"><Sparkles size={11} /> Auto</span>}</div>
                        <div className="tiny muted ellipsis" style={{ marginTop: 3 }}>{t.exercises.length ? `${templateParts(t)} · ~${estimateMinutes(t)} min` : 'Vuota: aggiungi esercizi'}</div>
                        {f.muscles.length > 0 && <div className="tpl-muscles">{f.muscles.slice(0, 3).map((m) => <span key={m}>{MUSCLE_LABEL[m]}</span>)}{hasCardio && <span className="c">Cardio</span>}</div>}
                      </Link>
                      <button className="icon-btn soft" onClick={() => start(t)} aria-label={`Inizia ${t.name}`} disabled={!t.exercises.length}><Play size={18} fill="currentColor" /></button>
                      <button className="icon-btn ghost" onClick={() => setMenu(t)} aria-label={`Altre azioni per ${t.name}`}><MoreVertical size={18} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          {/* Programmi */}
          <section ref={programsRef}>
            <div className="section-title">Programmi settimanali <button className="btn sm soft" onClick={createProgram}><Plus size={15} /> Nuovo</button></div>
            {programs.length === 0 ? <p className="small muted">Nessun programma salvato.</p> : (
              <div className="settings-group">
                {programs.map((p) => (
                  <div key={p.id} className="list-item" style={{ cursor: 'default' }}>
                    <span className="li-icon">{p.active ? <CheckCircle2 size={20} className="accent" /> : <CalendarDays size={20} />}</span>
                    <Link to={`/workouts/program/${p.id}`} className="grow" style={{ minWidth: 0 }}>
                      <div className="li-title ellipsis">{p.name}</div>
                      <div className="li-sub">{p.schedule.filter(Boolean).length} giorni{p.block ? ` · ${BLOCK_MODELS[p.block.model].weeks.length} settimane` : ''} · {p.active ? 'Attivo' : 'Non attivo'}</div>
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
            <div className="section-title">Ultimi allenamenti <Link to="/history">Vedi tutti <ChevronRight size={15} /></Link></div>
            {done.length === 0 ? <p className="small muted">Qui compariranno gli allenamenti completati.</p> : (
              <div className="settings-group">
                {done.slice(0, 5).map((s) => {
                  const st = sessionStats(s);
                  return (
                    <Link key={s.id} to={`/session/${s.id}`} className="list-item">
                      <span className="li-icon sec-ic" style={{ ['--sc' as string]: 'var(--c-training)' } as React.CSSProperties}><Dumbbell size={18} /></span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <div className="li-title ellipsis">{s.name}</div>
                        <div className="li-sub">{formatShortDate(s.startedAt)} · {formatDuration(st.durationMs)}{st.sets ? ` · ${st.sets} serie · ${fmtN(st.volume)} kg` : ''}{cardioText(s)}</div>
                      </span>
                      {!!s.prs?.length && <span className="pr-badge">{s.prs.length} PR</span>}
                      <ChevronRight size={18} className="muted" />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <div className="related">
            <Link to="/progress" style={{ ['--sc' as string]: 'var(--c-progress)' } as React.CSSProperties}><TrendingUp size={18} /> Progressi</Link>
            <Link to="/exercises" style={{ ['--sc' as string]: 'var(--c-exercises)' } as React.CSSProperties}><Library size={18} /> Esercizi</Link>
            <Link to="/cardio" style={{ ['--sc' as string]: 'var(--c-cardio)' } as React.CSSProperties}><Bike size={18} /> Cardio</Link>
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
