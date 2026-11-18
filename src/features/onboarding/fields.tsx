/** Blocchi di form riutilizzati da onboarding e modifica profilo. */
import { Home, Trees, Building2, Wrench, Zap, Clock, Dumbbell, Cog } from 'lucide-react';
import type { Equipment, Goal, Injury, Level, MuscleGroup, Profile, SplitPref } from '@/lib/types';
import { ACTIVITY_INFO, DAY_SHORT, EQUIPMENT_LABEL, FULL_GYM, GOAL_INFO, INJURY_LABEL, LEVEL_INFO, MAIN_MUSCLES, MUSCLE_LABEL, SELECTABLE_EQUIPMENT, SPLIT_INFO } from '@/lib/labels';
import { NumberInput, Option, Segmented } from '@/components/ui';
import { EquipmentIcon } from '@/components/equipment-icons';

type Set_ = (p: Partial<Profile>) => void;
const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function PersonalFields({ p, set, errors }: { p: Profile; set: Set_; errors: Record<string, string> }) {
  return (
    <div className="stack-sm">
      <div className="grid-2">
        <div className="field"><label>Età</label><NumberInput value={p.age || null} onChange={(v) => set({ age: v ?? 0 })} suffix="anni" invalid={!!errors.age} ariaLabel="Età" />{errors.age && <span className="error-text">{errors.age}</span>}</div>
        <div className="field"><label>Altezza</label><NumberInput value={p.heightCm || null} onChange={(v) => set({ heightCm: v ?? 0 })} suffix="cm" invalid={!!errors.heightCm} ariaLabel="Altezza" />{errors.heightCm && <span className="error-text">{errors.heightCm}</span>}</div>
        <div className="field"><label>Peso attuale</label><NumberInput value={p.weightKg || null} onChange={(v) => set({ weightKg: v ?? 0 })} suffix="kg" invalid={!!errors.weightKg} ariaLabel="Peso attuale" />{errors.weightKg && <span className="error-text">{errors.weightKg}</span>}</div>
        <div className="field"><label>Peso obiettivo</label><NumberInput value={p.targetWeightKg || null} onChange={(v) => set({ targetWeightKg: v ?? 0 })} suffix="kg" invalid={!!errors.targetWeightKg} ariaLabel="Peso obiettivo" />{errors.targetWeightKg && <span className="error-text">{errors.targetWeightKg}</span>}</div>
      </div>
      <div className="field">
        <label>Sesso <span className="muted">(usato solo per le stime fisiologiche)</span></label>
        <Segmented value={p.sex} onChange={(v) => set({ sex: v })} options={[{ value: 'male', label: 'Uomo' }, { value: 'female', label: 'Donna' }, { value: 'unspecified', label: 'Preferisco non dirlo' }]} label="Sesso" />
      </div>
      <div className="field">
        <label>Massa grassa <span className="muted">(facoltativa, se la conosci)</span></label>
        <NumberInput value={p.bodyFatPct ?? null} onChange={(v) => set({ bodyFatPct: v })} suffix="%" ariaLabel="Percentuale di massa grassa" invalid={!!errors.bodyFatPct} />
        {errors.bodyFatPct && <span className="error-text">{errors.bodyFatPct}</span>}
      </div>
    </div>
  );
}

export function validatePersonal(p: Profile) {
  const e: Record<string, string> = {};
  if (!p.age || p.age < 14 || p.age > 100) e.age = 'Età tra 14 e 100 anni';
  if (!p.heightCm || p.heightCm < 120 || p.heightCm > 230) e.heightCm = 'Altezza tra 120 e 230 cm';
  if (!p.weightKg || p.weightKg < 30 || p.weightKg > 300) e.weightKg = 'Peso tra 30 e 300 kg';
  if (!p.targetWeightKg || p.targetWeightKg < 30 || p.targetWeightKg > 300) e.targetWeightKg = 'Peso obiettivo tra 30 e 300 kg';
  if (p.bodyFatPct != null && (p.bodyFatPct < 3 || p.bodyFatPct > 60)) e.bodyFatPct = 'Valore tra 3 e 60%';
  return e;
}

