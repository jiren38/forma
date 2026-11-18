import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Globe, Heart, Clock, BookOpen, Bookmark, PenLine, Search, Loader2, ScanBarcode } from 'lucide-react';
import { useCustomFoods, useMeta, useRecipes, useSavedMeals } from '@/app/data';
import { store } from '@/db/store';
import { MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import { dayKey, fmtN, fromKey, uid } from '@/lib/util';
import { totals } from '@/lib/nutrition';
import { PageHeader, SearchInput, Empty, Sheet, NumberInput, Stepper, useToast } from '@/components/ui';
import { MacroLine, QuantitySheet, addRecipeEntry, allFoods, defaultSlot, findFood, recipePer100, searchFoods } from './common';
import type { DiaryEntry, Food, MealSlot, Recipe } from '@/lib/types';
import { canonicalCode } from '@/lib/barcode';
import { OFF_FIELDS, parseOffProduct } from '@/lib/off';
import { saveOnlineProduct } from './products';
import { unlockAudio } from './scanner/feedback';

type Tab = 'search' | 'recent' | 'fav' | 'meals' | 'recipes';

export default function AddFood() {
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const date = sp.get('date') ?? dayKey();
  const [slot, setSlot] = useState<MealSlot>((sp.get('slot') as MealSlot) || defaultSlot());
  const custom = useCustomFoods();
  const meta = useMeta();
  const recipes = useRecipes();
  const saved = useSavedMeals();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('search');
  const [sel, setSel] = useState<Food | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(1);
  const [manual, setManual] = useState(false);
  const [off, setOff] = useState<{ loading: boolean; results: Food[]; error?: string } | null>(null);
  const [added, setAdded] = useState(0);

  const foods = useMemo(() => allFoods(custom), [custom]);
  const results = useMemo(() => searchFoods(foods, q).slice(0, 80), [foods, q]);
  const recent = meta.recentFoods.map(findFood).filter((f): f is Food => !!f);
  const favs = meta.favoriteFoods.map(findFood).filter((f): f is Food => !!f);

  async function searchOnline() {
    const term = q.trim();
    if (term.length < 2) return;
    // un codice a barre apre la scheda prodotto (ricerca su Open Food Facts con cache)
    if (/^\d{8,14}$/.test(term)) { nav(`/nutrition/product/${canonicalCode(term)}?date=${date}&slot=${slot}`); return; }
    setOff({ loading: true, results: [] });
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=25&lc=it&fields=${OFF_FIELDS}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const products: any[] = data.products ?? [];
      const out: Food[] = products
        .map((p) => (p?.code ? parseOffProduct(p, canonicalCode(String(p.code))) : null))
        .filter((x): x is Food => !!x && !(x.missing ?? []).includes('kcal'));
      setOff({ loading: false, results: out });
    } catch {
      setOff({ loading: false, results: [], error: 'Ricerca online non disponibile (sei offline o il servizio non risponde). Puoi creare l’alimento manualmente.' });
    }
  }

  async function pickOnline(f: Food) {
    // salvato tra i propri prodotti (un documento per codice) e aperto nella scheda prodotto
    const saved = await saveOnlineProduct(f);
    nav(`/nutrition/product/${saved.barcode}?date=${date}&slot=${slot}`);
  }
  /** Gli alimenti con codice a barre si aprono nella scheda prodotto (porzioni, ml, dati mancanti). */
  const pick = (f: Food) => (f.barcode ? nav(`/nutrition/product/${f.barcode}?date=${date}&slot=${slot}`) : setSel(f));

  const done = (msg: string) => { toast(msg); setAdded((n) => n + 1); };

  return (
    <div className="page stack">
      <PageHeader title="Aggiungi alimento" back right={added > 0 ? <button className="btn sm primary" onClick={() => nav(`/nutrition?date=${date}`)}>Fatto ({added})</button> : undefined} />
      <div className="row" style={{ gap: 8 }}>
        <select className="select grow" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)} aria-label="Pasto">{MEAL_ORDER.map((s) => <option key={s} value={s}>{MEAL_LABEL[s]}</option>)}</select>
        <span className="pill">{date === dayKey() ? 'Oggi' : fromKey(date).toLocaleDateString('it-IT')}</span>
      </div>
      <div className="row search-scan" style={{ gap: 8 }}>
        <div className="grow"><SearchInput value={q} onChange={(v) => { setQ(v); setTab('search'); setOff(null); }} placeholder="Cerca alimento o codice a barre" autoFocus /></div>
        <button className="icon-btn scan-icon" onClick={() => { unlockAudio(); nav(`/nutrition/scan?date=${date}&slot=${slot}`); }} aria-label="Scansiona il codice a barre" title="Scansiona il codice a barre"><ScanBarcode size={21} /></button>
      </div>
      <div className="chips">
        <button className={`chip ${tab === 'search' ? 'on' : ''}`} onClick={() => setTab('search')}><Search size={13} /> Database</button>
        <button className={`chip ${tab === 'recent' ? 'on' : ''}`} onClick={() => setTab('recent')}><Clock size={13} /> Recenti</button>
        <button className={`chip ${tab === 'fav' ? 'on' : ''}`} onClick={() => setTab('fav')}><Heart size={13} /> Preferiti</button>
        <button className={`chip ${tab === 'meals' ? 'on' : ''}`} onClick={() => setTab('meals')}><Bookmark size={13} /> Pasti salvati</button>
        <button className={`chip ${tab === 'recipes' ? 'on' : ''}`} onClick={() => setTab('recipes')}><BookOpen size={13} /> Ricette</button>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn sm" onClick={() => setManual(true)}><PenLine size={15} /> Inserimento rapido</button>
        <Link to="/nutrition/foods?new=1" className="btn sm"><Plus size={15} /> Crea alimento</Link>
      </div>

      {tab === 'search' && (
        <>
          {results.length === 0 && !q ? null : results.length === 0 ? <p className="small muted">Nessun alimento nel database locale per “{q}”.</p> : <FoodList foods={results} onPick={pick} />}
          {q.trim().length >= 2 && (
            <div className="card stack-sm">
              <div className="row-between"><span className="small"><b>Non trovi l’alimento?</b><div className="tiny muted">Cerca tra i prodotti confezionati di Open Food Facts (database aperto). Per i codici a barre inserisci le cifre.</div></span></div>
              <button className="btn" onClick={searchOnline} disabled={off?.loading}>{off?.loading ? <><Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Ricerca…</> : <>{/^\d{8,14}$/.test(q.trim()) ? <ScanBarcode size={16} /> : <Globe size={16} />} Cerca online</>}</button>
              {off?.error && <p className="small danger-text">{off.error}</p>}
              {off && !off.loading && !off.error && (off.results.length ? <FoodList foods={off.results} onPick={pickOnline} /> : <p className="small muted">Nessun prodotto trovato online.</p>)}
            </div>
          )}
          {!q && <p className="small muted">Cerca tra oltre {foods.length} alimenti con valori medi per 100 g, oppure usa recenti e preferiti.</p>}
        </>
      )}
      {tab === 'recent' && (recent.length ? <FoodList foods={recent} onPick={pick} /> : <Empty icon={<Clock />} title="Nessun alimento recente" />)}
      {tab === 'fav' && (favs.length ? <FoodList foods={favs} onPick={pick} /> : <Empty icon={<Heart />} title="Nessun preferito" text="Quando aggiungi un alimento puoi segnarlo come preferito." />)}
      {tab === 'meals' && (saved.length ? (
        <div className="settings-group">
          {saved.map((m) => (
            <button key={m.id} className="list-item" onClick={async () => {
              for (const it of m.items) { const e: DiaryEntry = { ...it, id: uid('d_'), date, slot, createdAt: new Date().toISOString() }; await store.put('diary', e.id, e); }
              done(`“${m.name}” aggiunto a ${MEAL_LABEL[slot]}`);
            }}>
              <span className="grow"><div className="li-title">{m.name}</div><MacroLine {...totals(m.items)} /></span><Plus size={18} className="muted" />
            </button>
          ))}
        </div>
      ) : <Empty icon={<Bookmark />} title="Nessun pasto salvato" text="Dal diario, apri il menu di un pasto e scegli “Salva questo pasto”." />)}
      {tab === 'recipes' && (recipes.length ? (
        <div className="settings-group">
          {recipes.map((r) => { const info = recipePer100(r); return (
            <button key={r.id} className="list-item" onClick={() => { setRecipe(r); setServings(1); }}>
              <span className="grow"><div className="li-title">{r.name}</div><span className="tiny muted">Per porzione: </span><MacroLine {...info.perServing} /></span><Plus size={18} className="muted" />
            </button>
          ); })}
        </div>
      ) : <Empty icon={<BookOpen />} title="Nessuna ricetta" action={<Link to="/nutrition/recipes" className="btn sm">Crea una ricetta</Link>} />)}

      <QuantitySheet open={!!sel} food={sel} date={date} slot={slot} onClose={() => setSel(null)} onDone={done} />
      <Sheet open={!!recipe} onClose={() => setRecipe(null)} title={recipe?.name}
        footer={<button className="btn primary block" onClick={async () => { await addRecipeEntry(date, slot, recipe!, servings); done(`${recipe!.name} aggiunta a ${MEAL_LABEL[slot]}`); setRecipe(null); }}>Aggiungi al diario</button>}>
        {recipe && (() => { const info = recipePer100(recipe); return (
          <div className="stack">
            <div className="field"><label>Porzioni</label><Stepper value={servings} min={0.5} max={20} step={0.5} format={(v) => fmtN(v, 1)} onChange={setServings} /></div>
            <MacroLine kcal={info.perServing.kcal * servings} protein={info.perServing.protein * servings} carbs={info.perServing.carbs * servings} fat={info.perServing.fat * servings} />
            <span className="tiny muted">La ricetta è per {recipe.servings} porzioni ({fmtN(info.grams)} g totali).</span>
          </div>
        ); })()}
      </Sheet>
      <ManualSheet open={manual} onClose={() => setManual(false)} onSave={async (e) => { const full: DiaryEntry = { ...e, id: uid('d_'), date, slot, createdAt: new Date().toISOString() }; await store.put('diary', full.id, full); done(`${e.name} aggiunto`); setManual(false); }} />
    </div>
  );
}

