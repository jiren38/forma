import { useMemo, useState } from 'react';
import { BookOpen, Plus, Trash2, Copy, Pencil, Search } from 'lucide-react';
import { useCustomFoods, useRecipes } from '@/app/data';
import { store } from '@/db/store';
import { PageHeader, Empty, Sheet, NumberInput, Stepper, SearchInput, Confirm, useToast } from '@/components/ui';
import { MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import { dayKey, fmtN, uid } from '@/lib/util';
import { MacroLine, addRecipeEntry, allFoods, defaultSlot, recipePer100, searchFoods } from './common';
import type { MealSlot, Recipe, RecipeIngredient } from '@/lib/types';

const blank = (): Recipe => ({ id: uid('rc_'), name: '', servings: 2, ingredients: [], instructions: '', createdAt: new Date().toISOString() });

export default function RecipesPage() {
  const toast = useToast();
  const recipes = useRecipes().slice().sort((a, b) => a.name.localeCompare(b.name));
  const [edit, setEdit] = useState<Recipe | null>(null);
  const [del, setDel] = useState<Recipe | null>(null);
  const [log, setLog] = useState<Recipe | null>(null);

  return (
    <div className="page stack">
      <PageHeader title="Ricette" back right={<button className="btn sm primary" onClick={() => setEdit(blank())}><Plus size={16} /> Nuova</button>} />
      {recipes.length === 0 ? (
        <Empty icon={<BookOpen />} title="Nessuna ricetta" text="Crea le tue ricette: calcoliamo automaticamente calorie e macronutrienti per porzione dagli ingredienti." action={<button className="btn primary" onClick={() => setEdit(blank())}><Plus size={18} /> Crea ricetta</button>} />
      ) : (
        <div className="desk-grid">
          {recipes.map((r) => {
            const info = recipePer100(r);
            return (
              <div key={r.id} className="card" style={{ padding: 14 }}>
                <div className="row-between"><h3 className="ellipsis">{r.name}</h3><span className="pill">{r.servings} porz.</span></div>
                <div style={{ marginTop: 4 }}><span className="tiny muted">Per porzione: </span><MacroLine {...info.perServing} /></div>
                <div className="tiny muted ellipsis" style={{ marginTop: 4 }}>{r.ingredients.map((i) => i.name).join(', ')}</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  <button className="btn sm soft" onClick={() => setLog(r)}><Plus size={14} /> Al diario</button>
                  <button className="btn sm" onClick={() => setEdit({ ...r })}><Pencil size={14} /> Modifica</button>
                  <button className="btn sm" onClick={async () => { const c = { ...r, id: uid('rc_'), name: `${r.name} (copia)`, createdAt: new Date().toISOString() }; await store.put('recipes', c.id, c); toast('Ricetta duplicata'); }}><Copy size={14} /></button>
                  <button className="btn sm ghost" onClick={() => setDel(r)} aria-label={`Elimina ${r.name}`}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {edit && <RecipeEditor key={edit.id} recipe={edit} onClose={() => setEdit(null)} onSaved={() => toast('Ricetta salvata')} />}
      {log && <LogRecipe key={log.id} recipe={log} onClose={() => setLog(null)} onDone={(m) => toast(m)} />}
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="Elimina" title="Eliminare la ricetta?" body="Le voci già registrate nel diario restano invariate." onConfirm={async () => { await store.remove('recipes', del!.id); toast('Ricetta eliminata'); }} />
    </div>
  );
}

function LogRecipe({ recipe, onClose, onDone }: { recipe: Recipe | null; onClose: () => void; onDone: (m: string) => void }) {
  const [servings, setServings] = useState(1);
  const [slot, setSlot] = useState<MealSlot>(defaultSlot());
  const [date, setDate] = useState(dayKey());
  if (!recipe) return null;
  const info = recipePer100(recipe);
  return (
    <Sheet open onClose={onClose} title={`Aggiungi “${recipe.name}”`} footer={<button className="btn primary block" onClick={async () => { await addRecipeEntry(date, slot, recipe, servings); onDone(`Aggiunta a ${MEAL_LABEL[slot]}`); onClose(); }}>Aggiungi al diario</button>}>
      <div className="stack">
        <div className="field"><label>Porzioni</label><Stepper value={servings} min={0.5} max={20} step={0.5} format={(v) => fmtN(v, 1)} onChange={setServings} /></div>
        <MacroLine kcal={info.perServing.kcal * servings} protein={info.perServing.protein * servings} carbs={info.perServing.carbs * servings} fat={info.perServing.fat * servings} />
        <div className="grid-2">
          <div className="field"><label>Pasto</label><select className="select" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>{MEAL_ORDER.map((s) => <option key={s} value={s}>{MEAL_LABEL[s]}</option>)}</select></div>
          <div className="field"><label>Giorno</label><input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        </div>
      </div>
    </Sheet>
  );
}

function RecipeEditor({ recipe, onClose, onSaved }: { recipe: Recipe; onClose: () => void; onSaved: () => void }) {
  const [r, setR] = useState<Recipe>(recipe);
  const [adding, setAdding] = useState(false);
  const info = recipePer100(r);
  const valid = r.name.trim().length > 0 && r.ingredients.length > 0;
  const setIng = (i: number, p: Partial<RecipeIngredient>) => setR({ ...r, ingredients: r.ingredients.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <>
      <Sheet open onClose={onClose} title={recipe.name ? 'Modifica ricetta' : 'Nuova ricetta'} wide
        footer={<button className="btn primary block" disabled={!valid} onClick={async () => { await store.put('recipes', r.id, { ...r, name: r.name.trim() }); onSaved(); onClose(); }}>Salva ricetta</button>}>
        <div className="stack">
          <div className="field"><label htmlFor="rname">Nome</label><input id="rname" className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Es. Pasta al tonno" maxLength={60} /></div>
          <div className="field"><label>Porzioni</label><Stepper value={r.servings} min={1} max={30} onChange={(v) => setR({ ...r, servings: v })} /></div>
          <div>
            <div className="row-between" style={{ marginBottom: 6 }}><span className="label">Ingredienti</span><button className="btn sm soft" onClick={() => setAdding(true)}><Plus size={14} /> Aggiungi</button></div>
            {r.ingredients.length === 0 ? <p className="small muted">Aggiungi almeno un ingrediente.</p> : r.ingredients.map((ing, i) => (
              <div key={i} className="food-line">
                <span className="grow small ellipsis" style={{ fontWeight: 600 }}>{ing.name}</span>
                <div style={{ width: 110 }}><NumberInput value={ing.grams} onChange={(v) => setIng(i, { grams: v ?? 0 })} suffix="g" min={0} max={10000} ariaLabel={`Grammi di ${ing.name}`} /></div>
                <button className="icon-btn ghost" onClick={() => setR({ ...r, ingredients: r.ingredients.filter((_, j) => j !== i) })} aria-label={`Rimuovi ${ing.name}`}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          {r.ingredients.length > 0 && (
            <div className="card" style={{ background: 'var(--surface-2)', padding: 12 }}>
              <div className="small"><b>Totale ({fmtN(info.grams)} g):</b> <MacroLine {...info.total} /></div>
              <div className="small" style={{ marginTop: 4 }}><b>Per porzione (~{fmtN(info.servingGrams)} g):</b> <MacroLine {...info.perServing} /></div>
            </div>
          )}
          <div className="field"><label htmlFor="rinst">Preparazione (facoltativa)</label><textarea id="rinst" className="textarea" value={r.instructions ?? ''} onChange={(e) => setR({ ...r, instructions: e.target.value })} /></div>
        </div>
      </Sheet>
      <IngredientPicker open={adding} onClose={() => setAdding(false)} onPick={(ing) => { setR({ ...r, ingredients: [...r.ingredients, ing] }); setAdding(false); }} />
    </>
  );
}

export function IngredientPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (i: RecipeIngredient) => void }) {
  const custom = useCustomFoods();
  const [q, setQ] = useState('');
  const foods = useMemo(() => searchFoods(allFoods(custom), q).slice(0, 60), [custom, q]);
  return (
    <Sheet open={open} onClose={onClose} title="Scegli ingrediente">
      <div className="stack-sm">
        <SearchInput value={q} onChange={setQ} placeholder="Cerca alimento" autoFocus />
        {q ? (
          <div className="settings-group">
            {foods.map((f) => (
              <button key={f.id} className="list-item" onClick={() => { onPick({ foodId: f.id, name: f.name, grams: f.unitGrams ?? 100, per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat } }); setQ(''); }}>
                <span className="grow"><div className="li-title">{f.name}</div><div className="li-sub">{f.kcal} kcal/100 g</div></span><Plus size={17} className="muted" />
              </button>
            ))}
          </div>
        ) : <p className="small muted row" style={{ gap: 6 }}><Search size={14} /> Scrivi il nome di un alimento.</p>}
      </div>
    </Sheet>
  );
}