export function LevelPicker({ p, set }: { p: Profile; set: Set_ }) {
  return (
    <div className="col">
      {(Object.keys(LEVEL_INFO) as Level[]).map((l) => (
        <Option key={l} row on={p.level === l} onClick={() => set({ level: l })} title={LEVEL_INFO[l].label} desc={LEVEL_INFO[l].desc}
          icon={<span className="num" style={{ fontWeight: 800 }}>{l === 'beginner' ? 'I' : l === 'intermediate' ? 'II' : 'III'}</span>} />
      ))}
    </div>
  );
}

export function GoalsPicker({ p, set }: { p: Profile; set: Set_ }) {
  return (
    <div className="option-grid">
      {(Object.keys(GOAL_INFO) as Goal[]).map((g) => (
        <Option key={g} on={p.goals.includes(g)} onClick={() => set({ goals: toggle(p.goals, g) })} title={GOAL_INFO[g].label} desc={GOAL_INFO[g].desc} />
      ))}
    </div>
  );
}

const MINUTES = [15, 30, 45, 60, 90];
export function FrequencyFields({ p, set }: { p: Profile; set: Set_ }) {
  const custom = !MINUTES.includes(p.minutesPerSession);
  return (
    <div className="stack">
      <div className="field">
        <label>Giorni di allenamento a settimana</label>
        <div className="segmented" style={{ gridAutoColumns: '1fr' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => <button key={d} type="button" className={p.daysPerWeek === d ? 'on' : ''} onClick={() => set({ daysPerWeek: d })} aria-pressed={p.daysPerWeek === d}>{d}</button>)}
        </div>
      </div>
      <div className="field">
        <label>Tempo per allenamento</label>
        <div className="chips wrap">
          {MINUTES.map((m) => <button key={m} type="button" className={`chip accent ${p.minutesPerSession === m ? 'on' : ''}`} onClick={() => set({ minutesPerSession: m })}>{m} min</button>)}
          <button type="button" className={`chip accent ${custom ? 'on' : ''}`} onClick={() => set({ minutesPerSession: custom ? p.minutesPerSession : 75 })}>Personalizzato</button>
        </div>
        {custom && <NumberInput value={p.minutesPerSession} onChange={(v) => set({ minutesPerSession: Math.max(10, Math.min(180, v ?? 60)) })} suffix="min" ariaLabel="Minuti personalizzati" />}
      </div>
      <div className="field">
        <label>Giorni preferiti <span className="muted">(facoltativo)</span></label>
        <div className="week">
          {DAY_SHORT.map((d, i) => (
            <button key={d} type="button" className={`day ${p.preferredDays.includes(i) ? 'done' : ''}`} style={p.preferredDays.includes(i) ? { borderColor: 'var(--accent)' } : undefined} onClick={() => set({ preferredDays: toggle(p.preferredDays, i).sort() })} aria-pressed={p.preferredDays.includes(i)}>
              <span className="dn">{d}</span><span className="dot" />
            </button>
          ))}
        </div>
        {p.preferredDays.length > 0 && p.preferredDays.length !== p.daysPerWeek && <span className="hint">Hai scelto {p.preferredDays.length} giorni preferiti su {p.daysPerWeek} allenamenti: completeremo o ridurremo noi la selezione.</span>}
      </div>
      <div className="field">
        <label>Che tipo di sessioni preferisci?</label>
        <div className="grid-2">
          <Option on={p.sessionStyle === 'short_intense'} onClick={() => set({ sessionStyle: 'short_intense' })} title="Brevi e intense" desc="Recuperi corti, ritmo alto" icon={<Zap size={20} />} />
          <Option on={p.sessionStyle === 'long'} onClick={() => set({ sessionStyle: 'long' })} title="Più lunghe" desc="Recuperi completi, più volume" icon={<Clock size={20} />} />
        </div>
      </div>
    </div>
  );
}

export function SplitPicker({ p, set }: { p: Profile; set: Set_ }) {
  return (
    <div className="col">
      {(Object.keys(SPLIT_INFO) as SplitPref[]).map((s) => (
        <Option key={s} row on={p.split === s} onClick={() => set({ split: s })} title={SPLIT_INFO[s].label} desc={SPLIT_INFO[s].desc} />
      ))}
    </div>
  );
}

