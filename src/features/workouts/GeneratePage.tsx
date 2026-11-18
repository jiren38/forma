import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Check, AlertTriangle, Settings2 } from 'lucide-react';
import { useProfile, useSessions, saveTemplate, saveProgram, activateProgram } from '@/app/data';
import { PageHeader, Stepper, useToast } from '@/components/ui';
import { generateProgram, chooseSplit, SPLIT_NAMES, type SplitKind } from '@/lib/generator';
import { DAY_SHORT, GOAL_INFO, LEVEL_INFO } from '@/lib/labels';
import { getExercise } from '@/data/exercises';
import { formatClock } from '@/lib/util';
import { estimateMinutes } from './WorkoutsPage';

const SPLIT_OPTIONS: SplitKind[] = ['full_body', 'upper_lower', 'ppl', 'ppl_ul', 'bro_split', 'home', 'conditioning'];

export default function GeneratePage() {
  const profile = useProfile()!;
  const sessions = useSessions();
  const nav = useNavigate();
  const toast = useToast();
  const [split, setSplit] = useState<SplitKind | 'auto'>('auto');
  const [days, setDays] = useState(profile.daysPerWeek);
  const [minutes, setMinutes] = useState(profile.minutesPerSession);
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const auto = chooseSplit({ ...profile, daysPerWeek: days });

  const g = useMemo(() => {
    const res = generateProgram({ ...profile, daysPerWeek: days, minutesPerSession: minutes }, sessions, { split: split === 'auto' ? undefined : split, daysPerWeek: days, minutes });
    if (seed > 0) {
      // variante: penalizza leggermente le scelte precedenti rigenerando con preferenza invertita
      const avoid = new Set(res.templates.flatMap((t) => t.exercises.filter((_, i) => (i + seed) % 2 === 0).map((e) => e.exerciseId)));
      const p2 = { ...profile, daysPerWeek: days, minutesPerSession: minutes, exercisePrefs: { ...profile.exercisePrefs, avoidIds: [...(profile.exercisePrefs?.avoidIds ?? []), ...avoid] } };
      const alt = generateProgram(p2, sessions, { split: split === 'auto' ? undefined : split, daysPerWeek: days, minutes });
      if (alt.templates.every((t) => t.exercises.length >= 2)) return alt;
    }
    return res;
  }, [profile, sessions, split, days, minutes, seed]);

  async function save() {
    setBusy(true);
    try {
      for (const t of g.templates) await saveTemplate(t);
      await saveProgram(g.program);
      await activateProgram(g.program.id);
      toast('Programma creato e attivato');
      nav('/workouts', { replace: true });
    } finally { setBusy(false); }
  }

  return (
    <div className="page stack" style={{ paddingBottom: 110 }}>
      <PageHeader title="Genera programma" back sub="Basato sul tuo profilo: puoi modificare tutto dopo" />

      <div className="card stack-sm">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="pill">{LEVEL_INFO[profile.level].label}</span>
          {profile.goals.map((x) => <span key={x} className="pill accent">{GOAL_INFO[x].label}</span>)}
          <span className="pill">{profile.fullGym ? 'Palestra completa' : `${profile.equipment.length} attrezzi`}</span>
          {profile.injuries.length > 0 && <span className="pill orange">Limitazioni indicate</span>}
        </div>
        <Link to="/profile/edit" className="small accent row" style={{ gap: 4 }}><Settings2 size={14} /> Modifica obiettivi, livello e preferenze</Link>
      </div>

      <div className="card stack">
        <div className="grid-2">
          <div className="field"><label>Giorni a settimana</label><Stepper value={days} min={1} max={7} onChange={setDays} /></div>
          <div className="field"><label>Minuti per sessione</label><Stepper value={minutes} min={15} max={150} step={15} onChange={setMinutes} /></div>
        </div>
        <div className="field">
          <label>Suddivisione</label>
          <select className="select" value={split} onChange={(e) => setSplit(e.target.value as SplitKind | 'auto')}>
            <option value="auto">Automatica (consigliata: {SPLIT_NAMES[auto]})</option>
            {SPLIT_OPTIONS.map((s) => <option key={s} value={s}>{SPLIT_NAMES[s]}</option>)}
          </select>
        </div>
      </div>

      {g.warnings.map((w, i) => <div key={i} className="banner warn"><AlertTriangle size={18} /><span>{w}</span></div>)}

      <div className="section-title">Anteprima · {g.program.name}
        <button className="btn sm ghost" onClick={() => setSeed((s) => s + 1)} style={{ textTransform: 'none', letterSpacing: 0 }}><RefreshCw size={15} /> Variante</button>
      </div>
      <div className="card">
        <div className="week" style={{ marginBottom: 4 }}>
          {g.program.schedule.map((tid, i) => {
            const idx = g.templates.findIndex((t) => t.id === tid);
            return (
              <div key={i} className={`day ${tid ? 'train' : ''}`} style={{ cursor: 'default' }}>
                <span className="dn">{DAY_SHORT[i]}</span><span className="dd" style={{ fontSize: 14 }}>{tid ? String.fromCharCode(65 + idx) : '–'}</span><span className="dot" />
              </div>
            );
          })}
        </div>
      </div>
      <div className="stack-sm">
        {g.templates.map((t, i) => (
          <div key={t.id} className="card">
            <div className="row-between" style={{ marginBottom: 8 }}>
              <h3><span className="pill accent" style={{ marginRight: 8 }}>{String.fromCharCode(65 + i)}</span>{t.name}</h3>
              <span className="tiny muted">~{estimateMinutes(t)} min</span>
            </div>
            <ol className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
              {t.exercises.map((e) => {
                const ex = getExercise(e.exerciseId);
                return (
                  <li key={e.uid} className="small">
                    <Link to={`/exercises/${e.exerciseId}`} style={{ fontWeight: 600 }}>{ex?.name}</Link>
                    <span className="muted"> · {e.sets}×{e.repMin}–{e.repMax}{ex?.tracking === 'time' ? ' s' : ''} · rec. {formatClock(e.restSec)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      <p className="hint">Il programma è un punto di partenza basato su principi generali di allenamento: adatta carichi e volume alle tue sensazioni. Con dolori o condizioni mediche consulta un professionista.</p>
      <button className="btn primary lg fab" disabled={busy || !g.templates.length} onClick={save}>{busy ? 'Salvataggio…' : <><Check size={18} /> Salva e attiva</>}</button>
    </div>
  );
}
