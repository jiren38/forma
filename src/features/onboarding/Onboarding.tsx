import { useEffect, useState } from 'react';
import { ArrowLeft, Sparkles, ShieldCheck } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { store } from '@/db/store';
import { saveProfile, saveProgram, saveTemplate, activateProgram, useProfile, patchSettings } from '@/app/data';
import { generateProgram } from '@/lib/generator';
import { computeTargets } from '@/lib/nutrition';
import { GOAL_INFO, LEVEL_INFO, SPLIT_INFO } from '@/lib/labels';
import { BrandMark } from '@/components/brand';
import { useToast } from '@/components/ui';
import { DietFields, EquipmentPicker, FrequencyFields, GoalsPicker, LevelPicker, OtherFields, PersonalFields, SplitPicker, defaultProfile, validatePersonal } from './fields';
import { uid } from '@/lib/util';

const DRAFT_KEY = 'forma.onboardingDraft';

export default function Onboarding() {
  const existing = useProfile();
  const toast = useToast();
  const [p, setP] = useState<Profile>(() => {
    try { const d = sessionStorage.getItem(DRAFT_KEY); if (d) return { ...defaultProfile(), ...JSON.parse(d) }; } catch { /* ignore */ }
    return { ...defaultProfile(), ...(existing ?? {}) };
  });
  // Se il profilo è stato completato ma manca l'attrezzatura, riparti dallo step attrezzatura
  const [step, setStep] = useState(existing?.onboardedAt && !existing.equipmentSetAt ? 8 : 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (x: Partial<Profile>) => setP((cur) => ({ ...cur, ...x }));
  useEffect(() => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(p)); } catch { /* ignore */ } }, [p]);

  const steps: { title: string; sub?: string; body: JSX.Element; valid: () => boolean }[] = [
    {
      title: 'Benvenuto in Forma', sub: 'Configuriamo l’app in pochi minuti per creare allenamenti e obiettivi su misura per te.',
      body: (
        <div className="stack">
          <div className="field"><label htmlFor="name">Come ti chiami?</label><input id="name" className="input" value={p.name} onChange={(e) => set({ name: e.target.value.slice(0, 40) })} placeholder="Il tuo nome" autoFocus /></div>
          <div className="banner"><ShieldCheck size={18} /><span>I tuoi dati servono solo a personalizzare l’esperienza. Puoi modificarli o eliminarli in qualsiasi momento dal profilo.</span></div>
        </div>
      ),
      valid: () => p.name.trim().length > 0,
    },
    { title: 'Informazioni personali', sub: 'Servono per stimare fabbisogno calorico e carichi iniziali.', body: <PersonalFields p={p} set={set} errors={errors} />, valid: () => { const e = validatePersonal(p); setErrors(e); return !Object.keys(e).length; } },
    { title: 'Il tuo livello', sub: 'Scegli quello che ti descrive meglio, potrai cambiarlo in futuro.', body: <LevelPicker p={p} set={set} />, valid: () => true },
    { title: 'I tuoi obiettivi', sub: 'Puoi selezionarne più di uno: il primo scelto avrà la priorità.', body: <GoalsPicker p={p} set={set} />, valid: () => p.goals.length > 0 },
    { title: 'Frequenza e disponibilità', body: <FrequencyFields p={p} set={set} />, valid: () => p.daysPerWeek > 0 },
    { title: 'Come preferisci allenarti?', sub: 'Scegli una suddivisione o lascia decidere all’app.', body: <SplitPicker p={p} set={set} />, valid: () => true },
    { title: 'Altre informazioni', sub: 'Ci aiutano a scegliere gli esercizi più adatti.', body: <OtherFields p={p} set={set} />, valid: () => true },
    { title: 'Alimentazione', sub: 'Per personalizzare diario e piano pasti.', body: <DietFields p={p} set={set} />, valid: () => true },
    { title: 'Dove e con cosa ti alleni?', sub: 'Gli esercizi e le schede verranno scelti in base a ciò che hai a disposizione.', body: <EquipmentPicker p={p} set={set} />, valid: () => p.fullGym || p.equipment.length > 0 || p.location.length > 0 },
    {
      title: 'Tutto pronto', sub: 'Ecco il riepilogo. Puoi modificare tutto dal profilo.',
      body: <Summary p={p} />, valid: () => true,
    },
  ];
  const cur = steps[step];
  const last = step === steps.length - 1;

  async function finish(generate: boolean) {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const prof: Profile = { ...p, name: p.name.trim(), onboardedAt: p.onboardedAt ?? now, equipmentSetAt: now };
      await patchSettings({ weeklyWorkoutGoal: p.daysPerWeek, monthlyWorkoutGoal: p.daysPerWeek * 4 });
      // prima misurazione reale: il peso inserito dall'utente
      if (!store.list('measurements').length) {
        const id = uid('m_');
        await store.put('measurements', id, { id, date: now.slice(0, 10), weightKg: p.weightKg, bodyFatPct: p.bodyFatPct ?? null });
      }
      if (generate && p.split !== 'custom') {
        const g = generateProgram(prof, []);
        for (const t of g.templates) await saveTemplate(t);
        await saveProgram(g.program);
        await activateProgram(g.program.id);
        if (g.warnings.length) toast(g.warnings[0], 'info');
      }
      await saveProfile(prof);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    } catch (e: any) {
      toast(e?.message ?? 'Errore durante il salvataggio', 'error');
    } finally { setBusy(false); }
  }

  async function next() {
    if (!cur.valid()) { if (step !== 1) toast(step === 3 ? 'Seleziona almeno un obiettivo' : step === 8 ? 'Seleziona almeno un luogo o un attrezzo' : 'Completa i campi richiesti', 'error'); return; }
    if (step === 7) {
      // salvataggio intermedio: profilo completato, manca solo l'attrezzatura
      await saveProfile({ ...p, onboardedAt: p.onboardedAt ?? new Date().toISOString() });
    }
    setStep((s) => Math.min(steps.length - 1, s + 1));
    window.scrollTo(0, 0);
  }

  return (
    <div className="ob">
      <div className="ob-top">
        <div className="row-between" style={{ marginBottom: 12 }}>
          {step > 0 ? <button className="icon-btn ghost" onClick={() => setStep(step - 1)} aria-label="Indietro"><ArrowLeft size={22} /></button> : <div className="brand"><BrandMark /> Forma</div>}
          <span className="muted small">Passo {step + 1} di {steps.length}</span>
        </div>
        <div className="ob-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={steps.length}><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <div className="ob-body" key={step}>
        <h1>{cur.title}</h1>
        {cur.sub && <p className="muted" style={{ marginBottom: 20 }}>{cur.sub}</p>}
        {cur.body}
      </div>
      <div className="ob-foot">
        {!last && <button className="btn primary lg grow" onClick={next}>Continua</button>}
        {last && (
          <div className="col grow">
            {p.split !== 'custom' && <button className="btn primary lg block" disabled={busy} onClick={() => finish(true)}><Sparkles size={18} /> Crea il mio programma</button>}
            <button className={`btn lg block ${p.split === 'custom' ? 'primary' : ''}`} disabled={busy} onClick={() => finish(false)}>{p.split === 'custom' ? 'Inizia e crea le mie schede' : 'Inizia senza programma'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ p }: { p: Profile }) {
  const t = computeTargets(p, null);
  return (
    <div className="stack-sm">
      <div className="card">
        <dl className="kv">
          <dt>Livello</dt><dd>{LEVEL_INFO[p.level].label}</dd>
          <dt>Obiettivi</dt><dd>{p.goals.map((g) => GOAL_INFO[g].label).join(', ')}</dd>
          <dt>Allenamenti</dt><dd>{p.daysPerWeek} a settimana · {p.minutesPerSession} min</dd>
          <dt>Suddivisione</dt><dd>{SPLIT_INFO[p.split].label}</dd>
          <dt>Attrezzatura</dt><dd>{p.fullGym ? 'Palestra completa' : `${p.equipment.length} strumenti`}</dd>
        </dl>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Fabbisogno stimato</h3>
        <div className="grid-2">
          <div className="stat"><span className="v">{t.kcal}</span><span className="l">kcal al giorno</span></div>
          <div className="stat"><span className="v">{t.protein} g</span><span className="l">proteine</span></div>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>Sono stime indicative basate su formule standard: non sostituiscono il parere di un dietista o nutrizionista. Potrai modificarle nella sezione Nutrizione.</p>
      </div>
    </div>
  );
}
