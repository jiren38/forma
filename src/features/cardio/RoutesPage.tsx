/**
 * Percorsi guidati per tapis roulant e cyclette: predefiniti (facili, medi, difficili)
 * e personalizzati. "Inizia" apre l'allenamento con il percorso; lì si collega l'attrezzo
 * e, se si attivano i comandi, l'app lo guida fase per fase.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Copy, Gauge, Mountain, Pencil, Play, Plus, Route as RouteIcon, SlidersHorizontal, Trash2, Zap } from 'lucide-react';
import { SectionHero } from '@/design/SectionHero';
import { Confirm, Segmented, Sheet, useToast } from '@/components/ui';
import { patchProfile, useProfile } from '@/app/data';
import { store } from '@/db/store';
import { LEVEL_INFO, routeStats, routesFor, type CardioRoute, type RouteLevel, type RouteMachine } from '@/lib/routes';
import { MACHINE_INFO, PHASE_LABEL } from '@/lib/cardio';
import { formatClock, fmtN } from '@/lib/util';
import { activeSession, exerciseLogFor, saveSession, startSession } from '@/features/workouts/session';
import type { CardioPlan, WorkoutSession } from '@/lib/types';
import { RouteChart } from './RouteChart';

/** Avvia (o aggiunge all'allenamento in corso) un'attività cardio con il percorso e apre la modalità live. */
export async function startRoutePlan(plan: CardioPlan, name: string) {
  const exId = MACHINE_INFO[plan.machine].ex.intervals ?? MACHINE_INFO[plan.machine].ex.steady;
  const existing = activeSession();
  const s = existing ?? (await startSession(null, name));
  const log = exerciseLogFor(exId, store.list<WorkoutSession>('sessions'), { cardio: { ...plan, title: name } });
  await saveSession({ ...s, exercises: [...s.exercises, log] });
  return !!existing;
}

const LEVELS: RouteLevel[] = ['easy', 'medium', 'hard'];

export default function RoutesPage() {
  const profile = useProfile();
  const [sp, setSp] = useSearchParams();
  const machine = (sp.get('m') === 'bike' ? 'bike' : 'treadmill') as RouteMachine;
  const routes = useMemo(() => routesFor(machine, profile), [machine, profile]);
  const [open, setOpen] = useState<CardioRoute | null>(null);
  const mine = routes.filter((r) => r.custom);

  return (
    <div className="page stack">
      <SectionHero section="cardio" back="/cardio" title="Percorsi" desc="Scegli un percorso: collegando l’attrezzo, l’app cambia velocità e pendenza (o resistenza) al posto tuo." />

      <Segmented label="Attrezzo" value={machine} onChange={(m) => setSp({ m }, { replace: true })}
        options={[{ value: 'treadmill', label: 'Tapis roulant' }, { value: 'bike', label: 'Cyclette' }]} />

      {LEVELS.map((lv) => {
        const list = routes.filter((r) => !r.custom && r.level === lv);
        if (!list.length) return null;
        return (
          <section key={lv} className="stack-sm">
            <div className="section-title"><span className="row" style={{ gap: 8 }}><span className="lvl-dot" style={{ background: LEVEL_INFO[lv].color }} />{LEVEL_INFO[lv].label}</span></div>
            <div className="route-grid">{list.map((r) => <RouteCard key={r.id} r={r} onOpen={() => setOpen(r)} />)}</div>
          </section>
        );
      })}

      <section className="stack-sm">
        <div className="row-between">
          <div className="section-title" style={{ margin: 0 }}>I miei percorsi</div>
          <Link className="btn sm" to={`/cardio/routes/edit/new?m=${machine}`}><Plus size={15} /> Crea percorso</Link>
        </div>
        {mine.length
          ? <div className="route-grid">{mine.map((r) => <RouteCard key={r.id} r={r} onOpen={() => setOpen(r)} />)}</div>
          : <p className="small text-2">Non hai ancora creato percorsi. Puoi partire da zero o personalizzarne uno qui sopra con “Personalizza”.</p>}
      </section>

      {open && <RouteSheet r={open} onClose={() => setOpen(null)} onDeleted={async () => {
        await patchProfile({ cardioRoutes: (profile?.cardioRoutes ?? []).filter((x) => x.id !== open.id) });
        setOpen(null);
      }} />}
    </div>
  );
}

