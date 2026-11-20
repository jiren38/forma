import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Check, AlertTriangle, Settings2, Info, Bike, Dumbbell } from 'lucide-react';
import { useProfile, useSessions, saveTemplate, saveProgram, activateProgram } from '@/app/data';
import { PageHeader, Stepper, useToast } from '@/components/ui';
import { generateProgram, chooseSplit, analyzeEquipment, userCardioLimit, SPLIT_NAMES, MODE_LABEL, type SplitKind } from '@/lib/generator';
import { DAY_SHORT, EQUIPMENT_LABEL, GOAL_INFO, LEVEL_INFO } from '@/lib/labels';
import { machineLabel } from '@/lib/cardio';
import { CardioPlanLines } from './cardio-ui';
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
  // scelte manuali sul cardio (null = automatico)
  const [cardioDays, setCardioDays] = useState<{ n: number; round: 'up' | 'down' } | null>(null);
  const [cardioMin, setCardioMin] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const auto = chooseSplit({ ...profile, daysPerWeek: days });
  const analysis = analyzeEquipment(profile);
  const cardioOnly = analysis.mode === 'cardio_only';

  const g = useMemo(() => {
    const res = generateProgram({ ...profile, daysPerWeek: days, minutesPerSession: minutes }, sessions, { split: split === 'auto' ? undefined : split, daysPerWeek: days, minutes, variant: seed, cardioDays: cardioDays?.n, cardioDaysRound: cardioDays?.round, cardioMinutes: cardioMin ?? undefined });
    if (seed > 0 && res.mode !== 'cardio_only') {
      // variante: penalizza leggermente le scelte precedenti rigenerando con preferenza invertita
      const avoid = new Set(res.templates.flatMap((t) => t.exercises.filter((_, i) => (i + seed) % 2 === 0).map((e) => e.exerciseId)));
      const p2 = { ...profile, daysPerWeek: days, minutesPerSession: minutes, exercisePrefs: { ...profile.exercisePrefs, avoidIds: [...(profile.exercisePrefs?.avoidIds ?? []), ...avoid] } };
      const alt = generateProgram(p2, sessions, { split: split === 'auto' ? undefined : split, daysPerWeek: days, minutes, variant: seed, cardioDays: cardioDays?.n, cardioDaysRound: cardioDays?.round, cardioMinutes: cardioMin ?? undefined });
      if (alt.templates.every((t) => t.exercises.length >= 2)) return alt;
    }
    return res;
  }, [profile, sessions, split, days, minutes, seed, cardioDays, cardioMin]);

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
        {cardioOnly ? (
          <div className="field"><label>Suddivisione</label><div className="small text-2">Programma cardio: con la sola attrezzatura cardio non si possono generare schede muscolari.</div></div>
        ) : (
          <div className="field">
            <label>Suddivisione</label>
            <select className="select" value={split} onChange={(e) => setSplit(e.target.value as SplitKind | 'auto')}>
              <option value="auto">Automatica (consigliata: {SPLIT_NAMES[auto]})</option>
              {SPLIT_OPTIONS.map((s) => <option key={s} value={s}>{SPLIT_NAMES[s]}</option>)}
              {analysis.cardioMachines.length > 0 && <option value="cardio">Solo cardio</option>}
            </select>
          </div>
        )}
      </div>

      <div className="card stack-sm" aria-label="Attrezzatura considerata">
        <div className="row-between"><b>Attrezzatura considerata</b><span className={`pill ${g.mode === 'cardio_only' ? 'blue' : g.mode === 'mixed' ? 'accent' : ''}`}>{MODE_LABEL[g.mode]}</span></div>
        <div className="small row" style={{ gap: 6, alignItems: 'flex-start' }}><Dumbbell size={15} style={{ flex: 'none', marginTop: 2 }} /><span><b>Muscolare:</b> {analysis.strengthEquipment.length ? (profile.fullGym ? 'palestra completa' : analysis.strengthEquipment.map((e) => EQUIPMENT_LABEL[e].toLowerCase()).join(', ')) : 'nessun attrezzo'}</span></div>
        <div className="small row" style={{ gap: 6, alignItems: 'flex-start' }}><Bike size={15} style={{ flex: 'none', marginTop: 2 }} /><span><b>Cardio:</b> {analysis.cardioMachines.length ? analysis.cardioMachines.map((m) => machineLabel(m).toLowerCase()).join(', ') : 'nessuna macchina'}</span></div>
        <p className="hint">L’attrezzatura è un vincolo: il programma usa solo ciò che hai selezionato. <Link to="/profile/equipment" className="accent">Modifica attrezzatura</Link></p>
      </div>

      {g.cardioWeek.sessions > 0 && (
        <div className="card stack-sm" aria-label="Cardio settimanale">
          <div className="row-between"><b>Cardio settimanale</b>{g.cardioWeek.weightLoss && <span className="pill blue">Dimagrimento</span>}</div>
          {g.mode === 'mixed' && (
            <div className="grid-2">
              <div className="field"><label>Sedute con cardio</label><Stepper value={g.cardioWeek.sessions} min={1} max={days} onChange={(v) => setCardioDays({ n: v, round: v > g.cardioWeek.sessions ? 'up' : 'down' })} /></div>
              <div className="field"><label>Cardio per seduta</label><Stepper value={cardioMin ?? (Math.round(g.cardioWeek.perSession / 5) * 5 || 10)} min={10} max={userCardioLimit(minutes)} step={5} format={(v) => `${v} min`} onChange={setCardioMin} /></div>
            </div>
          )}
          {(cardioDays != null || cardioMin != null) && <button type="button" className="small accent" style={{ alignSelf: 'flex-start', background: 'none', border: 0, padding: 0 }} onClick={() => { setCardioDays(null); setCardioMin(null); }}>Torna alle impostazioni automatiche</button>}
          <div className="row-between small">
            <span><b>{g.cardioWeek.minutes} min</b> in {g.cardioWeek.sessions} {g.cardioWeek.sessions === 1 ? 'sessione' : 'sessioni'}</span>
            {g.cardioWeek.kcal != null && <span className="muted">≈ {Math.round(g.cardioWeek.kcal / 10) * 10} kcal (stima)</span>}
          </div>
          <div className="bar"><i style={{ width: `${Math.min(100, Math.round((g.cardioWeek.minutes / g.cardioWeek.target.goal) * 100))}%`, background: g.cardioWeek.minutes >= g.cardioWeek.target.start ? 'var(--accent)' : 'var(--blue)' }} /></div>
          <p className="hint">{g.cardioWeek.progressed > g.cardioWeek.minutes + 4 ? `Con la progressione automatica arrivi a circa ${g.cardioWeek.progressed} min a settimana. ` : ''}Consigliati: almeno {g.cardioWeek.target.start} min a settimana{g.cardioWeek.weightLoss ? `, fino a ${g.cardioWeek.target.goal}` : ''} (linee guida OMS e ACSM). Puoi cambiare sedute e minuti qui sopra; la parte con i pesi si adatta al tempo che resta. Le calorie sono una stima.</p>
        </div>
      )}

      {g.warnings.map((w, i) => <div key={i} className="banner warn"><AlertTriangle size={18} /><span>{w}</span></div>)}
      {g.notes.map((w, i) => <div key={`n${i}`} className="banner info"><Info size={18} /><span>{w}</span></div>)}

      <div className="section-title">Anteprima · {g.program.name}
        <button className="btn sm ghost" onClick={() => setSeed((s) => s + 1)} style={{ textTransform: 'none', letterSpacing: 0 }}><RefreshCw size={15} /> Variante</button>
      </div>
      <div className="card">
        <div className="week" style={{ marginBottom: 4 }}>
          {g.program.schedule.map((tid, i) => {
            const idx = g.templates.findIndex((t) => t.id === tid);
            return (
              <div key={i} className={`day ${tid ? 'train' : ''}`} style={{ cursor: 'default' }}>
                <span className="dn">{DAY_SHORT[i]}</span><span className="dd" style={{ fontSize: 14 }}>{tid ? String.fromCharCode(65 + idx) : '–'}</span>
                {tid && g.templates[idx]?.exercises.some((e) => e.cardio) ? <Bike size={12} color="var(--blue)" aria-label="con cardio" /> : <span className="dot" />}
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
            {t.exercises.some((e) => !e.cardio) && <>
              {t.exercises.some((e) => e.cardio) && <div className="group-label"><Dumbbell size={13} /> Allenamento muscolare</div>}
              <ol className="stack-sm" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {t.exercises.filter((e) => !e.cardio).map((e) => {
                  const ex = getExercise(e.exerciseId);
                  return (
                    <li key={e.uid} className="small">
                      <Link to={`/exercises/${e.exerciseId}`} style={{ fontWeight: 600 }}>{ex?.name}</Link>
                      <span className="muted"> · {e.sets}×{e.repMin}–{e.repMax}{ex?.tracking === 'time' ? ' s' : ''} · rec. {formatClock(e.restSec)}</span>
                    </li>
                  );
                })}
              </ol>
            </>}
            {t.exercises.some((e) => e.cardio) && <>
              <div className="group-label cardio" style={{ marginTop: 10 }}><Bike size={13} /> Allenamento cardio</div>
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {t.exercises.filter((e) => e.cardio).map((e) => (
                  <div key={e.uid} className="cardio-box" style={{ padding: 10 }}>
                    <Link to={`/exercises/${e.exerciseId}`} className="small" style={{ fontWeight: 700 }}>{getExercise(e.exerciseId)?.name}</Link>
                    <CardioPlanLines plan={e.cardio!} compact />
                  </div>
                ))}
              </div>
            </>}
          </div>
        ))}
      </div>
      <p className="hint">Il programma è un punto di partenza basato su principi generali di allenamento: adatta carichi e volume alle tue sensazioni. Con dolori o condizioni mediche consulta un professionista.</p>
      <button className="btn primary lg fab" disabled={busy || !g.templates.length} onClick={save}>{busy ? 'Salvataggio…' : <><Check size={18} /> Salva e attiva</>}</button>
    </div>
  );
}
