/** Utility e componenti condivisi della sezione Nutrizione. */
import { useEffect, useState } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { FOODS } from '@/data/foods';
import { store } from '@/db/store';
import { macrosFor } from '@/lib/nutrition';
import { MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import { dayKey, fmtN, normalize, uid } from '@/lib/util';
import { Sheet, NumberInput } from '@/components/ui';
import { patchMeta, pushRecentFood, useMeta } from '@/app/data';
import type { DiaryEntry, Food, MealSlot, Recipe } from '@/lib/types';

export const FOOD_MAP: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f]));
export function findFood(id: string | undefined): Food | undefined {
  if (!id) return undefined;
  return FOOD_MAP[id] ?? store.get<Food>('foods', id);
}
export function allFoods(custom: Food[]): Food[] { return [...custom, ...FOODS]; }

/** Radice semplice di una parola italiana: toglie la vocale finale (pizza/pizze, panino/panini). */
const stem = (w: string) => (w.length > 4 ? w.replace(/[aeiouy]$/, '') : w);
const STOP = new Set(['di', 'da', 'con', 'al', 'alla', 'alle', 'allo', 'ai', 'agli', 'il', 'la', 'le', 'lo', 'i', 'gli', 'e', 'in', 'del', 'della', 'dei', 'un', 'una']);
/** Le parole del testo, normalizzate. */
const tokens = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter(Boolean);
/** Distanza di modifica limitata (per tollerare un errore di battitura). */
function within1(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Ricerca tollerante: ogni parola cercata deve comparire nel nome, nella marca, nella categoria o nei
 * sinonimi, anche al plurale, come inizio di parola o con un errore di battitura (parole di 5+ lettere).
 * Ordine: nome che inizia con la ricerca, poi parole trovate nel nome, poi i nomi più corti.
 */
export function searchFoods(list: Food[], q: string) {
  const n = normalize(q.trim());
  if (!n) return list;
  const words = tokens(n).filter((w) => !STOP.has(w));
  if (!words.length) return list;
  type Hit = { f: Food; score: number };
  const hits: Hit[] = [];
  for (const f of list) {
    const nameT = tokens(f.name);
    const otherT = tokens(`${f.brand ?? ''} ${f.category ?? ''} ${f.keywords ?? ''}`);
    let score = 0, ok = true;
    for (const w of words) {
      const sw = stem(w);
      const m = (t: string) => t === w ? 3 : t.startsWith(w) ? 2.5 : stem(t) === sw || t.startsWith(sw) && sw.length >= 4 ? 2 : w.length >= 5 && within1(stem(t), sw) ? 1 : 0;
      let best = 0;
      for (const t of nameT) { best = Math.max(best, m(t) * 2); if (best === 6) break; }
      if (best < 6) for (const t of otherT) best = Math.max(best, m(t));
      if (!best) { ok = false; break; }
      score += best;
    }
    if (!ok) continue;
    const nn = normalize(f.name);
    if (nn.startsWith(n)) score += 8;
    else if (nn.includes(n)) score += 3;
    if (f.custom) score += 1; // i propri prodotti prima a parità di risultato
    hits.push({ f, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.f.name.length - b.f.name.length).map((h) => h.f);
}

/** Pasto suggerito in base all'ora. */
export function defaultSlot(d = new Date()): MealSlot {
  const h = d.getHours();
  return h < 10 ? 'breakfast' : h < 12 ? 'snack_am' : h < 15 ? 'lunch' : h < 18 ? 'snack_pm' : h < 22 ? 'dinner' : 'other';
}

export function recipePer100(r: Recipe) {
  const grams = r.ingredients.reduce((a, i) => a + i.grams, 0);
  const tot = r.ingredients.reduce((t, i) => { const m = macrosFor(i.per100, i.grams); return { kcal: t.kcal + m.kcal, protein: t.protein + m.protein, carbs: t.carbs + m.carbs, fat: t.fat + m.fat }; }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const perServing = { kcal: tot.kcal / r.servings, protein: tot.protein / r.servings, carbs: tot.carbs / r.servings, fat: tot.fat / r.servings };
  return { grams, total: tot, perServing, servingGrams: grams / Math.max(1, r.servings) };
}

export async function addFoodEntry(date: string, slot: MealSlot, food: Food, grams: number) {
  const m = macrosFor(food, grams);
  const e: DiaryEntry = { id: uid('d_'), date, slot, foodId: food.id, name: food.name, grams, ...m, createdAt: new Date().toISOString() };
  await store.put('diary', e.id, e);
  pushRecentFood(food.id);
  return e;
}
export async function addRecipeEntry(date: string, slot: MealSlot, r: Recipe, servings: number) {
  const info = recipePer100(r);
  const e: DiaryEntry = {
    id: uid('d_'), date, slot, recipeId: r.id, name: `${r.name} (${fmtN(servings, 1)} ${servings === 1 ? 'porzione' : 'porzioni'})`, grams: Math.round(info.servingGrams * servings),
    kcal: Math.round(info.perServing.kcal * servings), protein: Math.round(info.perServing.protein * servings * 10) / 10, carbs: Math.round(info.perServing.carbs * servings * 10) / 10, fat: Math.round(info.perServing.fat * servings * 10) / 10,
    createdAt: new Date().toISOString(),
  };
  await store.put('diary', e.id, e);
  return e;
}

export function MacroLine({ kcal, protein, carbs, fat }: { kcal: number; protein: number; carbs: number; fat: number }) {
  return (
    <span className="tiny muted">
      <b className="num" style={{ color: 'var(--text-2)' }}>{fmtN(kcal)} kcal</b> · <span style={{ color: 'var(--protein)' }}>P</span> {fmtN(protein, 1)} · <span style={{ color: 'var(--carbs)' }}>C</span> {fmtN(carbs, 1)} · <span style={{ color: 'var(--fat)' }}>G</span> {fmtN(fat, 1)}
    </span>
  );
}

/**
 * Pannello quantità: aggiunta di un alimento o modifica di una voce del diario.
 * Gestisce grammi, porzioni, pasto e preferiti.
 */
export function QuantitySheet({ food, entry, open, onClose, date, slot: slot0, onDone }: {
  food: Food | null; entry?: DiaryEntry | null; open: boolean; onClose: () => void; date: string; slot: MealSlot; onDone?: (msg: string) => void;
}) {
  const meta = useMeta();
  const [grams, setGrams] = useState<number | null>(100);
  const [slot, setSlot] = useState<MealSlot>(slot0);
  const [day, setDay] = useState(date);
  useEffect(() => {
    if (!open) return;
    setSlot(entry?.slot ?? slot0);
    setDay(entry?.date ?? date);
    setGrams(entry ? entry.grams : food?.unitGrams ?? 100);
  }, [open, entry, food, slot0, date]);

  // per voci senza alimento di riferimento (inserimento manuale/ricetta) si scala proporzionalmente
  const base: Pick<Food, 'kcal' | 'protein' | 'carbs' | 'fat'> | null = food ?? (entry && entry.grams > 0 ? { kcal: (entry.kcal / entry.grams) * 100, protein: (entry.protein / entry.grams) * 100, carbs: (entry.carbs / entry.grams) * 100, fat: (entry.fat / entry.grams) * 100 } : null);
  const g = grams ?? 0;
  const m = base ? macrosFor(base, g) : entry ? { kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat } : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const fav = !!food && meta.favoriteFoods.includes(food.id);
  const name = food?.name ?? entry?.name ?? '';
  const scalable = !!base;

  async function submit() {
    if (scalable && (!grams || grams <= 0)) return;
    if (entry) {
      await store.put('diary', entry.id, { ...entry, slot, date: day, grams: scalable ? g : entry.grams, ...(scalable ? m : {}) });
      onDone?.('Voce aggiornata');
    } else if (food) {
      await addFoodEntry(day, slot, food, g);
      onDone?.(`${food.name} aggiunto a ${MEAL_LABEL[slot]}`);
    }
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={name}
      footer={<>
        {entry && <button className="btn danger" onClick={async () => { await store.remove('diary', entry.id); onDone?.('Voce eliminata'); onClose(); }} aria-label="Elimina voce"><Trash2 size={17} /></button>}
        <button className="btn primary grow" onClick={submit} disabled={scalable && (!grams || grams <= 0)}>{entry ? 'Salva modifiche' : 'Aggiungi al diario'}</button>
      </>}>
      <div className="stack">
        {food?.brand && <div className="small muted">{food.brand}</div>}
        <div className="card" style={{ padding: 14, background: 'var(--surface-2)' }}>
          <div className="grid-3" style={{ textAlign: 'center' }}>
            <div className="stat"><span className="v" style={{ color: 'var(--accent-ink)' }}>{fmtN(m.kcal)}</span><span className="l">kcal</span></div>
            <div className="stat"><span className="v" style={{ fontSize: 18 }}>{fmtN(m.protein, 1)} g</span><span className="l">proteine</span></div>
            <div className="stat"><span className="v" style={{ fontSize: 18 }}>{fmtN(m.carbs, 1)} / {fmtN(m.fat, 1)}</span><span className="l">carbo / grassi</span></div>
          </div>
        </div>
        {scalable && (
          <div className="field">
            <label>Quantità</label>
            <NumberInput value={grams} onChange={setGrams} suffix={food?.unit ?? entry?.unit ?? 'g'} min={0} max={5000} ariaLabel={(food?.unit ?? entry?.unit) === 'ml' ? 'Quantità in millilitri' : 'Quantità in grammi'} />
            <div className="scale-row">
              {food?.unitGrams ? [0.5, 1, 2].map((k) => <button key={k} type="button" className={g === food.unitGrams! * k ? 'on' : ''} onClick={() => setGrams(food.unitGrams! * k)}>{k === 0.5 ? '½' : k} {food.unitName ?? 'porz.'}</button>) : null}
              {[50, 100, 150, 200].filter((x) => !food?.unitGrams || x !== food.unitGrams).slice(0, food?.unitGrams ? 2 : 4).map((x) => <button key={x} type="button" className={g === x ? 'on' : ''} onClick={() => setGrams(x)}>{x} {food?.unit ?? entry?.unit ?? 'g'}</button>)}
            </div>
            {food && <span className="tiny muted">Valori per 100 {food.unit ?? 'g'}: {food.kcal} kcal · P {food.protein} · C {food.carbs} · G {food.fat}</span>}
          </div>
        )}
        <div className="grid-2">
          <div className="field"><label htmlFor="qslot">Pasto</label>
            <select id="qslot" className="select" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>{MEAL_ORDER.map((s) => <option key={s} value={s}>{MEAL_LABEL[s]}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="qday">Giorno</label><input id="qday" type="date" className="input" value={day} max={dayKey(new Date(Date.now() + 86400000 * 30))} onChange={(e) => e.target.value && setDay(e.target.value)} /></div>
        </div>
        {food && (
          <button className="btn ghost" onClick={() => patchMeta({ favoriteFoods: fav ? meta.favoriteFoods.filter((x) => x !== food.id) : [food.id, ...meta.favoriteFoods] })} aria-pressed={fav}>
            <Heart size={17} fill={fav ? 'var(--accent)' : 'none'} color={fav ? 'var(--accent)' : 'currentColor'} /> {fav ? 'Nei preferiti' : 'Aggiungi ai preferiti'}
          </button>
        )}
      </div>
    </Sheet>
  );
}
