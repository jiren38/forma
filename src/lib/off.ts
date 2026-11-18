/**
 * Open Food Facts (https://world.openfoodfacts.org), database aperto di prodotti alimentari.
 * Lettura di un prodotto per codice a barre e conversione nel formato Food dell'app.
 * Regola: nessun valore nutrizionale viene inventato. Quelli assenti finiscono in `missing`;
 * le sole conversioni ammesse sono esatte o dichiarate dalla fonte (kJ -> kcal, sodio -> sale,
 * valori per porzione riportati a 100 quando la porzione ha un peso noto) e sono elencate in `derived`.
 */
import type { Food, NutrientKey } from './types';

export const OFF_FIELDS = [
  'code', 'product_name', 'product_name_it', 'generic_name', 'generic_name_it', 'brands', 'quantity', 'product_quantity', 'product_quantity_unit',
  'serving_size', 'serving_quantity', 'serving_quantity_unit', 'nutrition_data_per', 'nutriments', 'image_front_url', 'image_front_small_url', 'image_url',
  'categories', 'categories_tags', 'ingredients_text', 'ingredients_text_it', 'allergens_tags', 'traces_tags', 'nutriscore_grade', 'nova_group', 'lang',
].join(',');

export function offProductUrl(code: string) {
  return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}&lc=it&app_name=Forma&app_version=1.0`;
}

const NUM = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

const ALLERGENS_IT: Record<string, string> = {
  gluten: 'Glutine', crustaceans: 'Crostacei', eggs: 'Uova', fish: 'Pesce', peanuts: 'Arachidi', soybeans: 'Soia', milk: 'Latte',
  nuts: 'Frutta a guscio', celery: 'Sedano', mustard: 'Senape', 'sesame-seeds': 'Sesamo', 'sulphur-dioxide-and-sulphites': 'Anidride solforosa e solfiti',
  lupin: 'Lupini', molluscs: 'Molluschi',
};
export function allergenLabel(tag: string) {
  const k = tag.replace(/^[a-z]{2}:/, '');
  return ALLERGENS_IT[k] ?? k.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function unitOf(u: unknown): 'g' | 'ml' | null {
  const s = String(u ?? '').trim().toLowerCase();
  if (['ml', 'cl', 'dl', 'l', 'lt'].includes(s)) return 'ml';
  if (['g', 'kg', 'mg'].includes(s)) return 'g';
  return null;
}
/** "1,5 l" -> { qty: 1500, unit: 'ml' }, "500 g" -> { qty: 500, unit: 'g' }. */
export function parseQuantity(text: string | undefined | null): { qty: number; unit: 'g' | 'ml' } | null {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const m = t.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|gr|mg|ml|cl|dl|l|lt|litri|litro)\b/);
  if (!m) return null;
  const n = Number(m[2]) * (m[1] ? Number(m[1]) : 1);
  const f: Record<string, [number, 'g' | 'ml']> = { kg: [1000, 'g'], g: [1, 'g'], gr: [1, 'g'], mg: [0.001, 'g'], ml: [1, 'ml'], cl: [10, 'ml'], dl: [100, 'ml'], l: [1000, 'ml'], lt: [1000, 'ml'], litri: [1000, 'ml'], litro: [1000, 'ml'] };
  const [k, unit] = f[m[3]];
  return { qty: r2(n * k), unit };
}

export type OffResult = { status: 'found'; food: Food } | { status: 'not_found' } | { status: 'error'; kind: 'offline' | 'network' | 'busy' | 'server'; message: string };

/** Converte il JSON di un prodotto Open Food Facts. Ritorna null se non c'è nemmeno un nome. */
export function parseOffProduct(p: any, code: string): Food | null {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.product_name_it || p.product_name || p.generic_name_it || p.generic_name || '').trim();
  const brand = String(p.brands ?? '').split(',')[0]?.trim() || undefined;
  if (!name && !brand) return null;
  const n = p.nutriments ?? {};

  const pq = NUM(p.product_quantity);
  const pqUnit = unitOf(p.product_quantity_unit) ?? parseQuantity(p.quantity)?.unit ?? null;
  const fromText = parseQuantity(p.quantity);
  const packageQty = pq ?? fromText?.qty ?? null;
  const sq = NUM(p.serving_quantity);
  const sqUnit = unitOf(p.serving_quantity_unit) ?? parseQuantity(p.serving_size)?.unit ?? (sq ? pqUnit : null);
  // liquidi: i valori di Open Food Facts sono per 100 ml
  const unit: 'g' | 'ml' = pqUnit === 'ml' || (!pqUnit && sqUnit === 'ml') ? 'ml' : 'g';

  const derived: string[] = [];
  const per100 = (key: string): number | null => {
    const v = NUM(n[`${key}_100g`]);
    if (v !== null) return v;
    const s = NUM(n[`${key}_serving`]);
    if (s !== null && sq && sq > 0 && (sqUnit ?? unit) === unit) { if (!derived.includes('per100_from_serving')) derived.push('per100_from_serving'); return (s * 100) / sq; }
    return null;
  };

  let kcal = per100('energy-kcal');
  if (kcal === null) {
    const kj = per100('energy-kj') ?? per100('energy'); // energy_100g in Open Food Facts è sempre in kJ
    if (kj !== null) { kcal = kj / 4.184; derived.push('kcal_from_kj'); }
  }
  let salt = per100('salt');
  if (salt === null) { const sodium = per100('sodium'); if (sodium !== null) { salt = sodium * 2.5; derived.push('salt_from_sodium'); } }
  const vals: Record<NutrientKey, number | null> = {
    kcal, protein: per100('proteins'), carbs: per100('carbohydrates'), sugars: per100('sugars'), fat: per100('fat'),
    satFat: per100('saturated-fat'), fiber: per100('fiber'), salt,
  };
  const missing = (Object.keys(vals) as NutrientKey[]).filter((k) => vals[k] === null);

  const allergens = Array.isArray(p.allergens_tags) ? p.allergens_tags.map(String) : [];
  const traces = Array.isArray(p.traces_tags) ? p.traces_tags.map(String) : [];
  const nova = NUM(p.nova_group);
  const grade = String(p.nutriscore_grade ?? '').toLowerCase();
  return {
    id: `off_${code}`, name: name || brand!, brand, source: 'openfoodfacts', custom: true, category: 'Prodotti confezionati', barcode: code, unit,
    kcal: vals.kcal === null ? 0 : Math.round(vals.kcal), protein: r1(vals.protein ?? 0), carbs: r1(vals.carbs ?? 0), fat: r1(vals.fat ?? 0),
    fiber: vals.fiber === null ? undefined : r1(vals.fiber), sugars: vals.sugars === null ? null : r1(vals.sugars), satFat: vals.satFat === null ? null : r1(vals.satFat), salt: vals.salt === null ? null : r2(vals.salt),
    missing, derived,
    imageUrl: p.image_front_url || p.image_url || p.image_front_small_url || undefined,
    packageQty, packageUnit: packageQty ? (pqUnit ?? unit) : null, packageLabel: p.quantity ? String(p.quantity) : undefined,
    servingQty: sq, servingUnit: sq ? (sqUnit ?? unit) : null, servingLabel: p.serving_size ? String(p.serving_size) : undefined,
    unitGrams: sq && (sqUnit ?? unit) === unit ? sq : undefined, unitName: sq ? 'porzione' : undefined,
    ingredients: String(p.ingredients_text_it || p.ingredients_text || '').trim() || undefined,
    allergens, traces,
    categories: p.categories || (Array.isArray(p.categories_tags) && p.categories_tags.length) ? categoryLabel(p.categories, p.categories_tags ?? []) || undefined : undefined,
    nutriscore: /^[a-e]$/.test(grade) ? grade : undefined, nova: nova ? Math.round(nova) : undefined,
    fetchedAt: new Date().toISOString(),
  };
}

function categoryLabel(text: unknown, tags: string[]): string {
  const t = String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (t.length) return t[t.length - 1];
  const last = tags[tags.length - 1] ?? '';
  return last.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

/** Legge un prodotto per codice. `fetchImpl` permette i test. */
export async function fetchOffProduct(code: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10000): Promise<OffResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'error', kind: 'offline', message: 'Sei offline. Collegati a internet per cercare il prodotto.' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(offProductUrl(code), { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 404) return { status: 'not_found' };
    if (res.status === 429 || res.status === 503) return { status: 'error', kind: 'busy', message: 'Open Food Facts è occupato in questo momento. Riprova tra qualche secondo.' };
    if (!res.ok) return { status: 'error', kind: 'server', message: `Open Food Facts ha risposto con un errore (${res.status}).` };
    const data = await res.json();
    if (!data || data.status === 0 || !data.product) return { status: 'not_found' };
    const food = parseOffProduct(data.product, code);
    return food ? { status: 'found', food } : { status: 'not_found' };
  } catch (e: any) {
    const aborted = e?.name === 'AbortError';
    return { status: 'error', kind: 'network', message: aborted ? 'La ricerca ha impiegato troppo tempo. Controlla la connessione e riprova.' : 'Impossibile contattare Open Food Facts. Controlla la connessione e riprova.' };
  } finally { clearTimeout(t); }
}
