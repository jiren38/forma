/** Hook del catalogo personale (I miei prodotti). */
import { useMemo } from 'react';
import { useCustomFoods, useMeta } from '@/app/data';
import type { Food } from '@/lib/types';
import { findFood } from './common';
import { isOwnFood } from './products';

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
      byCode.set(f.barcode, { ...keep, savedAt: [f.savedAt, cur.savedAt].filter(Boolean).sort().pop(), scannedAt: [f.scannedAt, cur.scannedAt].filter(Boolean).sort().pop(), scanCount: (f.scanCount ?? 0) + (cur.scanCount ?? 0) });
    }
    return [...byCode.values()];
  }, [foods]);
}

/** Tutti gli alimenti "miei" (prodotti per codice + alimenti senza codice) e il catalogo salvato. */
export function useCatalog() {
  const foods = useCustomFoods();
  const products = useProductsList();
  const meta = useMeta();
  return useMemo(() => {
    const known = [...products, ...foods.filter((f) => !f.barcode)];
    const ids = new Set(known.map((f) => f.id));
    const fromDb = (meta.savedFoods ?? []).map(findFood).filter((f): f is Food => !!f && !ids.has(f.id));
    const catalog = [...known.filter((f) => f.savedAt || isOwnFood(f)), ...fromDb].sort((a, b) => a.name.localeCompare(b.name, 'it'));
    return { known, catalog };
  }, [foods, products, meta.savedFoods]);
}

