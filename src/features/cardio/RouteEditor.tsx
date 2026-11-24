/** Crea o modifica un percorso personalizzato (salvato nel profilo, quindi sincronizzato). */
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Play } from 'lucide-react';
import { SectionHero } from '@/design/SectionHero';
import { useToast } from '@/components/ui';
import { patchProfile, useProfile } from '@/app/data';
import { blankRoutePlan, findRoute, guessLevel, LEVEL_INFO, routeStats, type CustomRoute, type RouteMachine } from '@/lib/routes';
import { MACHINE_INFO } from '@/lib/cardio';
import { fmtN, uid } from '@/lib/util';
import type { CardioPlan } from '@/lib/types';
import { CardioPlanEditor } from '@/features/workouts/cardio-ui';
import { RouteChart } from './RouteChart';
import { startRoutePlan } from './RoutesPage';

export default function RouteEditor() {
  const { id = 'new' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const existing = id !== 'new' ? profile?.cardioRoutes?.find((r) => r.id === id) : undefined;
  const from = sp.get('from') ? findRoute(sp.get('from')!, profile) : undefined;
  const machine: RouteMachine = existing?.machine ?? from?.machine ?? (sp.get('m') === 'bike' ? 'bike' : 'treadmill');
  const [name, setName] = useState(existing?.name ?? (from ? `${from.name} (mio)` : 'Il mio percorso'));
  const [plan, setPlan] = useState<CardioPlan>(() => ({ ...(existing?.plan ?? from?.plan ?? blankRoutePlan(machine, profile)), mode: 'intervals' }));
  const exId = MACHINE_INFO[machine].ex.intervals ?? MACHINE_INFO[machine].ex.steady;
  const st = routeStats(plan);
  const level = guessLevel(plan);

  async function save(): Promise<CustomRoute | null> {
    const n = name.trim();
    if (!n) { toast('Dai un nome al percorso', 'error'); return null; }
    if (st.minutes < 1) { toast('Il percorso deve durare almeno un minuto', 'error'); return null; }
    const r: CustomRoute = { id: existing?.id ?? uid('rt_'), name: n, machine, level, plan: { ...plan, title: n }, createdAt: existing?.createdAt ?? new Date().toISOString() };
    const list = profile?.cardioRoutes ?? [];
    await patchProfile({ cardioRoutes: existing ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r] });
    return r;
  }

  return (
    <div className="page stack">
      <SectionHero section="cardio" back={`/cardio/routes?m=${machine}`} title={existing ? 'Modifica percorso' : 'Nuovo percorso'}
        desc={`${machine === 'bike' ? 'Cyclette' : 'Tapis roulant'} · imposta le fasi: ${machine === 'bike' ? 'durata e resistenza' : 'durata, velocità e pendenza'}.`} compact />

      <section className="card stack-sm">
        <div className="field"><label htmlFor="rt-name">Nome</label>
          <input id="rt-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Es. Salita del sabato" />
        </div>
        <RouteChart plan={plan} height={110} axis />
        <div className="row wrap small text-2" style={{ gap: 12 }}>
          <span>{st.minutes} min</span>
          <span style={{ color: LEVEL_INFO[level].color, fontWeight: 700 }}>{LEVEL_INFO[level].label}</span>
          {machine === 'treadmill' && st.maxSpeed != null && <span>fino a {fmtN(st.maxSpeed, 1)} km/h</span>}
          {machine === 'treadmill' && st.maxIncline != null && <span>pendenza fino a {fmtN(st.maxIncline, 1)}%</span>}
        </div>
      </section>

      <section className="card">
        <CardioPlanEditor plan={plan} onChange={(p) => setPlan({ ...p, mode: 'intervals' })} profile={profile ?? undefined} exerciseId={exId} />
      </section>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={async () => { const r = await save(); if (r) { toast('Percorso salvato', 'success'); nav(`/cardio/routes?m=${machine}`); } }}><Check size={17} /> Salva</button>
        <button className="btn primary grow" onClick={async () => { const r = await save(); if (r) { await startRoutePlan(r.plan, r.name); nav('/workout/live'); } }}><Play size={16} fill="currentColor" /> Salva e inizia</button>
      </div>
    </div>
  );
}
