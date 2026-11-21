/**
 * Aggiungi ai miei prodotti cercando: database dell'app (cibi generici e pronti) e prodotti dei supermercati
 * su Open Food Facts. Un tocco salva il prodotto nel catalogo, senza registrarlo in un pasto.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Globe, Loader2, Plus, ScanBarcode, ShoppingCart } from 'lucide-react';
import { useCustomFoods, useMeta } from '@/app/data';
import { PageHeader, SearchInput, useToast } from '@/components/ui';
import { canonicalCode } from '@/lib/barcode';
import { fmtN } from '@/lib/util';
import type { Food } from '@/lib/types';
import { allFoods, searchFoods } from './common';
import { addProductToShopping, isInCatalog, removeFromCatalog, saveToCatalog } from './products';
import { useOnlineSearch } from './useOnlineSearch';
import { unlockAudio } from './scanner/feedback';
import { ProductImage } from './ProductPage';

export default function CatalogAddPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const forShop = sp.get('to') === 'shopping';
  const custom = useCustomFoods();
  const meta = useMeta();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const foods = useMemo(() => allFoods(custom), [custom]);
  const results = useMemo(() => (q.trim() ? searchFoods(foods, q).slice(0, 60) : []), [foods, q]);
  const { off, retry } = useOnlineSearch(q);
  const [count, setCount] = useState(0);
  const isCode = /^\d{8,14}$/.test(q.trim());
  const ctx = forShop ? 'shopping' : 'catalog';

  async function toggle(f: Food) {
    // senza calorie nei risultati online: la scheda scarica il prodotto completo e lo salva da lì
    if (f.source === 'openfoodfacts' && (f.missing ?? []).includes('kcal') && f.barcode) { nav(`/nutrition/product/${f.barcode}?to=${ctx}`); return; }
    if (forShop) {
      if (f.barcode || f.source === 'openfoodfacts') await saveToCatalog(f);
      const ok = await addProductToShopping(f);
      toast(ok ? `${f.name} aggiunto alla lista della spesa` : `${f.name} è già nella lista della spesa`);
      return;
    }
    if (isInCatalog(f, meta)) { await removeFromCatalog(f); toast(`${f.name} tolto dai miei prodotti`); setCount((n) => Math.max(0, n - 1)); return; }
    await saveToCatalog(f);
    toast(`${f.name} salvato nei miei prodotti`);
    setCount((n) => n + 1);
  }

  return (
    <div className="page stack">
      <PageHeader title={forShop ? 'Aggiungi alla spesa' : 'Aggiungi ai miei prodotti'} back
        right={count > 0 ? <button className="btn sm primary" onClick={() => nav(-1)}>Fatto ({count})</button> : undefined} />
      <div className="row search-scan" style={{ gap: 8 }}>
        <div className="grow"><SearchInput value={q} onChange={setQ} placeholder="Cerca alimento, marca o codice" autoFocus /></div>
        <button className="icon-btn scan-icon" onClick={() => { unlockAudio(); nav(`/nutrition/scan?to=${ctx}`); }} aria-label="Scansiona il codice a barre" title="Scansiona il codice a barre"><ScanBarcode size={21} /></button>
      </div>
      {!q.trim() && <p className="small muted">Cerca tra oltre {foods.length} alimenti dell’app (anche pizze, panini e piatti pronti) e tra i prodotti dei supermercati online. Tocca <b>+</b> per salvarli nei tuoi prodotti: {forShop ? 'finiranno anche nella lista della spesa.' : 'non vengono aggiunti ai pasti di oggi.'}</p>}

      {isCode && <Link className="btn primary" to={`/nutrition/product/${canonicalCode(q.trim())}?to=${ctx}`}><ScanBarcode size={17} /> Apri il prodotto con codice {q.trim()}</Link>}

      {q.trim() && !isCode && (
        <>
          <div className="section-title">Nell’app</div>
          {results.length ? <ResultList foods={results} isSaved={(f) => !forShop && isInCatalog(f, meta)} onToggle={toggle} forShop={forShop} /> : <p className="small muted">Nessun alimento nell’app per “{q.trim()}”.</p>}
          {q.trim().length >= 2 && (
            <div className="card stack-sm">
              <span className="small"><b>Prodotti dei supermercati online</b><div className="tiny muted">Da Open Food Facts, database aperto con milioni di prodotti confezionati.</div></span>
              {off?.loading && <p className="small muted row" style={{ gap: 6 }}><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Cerco “{q.trim()}” online…</p>}
              {off?.error && <p className="small danger-text">{off.error}</p>}
              {off && !off.loading && !off.error && (off.results.length ? <ResultList foods={off.results} isSaved={(f) => !forShop && isInCatalog(f, meta)} onToggle={toggle} forShop={forShop} /> : <p className="small muted">Nessun prodotto trovato online per “{q.trim()}”.</p>)}
              {(!off || off.error) && !off?.loading && <button className="btn" onClick={retry}><Globe size={16} /> {off?.error ? 'Riprova la ricerca online' : 'Cerca online'}</button>}
            </div>
          )}
        </>
      )}
      <Link to={`/nutrition/foods?new=1${forShop ? '&to=shopping' : ''}`} className="btn ghost"><Plus size={16} /> Non lo trovi? Crealo con i valori dell’etichetta</Link>
    </div>
  );
}

function ResultList({ foods, isSaved, onToggle, forShop }: { foods: Food[]; isSaved: (f: Food) => boolean; onToggle: (f: Food) => void; forShop: boolean }) {
  return (
    <div className="settings-group">
      {foods.map((f) => {
        const saved = isSaved(f);
        return (
          <button key={f.id} className="list-item product-row" onClick={() => onToggle(f)} aria-pressed={saved}
            aria-label={forShop ? `Aggiungi ${f.name} alla lista della spesa` : saved ? `Togli ${f.name} dai miei prodotti` : `Salva ${f.name} nei miei prodotti`}>
            {f.imageUrl ? <ProductImage src={f.imageUrl} size="sm" /> : null}
            <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
              <div className="li-title ellipsis">{f.name}</div>
              <div className="li-sub ellipsis">{f.brand ? `${f.brand} · ` : ''}{(f.missing ?? []).includes('kcal') ? 'Valori nella scheda' : `${fmtN(f.kcal)} kcal/100 ${f.unit ?? 'g'} · P ${fmtN(f.protein, 1)} · C ${fmtN(f.carbs, 1)} · G ${fmtN(f.fat, 1)}`}</div>
            </span>
            <span className={`icon-btn ${saved ? 'primary' : 'soft'}`} aria-hidden>{forShop ? <ShoppingCart size={17} /> : saved ? <Check size={17} /> : <Plus size={17} />}</span>
          </button>
        );
      })}
    </div>
  );
}
