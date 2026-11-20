import { estimateMinutes, templateParts } from '@/features/workouts/WorkoutsPage';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Bell, ChevronRight, Flame, Scale, Droplets, Moon, Sparkles, Bike, Plus, TrendingDown, TrendingUp, Minus, Coffee, Trophy, Timer, Dumbbell, Activity, BatteryMedium } from 'lucide-react';
import {
  useActiveProgram, useDiary, useMeasurements, useNotifications, useProfile, useSessions, useSettings, useSuggestions, useTemplates, useWellness, useCardio,
} from '@/app/data';
import { completedSessions, sessionStats } from '@/lib/stats';
import { readiness, todaysTemplate, weekProgress } from '@/lib/insights';
import { computeTargets, totals } from '@/lib/nutrition';
import { addDays, dayKey, formatDuration, formatLongDate, formatShortDate, fmtN, fmtW, startOfWeek, weekdayIdx } from '@/lib/util';
import { DAY_SHORT } from '@/lib/labels';
import { MacroBar, Ring, useToast } from '@/components/ui';
import { LineChart } from '@/components/charts';
import { getExercise } from '@/data/exercises';
import { activeSession, startSession } from '@/features/workouts/session';
import { store } from '@/db/store';
import { SyncBadge } from '@/components/sync-badge';
import { EnergyCard } from '@/features/energy/EnergyCard';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

