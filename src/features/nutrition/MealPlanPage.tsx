import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Trash2, ClipboardCopy, ShoppingCart, Copy, BookOpen } from 'lucide-react';
import { useActiveProgram, useCustomFoods, useMealPlans, useProfile, useRecipes, useSettings } from '@/app/data';
import { store } from '@/db/store';
import { targetsFor } from '@/lib/insights';
import { macrosFor } from '@/lib/nutrition';
import { DAY_LONG, MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import { addDays, dayKey, fmtN, fromKey, startOfWeek, uid } from '@/lib/util';
import { PageHeader, Sheet, SearchInput, NumberInput, Stepper, Bar, useToast } from '@/components/ui';
import { allFoods, findFood, recipePer100, searchFoods, addFoodEntry, addRecipeEntry } from './common';
import type { MealPlanDay, MealPlanItem, MealSlot, Recipe, Food } from '@/lib/types';

export function itemMacros(it: MealPlanItem) {
  if (it.kind === 'food') { const f = findFood(it.refId); return f ? macrosFor(f, it.grams) : { kcal: 0, protein: 0, carbs: 0, fat: 0 }; }
  const r = store.get<Recipe>('recipes', it.refId);
  if (!r) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const ps = recipePer100(r).perServing, k = it.servings ?? 1;
  return { kcal: ps.kcal * k, protein: ps.protein * k, carbs: ps.carbs * k, fat: ps.fat * k };
}

export default function MealPlanPage() {
  const toast = useToast();
  const profile = useProfile()!;
  const settings = useSettings();
  const program = useActiveProgram();
  const plans = useMealPlans();
  const t = targetsFor(profile, settings, program);
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const ws = addDays(startOfWeek(), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(ws, i)));
  const byDate = useMemo(() => Object.fromEntries(plans.map((p) => [p.date, p])), [plans]) as Record<string, MealPlanDay>;

  const putDay = (date: string, items: MealPlanItem[]) => store.put('mealPlans', date, { id: date, date, items });
  async function copyToDiary(date: string) {
    const d = byDate[date];
    if (!d?.items.length) return;
    for (const it of d.items) {
      if (it.kind === 'food') { const f = findFood(it.refId); if (f) await addFoodEntry(date, it.slot, f, it.grams); }
      else { const r = store.get<Recipe>('recipes', it.refId); if (r) await addRecipeEntry(date, it.slot, r, it.servings ?? 1); }
    }
    toast(`Piano del ${fromKey(date).toLocaleDateString('it-IT')} copiato nel diario`);
  }
  async function copyPrevWeek() {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const src = byDate[dayKey(addDays(ws, i - 7))];
      if (src?.items.length) { await putDay(days[i], src.items.map((x) => ({ ...x, uid: uid('mp_') }))); n++; }
    }
    toast(n ? `Copiati ${n} giorni dalla settimana precedente` : 'La settimana precedente è vuota', n ? 'success' : 'info');
  }

  return (
    <div className="page stack">
      <PageHeader title="Piano pasti" back right={<Link to={`/nutrition/shopping?week=${dayKey(ws)}`} className="icon-btn" aria-label="Lista della spesa"><ShoppingCart size={20} /></Link>} />
      <div className="row-between card" style={{ padding: 8 }}>
        <button className="icon-btn ghost" onClick={() => setOffset(offset - 1)} aria-label="Settimana precedente"><ChevronLeft size={20} /></button>
        <div className="center"><b>{offset === 0 ? 'Questa settimana' : offset === 1 ? 'Prossima settimana' : offset === -1 ? 'Settimana scorsa' : `Settimana del ${ws.toLocaleDateString('it-IT')}`}</b><div className="tiny muted">{ws.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – {addDays(ws, 6).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</div></div>
        <button className="icon-btn ghost" onClick={() => setOffset(offset + 1)} aria-label="Settimana successiva"><ChevronRight size={20} /></button>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn sm" onClick={copyPrevWeek}><Copy size={15} /> Copia settimana precedente</button>
        <Link to={`/nutrition/shopping?week=${dayKey(ws)}`} className="btn sm"><ShoppingCart size={15} /> Lista della spesa</Link>
        <Link to="/nutrition/recipes" className="btn sm"><BookOpen size={15} /> Ricette</Link>
      </div>
      <div className="desk-grid" style={{ gap: 12 }}>
        {days.map((date, i) => {
          const d = byDate[date];
          const items = d?.items ?? [];
          const tot = items.reduce((a, it) => { const m = itemMacros(it); return { kcal: a.kcal + m.kcal, protein: a.protein + m.protein }; }, { kcal: 0, protein: 0 });
          return (
            <section key={date} className="card" style={{ padding: 14 }}>
              <div className="row-between">
                <div><b>{DAY_LONG[i]}</b> <span className="tiny muted">{fromKey(date).getDate()}</span>{date === dayKey() && <span className="pill accent" style={{ marginLeft: 6 }}>Oggi</span>}</div>
                <div className="row" style={{ gap: 4 }}>
                  {items.length > 0 && <button className="icon-btn ghost" onClick={() => copyToDiary(date)} aria-label={`Copia ${DAY_LONG[i]} nel diario`} title="Copia nel diario"><ClipboardCopy size={17} /></button>}
                  <button className="icon-btn soft" onClick={() => setAdding(date)} aria-label={`Aggiungi a ${DAY_LONG[i]}`}><Plus size={17} /></button>
                </div>
              </div>
              {items.length > 0 ? (
                <>
                  <div className="tiny muted" style={{ margin: '4px 0 6px' }}>{fmtN(tot.kcal)} / {fmtN(t.kcal)} kcal · {fmtN(tot.protein)} g proteine</div>
                  <Bar value={tot.kcal} max={t.kcal} thin />
                  {MEAL_ORDER.filter((s) => items.some((it) => it.slot === s)).map((s) => (
                    <div key={s} style={{ marginTop: 8 }}>
                      <div className="tiny" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{MEAL_LABEL[s]}</div>
                      {items.filter((it) => it.slot === s).map((it) => (
                        <div key={it.uid} className="row-between small" style={{ padding: '3px 0' }}>
                          <span className="ellipsis grow">{it.name} <span className="muted tiny">{it.kind === 'recipe' ? `× ${it.servings ?? 1}` : `${it.grams} g`}</span></span>
                          <span className="tiny muted num">{fmtN(itemMacros(it).kcal)}</span>
                          <button className="icon-btn ghost sm" onClick={() => putDay(date, items.filter((x) => x.uid !== it.uid))} aria-label={`Rimuovi ${it.name}`}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              ) : <p className="tiny muted" style={{ marginTop: 6 }}>Nessun pasto pianificato.</p>}
            </section>
          );
        })}
      </div>
      <p className="hint">Il piano pasti è uno strumento organizzativo: per esigenze cliniche o diete specifiche rivolgiti a un dietista o nutrizionista.</p>
      {adding && <AddPlanItem date={adding} onClose={() => setAdding(null)} onAdd={(it) => { const cur = byDate[adding]?.items ?? []; putDay(adding, [...cur, it]); toast(`${it.name} aggiunto al piano`); }} />}
    </div>
  );
}

function AddPlanItem({ date, onClose, onAdd }: { date: string; onClose: () => void; onAdd: (it: MealPlanItem) => void }) {
  const custom = useCustomFoods();
  const recipes = useRecipes();
  const [q, setQ] = useState('');
  const [slot, setSlot] = useState<MealSlot>('lunch');
  const [food, setFood] = useState<Food | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [grams, setGrams] = useState<number | null>(100);
  const [servings, setServings] = useState(1);
  const foods = useMemo(() => searchFoods(allFoods(custom), q).slice(0, 40), [custom, q]);
  const recs = recipes.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = food || recipe;
  return (
    <Sheet open onClose={onClose} title={`Aggiungi al ${fromKey(date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' })}`}
      footer={chosen ? <><button className="btn" onClick={() => { setFood(null); setRecipe(null); }}>Indietro</button><button className="btn primary grow" disabled={!!food && !grams} onClick={() => {
        onAdd(food ? { uid: uid('mp_'), slot, kind: 'food', refId: food.id, name: food.name, grams: grams ?? 0 } : { uid: uid('mp_'), slot, kind: 'recipe', refId: recipe!.id, name: recipe!.name, grams: Math.round(recipePer100(recipe!).servingGrams * servings), servings });
        setFood(null); setRecipe(null); setQ('');
      }}>Aggiungi</button></> : undefined}>
      <div className="stack-sm">
        <div className="field"><label>Pasto</label><select className="select" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>{MEAL_ORDER.map((s) => <option key={s} value={s}>{MEAL_LABEL[s]}</option>)}</select></div>
        {chosen ? (
          <div className="stack-sm">
            <b>{chosen.name}</b>
            {food ? <NumberInput value={grams} onChange={setGrams} suffix="g" min={0} max={5000} ariaLabel="Grammi" /> : <Stepper value={servings} min={0.5} max={20} step={0.5} format={(v) => `${fmtN(v, 1)} porz.`} onChange={setServings} />}
          </div>
        ) : (
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Cerca alimento o ricetta" autoFocus />
            {recs.length > 0 && <div className="section-title" style={{ marginTop: 8 }}>Ricette</div>}
            {recs.slice(0, 10).map((r) => <button key={r.id} className="list-item" onClick={() => setRecipe(r)}><BookOpen size={17} className="muted" /><span className="grow li-title">{r.name}</span><Plus size={16} className="muted" /></button>)}
            {q && <div className="section-title" style={{ marginTop: 8 }}>Alimenti</div>}
            {q && foods.map((f) => <button key={f.id} className="list-item" onClick={() => { setFood(f); setGrams(f.unitGrams ?? 100); }}><span className="grow"><div className="li-title">{f.name}</div><div className="li-sub">{f.kcal} kcal/100 g</div></span><Plus size={16} className="muted" /></button>)}
          </>
        )}
      </div>
    </Sheet>
  );
}
