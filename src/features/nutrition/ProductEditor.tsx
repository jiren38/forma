/** Inserimento o correzione di un prodotto legato a un codice a barre. I campi vuoti restano "non disponibili". */
import { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, Barcode, Info } from 'lucide-react';
import { PageHeader, Segmented, useToast } from '@/components/ui';
import { formatCode } from '@/lib/barcode';
import type { Food, NutrientKey } from '@/lib/types';
import { NUTRIENTS, compressImage, saveCustomProduct } from './products';

const toStr = (v: number | null | undefined, missing: boolean) => (missing || v === null || v === undefined ? '' : String(v).replace('.', ','));
const parse = (s: string): number | null => { const t = s.trim().replace(',', '.'); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : NaN; };

export function ProductEditor({ code, base, onSaved, onCancel }: { code: string; base?: Food | null; onSaved: (f: Food) => void; onCancel: () => void }) {
  const toast = useToast();
  const miss = new Set(base?.missing ?? []);
  const [name, setName] = useState(base?.name ?? '');
  const [brand, setBrand] = useState(base?.brand ?? '');
  const [unit, setUnit] = useState<'g' | 'ml'>(base?.unit ?? 'g');
  const [vals, setVals] = useState<Record<NutrientKey, string>>(() => ({
    kcal: toStr(base?.kcal, miss.has('kcal')), protein: toStr(base?.protein, miss.has('protein')), carbs: toStr(base?.carbs, miss.has('carbs')), sugars: toStr(base?.sugars, miss.has('sugars')),
    fat: toStr(base?.fat, miss.has('fat')), satFat: toStr(base?.satFat, miss.has('satFat')), fiber: toStr(base?.fiber, miss.has('fiber')), salt: toStr(base?.salt, miss.has('salt')),
  }));
  const [pkg, setPkg] = useState(toStr(base?.packageQty, false));
  const [serving, setServing] = useState(toStr(base?.servingQty, false));
  const [photo, setPhoto] = useState<string | undefined>(base?.imageUrl);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const nums = Object.fromEntries((Object.keys(vals) as NutrientKey[]).map((k) => [k, parse(vals[k])])) as Record<NutrientKey, number | null>;
  const bad = (Object.keys(nums) as NutrientKey[]).filter((k) => Number.isNaN(nums[k]));
  const pkgN = parse(pkg), servN = parse(serving);
  const errors: string[] = [];
  if (!name.trim()) errors.push('Inserisci il nome del prodotto.');
  if (nums.kcal === null) errors.push('Inserisci le calorie per 100 ' + unit + ' (le trovi nella tabella nutrizionale).');
  if (bad.length || Number.isNaN(pkgN) || Number.isNaN(servN)) errors.push('Alcuni numeri non sono validi.');
  if ((nums.sugars ?? 0) > (nums.carbs ?? Infinity) || (nums.satFat ?? 0) > (nums.fat ?? Infinity)) errors.push('Zuccheri e grassi saturi non possono superare carboidrati e grassi.');
  const macroKcal = (nums.protein ?? 0) * 4 + (nums.carbs ?? 0) * 4 + (nums.fat ?? 0) * 9;
  const kcalOff = nums.kcal !== null && !Number.isNaN(nums.kcal) && macroKcal > 0 && Math.abs(macroKcal - nums.kcal) > Math.max(40, nums.kcal * 0.35);

  async function pick(file?: File | null) {
    if (!file) return;
    try { setPhoto(await compressImage(file)); } catch { toast('Immagine non leggibile', 'error'); }
  }

  async function save() {
    setTried(true);
    if (errors.length) return;
    setBusy(true);
    const missing = (Object.keys(nums) as NutrientKey[]).filter((k) => nums[k] === null);
    const changed = (k: NutrientKey) => toStr((base as any)?.[k], miss.has(k)) !== vals[k];
    const derived = (base?.derived ?? []).filter((d) => (d === 'kcal_from_kj' ? !changed('kcal') : d === 'salt_from_sodium' ? !changed('salt') : !NUTRIENTS.some((n) => changed(n.key))));
    const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
    const f: Food = {
      ...(base ?? {}), id: base?.id ?? `bc_${code}`, barcode: code, name: name.trim(), brand: brand.trim() || undefined, unit, category: base?.category ?? 'Prodotti confezionati',
      kcal: Math.round(nums.kcal ?? 0), protein: r1(nums.protein) ?? 0, carbs: r1(nums.carbs) ?? 0, fat: r1(nums.fat) ?? 0,
      sugars: r1(nums.sugars), satFat: r1(nums.satFat), fiber: nums.fiber === null ? undefined : r1(nums.fiber)!, salt: nums.salt === null ? null : Math.round(nums.salt * 100) / 100,
      missing, derived,
      packageQty: pkgN, packageUnit: pkgN ? unit : null, packageLabel: pkgN ? (pkgN === base?.packageQty && base?.packageLabel ? base.packageLabel : `${pkg.trim()} ${unit}`) : undefined,
      servingQty: servN, servingUnit: servN ? unit : null, servingLabel: servN ? (servN === base?.servingQty && base?.servingLabel ? base.servingLabel : `${serving.trim()} ${unit}`) : undefined,
      unitGrams: servN ?? undefined, unitName: servN ? 'porzione' : undefined,
      imageUrl: photo,
    };
    const saved = await saveCustomProduct(f, base ?? undefined);
    setBusy(false);
    toast(base ? 'Prodotto aggiornato' : 'Prodotto salvato: la prossima scansione lo riconoscerà subito');
    onSaved(saved);
  }

  const set = (k: NutrientKey) => (e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, [k]: e.target.value.replace(/[^\d.,]/g, '') }));

  return (
    <div className="page stack product-editor">
      <PageHeader title={base ? 'Modifica prodotto' : 'Nuovo prodotto'} back={false} right={<button className="btn sm ghost" onClick={onCancel}>Annulla</button>} />
      <div className="row small muted" style={{ gap: 6 }}><Barcode size={16} /> Codice <b className="num">{formatCode(code)}</b></div>
      {base?.source === 'openfoodfacts' && <p className="tiny muted row" style={{ gap: 6, alignItems: 'flex-start' }}><Info size={14} style={{ flexShrink: 0, marginTop: 1 }} /> Le correzioni restano nel tuo account e hanno la precedenza sui dati di Open Food Facts per questo codice.</p>}

      <section className="card stack-sm">
        <div className="field"><label htmlFor="pn">Nome *</label><input id="pn" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Yogurt greco 0%" maxLength={80} /></div>
        <div className="field"><label htmlFor="pb">Marca</label><input id="pb" className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Es. Fage" maxLength={60} /></div>
        <div className="field"><label>Valori riferiti a</label><Segmented label="Unità" value={unit} onChange={setUnit} options={[{ value: 'g', label: '100 g (solidi)' }, { value: 'ml', label: '100 ml (liquidi)' }]} /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="pq">Confezione ({unit})</label><input id="pq" className="input num" inputMode="decimal" value={pkg} onChange={(e) => setPkg(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Es. 500" /></div>
          <div className="field"><label htmlFor="ps">Porzione ({unit})</label><input id="ps" className="input num" inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Es. 125" /></div>
        </div>
      </section>

      <section className="card stack-sm">
        <div className="card-title"><h3>Valori per 100 {unit}</h3><span className="tiny muted">vuoto = non disponibile</span></div>
        <div className="nutri-form">
          {NUTRIENTS.map((n) => (
            <label key={n.key} className={`nutri-row ${n.sub ? 'sub' : ''}`}>
              <span>{n.label}{n.key === 'kcal' ? ' *' : ''}</span>
              <span className="nutri-input"><input className="input num" inputMode="decimal" value={vals[n.key]} onChange={set(n.key)} aria-label={`${n.label} per 100 ${unit}`} aria-invalid={bad.includes(n.key)} /><i>{n.unit}</i></span>
            </label>
          ))}
        </div>
        {kcalOff && <p className="tiny warn-text">Controlla le calorie: con questi macronutrienti ci si aspetterebbero circa {Math.round(macroKcal)} kcal.</p>}
      </section>

      <section className="card stack-sm">
        <div className="card-title"><h3>Foto della confezione</h3><span className="tiny muted">facoltativa</span></div>
        {photo ? (
          <div className="row" style={{ gap: 12 }}>
            <img src={photo} alt="Foto del prodotto" className="product-thumb lg" referrerPolicy="no-referrer" />
            <div className="stack-sm"><button className="btn sm" onClick={() => fileRef.current?.click()}><Camera size={15} /> Cambia</button><button className="btn sm ghost" onClick={() => setPhoto(undefined)}><Trash2 size={15} /> Rimuovi</button></div>
          </div>
        ) : <button className="btn" onClick={() => fileRef.current?.click()}><ImagePlus size={17} /> Scatta o scegli una foto</button>}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </section>

      {tried && errors.length > 0 && <div className="card danger-soft small" role="alert">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      <div className="sticky-actions">
        <button className="btn primary block lg" onClick={save} disabled={busy}>{base ? 'Salva le modifiche' : 'Salva il prodotto'}</button>
      </div>
      <p className="tiny muted">I prodotti inseriti da te sono salvati nel tuo account, sincronizzati sugli altri dispositivi e marcati come “Creato da te”.</p>
    </div>
  );
}
