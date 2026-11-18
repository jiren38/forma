import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, RotateCcw, Save, Calculator } from 'lucide-react';
import { useActiveProgram, useProfile, useSettings, patchSettings } from '@/app/data';
import { targetsFor } from '@/lib/insights';
import { computeTargets, bmi } from '@/lib/nutrition';
import { PageHeader, NumberInput, useToast } from '@/components/ui';
import { fmtN, round } from '@/lib/util';
import { ACTIVITY_INFO } from '@/lib/labels';
import { Donut } from '@/components/charts';

export default function TargetsPage() {
  const toast = useToast();
  const profile = useProfile()!;
  const settings = useSettings();
  const program = useActiveProgram();
  const t = targetsFor(profile, settings, program);
  const est = computeTargets(profile, { ...settings, nutritionOverride: null }, program ? program.schedule.filter(Boolean).length : undefined);
  const [kcal, setKcal] = useState<number | null>(t.kcal);
  const [p, setP] = useState<number | null>(t.protein);
  const [c, setC] = useState<number | null>(t.carbs);
  const [f, setF] = useState<number | null>(t.fat);
  const fromMacros = Math.round((p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9);
  const mismatch = kcal != null && Math.abs(fromMacros - kcal) > 60;
  const b = bmi(profile);

  async function save() {
    if (!kcal || kcal < 800 || kcal > 8000) { toast('Inserisci un obiettivo calorico tra 800 e 8000 kcal', 'error'); return; }
    await patchSettings({ nutritionOverride: { kcal: Math.round(kcal), protein: Math.round(p ?? 0), carbs: Math.round(c ?? 0), fat: Math.round(f ?? 0) } });
    toast('Obiettivi personalizzati salvati');
  }
  async function reset() {
    await patchSettings({ nutritionOverride: null });
    setKcal(est.kcal); setP(est.protein); setC(est.carbs); setF(est.fat);
    toast('Ripristinata la stima automatica');
  }

  return (
    <div className="page stack">
      <PageHeader title="Obiettivi nutrizionali" back />
      <div className="banner"><Info size={18} /><span>Questi valori sono <b>stime indicative</b> calcolate con formule standard sui dati del tuo profilo. Non sono una prescrizione: per esigenze specifiche, patologie, gravidanza o disturbi alimentari rivolgiti a un medico o a un dietista/nutrizionista.</span></div>

      <div className="desk-2">
        <section className="card stack-sm">
          <div className="card-title"><h3><Calculator size={18} /> Come calcoliamo la stima</h3></div>
          <div className="grid-2">
            <div className="stat-tile"><div className="stat"><span className="l">Metabolismo basale</span><span className="v">{fmtN(est.bmr)}</span><span className="tiny muted">kcal · {est.method === 'katch' ? 'Katch-McArdle' : 'Mifflin-St Jeor'}</span></div></div>
            <div className="stat-tile"><div className="stat"><span className="l">Dispendio giornaliero</span><span className="v">{fmtN(est.tdee)}</span><span className="tiny muted">kcal (TDEE stimato)</span></div></div>
            <div className="stat-tile"><div className="stat"><span className="l">Obiettivo stimato</span><span className="v">{fmtN(est.kcal)}</span><span className="tiny muted">{est.adjustment === 0 ? 'mantenimento' : est.adjustment < 0 ? `deficit ${Math.round(-est.adjustment * 100)}%` : `surplus ${Math.round(est.adjustment * 100)}%`}</span></div></div>
            <div className="stat-tile"><div className="stat"><span className="l">IMC</span><span className="v">{fmtN(round(b, 1), 1)}</span><span className="tiny muted">indicatore generico</span></div></div>
          </div>
          <p className="small text-2" style={{ lineHeight: 1.6 }}>{est.explanation}</p>
          <p className="tiny muted">Dati usati: {profile.age} anni, {profile.heightCm} cm, {profile.weightKg} kg{profile.bodyFatPct ? `, ${profile.bodyFatPct}% di grasso` : ''}, attività {ACTIVITY_INFO[profile.activity].label.toLowerCase()}, {program ? program.schedule.filter(Boolean).length : profile.daysPerWeek} allenamenti/settimana. <Link to="/profile/edit" className="accent">Aggiorna il profilo</Link></p>
        </section>

        <section className="card stack">
          <div className="row-between">
            <div className="card-title" style={{ margin: 0 }}><h3>I tuoi obiettivi</h3></div>
            <span className={`pill ${t.overridden ? 'orange' : 'accent'}`}>{t.overridden ? 'Personalizzati' : 'Stima automatica'}</span>
          </div>
          <div className="row" style={{ gap: 16, alignItems: 'center' }}>
            <Donut ariaLabel="Ripartizione delle calorie tra i macronutrienti" size={110} stroke={14} parts={[{ value: (p ?? 0) * 4, color: 'var(--protein)' }, { value: (c ?? 0) * 4, color: 'var(--carbs)' }, { value: (f ?? 0) * 9, color: 'var(--fat)' }]}>
              <div className="center"><div className="num" style={{ fontWeight: 700 }}>{fmtN(fromMacros)}</div><div className="tiny muted">kcal</div></div>
            </Donut>
            <div className="legend" style={{ flexDirection: 'column', gap: 6 }}>
              <span><i style={{ background: 'var(--protein)' }} />Proteine {fromMacros ? Math.round(((p ?? 0) * 400) / fromMacros) : 0}%</span>
              <span><i style={{ background: 'var(--carbs)' }} />Carboidrati {fromMacros ? Math.round(((c ?? 0) * 400) / fromMacros) : 0}%</span>
              <span><i style={{ background: 'var(--fat)' }} />Grassi {fromMacros ? Math.round(((f ?? 0) * 900) / fromMacros) : 0}%</span>
            </div>
          </div>
          <div className="grid-2">
            <div className="field"><label>Calorie</label><NumberInput value={kcal} onChange={setKcal} suffix="kcal" min={0} max={8000} ariaLabel="Calorie giornaliere" /></div>
            <div className="field"><label>Proteine</label><NumberInput value={p} onChange={setP} suffix="g" min={0} max={500} ariaLabel="Proteine" /></div>
            <div className="field"><label>Carboidrati</label><NumberInput value={c} onChange={setC} suffix="g" min={0} max={1000} ariaLabel="Carboidrati" /></div>
            <div className="field"><label>Grassi</label><NumberInput value={f} onChange={setF} suffix="g" min={0} max={400} ariaLabel="Grassi" /></div>
          </div>
          {mismatch && <p className="small" style={{ color: 'var(--warning)' }}>I macronutrienti corrispondono a {fmtN(fromMacros)} kcal, diverso dall’obiettivo calorico. <button className="link accent" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontWeight: 700 }} onClick={() => setKcal(fromMacros)}>Usa {fmtN(fromMacros)} kcal</button></p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn grow" onClick={reset} disabled={!t.overridden}><RotateCcw size={16} /> Usa la stima</button>
            <button className="btn primary grow" onClick={save}><Save size={16} /> Salva</button>
          </div>
        </section>
      </div>
    </div>
  );
}
