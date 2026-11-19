import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Apple, Plus, Pencil, Trash2, Heart } from 'lucide-react';
import { useCustomFoods, useMeta, patchMeta } from '@/app/data';
import { store } from '@/db/store';
import { PageHeader, Empty, Sheet, NumberInput, Confirm, useToast } from '@/components/ui';
import { uid } from '@/lib/util';
import { FOOD_CATEGORIES } from '@/data/foods';
import { findFood } from './common';
import type { Food } from '@/lib/types';

const blank = (): Food => ({ id: uid('cf_'), name: '', kcal: 0, protein: 0, carbs: 0, fat: 0, custom: true, source: 'custom', category: 'Personalizzati' });

export default function MyFoodsPage() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const foods = useCustomFoods().slice().sort((a, b) => a.name.localeCompare(b.name));
  const meta = useMeta();
  const favs = meta.favoriteFoods.map(findFood).filter((f): f is Food => !!f);
  const [edit, setEdit] = useState<Food | null>(null);
  const [del, setDel] = useState<Food | null>(null);
  useEffect(() => { if (sp.get('new')) { setEdit(blank()); setSp({}, { replace: true }); } }, []); // eslint-disable-line

  return (
    <div className="page stack">
      <PageHeader title="I miei alimenti" back right={<button className="btn sm primary" onClick={() => setEdit(blank())}><Plus size={16} /> Nuovo</button>} />
      <div className="section-title">Alimenti personalizzati</div>
      {foods.length === 0 ? <Empty icon={<Apple />} title="Nessun alimento personalizzato" text="Crea alimenti con i valori dell’etichetta: li troverai nella ricerca. Anche i prodotti scelti da Open Food Facts vengono salvati qui." /> : (
        <div className="settings-group">
          {foods.map((f) => (
            <div key={f.id} className="list-item" style={{ cursor: 'default' }}>
              <span className="grow" style={{ minWidth: 0 }}><div className="li-title ellipsis">{f.name}{f.source === 'openfoodfacts' && <span className="pill" style={{ marginLeft: 6 }}>Open Food Facts</span>}</div><div className="li-sub">{f.brand ? `${f.brand} · ` : ''}{f.kcal} kcal · P {f.protein} · C {f.carbs} · G {f.fat} per 100 g</div></span>
              <button className="icon-btn ghost" onClick={() => setEdit({ ...f })} aria-label={`Modifica ${f.name}`}><Pencil size={16} /></button>
              <button className="icon-btn ghost" onClick={() => setDel(f)} aria-label={`Elimina ${f.name}`}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="section-title">La mia lista</div>
      {favs.length === 0 ? <p className="small muted">La tua lista è vuota. Puoi salvarci gli alimenti quando li aggiungi a un pasto.</p> : (
        <div className="settings-group">
          {favs.map((f) => (
            <div key={f.id} className="list-item" style={{ cursor: 'default' }}>
              <span className="grow"><div className="li-title">{f.name}</div><div className="li-sub">{f.kcal} kcal/100 g</div></span>
              <button className="icon-btn ghost" onClick={() => patchMeta({ favoriteFoods: meta.favoriteFoods.filter((x) => x !== f.id) })} aria-label={`Rimuovi ${f.name} dalla tua lista`}><Heart size={17} fill="var(--accent)" color="var(--accent)" /></button>
            </div>
          ))}
        </div>
      )}
      {edit && <FoodEditor key={edit.id} food={edit} onClose={() => setEdit(null)} onSaved={() => toast('Alimento salvato')} />}
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Elimina" title="Eliminare l’alimento?" body="Le voci del diario già registrate restano invariate." onConfirm={async () => { await store.remove('foods', del!.id); toast('Alimento eliminato'); }} />
    </div>
  );
}

function FoodEditor({ food, onClose, onSaved }: { food: Food; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Food>(food);
  const set = (p: Partial<Food>) => setF((x) => ({ ...x, ...p }));
  const macroK = Math.round(f.protein * 4 + f.carbs * 4 + f.fat * 9);
  const errors: string[] = [];
  if (!f.name.trim()) errors.push('Inserisci un nome');
  if (f.protein + f.carbs + f.fat > 100) errors.push('Proteine, carboidrati e grassi non possono superare 100 g su 100 g');
  if (f.kcal > 950) errors.push('Le calorie per 100 g non possono superare 950');
  return (
    <Sheet open onClose={onClose} title={food.name ? 'Modifica alimento' : 'Nuovo alimento'}
      footer={<button className="btn primary block" disabled={errors.length > 0} onClick={async () => { await store.put('foods', f.id, { ...f, name: f.name.trim(), kcal: f.kcal || macroK }); onSaved(); onClose(); }}>Salva</button>}>
      <div className="stack-sm">
        <div className="field"><label htmlFor="fn">Nome</label><input id="fn" className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="Es. Yogurt greco 0%" /></div>
        <div className="field"><label htmlFor="fb">Marca (facoltativa)</label><input id="fb" className="input" value={f.brand ?? ''} onChange={(e) => set({ brand: e.target.value || undefined })} maxLength={40} /></div>
        <div className="field"><label htmlFor="fc">Categoria</label><select id="fc" className="select" value={f.category} onChange={(e) => set({ category: e.target.value })}>{['Personalizzati', ...FOOD_CATEGORIES].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="label">Valori per 100 g</div>
        <div className="grid-2">
          <div className="field"><label>Calorie</label><NumberInput value={f.kcal || null} onChange={(v) => set({ kcal: v ?? 0 })} suffix="kcal" min={0} max={950} placeholder={macroK ? String(macroK) : ''} ariaLabel="Calorie per 100 g" /></div>
          <div className="field"><label>Proteine</label><NumberInput value={f.protein} onChange={(v) => set({ protein: v ?? 0 })} suffix="g" min={0} max={100} ariaLabel="Proteine per 100 g" /></div>
          <div className="field"><label>Carboidrati</label><NumberInput value={f.carbs} onChange={(v) => set({ carbs: v ?? 0 })} suffix="g" min={0} max={100} ariaLabel="Carboidrati per 100 g" /></div>
          <div className="field"><label>Grassi</label><NumberInput value={f.fat} onChange={(v) => set({ fat: v ?? 0 })} suffix="g" min={0} max={100} ariaLabel="Grassi per 100 g" /></div>
        </div>
        <div className="label">Porzione (facoltativa)</div>
        <div className="grid-2">
          <div className="field"><label htmlFor="fun">Nome porzione</label><input id="fun" className="input" value={f.unitName ?? ''} onChange={(e) => set({ unitName: e.target.value || undefined })} placeholder="Es. vasetto" maxLength={20} /></div>
          <div className="field"><label>Peso porzione</label><NumberInput value={f.unitGrams ?? null} onChange={(v) => set({ unitGrams: v ?? undefined })} suffix="g" min={0} max={2000} ariaLabel="Peso porzione" /></div>
        </div>
        {errors.length > 0 && f.name && <p className="small error-text">{errors.join('. ')}</p>}
      </div>
    </Sheet>
  );
}
