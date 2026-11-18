import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Save, Sparkles } from 'lucide-react';
import { useProfile, saveProfile, useActiveProgram } from '@/app/data';
import { PageHeader, Sheet, useToast } from '@/components/ui';
import { DietFields, FrequencyFields, GoalsPicker, LevelPicker, OtherFields, PersonalFields, SplitPicker, validatePersonal } from '@/features/onboarding/fields';
import type { Profile } from '@/lib/types';

export default function EditProfile() {
  const cur = useProfile()!;
  const program = useActiveProgram();
  const nav = useNavigate();
  const toast = useToast();
  const [p, setP] = useState<Profile>(cur);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [regen, setRegen] = useState(false);
  const set = (x: Partial<Profile>) => setP((c) => ({ ...c, ...x }));
  const dirty = JSON.stringify(p) !== JSON.stringify(cur);

  async function save() {
    const e = validatePersonal(p);
    setErrors(e);
    if (!p.name.trim()) { toast('Inserisci il nome', 'error'); return; }
    if (Object.keys(e).length) { toast('Controlla i dati personali', 'error'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!p.goals.length) { toast('Seleziona almeno un obiettivo', 'error'); return; }
    await saveProfile({ ...p, name: p.name.trim() });
    toast('Profilo aggiornato');
    const trainingChanged = ['level', 'goals', 'daysPerWeek', 'minutesPerSession', 'split', 'injuries', 'focusMuscles', 'lessMuscles', 'sessionStyle', 'preferredDays', 'exercisePrefs'].some((k) => JSON.stringify((p as any)[k]) !== JSON.stringify((cur as any)[k]));
    if (trainingChanged) setRegen(true); else nav('/profile');
  }

  return (
    <div className="page stack" style={{ paddingBottom: 110 }}>
      <PageHeader title="Modifica profilo" back />
      <section className="card stack-sm"><h3>Nome</h3><input className="input" value={p.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} aria-label="Nome" /></section>
      <section className="card stack-sm"><h3>Dati personali</h3><PersonalFields p={p} set={set} errors={errors} /></section>
      <section className="card stack-sm"><h3>Livello</h3><LevelPicker p={p} set={set} /></section>
      <section className="card stack-sm"><h3>Obiettivi</h3><GoalsPicker p={p} set={set} /></section>
      <section className="card stack-sm"><h3>Frequenza e disponibilità</h3><FrequencyFields p={p} set={set} /></section>
      <section className="card stack-sm"><h3>Suddivisione preferita</h3><SplitPicker p={p} set={set} /></section>
      <section className="card stack-sm"><h3>Infortuni, muscoli e preferenze</h3><OtherFields p={p} set={set} /></section>
      <section className="card stack-sm"><h3>Alimentazione</h3><DietFields p={p} set={set} /></section>
      <Link to="/profile/equipment" className="btn block">Modifica attrezzatura e luoghi</Link>
      <button className="btn primary lg fab" disabled={!dirty} onClick={save}><Save size={18} /> Salva</button>
      <Sheet open={regen} onClose={() => { setRegen(false); nav('/profile'); }} title="Aggiornare il programma?"
        footer={<><button className="btn grow" onClick={() => { setRegen(false); nav('/profile'); }}>Non ora</button><button className="btn primary grow" onClick={() => nav('/workouts/generate', { replace: true })}><Sparkles size={16} /> Genera nuovo</button></>}>
        <p className="text-2">Hai cambiato dati che influenzano l’allenamento. {program ? `Il programma attuale “${program.name}” resta invariato: ` : ''}puoi generarne uno nuovo basato sul profilo aggiornato. Le schede esistenti non vengono eliminate.</p>
      </Sheet>
    </div>
  );
}
