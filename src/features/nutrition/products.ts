/**
 * Prodotti confezionati: ricerca per codice a barre (prima i dati locali, poi Open Food Facts),
 * salvataggio senza duplicati, calcolo dei valori per la quantità consumata e aggiunta al diario.
 */
import { store } from '@/db/store';
import { pushRecentFood, patchMeta, type Meta, type ShoppingExtra } from '@/app/data';
import { canonicalCode, lookupVariants, type BarcodeFormat } from '@/lib/barcode';
import { fetchOffProduct } from '@/lib/off';
import { uid } from '@/lib/util';
import type { DiaryEntry, Food, MealSlot, NutrientKey } from '@/lib/types';

export const NUTRIENTS: { key: NutrientKey; label: string; unit: string; sub?: boolean }[] = [
  { key: 'kcal', label: 'Energia', unit: 'kcal' },
  { key: 'protein', label: 'Proteine', unit: 'g' },
  { key: 'carbs', label: 'Carboidrati', unit: 'g' },
  { key: 'sugars', label: 'di cui zuccheri', unit: 'g', sub: true },
  { key: 'fat', label: 'Grassi', unit: 'g' },
  { key: 'satFat', label: 'di cui saturi', unit: 'g', sub: true },
  { key: 'fiber', label: 'Fibre', unit: 'g' },
  { key: 'salt', label: 'Sale', unit: 'g' },
];
export const NUTRIENT_LABEL: Record<NutrientKey, string> = { kcal: 'calorie', protein: 'proteine', carbs: 'carboidrati', sugars: 'zuccheri', fat: 'grassi', satFat: 'grassi saturi', fiber: 'fibre', salt: 'sale' };

export type Nutrients = Record<NutrientKey, number | null>;

/** Valori per 100 g/ml; null = dato non disponibile (mai sostituito con una stima). */
export function per100Of(f: Food): Nutrients {
  const miss = new Set(f.missing ?? []);
  const v = (k: NutrientKey, x: number | null | undefined) => (miss.has(k) || x === null || x === undefined ? null : x);
  return { kcal: v('kcal', f.kcal), protein: v('protein', f.protein), carbs: v('carbs', f.carbs), sugars: v('sugars', f.sugars), fat: v('fat', f.fat), satFat: v('satFat', f.satFat), fiber: v('fiber', f.fiber), salt: v('salt', f.salt) };
}

/** Valori per una quantità (in g o ml, la stessa unità dei valori per 100). */
export function scaleNutrients(per100: Nutrients, amount: number): Nutrients {
  const k = Math.max(0, amount) / 100;
  const out = {} as Nutrients;
  for (const key of Object.keys(per100) as NutrientKey[]) {
    const x = per100[key];
    if (x === null) { out[key] = null; continue; }
    const y = x * k;
    out[key] = key === 'kcal' ? Math.round(y) : key === 'salt' ? Math.round(y * 100) / 100 : Math.round(y * 10) / 10;
  }
  return out;
}

export interface PortionOption { id: 'base' | 'serving' | 'package'; label: string; short: string; size: number; step: number }

/** Unità di quantità disponibili. Porzione e confezione solo se espresse nella stessa unità dei valori (niente conversioni g/ml). */
export function portionOptions(f: Food): PortionOption[] {
  const u = f.unit ?? 'g';
  const out: PortionOption[] = [{ id: 'base', label: u, short: u, size: 1, step: u === 'ml' ? 10 : 5 }];
  if (f.servingQty && (f.servingUnit ?? u) === u) out.push({ id: 'serving', label: `Porzione (${fmt(f.servingQty)} ${u})`, short: 'porz.', size: f.servingQty, step: 0.5 });
  if (f.packageQty && (f.packageUnit ?? u) === u && f.packageQty !== f.servingQty) out.push({ id: 'package', label: `Confezione (${fmt(f.packageQty)} ${u})`, short: 'conf.', size: f.packageQty, step: 0.25 });
  return out;
}
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('it-IT');

// ---------------------------------------------------------------- ricerca
export type LookupResult =
  | { status: 'found'; food: Food; from: 'local' | 'online' }
  | { status: 'not_found'; code: string }
  | { status: 'error'; code: string; kind: 'offline' | 'network' | 'busy' | 'server'; message: string };

