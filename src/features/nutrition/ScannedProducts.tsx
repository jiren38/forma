/** Prodotti scansionati: ultimi, preferiti, più aggiunti, creati da te, con ricerca per nome e marca. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ScanBarcode, Clock, Heart, TrendingUp, PenLine, Plus, Package } from 'lucide-react';
import { useCustomFoods, useDiary, useMeta } from '@/app/data';
import { PageHeader, SearchInput, Empty, Chips } from '@/components/ui';
import { normalize, fmtN, formatShortDate } from '@/lib/util';
import type { Food } from '@/lib/types';
import { ProductImage } from './ProductPage';
import { unlockAudio } from './scanner/feedback';

type Tab = 'recent' | 'fav' | 'freq' | 'mine';

/** Un solo prodotto per codice: prevale la versione creata o corretta dall'utente. */
export function useProductsList(): Food[] {
  const foods = useCustomFoods();
  return useMemo(() => {
    const byCode = new Map<string, Food>();
    for (const f of foods) {
      if (!f.barcode) continue;
      const cur = byCode.get(f.barcode);
      if (!cur) { byCode.set(f.barcode, f); continue; }
      const mine = (x: Food) => x.source === 'custom' || !!x.editedFromOff;
      const keep = mine(f) && !mine(cur) ? f : cur;
      byCode.set(f.barcode, { ...keep, scannedAt: [f.scannedAt, cur.scannedAt].filter(Boolean).sort().pop(), scanCount: (f.scanCount ?? 0) + (cur.scanCount ?? 0) });
    }
    return [...byCode.values()];
  }, [foods]);
}

export default function ScannedProducts() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const qs = new URLSearchParams();
  if (sp.get('date')) qs.set('date', sp.get('date')!);
  if (sp.get('slot')) qs.set('slot', sp.get('slot')!);
  const q0 = qs.toString() ? `?${qs}` : '';
  const products = useProductsList();
  const meta = useMeta();
  const diary = useDiary();
  const [tab, setTab] = useState<Tab>('recent');
  const [q, setQ] = useState('');

  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of diary) if (d.foodId) m.set(d.foodId, (m.get(d.foodId) ?? 0) + 1);
    return m;
  }, [diary]);

  const list = useMemo(() => {
    const n = normalize(q.trim());
    if (n) {
      const words = n.split(/\s+/);
      return products.filter((f) => { const h = normalize(`${f.name} ${f.brand ?? ''} ${f.barcode ?? ''}`); return words.every((w) => h.includes(w)); });
    }
    if (tab === 'recent') return products.filter((f) => f.scannedAt).sort((a, b) => b.scannedAt!.localeCompare(a.scannedAt!));
    if (tab === 'fav') return meta.favoriteFoods.map((id) => products.find((f) => f.id === id)).filter((f): f is Food => !!f);
    if (tab === 'freq') return products.filter((f) => (uses.get(f.id) ?? 0) > 0).sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0));
    return products.filter((f) => f.source === 'custom' || f.editedFromOff).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [products, tab, q, meta.favoriteFoods, uses]);

  const open = (f: Food) => nav(`/nutrition/product/${f.barcode}${q0}`);
  const empty: Record<Tab, { icon: JSX.Element; title: string; text: string }> = {
    recent: { icon: <Clock />, title: 'Nessun prodotto scansionato', text: 'Scansiona il codice a barre di una confezione: lo ritroverai qui, pronto da aggiungere al diario.' },
    fav: { icon: <Heart />, title: 'Nessun prodotto preferito', text: 'Nella scheda di un prodotto tocca il cuore per averlo sempre a portata di mano.' },
    freq: { icon: <TrendingUp />, title: 'Ancora nessun prodotto frequente', text: 'Qui compaiono i prodotti che aggiungi più spesso al diario.' },
    mine: { icon: <PenLine />, title: 'Nessun prodotto creato da te', text: 'Quando un codice non è nel database puoi inserire i dati a mano: il prodotto comparirà qui.' },
  };

  return (
    <div className="page stack">
      <PageHeader title="Prodotti scansionati" back sub={`${products.length} ${products.length === 1 ? 'prodotto' : 'prodotti'} sul tuo account`} />
      <button className="btn primary lg block" onClick={() => { unlockAudio(); nav(`/nutrition/scan${q0}`); }}><ScanBarcode size={20} /> Scansiona prodotto</button>
      <SearchInput value={q} onChange={setQ} placeholder="Cerca per nome, marca o codice" />
      {!q && (
        <Chips>
          <button className={`chip ${tab === 'recent' ? 'on' : ''}`} onClick={() => setTab('recent')}><Clock size={13} /> Ultimi</button>
          <button className={`chip ${tab === 'fav' ? 'on' : ''}`} onClick={() => setTab('fav')}><Heart size={13} /> Preferiti</button>
          <button className={`chip ${tab === 'freq' ? 'on' : ''}`} onClick={() => setTab('freq')}><TrendingUp size={13} /> Più aggiunti</button>
          <button className={`chip ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}><PenLine size={13} /> Creati da te</button>
        </Chips>
      )}
      {list.length === 0 ? (
        q ? <p className="small muted">Nessun prodotto per “{q}”.</p> : <Empty icon={empty[tab].icon} title={empty[tab].title} text={empty[tab].text} />
      ) : (
        <div className="settings-group">
          {list.map((f) => (
            <div key={f.id} className="list-item product-row">
              <button className="product-row-main" onClick={() => open(f)}>
                <ProductImage src={f.imageUrl} size="sm" />
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="li-title ellipsis">{f.name}</div>
                  <div className="li-sub ellipsis">
                    {f.brand ? `${f.brand} · ` : ''}{(f.missing ?? []).includes('kcal') ? 'kcal n.d.' : `${fmtN(f.kcal)} kcal/100 ${f.unit ?? 'g'}`}
                    {tab === 'freq' && !q ? ` · aggiunto ${uses.get(f.id)} ${uses.get(f.id) === 1 ? 'volta' : 'volte'}` : tab === 'recent' && !q && f.scannedAt ? ` · ${formatShortDate(f.scannedAt)}` : ''}
                  </div>
                  {(f.source === 'custom' || f.editedFromOff) && <span className="pill accent" style={{ marginTop: 4 }}>{f.editedFromOff ? 'Corretto da te' : 'Creato da te'}</span>}
                </span>
              </button>
              <Link className="icon-btn soft" to={`/nutrition/product/${f.barcode}${q0}`} aria-label={`Aggiungi ${f.name} al diario`}><Plus size={18} /></Link>
            </div>
          ))}
        </div>
      )}
      {products.length > 0 && <p className="tiny muted row" style={{ gap: 6 }}><Package size={13} /> I prodotti consultati restano disponibili anche offline e si sincronizzano tra i tuoi dispositivi.</p>}
    </div>
  );
}
