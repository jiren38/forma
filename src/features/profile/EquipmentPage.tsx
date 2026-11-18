import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Sparkles } from 'lucide-react';
import { useProfile, saveProfile } from '@/app/data';
import { PageHeader, Sheet, useToast } from '@/components/ui';
import { EquipmentPicker } from '@/features/onboarding/fields';
import type { Profile } from '@/lib/types';

export default function EquipmentPage() {
  const cur = useProfile()!;
  const nav = useNavigate();
  const toast = useToast();
  const [p, setP] = useState<Profile>(cur);
  const [regen, setRegen] = useState(false);
  const dirty = JSON.stringify([p.location, p.equipment, p.fullGym]) !== JSON.stringify([cur.location, cur.equipment, cur.fullGym]);
  const valid = p.fullGym || p.equipment.length > 0 || p.location.length > 0;

  return (
    <div className="page stack" style={{ paddingBottom: 110 }}>
      <PageHeader title="Attrezzatura" back sub="Esercizi e programmi si adattano a ciò che hai a disposizione" />
      <EquipmentPicker p={p} set={(x) => setP((c) => ({ ...c, ...x }))} />
      <button className="btn primary lg fab" disabled={!dirty || !valid} onClick={async () => { await saveProfile({ ...p, equipmentSetAt: new Date().toISOString() }); toast('Attrezzatura aggiornata'); setRegen(true); }}><Save size={18} /> Salva</button>
      <Sheet open={regen} onClose={() => nav('/profile')} title="Adattare il programma?"
        footer={<><button className="btn grow" onClick={() => nav('/profile')}>Non ora</button><button className="btn primary grow" onClick={() => nav('/workouts/generate', { replace: true })}><Sparkles size={16} /> Genera nuovo</button></>}>
        <p className="text-2">Puoi generare un nuovo programma con l’attrezzatura aggiornata, oppure sostituire singoli esercizi dalle tue schede. Nella libreria il filtro “con la mia attrezzatura” è già aggiornato.</p>
      </Sheet>
    </div>
  );
}