export default function HomePage() {
  const nav = useNavigate();
  const toast = useToast();
  const profile = useProfile()!;
  const settings = useSettings();
  const sessions = useSessions();
  const templates = useTemplates();
  const program = useActiveProgram();
  const diary = useDiary();
  const measurements = useMeasurements();
  const wellness = useWellness();
  const cardio = useCardio();
  const notifications = useNotifications();
  const suggestions = useSuggestions().filter((s) => s.status === 'pending');
  const [selDay, setSelDay] = useState(weekdayIdx(new Date()));

  const today = dayKey();
  const done = completedSessions(sessions);
  const active = sessions.find((s) => s.status === 'active');
  const todayT = todaysTemplate(program, templates);
  const trainedToday = done.some((s) => dayKey(s.startedAt) === today);
  const last = done[done.length - 1];
  const lastStats = last ? sessionStats(last) : null;
  const goal = settings.weeklyWorkoutGoal ?? profile.daysPerWeek;
  const wk = weekProgress(sessions, goal);
  const targets = computeTargets(profile, settings, program ? program.schedule.filter(Boolean).length : undefined);
  const todayFood = totals(diary.filter((d) => d.date === today));
  const w = wellness.find((x) => x.date === today);
  const ready = readiness(w, sessions, settings.sleepGoalH, cardio);
  const unread = notifications.filter((n) => !n.read).length;

  const weights = useMemo(() => { const by = new Map<string, typeof measurements[number]>(); measurements.filter((m) => m.weightKg).sort((a, b) => a.date.localeCompare(b.date)).forEach((m) => by.set(m.date, m)); return Array.from(by.values()); }, [measurements]);
  const curW = weights.length ? weights[weights.length - 1].weightKg! : profile.weightKg;
  const prevW = weights.length > 1 ? weights[Math.max(0, weights.length - 2)].weightKg! : null;
  const trend = prevW !== null ? curW - prevW : 0;
  const startW = weights.length ? weights[0].weightKg! : profile.weightKg;
  const goalSpan = profile.targetWeightKg - startW;
  const goalPct = Math.abs(goalSpan) < 0.1 ? 1 : Math.max(0, Math.min(1, (curW - startW) / goalSpan));

  // calendario settimanale
  const ws = startOfWeek();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const k = dayKey(d);
    const tid = program?.schedule[i];
    return { i, d, k, tpl: tid ? templates.find((t) => t.id === tid) : undefined, done: done.filter((s) => dayKey(s.startedAt) === k) };
  });
  const sel = week[selDay];

  async function start(tplId?: string | null) {
    const a = activeSession();
    if (a) { nav('/workout/live'); return; }
    const t = tplId ? templates.find((x) => x.id === tplId) ?? null : todayT;
    await startSession(t);
    nav('/workout/live');
  }

  const coachTip = suggestions[0];

  return (
    <div className="page stack">
      <header className="row-between" style={{ paddingTop: 6 }}>
        <div>
          <div className="muted small" style={{ fontWeight: 600 }}>{formatLongDate(new Date())}</div>
          <h1>{greeting()}, {profile.name}</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <SyncBadge />
          <Link to="/notifications" className="icon-btn" aria-label={`Notifiche${unread ? `, ${unread} non lette` : ''}`} style={{ position: 'relative' }}>
            <Bell size={20} />
            {unread > 0 && <span style={{ position: 'absolute', top: 6, right: 7, width: 9, height: 9, borderRadius: 9, background: 'var(--orange)', border: '2px solid var(--surface-2)' }} />}
          </Link>
        </div>
      </header>

      {active && (
        <button className="card clickable row" style={{ width: '100%', textAlign: 'left', borderColor: 'var(--accent)', background: 'var(--accent-soft)' }} onClick={() => nav('/workout/live')}>
          <span className="li-icon" style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center' }}><Timer size={20} /></span>
          <span className="grow"><b>Allenamento in corso</b><div className="small text-2">{active.name} · riprendi da dove eri rimasto</div></span>
          <ChevronRight />
        </button>
      )}

      <div className="desk-2">
        <div className="stack">
          {/* Allenamento di oggi */}
          <section className="card hero pad-lg" aria-label="Allenamento di oggi">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="pill accent"><Dumbbell size={13} /> Oggi</span>
              {program && <Link to={`/workouts/program/${program.id}`} className="small muted">{program.name}</Link>}
            </div>
            {trainedToday ? (
              <>
                <h2 style={{ fontSize: 24 }}>Allenamento completato 💪</h2>
                <p className="text-2" style={{ marginTop: 4 }}>Ottimo lavoro. Ora recupero, idratazione e una buona alimentazione.</p>
                <div className="row wrap" style={{ marginTop: 14 }}>
                  <Link to={`/session/${done.filter((s) => dayKey(s.startedAt) === today).slice(-1)[0].id}`} className="btn">Vedi riepilogo</Link>
                  <button className="btn ghost" onClick={() => start(null)}>Altra sessione</button>
                </div>
              </>
            ) : todayT ? (
              <>
                <h2 style={{ fontSize: 26 }}>{todayT.name}</h2>
                <p className="text-2" style={{ marginTop: 4 }}>{templateParts(todayT)} · ~{estimateMinutes(todayT)} min</p>
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  {todayT.exercises.slice(0, 4).map((e) => <span key={e.uid} className={`pill ${e.cardio ? 'blue' : ''}`}>{getExercise(e.exerciseId)?.name ?? e.exerciseId}{e.cardio ? ` · ${Math.round(e.cardio.durationMin)} min` : ''}</span>)}
                  {todayT.exercises.length > 4 && <span className="pill">+{todayT.exercises.length - 4}</span>}
                </div>
                <div className="row" style={{ marginTop: 16 }}>
                  <button className="btn primary lg grow" onClick={() => start(todayT.id)}><Play size={18} fill="currentColor" /> Inizia allenamento</button>
                  <Link to={`/workouts/template/${todayT.id}`} className="btn lg" aria-label="Modifica scheda">Modifica</Link>
                </div>
              </>
            ) : program ? (
              <>
                <h2 style={{ fontSize: 24 }}>Giorno di riposo</h2>
                <p className="text-2" style={{ marginTop: 4 }}>Il recupero fa parte dei progressi. Se vuoi, fai mobilità o un po’ di cardio leggero.</p>
                <div className="row wrap" style={{ marginTop: 14 }}>
                  <Link to="/cardio" className="btn"><Bike size={18} /> Registra cardio</Link>
                  <button className="btn ghost" onClick={() => start(null)}>Allenamento libero</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 24 }}>Nessun programma attivo</h2>
                <p className="text-2" style={{ marginTop: 4 }}>Genera un programma su misura o crea la tua scheda.</p>
                <div className="row wrap" style={{ marginTop: 14 }}>
                  <Link to="/workouts/generate" className="btn primary"><Sparkles size={18} /> Genera programma</Link>
                  <button className="btn" onClick={() => start(null)}><Play size={18} /> Allenamento libero</button>
                </div>
              </>
            )}
          </section>

          {/* Settimana */}
          <section className="card" aria-label="Calendario settimanale">
            <div className="card-title"><h3>Questa settimana</h3><Link to="/history" className="link">Storico <ChevronRight size={16} /></Link></div>
            <div className="week">
              {week.map((d) => (
                <button key={d.k} className={`day ${d.tpl ? 'train' : ''} ${d.done.length ? 'done' : ''} ${d.k === today ? 'today' : ''} ${selDay === d.i ? 'sel' : ''}`} onClick={() => setSelDay(d.i)} aria-label={`${DAY_SHORT[d.i]} ${d.d.getDate()}: ${d.done.length ? 'allenamento completato' : d.tpl ? `in programma ${d.tpl.name}` : 'riposo'}`}>
                  <span className="dn">{DAY_SHORT[d.i]}</span><span className="dd">{d.d.getDate()}</span><span className="dot" />
                </button>
              ))}
            </div>
            <div className="row-between" style={{ marginTop: 12, fontSize: 13.5 }}>
              <span className="text-2">
                {sel.done.length ? `✓ ${sel.done.map((s) => s.name).join(', ')}` : sel.tpl ? `In programma: ${sel.tpl.name}` : 'Giorno di riposo'}
              </span>
              {sel.done[0] ? <Link to={`/session/${sel.done[0].id}`} className="accent small" style={{ fontWeight: 600 }}>Dettagli</Link>
                : sel.tpl && sel.k >= today ? <button className="btn sm soft" onClick={() => start(sel.tpl!.id)}>Inizia</button> : null}
            </div>
            <div className="row" style={{ gap: 14, marginTop: 10 }}>
              <span className="tiny muted row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 7, background: 'var(--orange)', display: 'inline-block' }} /> In programma</span>
              <span className="tiny muted row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 7, background: 'var(--accent)', display: 'inline-block' }} /> Completato</span>
            </div>
          </section>

          {/* Obiettivo settimanale + ultimo allenamento */}
          <div className="grid-2">
            <Link to="/goals" className="card clickable col" style={{ alignItems: 'center', gap: 8 }} aria-label="Obiettivo settimanale">
              <Ring value={wk.done} max={goal} size={104} stroke={10}>
                <div><div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{wk.done}<span className="muted" style={{ fontSize: 15 }}>/{goal}</span></div></div>
              </Ring>
              <div className="center"><b className="small">Obiettivo settimanale</b><div className="tiny muted">{done.length} {done.length === 1 ? 'allenamento totale' : 'allenamenti totali'}</div></div>
            </Link>
            <Link to={last ? `/session/${last.id}` : '/history'} className="card clickable col" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8 }}><Flame size={18} className="accent" /><b className="small">Ultimo allenamento</b></div>
              {last && lastStats ? (
                <>
                  <div><div style={{ fontWeight: 650 }} className="ellipsis">{last.name}</div><div className="tiny muted">{formatShortDate(last.startedAt)}</div></div>
                  <div className="col" style={{ gap: 2 }}>
                    <span className="small"><b className="num">{formatDuration(lastStats.durationMs)}</b> <span className="muted">durata</span></span>
                    <span className="small"><b className="num">{fmtN(lastStats.volume)}</b> <span className="muted">kg volume</span></span>
                    <span className="small"><b className="num">{lastStats.sets}</b> <span className="muted">serie</span></span>
                  </div>
                  {!!last.prs?.length && <span className="pr-badge"><Trophy size={12} /> {last.prs.length} record</span>}
                </>
              ) : <p className="small muted">Ancora nessun allenamento registrato. Il primo è il più importante!</p>}
            </Link>
          </div>

          {/* Coach */}
          <Link to="/coach" className="card clickable row" style={{ alignItems: 'flex-start' }}>
            <span style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-ink)', flexShrink: 0 }}><Sparkles size={20} /></span>
            <span className="grow">
              <b>{coachTip ? coachTip.title : 'Coach'}</b>
              <div className="small text-2" style={{ marginTop: 2 }}>{coachTip ? coachTip.body : 'Chiedi consigli sui tuoi allenamenti, i carichi e l’alimentazione: le risposte si basano sui tuoi dati.'}</div>
            </span>
            <ChevronRight className="muted" />
          </Link>
        </div>

        <div className="stack">
          {/* Nutrizione */}
          <Link to="/nutrition" className="card clickable" aria-label="Calorie e macronutrienti di oggi">
            <div className="card-title"><h3><Coffee size={18} /> Alimentazione di oggi</h3><ChevronRight size={18} className="muted" /></div>
            <div className="row" style={{ gap: 18, alignItems: 'center' }}>
              <Ring value={todayFood.kcal} max={targets.kcal} size={112} stroke={11}>
                <div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{fmtN(Math.max(0, targets.kcal - todayFood.kcal))}</div><div className="tiny muted">kcal rimaste</div></div>
              </Ring>
              <div className="col grow" style={{ gap: 10 }}>
                <MacroBar label="Proteine" value={todayFood.protein} max={targets.protein} color="var(--protein)" />
                <MacroBar label="Carboidrati" value={todayFood.carbs} max={targets.carbs} color="var(--carbs)" />
                <MacroBar label="Grassi" value={todayFood.fat} max={targets.fat} color="var(--fat)" />
              </div>
            </div>
            <div className="row-between small" style={{ marginTop: 12 }}><span className="muted">Assunte <b className="num" style={{ color: 'var(--text)' }}>{fmtN(todayFood.kcal)}</b> di {fmtN(targets.kcal)} kcal</span><span className="accent" style={{ fontWeight: 600 }}>+ Aggiungi</span></div>
          </Link>

          <EnergyCard />

          {/* Peso */}
          <Link to="/body" className="card clickable" aria-label="Peso e andamento">
            <div className="card-title"><h3><Scale size={18} /> Peso</h3><ChevronRight size={18} className="muted" /></div>
            <div className="row-between" style={{ alignItems: 'flex-end' }}>
              <div>
                <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{fmtW(curW, settings.units)}</div>
                <div className="small row" style={{ gap: 4, color: trend < 0 ? 'var(--success)' : trend > 0 ? 'var(--orange)' : 'var(--muted)' }}>
                  {trend < 0 ? <TrendingDown size={15} /> : trend > 0 ? <TrendingUp size={15} /> : <Minus size={15} />}
                  {prevW !== null ? `${trend > 0 ? '+' : ''}${fmtW(trend, settings.units)} dall’ultima misura` : 'Prima misurazione'}
                </div>
              </div>
              <div className="center" style={{ minWidth: 90 }}>
                <div className="tiny muted">Obiettivo {fmtW(profile.targetWeightKg, settings.units)}</div>
                <div style={{ marginTop: 6 }}><div className="bar thin"><i style={{ width: `${goalPct * 100}%` }} /></div></div>
                <div className="tiny muted" style={{ marginTop: 4 }}>{Math.round(goalPct * 100)}% del percorso</div>
              </div>
            </div>
            {weights.length >= 2 && (
              <div style={{ marginTop: 10 }}>
                <LineChart ariaLabel="Andamento del peso" height={90} points={weights.slice(-20).map((m) => ({ x: new Date(m.date).getTime(), y: m.weightKg!, label: formatShortDate(m.date) }))} format={(v) => v.toFixed(1)} goal={null} />
              </div>
            )}
          </Link>

          {/* Recupero */}
          <Link to="/wellness" className="card clickable row" aria-label="Recupero e benessere">
            <Ring value={ready.score ?? 0} max={100} size={64} stroke={7} color={ready.tone === 'good' ? 'var(--success)' : ready.tone === 'ok' ? 'var(--warning)' : ready.tone === 'low' ? 'var(--danger)' : 'var(--surface-3)'}>
              <BatteryMedium size={20} />
            </Ring>
            <div className="grow">
              <b>{ready.label}{ready.score !== null && <span className="muted"> · {ready.score}</span>}</b>
              <div className="small text-2">{ready.advice}</div>
            </div>
          </Link>

          {/* Azioni rapide */}
          <div className="grid-3">
            <QuickWater />
            <Link to="/wellness" className="card clickable col center" style={{ alignItems: 'center', gap: 6, padding: 12 }}><Moon size={20} /><span className="small" style={{ fontWeight: 600 }}>Sonno</span><span className="tiny muted">{w?.sleepHours ? `${w.sleepHours} h` : 'Registra'}</span></Link>
            <Link to="/cardio" className="card clickable col center" style={{ alignItems: 'center', gap: 6, padding: 12 }}><Activity size={20} /><span className="small" style={{ fontWeight: 600 }}>Cardio</span><span className="tiny muted">{cardio.filter((c) => c.date >= dayKey(ws)).length} questa sett.</span></Link>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Link to="/progress" className="btn sm"><TrendingUp size={16} /> Progressi</Link>
            <Link to="/body" className="btn sm"><Plus size={16} /> Misure</Link>
            <Link to="/goals" className="btn sm"><Trophy size={16} /> Traguardi</Link>
          </div>
        </div>
      </div>
    </div>
  );

  function QuickWater() {
    const ml = w?.waterMl ?? 0;
    return (
      <button className="card clickable col center" style={{ alignItems: 'center', gap: 6, padding: 12, width: '100%' }} onClick={async () => {
        const cur = store.get<any>('wellness', today) ?? { id: today, date: today, waterMl: 0 };
        await store.put('wellness', today, { ...cur, waterMl: (cur.waterMl ?? 0) + 250 });
        toast('+250 ml d’acqua');
      }} aria-label="Aggiungi un bicchiere d'acqua">
        <Droplets size={20} color="var(--blue)" />
        <span className="small" style={{ fontWeight: 600 }}>+ Acqua</span>
        <span className="tiny muted">{fmtN(ml / 1000, 2)} / {fmtN(settings.waterGoalMl / 1000, 1)} L</span>
      </button>
    );
  }
}