function RouteCard({ r, onOpen }: { r: CardioRoute; onOpen: () => void }) {
  const st = routeStats(r.plan);
  return (
    <button className="route-card" onClick={onOpen} aria-label={`${r.name}, ${LEVEL_INFO[r.level].label}, ${st.minutes} minuti`}>
      <RouteChart plan={r.plan} height={64} />
      <div className="route-card-body">
        <div className="row-between" style={{ gap: 6 }}>
          <b className="ellipsis">{r.name}</b>
          <span className="lvl-pill" style={{ ['--lc' as string]: LEVEL_INFO[r.level].color } as React.CSSProperties}>{LEVEL_INFO[r.level].label}</span>
        </div>
        <div className="route-meta">
          <span><Clock size={12} /> {st.minutes} min</span>
          {r.machine === 'treadmill' ? <>
            {st.maxSpeed != null && <span><Gauge size={12} /> {fmtN(st.maxSpeed, 1)} km/h</span>}
            {st.maxIncline != null && <span><Mountain size={12} /> {fmtN(st.maxIncline)}%</span>}
          </> : st.maxResistance != null && <span><SlidersHorizontal size={12} /> fino a {fmtN(st.maxResistance)}</span>}
        </div>
      </div>
    </button>
  );
}

function RouteSheet({ r, onClose, onDeleted }: { r: CardioRoute; onClose: () => void; onDeleted: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const st = routeStats(r.plan);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const added = await startRoutePlan(r.plan, r.name);
      if (added) toast('Percorso aggiunto all’allenamento in corso', 'success');
      nav('/workout/live');
    } finally { setBusy(false); }
  }

  return (
    <Sheet open onClose={onClose} title={r.name} footer={<>
      {r.custom
        ? <Link className="btn" to={`/cardio/routes/edit/${r.id}`}><Pencil size={16} /> Modifica</Link>
        : <Link className="btn" to={`/cardio/routes/edit/new?from=${r.id}&m=${r.machine}`}><Copy size={16} /> Personalizza</Link>}
      <button className="btn primary grow" onClick={start} disabled={busy}><Play size={16} fill="currentColor" /> Inizia</button>
    </>}>
      <div className="stack-sm">
        <div className="row" style={{ gap: 8 }}>
          <span className="lvl-pill" style={{ ['--lc' as string]: LEVEL_INFO[r.level].color } as React.CSSProperties}>{LEVEL_INFO[r.level].label}</span>
          <span className="small text-2">{r.desc}</span>
        </div>
        <RouteChart plan={r.plan} height={130} axis />
        <div className="route-kpis">
          <div><b>{st.minutes}</b><span>minuti</span></div>
          {r.machine === 'treadmill' ? <>
            <div><b>{st.maxSpeed != null ? fmtN(st.maxSpeed, 1) : '–'}</b><span>km/h max</span></div>
            <div><b>{st.maxIncline != null ? fmtN(st.maxIncline) : '–'}%</b><span>pendenza max</span></div>
            <div><b>{st.distKm != null ? fmtN(st.distKm, 1) : '–'}</b><span>km circa</span></div>
          </> : <>
            <div><b>{st.maxResistance ?? '–'}</b><span>resistenza max</span></div>
            <div><b>{r.plan.resistanceMax ?? '–'}</b><span>livelli</span></div>
          </>}
        </div>
        <div className="phase-list" aria-label="Fasi del percorso">
          {st.phases.map((p) => (
            <div key={p.uid} className="phase-row">
              <span className={`k ${p.kind}`} aria-hidden />
              <span className="grow ellipsis">{p.label || PHASE_LABEL[p.kind]}</span>
              <span className="tiny muted">{r.machine === 'treadmill'
                ? `${fmtN(p.speedKmh ?? 0, 1)} km/h · ${fmtN(p.inclinePct ?? 0)}%`
                : `resistenza ${p.resistance ?? '–'}${p.rpm ? ` · ${p.rpm} rpm` : ''}`}</span>
              <span className="num" style={{ width: 44, textAlign: 'right' }}>{formatClock(p.durationSec)}</span>
            </div>
          ))}
        </div>
        <div className="banner"><Zap size={18} /><span>Dopo “Inizia”, collega {r.machine === 'bike' ? 'la cyclette' : 'il tapis'} e tocca <b>Comanda {r.machine === 'bike' ? 'la cyclette' : 'il tapis'} dall’app</b>: {r.machine === 'bike' ? 'la resistenza cambierà' : 'velocità e pendenza cambieranno'} da sole a ogni fase. Senza comandi puoi seguirlo a mano.</span></div>
        {r.custom && <button className="btn ghost sm" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setDel(true)}><Trash2 size={15} /> Elimina percorso</button>}
        <p className="tiny muted row" style={{ gap: 4 }}><RouteIcon size={12} /> L’app non supera mai i limiti di velocità, pendenza e resistenza che imposti quando attivi i comandi.</p>
      </div>
      <Confirm open={del} title="Eliminare il percorso?" body={`“${r.name}” verrà eliminato.`} confirmLabel="Elimina" danger onConfirm={onDeleted} onClose={() => setDel(false)} />
    </Sheet>
  );
}