export function OtherFields({ p, set }: { p: Profile; set: Set_ }) {
  return (
    <div className="stack">
      <div className="field">
        <label>Infortuni o limitazioni fisiche</label>
        <div className="chips wrap">
          {(Object.keys(INJURY_LABEL) as Injury[]).map((i) => <button key={i} type="button" className={`chip ${p.injuries.includes(i) ? 'on' : ''}`} onClick={() => set({ injuries: toggle(p.injuries, i) })}>{INJURY_LABEL[i]}</button>)}
        </div>
        <textarea className="textarea" placeholder="Dettagli facoltativi (es. operazione al menisco nel 2022)" value={p.injuryNotes} onChange={(e) => set({ injuryNotes: e.target.value.slice(0, 500) })} aria-label="Note sugli infortuni" />
        {(p.injuries.length > 0 || p.injuryNotes) && <div className="banner warn small">Useremo queste informazioni solo per segnalare esercizi potenzialmente poco adatti. Non è una valutazione medica: in caso di dolore o dubbi rivolgiti a un medico, fisioterapista o professionista qualificato.</div>}
      </div>
      <div className="field">
        <label>Gruppi muscolari da sviluppare di più</label>
        <div className="chips wrap">
          {MAIN_MUSCLES.map((m) => <button key={m} type="button" className={`chip accent ${p.focusMuscles.includes(m) ? 'on' : ''}`} onClick={() => set({ focusMuscles: toggle(p.focusMuscles, m), lessMuscles: p.lessMuscles.filter((x) => x !== m) })}>{MUSCLE_LABEL[m]}</button>)}
        </div>
      </div>
      <div className="field">
        <label>Gruppi da allenare meno frequentemente</label>
        <div className="chips wrap">
          {MAIN_MUSCLES.map((m) => <button key={m} type="button" className={`chip ${p.lessMuscles.includes(m) ? 'on' : ''}`} onClick={() => set({ lessMuscles: toggle(p.lessMuscles, m as MuscleGroup), focusMuscles: p.focusMuscles.filter((x) => x !== m) })}>{MUSCLE_LABEL[m]}</button>)}
        </div>
      </div>
      <div className="field">
        <label>Preferenze sugli esercizi</label>
        <div className="grid-2">
          <Option on={p.exercisePrefs.preferFree} onClick={() => set({ exercisePrefs: { ...p.exercisePrefs, preferFree: !p.exercisePrefs.preferFree } })} title="Pesi liberi" desc="Bilancieri, manubri, kettlebell" icon={<Dumbbell size={20} />} />
          <Option on={p.exercisePrefs.preferMachines} onClick={() => set({ exercisePrefs: { ...p.exercisePrefs, preferMachines: !p.exercisePrefs.preferMachines } })} title="Macchinari" desc="Più guidati e semplici" icon={<Cog size={20} />} />
        </div>
      </div>
      <div className="field">
        <label>Attività fisica quotidiana (fuori dalla palestra)</label>
        <div className="col">
          {(Object.keys(ACTIVITY_INFO) as Profile['activity'][]).map((a) => <Option key={a} row on={p.activity === a} onClick={() => set({ activity: a })} title={ACTIVITY_INFO[a].label} desc={ACTIVITY_INFO[a].desc} />)}
        </div>
      </div>
    </div>
  );
}

export function DietFields({ p, set }: { p: Profile; set: Set_ }) {
  return (
    <div className="stack-sm">
      <div className="field">
        <label>Stile alimentare</label>
        <Segmented value={p.diet.pattern} onChange={(v) => set({ diet: { ...p.diet, pattern: v } })} options={[{ value: 'omnivore', label: 'Onnivoro' }, { value: 'pescatarian', label: 'Pescetariano' }, { value: 'vegetarian', label: 'Vegetariano' }, { value: 'vegan', label: 'Vegano' }]} label="Stile alimentare" />
      </div>
      <div className="field"><label>Allergie o intolleranze</label><input className="input" value={p.diet.allergies} onChange={(e) => set({ diet: { ...p.diet, allergies: e.target.value.slice(0, 200) } })} placeholder="Es. lattosio, frutta a guscio" /></div>
      <div className="field">
        <label>Pasti al giorno</label>
        <div className="segmented">{[2, 3, 4, 5, 6].map((n) => <button key={n} type="button" className={p.diet.mealsPerDay === n ? 'on' : ''} onClick={() => set({ diet: { ...p.diet, mealsPerDay: n } })}>{n}</button>)}</div>
      </div>
    </div>
  );
}

