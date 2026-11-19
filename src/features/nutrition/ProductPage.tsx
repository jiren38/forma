/** Scheda del prodotto scansionato: dati, tabella nutrizionale, quantità con calcolo immediato e aggiunta al diario. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bookmark, Pencil, Barcode, Package, PackageSearch, WifiOff, RefreshCw, ScanBarcode, Keyboard, Minus, Plus, Check, AlertTriangle, ChevronRight, RotateCcw } from 'lucide-react';
import { patchMeta, useActiveProgram, useCustomFoods, useDiary, useMeta, useProfile, useSettings } from '@/app/data';
import { PageHeader, Segmented, Sheet, Ring, MacroBar, useToast } from '@/components/ui';
import { formatCode } from '@/lib/barcode';
import { allergenLabel } from '@/lib/off';
import { targetsFor } from '@/lib/insights';
import { totals } from '@/lib/nutrition';
import { MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import { dayKey, fmtN, fromKey, uid } from '@/lib/util';
import type { Food, MealSlot } from '@/lib/types';
import { defaultSlot } from './common';
import { NUTRIENTS, NUTRIENT_LABEL, addProductToDiary, isStale, localProduct, lookupProduct, per100Of, portionOptions, scaleNutrients, type LookupResult, type Nutrients } from './products';
import { ProductEditor } from './ProductEditor';
import { lastHandled, unlockAudio } from './scanner/feedback';

const DERIVED: Record<string, string> = {
  kcal_from_kj: 'Calorie calcolate dai kJ riportati in etichetta (1 kcal = 4,184 kJ).',
  salt_from_sodium: 'Sale calcolato dal sodio (sale = sodio × 2,5).',
  per100_from_serving: 'Valori per 100 ricavati da quelli per porzione indicati in etichetta.',
};

export default function ProductPage() {
  const { code = '' } = useParams();
  const loc = useLocation();
  const [sp, setSp] = useSearchParams();
  const passed = (loc.state as { result?: LookupResult } | null)?.result;
  const [res, setRes] = useState<LookupResult | null>(passed ?? null);
  const [attempt, setAttempt] = useState(0);
  const editing = sp.get('edit') === '1';
  const setEditing = (on: boolean) => { const n = new URLSearchParams(sp); if (on) n.set('edit', '1'); else n.delete('edit'); setSp(n, { replace: true }); };
  useCustomFoods(); // ridisegna quando il prodotto cambia (modifiche, preferiti, sincronizzazione)

  useEffect(() => {
    if (res && attempt === 0) return;
    let alive = true;
    setRes(null);
    lookupProduct(code, { force: attempt > 0 }).then((r) => { if (alive) setRes(r); });
    return () => { alive = false; };
  }, [code, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // aggiornamento silenzioso dei dati in cache più vecchi di 30 giorni
  useEffect(() => {
    if (res?.status === 'found' && isStale(res.food) && navigator.onLine) void lookupProduct(code, { force: true });
  }, [res, code]);

  const food = res?.status === 'found' ? localProduct(code) ?? res.food : null;

  if (editing) {
    return <ProductEditor code={code} base={food} onCancel={() => setEditing(false)} onSaved={(f) => { setRes({ status: 'found', food: f, from: 'local' }); setEditing(false); }} />;
  }
  if (!res) {
    return (
      <div className="page stack">
        <PageHeader title="Prodotto" back />
        <div className="product-loading" role="status">
          <div className="spinner" />
          <b>Cerco il prodotto…</b>
          <span className="small muted num">{formatCode(code)}</span>
          <span className="tiny muted">Database Open Food Facts</span>
        </div>
      </div>
    );
  }
  if (res.status === 'not_found') return <NotFound code={code} onAdd={() => setEditing(true)} onRetry={() => setAttempt((n) => n + 1)} />;
  if (res.status === 'error') return <LookupError code={code} message={res.message} onRetry={() => setAttempt((n) => n + 1)} onManual={() => setEditing(true)} />;
  return <ProductView food={food!} onEdit={() => setEditing(true)} onRefetch={() => setAttempt((n) => n + 1)} />;
}

function scanAgainUrl(sp: URLSearchParams, slot?: MealSlot) {
  const q = new URLSearchParams();
  if (sp.get('date')) q.set('date', sp.get('date')!);
  if (slot ?? sp.get('slot')) q.set('slot', (slot ?? sp.get('slot'))!);
  return `/nutrition/scan${q.toString() ? `?${q}` : ''}`;
}

function NotFound({ code, onAdd, onRetry }: { code: string; onAdd: () => void; onRetry: () => void }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  return (
    <div className="page stack">
      <PageHeader title="Prodotto" back />
      <div className="product-empty">
        <div className="product-empty-ic"><PackageSearch size={34} /></div>
        <h2>Prodotto non trovato. Vuoi aggiungerlo manualmente?</h2>
        <p className="small muted">Il codice <b className="num">{formatCode(code)}</b> non è presente su Open Food Facts né tra i tuoi prodotti. Inserisci i dati della tabella nutrizionale: le prossime scansioni lo riconosceranno subito.</p>
        <div className="stack-sm" style={{ width: '100%', maxWidth: 360 }}>
          <button className="btn primary block lg" onClick={onAdd}><Pencil size={18} /> Aggiungi manualmente</button>
          <button className="btn block" onClick={() => { unlockAudio(); nav(scanAgainUrl(sp), { replace: true }); }}><ScanBarcode size={18} /> Scansiona un altro prodotto</button>
          <button className="btn ghost block" onClick={onRetry}><RefreshCw size={16} /> Cerca di nuovo</button>
        </div>
      </div>
    </div>
  );
}

function LookupError({ code, message, onRetry, onManual }: { code: string; message: string; onRetry: () => void; onManual: () => void }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  return (
    <div className="page stack">
      <PageHeader title="Prodotto" back />
      <div className="product-empty" role="alert">
        <div className="product-empty-ic warn"><WifiOff size={32} /></div>
        <h2>Ricerca non riuscita</h2>
        <p className="small muted">{message}</p>
        <p className="tiny muted num">Codice {formatCode(code)}</p>
        <div className="stack-sm" style={{ width: '100%', maxWidth: 360 }}>
          <button className="btn primary block lg" onClick={onRetry}><RefreshCw size={18} /> Riprova</button>
          <button className="btn block" onClick={onManual}><Keyboard size={18} /> Inserisci i dati a mano</button>
          <button className="btn ghost block" onClick={() => nav(scanAgainUrl(sp), { replace: true })}><ScanBarcode size={16} /> Torna allo scanner</button>
        </div>
      </div>
    </div>
  );
}

function sourceBadge(f: Food) {
  if (f.source === 'openfoodfacts' && f.editedFromOff) return <span className="pill orange">Corretto da te</span>;
  if (f.source === 'openfoodfacts') return <span className="pill blue">Open Food Facts</span>;
  return <span className="pill accent">Creato da te</span>;
}

export function ProductImage({ src, size = 'md', alt }: { src?: string; size?: 'sm' | 'md' | 'lg'; alt?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <div className={`product-thumb ${size} ph`} aria-hidden><Package size={size === 'sm' ? 20 : 34} /></div>;
  return <img className={`product-thumb ${size}`} src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

const fmtVal = (v: number | null, key: string) => (v === null ? null : key === 'kcal' ? fmtN(v) : key === 'salt' ? fmtN(v, 2) : fmtN(v, 1));

function ProductView({ food, onEdit, onRefetch }: { food: Food; onEdit: () => void; onRefetch: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const meta = useMeta();
  const profile = useProfile()!;
  const settings = useSettings();
  const program = useActiveProgram();
  const diary = useDiary();
  const t = targetsFor(profile, settings, program);
  const unit = food.unit ?? 'g';
  const options = useMemo(() => portionOptions(food), [food]);
  const [optId, setOptId] = useState<'base' | 'serving' | 'package'>(() => (options.some((o) => o.id === 'serving') ? 'serving' : 'base'));
  const opt = options.find((o) => o.id === optId) ?? options[0];
  const [count, setCount] = useState<number>(opt.id === 'base' ? 100 : 1);
  const [countText, setCountText] = useState<string>(String(opt.id === 'base' ? 100 : 1));
  const amount = Math.max(0, count * opt.size);
  const per100 = per100Of(food);
  const now = scaleNutrients(per100, amount);
  const serving = food.servingQty && (food.servingUnit ?? unit) === unit ? scaleNutrients(per100, food.servingQty) : null;
  const [view, setView] = useState<'100' | 'serving' | 'qty'>('100');
  // la quantità scelta compare come terza colonna solo se diversa da 100 e dalla porzione
  const qtyDistinct = amount > 0 && amount !== 100 && !(serving && amount === food.servingQty);
  const effView = view === 'qty' && !qtyDistinct ? (serving && amount === food.servingQty ? 'serving' : '100') : view;
  const shown: Nutrients = effView === '100' ? per100 : effView === 'serving' && serving ? serving : now;
  const fav = meta.favoriteFoods.includes(food.id);
  const missing = food.missing ?? [];
  const canAdd = per100.kcal !== null && amount > 0;
  const forShopping = sp.get('to') === 'shopping';
  // "La mia lista": i prodotti salvati (meta.favoriteFoods) da riusare in altri pasti e nella spesa
  function toggleSaved() {
    patchMeta({ favoriteFoods: fav ? meta.favoriteFoods.filter((x) => x !== food.id) : [food.id, ...meta.favoriteFoods] });
    toast(fav ? 'Rimosso dalla tua lista' : 'Salvato nella tua lista');
  }
  function addToShopping() {
    const extras = meta.shoppingExtra ?? [];
    if (extras.some((x) => x.foodId === food.id)) toast('Già nella lista della spesa');
    else {
      patchMeta({ shoppingExtra: [...extras, { id: uid('x_'), name: food.brand ? `${food.name} · ${food.brand}` : food.name, foodId: food.id }] });
      toast('Aggiunto alla lista della spesa');
    }
    nav('/nutrition/shopping', { replace: true });
  }
  const savedIcon = <Bookmark size={20} fill={fav ? 'var(--accent)' : 'none'} color={fav ? 'var(--accent)' : 'currentColor'} />;

  const [pickMeal, setPickMeal] = useState(false);
  const [slot, setSlot] = useState<MealSlot>((sp.get('slot') as MealSlot) || defaultSlot());
  const [day, setDay] = useState(sp.get('date') ?? dayKey());
  const [added, setAdded] = useState<{ slot: MealSlot; date: string; kcal: number } | null>(null);

  function setCountBoth(v: number) { const r = Math.round(v * 100) / 100; setCount(r); setCountText(String(r).replace('.', ',')); }
  function choose(id: typeof optId) { setOptId(id); setCountBoth(id === 'base' ? (food.servingQty && (food.servingUnit ?? unit) === unit ? food.servingQty : 100) : 1); }
  const step = opt.step;
  const quick = opt.id === 'base' ? (unit === 'ml' ? [100, 200, 250, 330, 500] : [30, 50, 100, 150, 200]) : opt.id === 'serving' ? [0.5, 1, 1.5, 2, 3] : [0.25, 0.5, 1];

  async function confirmAdd() {
    if (!canAdd) return;
    await addProductToDiary(day, slot, food, amount);
    lastHandled.code = food.barcode ?? ''; lastHandled.at = Date.now();
    setPickMeal(false);
    setAdded({ slot, date: day, kcal: now.kcal ?? 0 });
  }

  const dayTot = totals(diary.filter((d) => d.date === (added?.date ?? day)));
  const macroKcal = (per100.protein ?? 0) * 4 + (per100.carbs ?? 0) * 4 + (per100.fat ?? 0) * 9;
  const split = macroKcal > 0 && per100.protein !== null && per100.carbs !== null && per100.fat !== null
    ? [{ k: 'Proteine', v: ((per100.protein * 4) / macroKcal) * 100, c: 'var(--protein)' }, { k: 'Carboidrati', v: ((per100.carbs * 4) / macroKcal) * 100, c: 'var(--carbs)' }, { k: 'Grassi', v: ((per100.fat * 9) / macroKcal) * 100, c: 'var(--fat)' }]
    : null;

  return (
    <div className="page stack product-page">
      <PageHeader title="Prodotto" back right={<div className="row" style={{ gap: 6 }}>
        <button className="icon-btn" onClick={toggleSaved} aria-pressed={fav} aria-label={fav ? 'Rimuovi dalla tua lista' : 'Salva nella tua lista'}>
          {savedIcon}
        </button>
        <button className="icon-btn" onClick={onEdit} aria-label="Modifica il prodotto"><Pencil size={19} /></button>
      </div>} />

      <div className="desk-2">
        <div className="stack">
          <section className="card product-hero">
            <ProductImage src={food.imageUrl} size="lg" alt={`Confezione di ${food.name}`} />
            <div className="stack-sm" style={{ minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 6 }}>{sourceBadge(food)}{food.nutriscore && <span className={`nutriscore ns-${food.nutriscore}`} title="Nutri-Score">Nutri-Score {food.nutriscore.toUpperCase()}</span>}</div>
              <h1 className="product-name">{food.name}</h1>
              {food.brand && <div className="small muted">{food.brand}</div>}
              <div className="tiny muted product-meta">
                {food.packageLabel && <span><Package size={13} /> {food.packageLabel}</span>}
                {food.barcode && <span className="num"><Barcode size={13} /> {formatCode(food.barcode)}</span>}
              </div>
              {food.categories && <div className="tiny muted ellipsis">{food.categories}</div>}
            </div>
          </section>

          {missing.length > 0 && (
            <div className="card product-warn" role="note">
              <AlertTriangle size={18} />
              <div className="grow small">
                <b>Dati non disponibili:</b> {missing.map((k) => NUTRIENT_LABEL[k]).join(', ')}. Non sono stati stimati{per100.kcal === null ? ': senza calorie il prodotto non può essere aggiunto al diario.' : ' e non vengono conteggiati.'}
                <div><button className="btn sm soft" style={{ marginTop: 8 }} onClick={onEdit}><Pencil size={14} /> Completa i dati</button></div>
              </div>
            </div>
          )}

          <section className="card" aria-label="Valori nutrizionali">
            <div className="card-title"><h3>Valori nutrizionali</h3></div>
            <Segmented label="Riferimento" value={effView} onChange={setView} options={[
              { value: '100' as const, label: `100 ${unit}` },
              ...(serving ? [{ value: 'serving' as const, label: `Porzione` }] : []),
              ...(qtyDistinct ? [{ value: 'qty' as const, label: `${fmtN(amount, 1)} ${unit}` }] : []),
            ]} />
            <table className="nutri-table">
              <tbody>
                {NUTRIENTS.map((n) => {
                  const v = fmtVal(shown[n.key], n.key);
                  return (
                    <tr key={n.key} className={n.sub ? 'sub' : ''}>
                      <th scope="row">{n.label}</th>
                      <td className="num">{v === null ? <span className="nd" title="Dato non presente nella fonte">n.d.</span> : <>{v} {n.unit}</>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {serving && <div className="tiny muted">Porzione in etichetta: {food.servingLabel || `${fmtN(food.servingQty!, 1)} ${unit}`}{food.servingLabel && !food.servingLabel.includes(String(food.servingQty)) ? ` (${fmtN(food.servingQty!, 1)} ${unit})` : ''}</div>}
            {(food.derived ?? []).map((d) => DERIVED[d] && <div key={d} className="tiny muted">{DERIVED[d]}</div>)}
            {split && (
              <div className="macro-split" aria-label="Ripartizione delle calorie">
                <div className="macro-split-bar">{split.map((s) => <i key={s.k} style={{ width: `${s.v}%`, background: s.c }} />)}</div>
                <div className="row wrap tiny" style={{ gap: 12 }}>{split.map((s) => <span key={s.k}><b style={{ color: s.c }}>●</b> {s.k} {Math.round(s.v)}%</span>)}</div>
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card stack-sm" aria-label="Quantità consumata">
            <div className="card-title"><h3>Quanto ne hai consumato?</h3></div>
            {options.length > 1 && (
              <div className="qty-units" role="radiogroup" aria-label="Unità di misura">
                {options.map((o) => {
                  const title = o.id === 'base' ? (unit === 'ml' ? 'Millilitri' : 'Grammi') : o.id === 'serving' ? 'Porzione' : 'Confezione';
                  const sub = o.id === 'base' ? `a ${unit === 'ml' ? 'volume' : 'peso'}` : `${fmtN(o.size, 1)} ${unit}`;
                  return (
                    <button key={o.id} role="radio" aria-checked={o.id === optId} aria-label={`${title} (${sub})`} className={`qty-unit ${o.id === optId ? 'on' : ''}`} onClick={() => choose(o.id)}>
                      <b>{title}</b><span>{sub}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="qty-row">
              <button className="qty-btn" onClick={() => setCountBoth(Math.max(0, count - step))} aria-label="Diminuisci"><Minus size={20} /></button>
              <div className="qty-input">
                <input className="input num" inputMode="decimal" value={countText} aria-label={`Quantità in ${opt.id === 'base' ? unit : opt.short}`}
                  onChange={(e) => { const s = e.target.value.replace(/[^\d.,]/g, ''); setCountText(s); const n = Number(s.replace(',', '.')); setCount(Number.isFinite(n) ? n : 0); }} />
                <span>{opt.id === 'base' ? unit : opt.id === 'serving' ? (count === 1 ? 'porzione' : 'porzioni') : (count === 1 ? 'confezione' : 'confezioni')}</span>
              </div>
              <button className="qty-btn" onClick={() => setCountBoth(count + step)} aria-label="Aumenta"><Plus size={20} /></button>
            </div>
            <div className="scale-row">
              {quick.map((q) => <button key={q} className={count === q ? 'on' : ''} onClick={() => setCountBoth(q)}>{opt.id === 'base' ? `${q} ${unit}` : q === 0.25 ? '¼' : q === 0.5 ? '½' : q === 1.5 ? '1½' : String(q)}</button>)}
            </div>
            {opt.id !== 'base' && <div className="tiny muted">= {fmtN(amount, 1)} {unit}</div>}
            {unit === 'ml' && <div className="tiny muted">Valori per 100 ml: la quantità si indica in millilitri, senza convertirla in grammi.</div>}
            <div className="qty-result" aria-live="polite">
              <div className="qty-kcal"><b className="num">{now.kcal === null ? 'n.d.' : fmtN(now.kcal)}</b><span>kcal</span></div>
              <div className="qty-macros">
                <span><i style={{ background: 'var(--protein)' }} />Proteine <b className="num">{now.protein === null ? 'n.d.' : `${fmtN(now.protein, 1)} g`}</b></span>
                <span><i style={{ background: 'var(--carbs)' }} />Carboidrati <b className="num">{now.carbs === null ? 'n.d.' : `${fmtN(now.carbs, 1)} g`}</b></span>
                <span><i style={{ background: 'var(--fat)' }} />Grassi <b className="num">{now.fat === null ? 'n.d.' : `${fmtN(now.fat, 1)} g`}</b></span>
              </div>
            </div>
            {now.kcal !== null && t.kcal > 0 && <div className="tiny muted">Pari al {Math.round((now.kcal / t.kcal) * 100)}% del tuo obiettivo giornaliero di {fmtN(t.kcal)} kcal.</div>}
          </section>

          {(food.ingredients || (food.allergens?.length ?? 0) > 0 || (food.traces?.length ?? 0) > 0) && (
            <section className="card stack-sm">
              {(food.allergens?.length ?? 0) > 0 && <div><div className="small" style={{ fontWeight: 650, marginBottom: 6 }}>Allergeni</div><div className="row wrap" style={{ gap: 6 }}>{food.allergens!.map((a) => <span key={a} className="pill danger">{allergenLabel(a)}</span>)}</div></div>}
              {(food.traces?.length ?? 0) > 0 && <div className="tiny muted">Può contenere tracce di: {food.traces!.map(allergenLabel).join(', ')}</div>}
              {food.ingredients && <details><summary className="small" style={{ fontWeight: 650, cursor: 'pointer' }}>Ingredienti</summary><p className="small muted" style={{ marginTop: 6 }}>{food.ingredients}</p></details>}
            </section>
          )}
          {food.source === 'openfoodfacts' && (
            <p className="tiny muted">Dati da Open Food Facts (licenza ODbL), compilati da volontari: verifica sempre l’etichetta. {food.fetchedAt && <>Aggiornati il {new Date(food.fetchedAt).toLocaleDateString('it-IT')}. </>}
              {!food.editedFromOff && <button className="link-btn" onClick={onRefetch}><RotateCcw size={12} /> Aggiorna</button>}
            </p>
          )}
        </div>
      </div>

      <div className="product-cta">
        <div className="small"><b className="num">{fmtN(amount, 1)} {unit}</b> · <b className="num">{now.kcal === null ? 'n.d.' : `${fmtN(now.kcal)} kcal`}</b></div>
        <button className="icon-btn soft" onClick={toggleSaved} aria-pressed={fav} aria-label={fav ? 'Rimuovi dalla tua lista' : 'Salva nella tua lista'} title={fav ? 'Salvato nella tua lista' : 'Salva nella tua lista'}>{savedIcon}</button>
        {forShopping
          ? <button className="btn primary lg grow" onClick={addToShopping}>Aggiungi alla spesa</button>
          : <button className="btn primary lg grow" disabled={!canAdd} onClick={() => setPickMeal(true)}>Aggiungi al diario</button>}
      </div>

      <Sheet open={pickMeal} onClose={() => setPickMeal(false)} title="In quale pasto?"
        footer={<button className="btn primary block lg" onClick={confirmAdd}><Check size={18} /> Aggiungi a {MEAL_LABEL[slot]}</button>}>
        <div className="stack">
          <div className="option-grid meal-grid" role="radiogroup" aria-label="Pasto">
            {MEAL_ORDER.map((s) => <button key={s} role="radio" aria-checked={slot === s} className={`option ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}><span className="o-title">{MEAL_LABEL[s]}</span></button>)}
          </div>
          <div className="field"><label htmlFor="pday">Giorno</label><input id="pday" type="date" className="input" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></div>
          <div className="small muted">{food.name}: {fmtN(amount, 1)} {unit} · {fmtN(now.kcal ?? 0)} kcal · P {fmtN(now.protein ?? 0, 1)} · C {fmtN(now.carbs ?? 0, 1)} · G {fmtN(now.fat ?? 0, 1)}</div>
          <button type="button" className="list-item save-to-list" style={{ border: '1px solid var(--line)', borderRadius: 14 }} onClick={toggleSaved} aria-pressed={fav}>
            <span className={`set-check ${fav ? 'on' : ''}`} style={{ width: 28, height: 28, margin: 0 }}><Check size={15} strokeWidth={3} /></span>
            <span className="grow" style={{ textAlign: 'left' }}><div className="li-title">Salva nella mia lista</div><div className="li-sub">Lo ritrovi pronto quando aggiungi un alimento o fai la spesa</div></span>
            {savedIcon}
          </button>
        </div>
      </Sheet>

      <Sheet open={!!added} onClose={() => setAdded(null)} title="Aggiunto al diario"
        footer={<div className="stack-sm" style={{ width: '100%' }}>
          <button className="btn primary block lg" onClick={() => { unlockAudio(); nav(scanAgainUrl(sp, added?.slot), { replace: true }); }}><ScanBarcode size={18} /> Scansiona un altro prodotto</button>
          <button className="btn block" onClick={() => nav(`/nutrition${added && added.date !== dayKey() ? `?date=${added.date}` : ''}`)}>Vai al diario <ChevronRight size={16} /></button>
        </div>}>
        {added && (
          <div className="stack">
            <div className="row small" style={{ gap: 8 }}><span className="added-ic"><Check size={16} /></span><span><b>{food.name}</b> aggiunto a {MEAL_LABEL[added.slot]}{added.date !== dayKey() ? ` del ${fromKey(added.date).toLocaleDateString('it-IT')}` : ''} (+{fmtN(added.kcal)} kcal)</span></div>
            <div className="row" style={{ gap: 16, alignItems: 'center' }}>
              <Ring value={dayTot.kcal} max={t.kcal} size={104} stroke={10}>
                <div><div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{fmtN(Math.abs(t.kcal - dayTot.kcal))}</div><div className="tiny muted">{dayTot.kcal > t.kcal ? 'kcal in più' : 'kcal rimaste'}</div></div>
              </Ring>
              <div className="col grow small" style={{ gap: 6 }}>
                <div className="row-between"><span className="muted">Assunte</span><b className="num">{fmtN(dayTot.kcal)} kcal</b></div>
                <div className="row-between"><span className="muted">Obiettivo</span><b className="num">{fmtN(t.kcal)} kcal</b></div>
                <div className="row-between"><span className="muted">Raggiunto</span><b className="num">{Math.round((dayTot.kcal / Math.max(1, t.kcal)) * 100)}%</b></div>
              </div>
            </div>
            <div className="stack-sm">
              <MacroBar label="Proteine" value={dayTot.protein} max={t.protein} color="var(--protein)" />
              <MacroBar label="Carboidrati" value={dayTot.carbs} max={t.carbs} color="var(--carbs)" />
              <MacroBar label="Grassi" value={dayTot.fat} max={t.fat} color="var(--fat)" />
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
