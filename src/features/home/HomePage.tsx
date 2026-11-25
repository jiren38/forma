import { estimateMinutes, templateFocus } from '@/features/workouts/WorkoutsPage';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Play, Bell, ChevronRight, Scale, Droplets, Moon, Sparkles, Plus, TrendingDown, TrendingUp, Minus, Trophy, Timer, Dumbbell,
  BatteryMedium, ScanBarcode, Utensils, HeartPulse, Library, Pencil, Clock, Layers, CalendarDays, CheckCircle2,
} from 'lucide-react';
import {
  useActiveProgram, useDiary, useMeasurements, useNotifications, useProfile, useSessions, useSettings, useSuggestions, useTemplates, useWellness, useCardio,
} from '@/app/data';
import { completedSessions, sessionStats } from '@/lib/stats';
import { readiness, todaysTemplate, weekProgress } from '@/lib/insights';
import { activeWeek, WEEK_LABEL } from '@/lib/periodization';
import { computeTargets, totals } from '@/lib/nutrition';
import { addDays, dayKey, formatDuration, formatLongDate, formatShortDate, fmtN, fmtW, startOfWeek, weekdayIdx } from '@/lib/util';
import { DAY_SHORT, MUSCLE_LABEL } from '@/lib/labels';
import { Ring, useToast } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { getExercise } from '@/data/exercises';
import { cardioMinutesOf } from '@/lib/cardio';
import { activeSession, startSession } from '@/features/workouts/session';
import { store } from '@/db/store';
import { SyncBadge } from '@/components/sync-badge';
import { EnergyCard } from '@/features/energy/EnergyCard';
import { ArtPanel } from '@/design/Art';
import { DailySummary } from './DailySummary';
import { WeeklyCard } from '@/features/week/WeeklyCard';

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
  const blockWeek = activeWeek(program);
  const doneToday = done.filter((s) => dayKey(s.startedAt) === today);
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

  async function addWater() {
    const cur = store.get<any>('wellness', today) ?? { id: today, date: today, waterMl: 0 };
    await store.put('wellness', today, { ...cur, waterMl: (cur.waterMl ?? 0) + 250 });
    toast('+250 ml d’acqua');
  }

  const coachTip = suggestions[0];
  const initials = (profile.name || 'F').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const waterMl = w?.waterMl ?? 0;

  const quick = [
    { label: 'Scansiona', sub: 'codice a barre', icon: ScanBarcode, to: '/nutrition/scan', c: 'var(--c-nutrition)' },
    { label: 'Pasto', sub: 'aggiungi alimento', icon: Utensils, to: '/nutrition/add', c: 'var(--c-nutrition)' },
    { label: 'Acqua', sub: `${fmtN(waterMl / 1000, 2)} / ${fmtN(settings.waterGoalMl / 1000, 1)} L`, icon: Droplets, onClick: addWater, c: 'var(--c-wellness)' },
    { label: 'Cardio', sub: 'registra attività', icon: HeartPulse, to: '/cardio?new=1', c: 'var(--c-cardio)' },
    { label: 'Peso', sub: 'nuova misura', icon: Scale, to: '/body?new=1', c: 'var(--c-progress)' },
    { label: 'Esercizi', sub: 'libreria', icon: Library, to: '/exercises', c: 'var(--c-exercises)' },
  ];

  const hero = (() => {
    if (doneToday.length) {
      const s = doneToday[doneToday.length - 1];
      const st = sessionStats(s);
      return (
        <section className="tday tday-done" aria-label="Allenamento di oggi">
          <ArtPanel visual="rest" className="tday-art" />
          <div className="tday-body">
            <span className="tday-eyebrow"><CheckCircle2 size={14} /> Completato oggi</span>
            <h2 className="tday-title">{s.name}</h2>
            <div className="tday-stats">
              <span><Clock size={15} /> {formatDuration(st.durationMs)}</span>
              <span><Layers size={15} /> {st.sets} serie</span>
              {st.volume > 0 && <span><Dumbbell size={15} /> {fmtN(st.volume)} kg</span>}
            </div>
            <p className="tday-note">Ottimo lavoro. Ora recupero, idratazione e una buona alimentazione.</p>
            <div className="tday-actions">
              <Link to={`/session/${s.id}`} className="btn primary lg grow">Vedi riepilogo</Link>
              <button className="btn glass lg" onClick={() => start(null)}>Altra sessione</button>
            </div>
          </div>
        </section>
      );
    }
    if (todayT) {
      const f = templateFocus(todayT);
      const cardioMin = Math.round(cardioMinutesOf(todayT));
      const strength = todayT.exercises.filter((e) => !e.cardio).length;
      return (
        <section className="tday" aria-label="Allenamento di oggi">
          <ArtPanel spec={{ kind: 'figure', pattern: f.lead.pattern, muscles: f.lead.muscles, phase: 0.5, scene: 'gym' }} color="var(--c-training)" color2="#334f00" animate className="tday-art" />
          <div className="tday-body">
            <span className="tday-eyebrow"><Dumbbell size={14} /> Allenamento di oggi{blockWeek ? ` · Sett. ${blockWeek.week + 1} di ${blockWeek.total} · ${WEEK_LABEL[blockWeek.info.kind]}` : program ? ` · ${program.name}` : ''}</span>
            <h2 className="tday-title">{todayT.name}</h2>
            {f.muscles.length > 0 && <div className="tday-muscles">{f.muscles.slice(0, 4).map((m) => <span key={m}>{MUSCLE_LABEL[m]}</span>)}</div>}
            <div className="tday-stats">
              {strength > 0 && <span><Layers size={15} /> {strength} esercizi</span>}
              <span><Clock size={15} /> ~{estimateMinutes(todayT)} min</span>
              {cardioMin > 0 && <span className="cardio"><HeartPulse size={15} /> {cardioMin} min cardio</span>}
            </div>
            <div className="tday-actions">
              <button className="btn primary lg grow" onClick={() => start(todayT.id)}><Play size={18} fill="currentColor" /> Inizia allenamento</button>
              <Link to={`/workouts/template/${todayT.id}`} className="btn glass lg" aria-label="Modifica scheda"><Pencil size={18} /></Link>
            </div>
          </div>
        </section>
      );
    }
    if (program) {
      return (
        <section className="tday" aria-label="Allenamento di oggi">
          <ArtPanel visual="rest" className="tday-art" />
          <div className="tday-body">
            <span className="tday-eyebrow"><Moon size={14} /> Giorno di riposo</span>
            <h2 className="tday-title">Recupera e ricarica</h2>
            <p className="tday-note">Il recupero fa parte dei progressi. Se vuoi, fai mobilità o un po’ di cardio leggero.</p>
            <div className="tday-actions">
              <Link to="/exercises?cat=mobility" className="btn primary lg grow">Mobilità</Link>
              <Link to="/cardio?new=1" className="btn glass lg">Cardio</Link>
              <button className="btn glass lg" onClick={() => start(null)} aria-label="Allenamento libero"><Plus size={18} /></button>
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className="tday" aria-label="Allenamento di oggi">
        <ArtPanel visual="empty_program" className="tday-art" />
        <div className="tday-body">
          <span className="tday-eyebrow"><Sparkles size={14} /> Inizia da qui</span>
          <h2 className="tday-title">Nessun programma attivo</h2>
          <p className="tday-note">Genera un programma su misura in pochi secondi, crea la tua scheda o allenati liberamente.</p>
          <div className="tday-actions">
            <Link to="/workouts/generate" className="btn primary lg grow"><Sparkles size={18} /> Genera programma</Link>
            <Link to="/workouts?new=1" className="btn glass lg">Crea</Link>
            <button className="btn glass lg" onClick={() => start(null)} aria-label="Allenamento libero"><Play size={18} /></button>
          </div>
        </div>
      </section>
    );
  })();

  return (
    <div className="page stack home">
      <header className="home-head">
        <Link to="/profile" className="avatar" aria-label="Profilo">{initials}</Link>
        <div className="grow">
          <div className="eyebrow">{formatLongDate(new Date())}</div>
          <h1 className="home-hello">{greeting()}, <span>{profile.name}</span></h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <SyncBadge />
          <Link to="/notifications" className="icon-btn" aria-label={`Notifiche${unread ? `, ${unread} non lette` : ''}`}>
            <Bell size={20} />{unread > 0 && <span className="badge-dot" />}
          </Link>
        </div>
      </header>

      {active && (
        <button className="live-banner" onClick={() => nav('/workout/live')}>
          <span className="live-ic"><Timer size={20} /></span>
          <span className="grow"><b>Allenamento in corso</b><span className="small">{active.name} · riprendi da dove eri rimasto</span></span>
          <ChevronRight />
        </button>
      )}

      <DailySummary onStartWorkout={(id) => void start(id)} />
      <WeeklyCard />

      <div className="home-grid">
        <div className="stack home-main">
          {hero}

          {/* Accessi rapidi */}
          <div className="quick" role="list" aria-label="Accessi rapidi">
            {quick.map((q) => {
              const inner = <><span className="q-ic"><q.icon size={20} /></span><b>{q.label}</b><span className="tiny muted">{q.sub}</span></>;
              const style = { ['--sc' as string]: q.c } as CSSProperties;
              return q.to
                ? <Link role="listitem" key={q.label} to={q.to} className="q-tile" style={style}>{inner}</Link>
                : <button role="listitem" key={q.label} className="q-tile" style={style} onClick={q.onClick} aria-label="Aggiungi un bicchiere d'acqua">{inner}</button>;
            })}
          </div>

          {/* Settimana */}
          <section className="card" aria-label="Calendario settimanale">
            <div className="card-title">
              <h3><CalendarDays size={18} /> La tua settimana</h3>
              <span className="row" style={{ gap: 2 }}>
                <Link to="/history" className="link">Storico</Link>
                <Link to={`/week?w=${dayKey(ws)}`} className="link">Riepilogo <ChevronRight size={16} /></Link>
              </span>
            </div>
            <div className="week">
              {week.map((d) => (
                <button key={d.k} className={`day ${d.tpl ? 'train' : ''} ${d.done.length ? 'done' : ''} ${d.k === today ? 'today' : ''} ${selDay === d.i ? 'sel' : ''}`} onClick={() => setSelDay(d.i)} aria-label={`${DAY_SHORT[d.i]} ${d.d.getDate()}: ${d.done.length ? 'allenamento completato' : d.tpl ? `in programma ${d.tpl.name}` : 'riposo'}`}>
                  <span className="dn">{DAY_SHORT[d.i]}</span><span className="dd">{d.d.getDate()}</span><span className="dot" />
                </button>
              ))}
            </div>
            <div className="week-sel">
              <span className="text-2 grow ellipsis">
                {sel.done.length ? `✓ ${sel.done.map((s) => s.name).join(', ')}` : sel.tpl ? `In programma: ${sel.tpl.name}` : 'Giorno di riposo'}
              </span>
              {sel.done[0] ? <Link to={`/session/${sel.done[0].id}`} className="btn sm">Dettagli</Link>
                : sel.tpl && sel.k >= today ? <button className="btn sm soft" onClick={() => start(sel.tpl!.id)}><Play size={14} fill="currentColor" /> Inizia</button> : null}
            </div>
          </section>

          {/* Coach */}
          <Link to="/coach" className="coach-card">
            <ArtPanel visual="coach" className="coach-art" />
            <span className="coach-body">
              <span className="eyebrow" style={{ color: 'var(--c-coach)' }}><Sparkles size={13} style={{ verticalAlign: -2 }} /> Personal Trainer AI</span>
              <b>{coachTip ? coachTip.title : 'Chiedi al tuo coach'}</b>
              <span className="small">{coachTip ? coachTip.body : 'Consigli su allenamenti, carichi e alimentazione basati sui tuoi dati.'}</span>
            </span>
            <ChevronRight className="coach-go" />
          </Link>

          {last && lastStats && (
            <Link to={`/session/${last.id}`} className="card clickable last-card">
              <div className="row-between"><span className="eyebrow">Ultimo allenamento</span><span className="tiny muted">{formatShortDate(last.startedAt)}</span></div>
              <div className="row-between" style={{ marginTop: 6 }}>
                <b className="ellipsis" style={{ fontSize: 17 }}>{last.name}</b>
                {!!last.prs?.length && <span className="pr-badge"><Trophy size={12} /> {last.prs.length} record</span>}
              </div>
              <div className="last-stats">
                <span><b className="num">{formatDuration(lastStats.durationMs)}</b><i>durata</i></span>
                <span><b className="num">{fmtN(lastStats.volume)}</b><i>kg volume</i></span>
                <span><b className="num">{lastStats.sets}</b><i>serie</i></span>
              </div>
            </Link>
          )}
        </div>

        <div className="stack home-side">
          {/* Riepilogo */}
          <section className="card summary" aria-label="Riepilogo di oggi">
            <div className="card-title"><h3>Oggi in sintesi</h3><Link to="/progress" className="link">Progressi <ChevronRight size={16} /></Link></div>
            <div className="summary-rings">
              <Link to="/goals" className="sr" aria-label={`Allenamenti della settimana: ${wk.done} su ${goal}`}>
                <Ring value={wk.done} max={goal} size={86} stroke={9} color="var(--c-training)"><div className="num sr-v">{wk.done}<span>/{goal}</span></div></Ring>
                <b>Allenamenti</b><span>questa settimana</span>
              </Link>
              <Link to="/nutrition" className="sr" aria-label={`Calorie: ${Math.round(todayFood.kcal)} su ${targets.kcal}`}>
                <Ring value={todayFood.kcal} max={targets.kcal} size={86} stroke={9} color="var(--c-nutrition)"><div className="num sr-v">{fmtN(todayFood.kcal)}</div></Ring>
                <b>Calorie</b><span>di {fmtN(targets.kcal)} kcal</span>
              </Link>
              <Link to="/nutrition" className="sr" aria-label={`Proteine: ${Math.round(todayFood.protein)} su ${targets.protein} grammi`}>
                <Ring value={todayFood.protein} max={targets.protein} size={86} stroke={9} color="var(--protein)"><div className="num sr-v">{Math.round(todayFood.protein)}<span>g</span></div></Ring>
                <b>Proteine</b><span>di {Math.round(targets.protein)} g</span>
              </Link>
            </div>
          </section>

          <div className="grid-2">
            <Link to="/body" className="card clickable metric" aria-label="Peso e andamento">
              <span className="eyebrow"><Scale size={13} style={{ verticalAlign: -2 }} /> Peso</span>
              <div className="num metric-v">{fmtW(curW, settings.units)}</div>
              <div className="tiny row" style={{ gap: 4, color: trend < 0 ? 'var(--success)' : trend > 0 ? 'var(--orange)' : 'var(--muted)' }}>
                {trend < 0 ? <TrendingDown size={14} /> : trend > 0 ? <TrendingUp size={14} /> : <Minus size={14} />}
                {prevW !== null ? `${trend > 0 ? '+' : ''}${fmtW(trend, settings.units)}` : 'Prima misura'}
              </div>
              {weights.length >= 2
                ? <Sparkline values={weights.slice(-14).map((m) => m.weightKg!)} color="var(--c-progress)" />
                : <div className="bar thin" style={{ marginTop: 10 }}><i style={{ width: `${goalPct * 100}%`, background: 'var(--c-progress)' }} /></div>}
              <div className="tiny muted">Obiettivo {fmtW(profile.targetWeightKg, settings.units)} · {Math.round(goalPct * 100)}%</div>
            </Link>
            <Link to="/wellness" className="card clickable metric" aria-label="Recupero e benessere">
              <span className="eyebrow"><BatteryMedium size={13} style={{ verticalAlign: -2 }} /> Recupero</span>
              <div className="row" style={{ gap: 10, marginTop: 4 }}>
                <Ring value={ready.score ?? 0} max={100} size={54} stroke={6} color={ready.tone === 'good' ? 'var(--success)' : ready.tone === 'ok' ? 'var(--warning)' : ready.tone === 'low' ? 'var(--danger)' : 'var(--surface-3)'}>
                  <b className="num" style={{ fontSize: 15 }}>{ready.score ?? '–'}</b>
                </Ring>
                <b className="small" style={{ lineHeight: 1.25 }}>{ready.label}</b>
              </div>
              <div className="tiny muted" style={{ marginTop: 'auto' }}>
                <Moon size={12} style={{ verticalAlign: -2 }} /> {w?.sleepHours ? `${w.sleepHours} h di sonno` : 'Sonno da registrare'}
              </div>
            </Link>
          </div>

          <EnergyCard />
        </div>
      </div>
    </div>
  );
}