const LOCATIONS: { id: Profile['location'][number]; label: string; icon: JSX.Element }[] = [
  { id: 'commercial_gym', label: 'Palestra commerciale', icon: <Building2 size={20} /> },
  { id: 'home', label: 'Allenamento a casa', icon: <Home size={20} /> },
  { id: 'outdoor', label: 'All’aperto', icon: <Trees size={20} /> },
  { id: 'custom', label: 'Attrezzatura personalizzata', icon: <Wrench size={20} /> },
];

export function EquipmentPicker({ p, set }: { p: Profile; set: Set_ }) {
  const has = (e: Equipment) => p.fullGym ? FULL_GYM.includes(e) || p.equipment.includes(e) : p.equipment.includes(e);
  return (
    <div className="stack">
      <div className="field">
        <label>Dove ti alleni?</label>
        <div className="grid-2">
          {LOCATIONS.map((l) => (
            <Option key={l.id} on={p.location.includes(l.id)} icon={l.icon} title={l.label} onClick={() => {
              const loc = toggle(p.location, l.id);
              set({ location: loc, fullGym: l.id === 'commercial_gym' && loc.includes('commercial_gym') ? true : p.fullGym });
            }} />
          ))}
        </div>
      </div>
      <button type="button" className={`option row-opt ${p.fullGym ? 'on' : ''}`} onClick={() => set({ fullGym: !p.fullGym })} aria-pressed={p.fullGym}>
        <span className="o-icon"><Building2 size={22} /></span>
        <span className="col" style={{ gap: 2 }}><span className="o-title">Palestra completa</span><span className="o-desc">Considera disponibile l’attrezzatura standard di una palestra ben attrezzata</span></span>
        <span className="check">✓</span>
      </button>
      <div className="field">
        <div className="row-between"><label>Attrezzatura disponibile</label><span className="muted small">{p.fullGym ? 'Palestra completa + extra' : `${p.equipment.length} selezionati`}</span></div>
        <div className="option-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
          {SELECTABLE_EQUIPMENT.map((e) => (
            <button key={e} type="button" className={`option ${has(e) ? 'on' : ''}`} style={{ alignItems: 'center', textAlign: 'center', padding: '14px 8px', minHeight: 108 }}
              onClick={() => {
                if (p.fullGym && FULL_GYM.includes(e)) set({ fullGym: false, equipment: FULL_GYM.filter((x) => x !== e && x !== 'bodyweight') });
                else set({ equipment: toggle(p.equipment, e) });
              }} aria-pressed={has(e)}>
              <span className="o-icon" style={{ width: 48, height: 48 }}><EquipmentIcon id={e} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>{EQUIPMENT_LABEL[e]}</span>
              <span className="check" style={{ width: 18, height: 18, top: 8, right: 8, fontSize: 10 }}>✓</span>
            </button>
          ))}
        </div>
        <span className="hint">Gli esercizi a corpo libero sono sempre disponibili. Puoi modificare l’attrezzatura in qualsiasi momento dal profilo.</span>
      </div>
    </div>
  );
}

export function defaultProfile(): Profile {
  return {
    name: '', age: 0, sex: 'unspecified', heightCm: 0, weightKg: 0, targetWeightKg: 0, bodyFatPct: null, level: 'beginner', goals: [],
    daysPerWeek: 3, minutesPerSession: 60, preferredDays: [], sessionStyle: 'long', split: 'auto', injuries: [], injuryNotes: '',
    focusMuscles: [], lessMuscles: [], exercisePrefs: { preferFree: false, preferMachines: false, avoidIds: [] }, activity: 'moderate',
    location: [], equipment: [], fullGym: false, diet: { pattern: 'omnivore', allergies: '', mealsPerDay: 4 },
  };
}