function FoodList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  return (
    <div className="settings-group">
      {foods.map((f) => (
        <button key={f.id} className="list-item" onClick={() => onPick(f)}>
          <span className="grow" style={{ minWidth: 0 }}>
            <div className="li-title ellipsis">{f.name}{f.custom && f.source !== 'openfoodfacts' ? <span className="pill" style={{ marginLeft: 6 }}>Mio</span> : null}</div>
            <div className="li-sub ellipsis">{f.brand ? `${f.brand} · ` : ''}{f.kcal} kcal/100 {f.unit ?? 'g'} · P {f.protein} · C {f.carbs} · G {f.fat}{f.unitGrams ? ` · 1 ${f.unitName ?? 'porz.'} = ${f.unitGrams} g` : ''}</div>
          </span>
          <Plus size={18} className="muted" />
        </button>
      ))}
    </div>
  );
}

function ManualSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (e: Omit<DiaryEntry, 'id' | 'date' | 'slot' | 'createdAt'>) => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [p, setP] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [f, setF] = useState<number | null>(null);
  const [g, setG] = useState<number | null>(null);
  const calc = Math.round((p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9);
  const valid = name.trim() && (kcal ?? calc) > 0;
  return (
    <Sheet open={open} onClose={onClose} title="Inserimento rapido"
      footer={<button className="btn primary block" disabled={!valid} onClick={() => { onSave({ name: name.trim(), grams: g ?? 0, kcal: Math.round(kcal ?? calc), protein: p ?? 0, carbs: c ?? 0, fat: f ?? 0 }); setName(''); setKcal(null); setP(null); setC(null); setF(null); setG(null); }}>Aggiungi</button>}>
      <div className="stack-sm">
        <div className="field"><label htmlFor="mname">Descrizione</label><input id="mname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Pizza margherita al ristorante" maxLength={60} /></div>
        <div className="grid-2">
          <div className="field"><label>Calorie</label><NumberInput value={kcal} onChange={setKcal} suffix="kcal" min={0} max={10000} placeholder={calc ? String(calc) : ''} ariaLabel="Calorie" /></div>
          <div className="field"><label>Quantità (facoltativa)</label><NumberInput value={g} onChange={setG} suffix="g" min={0} max={5000} ariaLabel="Grammi" /></div>
          <div className="field"><label>Proteine</label><NumberInput value={p} onChange={setP} suffix="g" min={0} max={500} ariaLabel="Proteine" /></div>
          <div className="field"><label>Carboidrati</label><NumberInput value={c} onChange={setC} suffix="g" min={0} max={1000} ariaLabel="Carboidrati" /></div>
          <div className="field"><label>Grassi</label><NumberInput value={f} onChange={setF} suffix="g" min={0} max={500} ariaLabel="Grassi" /></div>
        </div>
        {!kcal && calc > 0 && <p className="tiny muted">Calorie calcolate dai macronutrienti: {calc} kcal.</p>}
      </div>
    </Sheet>
  );
}
