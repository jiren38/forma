import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingCart, Plus, Trash2, Check, ChevronLeft, ChevronRight, Share2, ScanBarcode, BookmarkCheck, Search } from 'lucide-react';
import { useCustomFoods, useMealPlans, useMeta, patchMeta } from '@/app/data';
import { store } from '@/db/store';
import { addDays, dayKey, fmtN, fromKey, startOfWeek, uid } from '@/lib/util';
import { PageHeader, Empty, useToast } from '@/components/ui';
import { findFood } from './common';
import type { Food, Recipe } from '@/lib/types';
import { ProductImage } from './ProductPage';
import { unlockAudio } from './scanner/feedback';

export default function ShoppingList() {
  const toast = useToast();
  const nav = useNavigate();
  const foods = useCustomFoods();
  const foodOf = (id?: string) => (id ? foods.find((f) => f.id === id) : undefined) as Food | undefined;
  const [sp, setSp] = useSearchParams();
  const ws = sp.get('week') ? fromKey(sp.get('week')!) : startOfWeek();
  const wk = dayKey(ws);
  const plans = useMealPlans();
  const meta = useMeta();
  const [extra, setExtra] = useState('');

  const items = useMemo(() => {
    const days = new Set(Array.from({ length: 7 }, (_, i) => dayKey(addDays(ws, i))));
    const agg = new Map<string, { id: string; name: string; grams: number; category: string; unit?: string; unitGrams?: number }>();
    const add = (foodId: string, name: string, grams: number) => {
      const f = findFood(foodId);
      const cur = agg.get(foodId) ?? { id: foodId, name: f?.name ?? name, grams: 0, category: f?.category ?? 'Altro', unit: f?.unitName, unitGrams: f?.unitGrams };
      cur.grams += grams;
      agg.set(foodId, cur);
    };
    for (const p of plans) {
      if (!days.has(p.date)) continue;
      for (const it of p.items) {
        if (it.kind === 'food') add(it.refId, it.name, it.grams);
        else {
          const r = store.get<Recipe>('recipes', it.refId);
          if (!r) continue;
          const k = (it.servings ?? 1) / Math.max(1, r.servings);
          for (const ing of r.ingredients) add(ing.foodId, ing.name, ing.grams * k);
        }
      }
    }
    const byCat = new Map<string, typeof agg extends Map<any, infer V> ? V[] : never>();
    for (const v of agg.values()) { if (!byCat.has(v.category)) byCat.set(v.category, []); byCat.get(v.category)!.push(v); }
    return Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([c, l]) => [c, l.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [plans, wk]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = (id: string) => `${wk}:${id}`;
  const checked = new Set(meta.shoppingChecked);
  const toggle = (id: string) => patchMeta({ shoppingChecked: checked.has(key(id)) ? meta.shoppingChecked.filter((x) => x !== key(id)) : [...meta.shoppingChecked.filter((x) => x.slice(0, 10) >= dayKey(addDays(new Date(), -60))), key(id)] });
  const extras = meta.shoppingExtra ?? [];
  const total = items.reduce((a, [, l]) => a + l.length, 0) + extras.length;
  const fmtQ = (g: number, unit?: string, ug?: number) => (g >= 1000 ? `${fmtN(g / 1000, 2)} kg` : `${Math.round(g)} g`) + (unit && ug ? ` (~${fmtN(g / ug, 1)} ${unit})` : '');

  async function share() {
    const text = ['Lista della spesa', ...items.flatMap(([c, l]) => [`\n${c}`, ...l.map((x) => `- ${x.name}: ${fmtQ(x.grams, x.unit, x.unitGrams)}`)]), ...(extras.length ? ['\nAggiunti da te', ...extras.map((x) => `- ${x.name}${x.brand && !x.name.toLowerCase().includes(x.brand.toLowerCase()) ? ` (${x.brand})` : ''}`)] : [])].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Lista della spesa', text });
      else { await navigator.clipboard.writeText(text); toast('Lista copiata negli appunti'); }
    } catch { /* annullato dall'utente */ }
  }

  const shift = (d: number) => setSp({ week: dayKey(addDays(ws, d * 7)) }, { replace: true });

  return (
    <div className="page stack">
      <PageHeader title="Lista della spesa" back right={total ? <button className="icon-btn" onClick={share} aria-label="Condividi o copia la lista"><Share2 size={19} /></button> : undefined} />
      <div className="row-between card" style={{ padding: 8 }}>
        <button className="icon-btn ghost" onClick={() => shift(-1)} aria-label="Settimana precedente"><ChevronLeft size={20} /></button>
        <div className="center"><b>Settimana</b><div className="tiny muted">{ws.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – {addDays(ws, 6).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</div></div>
        <button className="icon-btn ghost" onClick={() => shift(1)} aria-label="Settimana successiva"><ChevronRight size={20} /></button>
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!extra.trim()) return; patchMeta({ shoppingExtra: [...extras, { id: uid('x_'), name: extra.trim() }] }); setExtra(''); }}>
        <input className="input grow" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Aggiungi un articolo (es. detersivo)" aria-label="Nuovo articolo" maxLength={60} />
        <button className="btn" type="submit" aria-label="Aggiungi articolo"><Plus size={18} /></button>
      </form>
      <div className="shop-tools">
        <button className="btn primary" onClick={() => { unlockAudio(); nav('/nutrition/scan?to=shopping'); }}><ScanBarcode size={18} /> Scansiona</button>
        <Link className="btn" to="/nutrition/foods?to=shopping"><BookmarkCheck size={18} /> I miei prodotti</Link>
        <Link className="btn" to="/nutrition/foods/add?to=shopping"><Search size={18} /> Cerca</Link>
      </div>
      {total === 0 ? (
        <Empty icon={<ShoppingCart />} title="Lista vuota" text="La lista si genera dal piano pasti della settimana (ingredienti delle ricette inclusi). Puoi anche scansionare un prodotto o prenderlo dai tuoi prodotti." action={<Link to="/nutrition/plan" className="btn primary">Apri il piano pasti</Link>} />
      ) : (
        <>
          {items.map(([cat, list]) => (
            <section key={cat}>
              <div className="section-title" style={{ marginTop: 8 }}>{cat}</div>
              <div className="settings-group">
                {list.map((x) => (
                  <button key={x.id} className="list-item" onClick={() => toggle(x.id)} aria-pressed={checked.has(key(x.id))}>
                    <span className={`set-check ${checked.has(key(x.id)) ? 'on' : ''}`} style={{ width: 28, height: 28, margin: 0 }}><Check size={15} strokeWidth={3} /></span>
                    <span className="grow" style={{ textDecoration: checked.has(key(x.id)) ? 'line-through' : 'none', opacity: checked.has(key(x.id)) ? 0.55 : 1 }}><div className="li-title">{x.name}</div><div className="li-sub">{fmtQ(x.grams, x.unit, x.unitGrams)}</div></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {extras.length > 0 && (
            <section>
              <div className="section-title" style={{ marginTop: 8 }}>Aggiunti da te</div>
              <div className="settings-group">
                {extras.map((x) => {
                  const f = foodOf(x.foodId);
                  const done = checked.has(key(x.id));
                  return (
                  <div key={x.id} className="list-item">
                    <button className={`set-check ${done ? 'on' : ''}`} style={{ width: 28, height: 28, margin: 0, flexShrink: 0 }} onClick={() => toggle(x.id)} aria-pressed={done} aria-label={`Segna ${x.name}`}><Check size={15} strokeWidth={3} /></button>
                    {f?.barcode ? (
                      <button className="shop-item-main" onClick={() => nav(`/nutrition/product/${f.barcode}`)} style={{ opacity: done ? 0.55 : 1 }} aria-label={`Apri la scheda di ${x.name}`}>
                        <ProductImage src={f.imageUrl ?? x.imageUrl} size="sm" />
                        <span className="grow" style={{ minWidth: 0, textDecoration: done ? 'line-through' : 'none' }}><div className="li-title ellipsis">{f.name}</div>{(f.brand ?? x.brand) && <div className="li-sub ellipsis">{f.brand ?? x.brand}</div>}</span>
                      </button>
                    ) : (
                      <span className="grow li-title" style={{ minWidth: 0, textDecoration: done ? 'line-through' : 'none' }}>{x.name}</span>
                    )}
                    <button className="icon-btn ghost" style={{ flexShrink: 0 }} onClick={() => patchMeta({ shoppingExtra: extras.filter((y) => y.id !== x.id) })} aria-label={`Rimuovi ${x.name}`}><Trash2 size={16} /></button>
                  </div>
                  );
                })}
              </div>
            </section>
          )}
          <p className="hint">Le quantità sono calcolate sul peso degli alimenti come inseriti nel piano (es. pasta cruda). Arrotonda in base alle confezioni.</p>
        </>
      )}
    </div>
  );
}
