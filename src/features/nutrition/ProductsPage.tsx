/**
 * I miei prodotti: il catalogo personale. Riunisce i prodotti scansionati e salvati, quelli trovati con la ricerca
 * (database dell'app o Open Food Facts) e gli alimenti creati a mano. Non conta nei valori giornalieri:
 * da qui ogni prodotto si aggiunge a un pasto o alla lista della spesa.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ScanBarcode, Clock, Heart, TrendingUp, PenLine, Package, BookmarkCheck, ShoppingCart, Utensils, Search, Plus, Pencil, Trash2, BookmarkMinus } from 'lucide-react';
import { patchMeta, useDiary, useMeta } from '@/app/data';
import { store } from '@/db/store';
import { PageHeader, SearchInput, Empty, Chips, Sheet, NumberInput, Confirm, useToast } from '@/components/ui';
import { normalize, fmtN, formatShortDate, uid, dayKey } from '@/lib/util';
import { FOOD_CATEGORIES } from '@/data/foods';
import type { Food } from '@/lib/types';
import { ProductImage } from './ProductPage';
import { unlockAudio } from './scanner/feedback';
import { addProductToShopping, isOwnFood, removeFromCatalog } from './products';
import { QuantitySheet, defaultSlot, findFood } from './common';
import { useCatalog } from './catalog';

type Tab = 'saved' | 'recent' | 'fav' | 'freq' | 'mine';

const kcalLine = (f: Food) => ((f.missing ?? []).includes('kcal') ? 'kcal n.d.' : `${fmtN(f.kcal)} kcal/100 ${f.unit ?? 'g'}`);
const blank = (): Food => ({ id: uid('cf_'), name: '', kcal: 0, protein: 0, carbs: 0, fat: 0, custom: true, source: 'custom', category: 'Personalizzati' });

export default function ProductsPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const qs = new URLSearchParams();
  if (sp.get('date')) qs.set('date', sp.get('date')!);
  if (sp.get('slot')) qs.set('slot', sp.get('slot')!);
  const q0 = qs.toString() ? `?${qs}` : '';
  const forShop = sp.get('to') === 'shopping';
  const toast = useToast();
  const { known, catalog } = useCatalog();
  const meta = useMeta();
  const diary = useDiary();
  const [tab, setTab] = useState<Tab>('saved');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Food | null>(null);
  const [edit, setEdit] = useState<Food | null>(null);
  useEffect(() => { if (sp.get('new')) { setEdit(blank()); const n = new URLSearchParams(sp); n.delete('new'); setSp(n, { replace: true }); } }, []); // eslint-disable-line

  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of diary) if (d.foodId) m.set(d.foodId, (m.get(d.foodId) ?? 0) + 1);
    return m;
  }, [diary]);

  const list = useMemo(() => {
    const n = normalize(q.trim());
    if (n) {
      const words = n.split(/\s+/);
      const pool = [...known, ...catalog.filter((f) => !known.includes(f))];
      return pool.filter((f) => { const h = normalize(`${f.name} ${f.brand ?? ''} ${f.barcode ?? ''}`); return words.every((w) => h.includes(w)); });
    }
    if (tab === 'saved') return catalog;
    if (tab === 'recent') return known.filter((f) => f.scannedAt).sort((a, b) => b.scannedAt!.localeCompare(a.scannedAt!));
    if (tab === 'fav') return meta.favoriteFoods.map((id) => known.find((f) => f.id === id) ?? findFood(id)).filter((f): f is Food => !!f);
    if (tab === 'freq') return [...uses.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => known.find((f) => f.id === id) ?? findFood(id)).filter((f): f is Food => !!f).slice(0, 40);
    return known.filter((f) => f.source === 'custom' || f.editedFromOff);
  }, [known, catalog, tab, q, meta.favoriteFoods, uses]);

  const savedIds = useMemo(() => new Set(catalog.map((f) => f.id)), [catalog]);
  const show = (f: Food) => (f.barcode ? nav(`/nutrition/product/${f.barcode}${q0}`) : setOpen(f));
  async function toShop(f: Food) {
    const ok = await addProductToShopping(f);
    toast(ok ? `${f.name} aggiunto alla lista della spesa` : `${f.name} è già nella lista della spesa`);
  }
  const empty: Record<Tab, { icon: JSX.Element; title: string; text: string }> = {
    saved: { icon: <BookmarkCheck />, title: 'Ancora nessun prodotto', text: 'Scansiona una confezione o cerca un alimento con i pulsanti qui sopra: il prodotto resta qui, senza contare nei valori di oggi, pronto da aggiungere a un pasto o alla lista della spesa.' },
    recent: { icon: <Clock />, title: 'Nessun prodotto scansionato', text: 'Scansiona il codice a barre di una confezione: lo ritroverai qui.' },
    fav: { icon: <Heart />, title: 'Nessun preferito', text: 'Nella scheda di un prodotto tocca il cuore per averlo sempre a portata di mano.' },
    freq: { icon: <TrendingUp />, title: 'Ancora nessun alimento frequente', text: 'Qui compaiono gli alimenti che aggiungi più spesso ai pasti.' },
    mine: { icon: <PenLine />, title: 'Nessun prodotto creato da te', text: 'Tocca “Crea” per inserire un alimento con i valori dell’etichetta.' },
  };

  return (
    <div className="page stack">
      <PageHeader title="I miei prodotti" back sub={`${catalog.length} ${catalog.length === 1 ? 'prodotto' : 'prodotti'} · non contano nei valori giornalieri`} />
      <div className="catalog-add" role="group" aria-label="Aggiungi ai miei prodotti">
        <button className="catalog-add-btn primary" onClick={() => { unlockAudio(); nav(`/nutrition/scan?to=${forShop ? 'shopping' : 'catalog'}`); }}><ScanBarcode size={22} /><b>Scansiona</b><span>Codice a barre</span></button>
        <Link className="catalog-add-btn" to={`/nutrition/foods/add${forShop ? '?to=shopping' : ''}`}><Search size={22} /><b>Cerca</b><span>Nell’app e online</span></Link>
        <button className="catalog-add-btn" onClick={() => setEdit(blank())}><Plus size={22} /><b>Crea</b><span>Valori a mano</span></button>
      </div>
      {forShop && <p className="small muted">Tocca il carrello per aggiungere un prodotto alla lista della spesa.</p>}
      <SearchInput value={q} onChange={setQ} placeholder="Cerca tra i miei prodotti" />
      {!q && (
        <Chips>
          <button className={`chip ${tab === 'saved' ? 'on' : ''}`} onClick={() => setTab('saved')}><BookmarkCheck size={13} /> Salvati</button>
          <button className={`chip ${tab === 'recent' ? 'on' : ''}`} onClick={() => setTab('recent')}><Clock size={13} /> Scansionati</button>
          <button className={`chip ${tab === 'fav' ? 'on' : ''}`} onClick={() => setTab('fav')}><Heart size={13} /> Preferiti</button>
          <button className={`chip ${tab === 'freq' ? 'on' : ''}`} onClick={() => setTab('freq')}><TrendingUp size={13} /> Più aggiunti</button>
          <button className={`chip ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}><PenLine size={13} /> Creati da te</button>
        </Chips>
      )}
      {list.length === 0 ? (
        q ? <div className="stack-sm"><p className="small muted">Nessuno dei tuoi prodotti corrisponde a “{q}”.</p><Link className="btn" to={`/nutrition/foods/add?q=${encodeURIComponent(q)}${forShop ? '&to=shopping' : ''}`}><Search size={16} /> Cerca “{q}” nell’app e online</Link></div>
          : <Empty icon={empty[tab].icon} title={empty[tab].title} text={empty[tab].text} />
      ) : (
        <div className="settings-group">
          {list.map((f) => (
            <div key={f.id} className="list-item product-row">
              <button className="product-row-main" onClick={() => show(f)}>
                <ProductImage src={f.imageUrl} size="sm" />
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="li-title ellipsis">{f.name}</div>
                  <div className="li-sub ellipsis">
                    {f.brand ? `${f.brand} · ` : ''}{kcalLine(f)}
                    {tab === 'freq' && !q ? ` · aggiunto ${uses.get(f.id)} ${uses.get(f.id) === 1 ? 'volta' : 'volte'}` : tab === 'recent' && !q && f.scannedAt ? ` · ${formatShortDate(f.scannedAt)}` : ''}
                  </div>
                  {((savedIds.has(f.id) && (tab !== 'saved' || !!q)) || f.source === 'custom' || f.editedFromOff) && (
                    <span className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                      {savedIds.has(f.id) && (tab !== 'saved' || !!q) && <span className="pill">Salvato</span>}
                      {(f.source === 'custom' || f.editedFromOff) && <span className="pill accent">{f.editedFromOff ? 'Corretto da te' : 'Creato da te'}</span>}
                    </span>
                  )}
                </span>
              </button>
              <span className="product-row-actions">
                {f.barcode
                  ? <Link className="icon-btn soft" to={`/nutrition/product/${f.barcode}${q0}`} aria-label={`Aggiungi ${f.name} a un pasto`} title="Aggiungi a un pasto"><Utensils size={17} /></Link>
                  : <button className="icon-btn soft" onClick={() => setOpen(f)} aria-label={`Aggiungi ${f.name} a un pasto`} title="Aggiungi a un pasto"><Utensils size={17} /></button>}
                <button className={`icon-btn ${forShop ? 'primary' : 'soft'}`} onClick={() => toShop(f)} aria-label={`Aggiungi ${f.name} alla lista della spesa`} title="Aggiungi alla lista della spesa"><ShoppingCart size={17} /></button>
              </span>
            </div>
          ))}
        </div>
      )}
      {catalog.length > 0 && <p className="tiny muted row" style={{ gap: 6 }}><Package size={13} /> I tuoi prodotti restano disponibili anche offline e si sincronizzano tra i tuoi dispositivi.</p>}
      {open && <FoodSheet food={open} saved={savedIds.has(open.id)} date={sp.get('date') ?? dayKey()} onClose={() => setOpen(null)} onEdit={() => { setEdit({ ...open }); setOpen(null); }} onShop={() => toShop(open)} />}
      {edit && <FoodEditor key={edit.id} food={edit} onClose={() => setEdit(null)} onSaved={() => toast('Salvato nei miei prodotti')} />}
    </div>
  );
}

/** Scheda rapida di un alimento senza codice a barre (database dell'app o creato a mano). */
function FoodSheet({ food, saved, date, onClose, onEdit, onShop }: { food: Food; saved: boolean; date: string; onClose: () => void; onEdit: () => void; onShop: () => void }) {
  const toast = useToast();
  const meta = useMeta();
  const [qty, setQty] = useState(false);
  const [del, setDel] = useState(false);
  const fav = meta.favoriteFoods.includes(food.id);
  const own = isOwnFood(food) && !!store.get<Food>('foods', food.id);
  if (qty) return <QuantitySheet open food={food} date={date} slot={defaultSlot()} onClose={onClose} onDone={(m) => toast(m)} />;
  return (
    <Sheet open onClose={onClose} title={food.name}
      footer={<div className="stack-sm" style={{ width: '100%' }}>
        <button className="btn primary block lg" onClick={() => setQty(true)}><Utensils size={18} /> Aggiungi a un pasto</button>
        <button className="btn block" onClick={() => { onShop(); onClose(); }}><ShoppingCart size={18} /> Aggiungi alla lista spesa</button>
      </div>}>
      <div className="stack-sm">
        <div className="small muted">{food.brand ? `${food.brand} · ` : ''}{food.category ?? ''}</div>
        <div className="grid-2 small">
          <div><b className="num">{fmtN(food.kcal)}</b> kcal</div><div>Proteine <b className="num">{fmtN(food.protein, 1)} g</b></div>
          <div>Carboidrati <b className="num">{fmtN(food.carbs, 1)} g</b></div><div>Grassi <b className="num">{fmtN(food.fat, 1)} g</b></div>
        </div>
        <div className="tiny muted">Valori per 100 g{food.unitGrams ? ` · 1 ${food.unitName ?? 'porzione'} = ${fmtN(food.unitGrams)} g` : ''}.</div>
        <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
          <button className="btn sm" aria-pressed={fav} onClick={() => { void patchMeta({ favoriteFoods: fav ? meta.favoriteFoods.filter((x) => x !== food.id) : [food.id, ...meta.favoriteFoods] }); toast(fav ? 'Rimosso dai preferiti' : 'Aggiunto ai preferiti'); }}>
            <Heart size={15} fill={fav ? 'var(--accent)' : 'none'} color={fav ? 'var(--accent)' : 'currentColor'} /> {fav ? 'Nei preferiti' : 'Preferito'}
          </button>
          {own && <button className="btn sm" onClick={onEdit}><Pencil size={15} /> Modifica</button>}
          {own
            ? <button className="btn sm" onClick={() => setDel(true)}><Trash2 size={15} /> Elimina</button>
            : saved && <button className="btn sm" onClick={async () => { await removeFromCatalog(food); toast('Tolto dai miei prodotti'); onClose(); }}><BookmarkMinus size={15} /> Togli dai miei prodotti</button>}
        </div>
      </div>
      <Confirm open={del} onClose={() => setDel(false)} danger confirmLabel="Elimina" title="Eliminare l’alimento?" body="Le voci del diario già registrate restano invariate." onConfirm={async () => { await store.remove('foods', food.id); toast('Alimento eliminato'); onClose(); }} />
    </Sheet>
  );
}

export function FoodEditor({ food, onClose, onSaved }: { food: Food; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Food>(food);
  const set = (p: Partial<Food>) => setF((x) => ({ ...x, ...p }));
  const macroK = Math.round(f.protein * 4 + f.carbs * 4 + f.fat * 9);
  const errors: string[] = [];
  if (!f.name.trim()) errors.push('Inserisci un nome');
  if (f.protein + f.carbs + f.fat > 100) errors.push('Proteine, carboidrati e grassi non possono superare 100 g su 100 g');
  if (f.kcal > 950) errors.push('Le calorie per 100 g non possono superare 950');
  return (
    <Sheet open onClose={onClose} title={food.name ? 'Modifica alimento' : 'Nuovo prodotto'}
      footer={<button className="btn primary block" disabled={errors.length > 0} onClick={async () => { await store.put('foods', f.id, { ...f, name: f.name.trim(), kcal: f.kcal || macroK, savedAt: f.savedAt ?? new Date().toISOString() }); onSaved(); onClose(); }}>Salva</button>}>
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