const STALE_MS = 30 * 86400000;
const notFound = new Map<string, number>();
const inflight = new Map<string, Promise<LookupResult>>();

/** Prodotto già presente sul dispositivo (creato dall'utente oppure già consultato). */
export function localProduct(code: string, format?: BarcodeFormat): Food | undefined {
  const c = canonicalCode(code, format);
  return store.get<Food>('foods', `bc_${c}`) ?? store.get<Food>('foods', `off_${c}`) ?? store.list<Food>('foods').find((f) => f.barcode === c);
}

export function isStale(f: Food) { return f.source === 'openfoodfacts' && !f.editedFromOff && (!f.fetchedAt || Date.now() - Date.parse(f.fetchedAt) > STALE_MS); }

export function lookupProduct(code: string, opts: { format?: BarcodeFormat; force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<LookupResult> {
  const c = canonicalCode(code, opts.format);
  if (!opts.force) {
    const local = localProduct(c);
    if (local) return Promise.resolve({ status: 'found', food: local, from: 'local' });
    const nf = notFound.get(c);
    if (nf && Date.now() - nf < 120000) return Promise.resolve({ status: 'not_found', code: c });
  }
  const running = inflight.get(c);
  if (running) return running;
  const p = (async (): Promise<LookupResult> => {
    for (const v of lookupVariants(code, opts.format)) {
      const r = await fetchOffProduct(v, opts.fetchImpl);
      if (r.status === 'found') {
        const food = await saveOnlineProduct({ ...r.food, id: `off_${c}`, barcode: c });
        notFound.delete(c);
        return { status: 'found', food, from: 'online' };
      }
      if (r.status === 'error') {
        const cached = store.get<Food>('foods', `off_${c}`);
        if (cached) return { status: 'found', food: cached, from: 'local' };
        return { status: 'error', code: c, kind: r.kind, message: r.message };
      }
    }
    notFound.set(c, Date.now());
    return { status: 'not_found', code: c };
  })().finally(() => inflight.delete(c));
  inflight.set(c, p);
  return p;
}

/** Salva (o aggiorna) un prodotto di Open Food Facts mantenendo storico e preferenze: un solo documento per codice. */
export async function saveOnlineProduct(f: Food): Promise<Food> {
  const cur = store.get<Food>('foods', f.id);
  if (cur?.editedFromOff) return cur; // la versione corretta dall'utente ha la precedenza
  const next: Food = { ...f, scannedAt: cur?.scannedAt, scanCount: cur?.scanCount, savedAt: cur?.savedAt, updatedAt: new Date().toISOString() };
  return store.put('foods', f.id, next);
}

/** Registra una scansione (storico): aggiorna data e contatore dello stesso documento. */
export async function recordScan(f: Food) {
  const cur = store.get<Food>('foods', f.id) ?? f;
  await store.put('foods', f.id, { ...cur, scannedAt: new Date().toISOString(), scanCount: (cur.scanCount ?? 0) + 1 });
}

/** Salva un prodotto creato o corretto dall'utente, legato al codice a barre. */
export async function saveCustomProduct(f: Food, base?: Food): Promise<Food> {
  const code = f.barcode ? canonicalCode(f.barcode) : undefined;
  const fromOff = base?.source === 'openfoodfacts';
  const id = fromOff ? base!.id : code ? `bc_${code}` : f.id;
  const prev = store.get<Food>('foods', id);
  const next: Food = {
    ...prev, ...f, id, barcode: code, custom: true,
    source: fromOff ? 'openfoodfacts' : 'custom', editedFromOff: fromOff || prev?.editedFromOff || undefined,
    scannedAt: prev?.scannedAt ?? f.scannedAt, scanCount: prev?.scanCount ?? f.scanCount, updatedAt: new Date().toISOString(),
    // un prodotto inserito a mano finisce subito nei miei prodotti
    savedAt: prev?.savedAt ?? base?.savedAt ?? (fromOff ? undefined : new Date().toISOString()),
  };
  if (!next.savedAt) delete next.savedAt;
  return store.put('foods', id, next);
}

// ---------------------------------------------------------------- i miei prodotti (catalogo personale)
/** Salva (o toglie) il prodotto dai miei prodotti. Non crea voci nel diario alimentare. */
export async function setInCatalog(f: Food, on: boolean): Promise<Food> {
  const cur = store.get<Food>('foods', f.id) ?? f;
  const next: Food = { ...cur, savedAt: on ? cur.savedAt ?? new Date().toISOString() : undefined };
  if (!on) delete next.savedAt;
  return store.put('foods', f.id, next);
}

/** Alimento creato a mano senza codice a barre: fa sempre parte dei miei prodotti. */
export const isOwnFood = (f: Food) => f.source === 'custom' && !f.barcode;

/** true se l'alimento è tra i miei prodotti (documento salvato, alimento mio o voce del database salvata). */
export function isInCatalog(f: Food, m: Partial<Meta> = (store.get<Meta>('meta', 'me') ?? {}) as Partial<Meta>): boolean {
  const doc = store.get<Food>('foods', f.id);
  if (doc) return !!doc.savedAt || isOwnFood(doc);
  return !!f.savedAt || (m.savedFoods ?? []).includes(f.id);
}

/**
 * Aggiunge ai miei prodotti un alimento qualsiasi: prodotti con codice (anche appena trovati online)
 * diventano un documento in 'foods' con savedAt; le voci del database generico vanno in meta.savedFoods.
 */
export async function saveToCatalog(f: Food): Promise<void> {
  if (store.get<Food>('foods', f.id)) { await setInCatalog(f, true); return; }
  if (f.barcode || f.source === 'openfoodfacts') { await saveOnlineProduct(f); await setInCatalog(f, true); return; }
  const m = (store.get<Meta>('meta', 'me') ?? {}) as Partial<Meta>;
  const ids = m.savedFoods ?? [];
  if (!ids.includes(f.id)) await patchMeta({ savedFoods: [f.id, ...ids] });
}

/** Toglie dai miei prodotti senza cancellare i dati (gli alimenti creati a mano si eliminano a parte). */
export async function removeFromCatalog(f: Food): Promise<void> {
  if (store.get<Food>('foods', f.id)) await setInCatalog(f, false);
  const m = (store.get<Meta>('meta', 'me') ?? {}) as Partial<Meta>;
  if ((m.savedFoods ?? []).includes(f.id)) await patchMeta({ savedFoods: m.savedFoods!.filter((x) => x !== f.id) });
}

// ---------------------------------------------------------------- lista della spesa
/** Aggiunge il prodotto agli articoli della lista della spesa. false se c'era già. */
export async function addProductToShopping(f: Food): Promise<boolean> {
  const m = (store.get<Meta>('meta', 'me') ?? {}) as Partial<Meta>;
  const extras = m.shoppingExtra ?? [];
  if (extras.some((x) => x.foodId === f.id || (f.barcode && x.foodId && store.get<Food>('foods', x.foodId)?.barcode === f.barcode))) return false;
  const item: ShoppingExtra = { id: uid('x_'), name: f.name, foodId: f.id, ...(f.brand ? { brand: f.brand } : {}), ...(f.imageUrl && !f.imageUrl.startsWith('data:') ? { imageUrl: f.imageUrl } : {}) };
  await patchMeta({ shoppingExtra: [...extras, item] });
  return true;
}

// ---------------------------------------------------------------- diario
export function diaryName(f: Food) { return f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? `${f.name} · ${f.brand}` : f.name; }

export async function addProductToDiary(date: string, slot: MealSlot, f: Food, amount: number): Promise<DiaryEntry> {
  const n = scaleNutrients(per100Of(f), amount);
  const e: DiaryEntry = {
    id: uid('d_'), date, slot, foodId: f.id, name: diaryName(f), grams: Math.round(amount * 10) / 10, unit: f.unit ?? 'g',
    kcal: n.kcal ?? 0, protein: n.protein ?? 0, carbs: n.carbs ?? 0, fat: n.fat ?? 0, createdAt: new Date().toISOString(),
  };
  await store.put('diary', e.id, e);
  pushRecentFood(f.id);
  return e;
}

// ---------------------------------------------------------------- foto
/** Riduce una foto a un JPEG leggero (lato massimo 480 px), salvato nel documento e quindi sincronizzato. */
export function compressImage(file: Blob, max = 480, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Immagine non leggibile')); };
    img.src = url;
  });
}
