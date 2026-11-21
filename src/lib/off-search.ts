/**
 * Ricerca testuale dei prodotti su Open Food Facts.
 *
 * Perché due servizi: la vecchia ricerca (cgi/search.pl) è lenta, ha un limite di 10 ricerche al
 * minuto per IP e risponde spesso 503 quando il server è carico; la nuova (Search-a-licious,
 * search.openfoodfacts.org) è quella che Open Food Facts consiglia per la ricerca a testo libero.
 * Proviamo prima la nuova e, se non risponde o non trova nulla, la vecchia limitata all'Italia
 * e poi al mondo. Ogni richiesta ha un timeout, così la ricerca non resta mai appesa.
 */
import type { Food } from './types';
import { OFF_FIELDS, parseOffProduct } from './off';
import { canonicalCode } from './barcode';

export type OffSearchResult =
  | { status: 'ok'; foods: Food[]; source: 'searchalicious' | 'search_it' | 'search_world' }
  | { status: 'error'; kind: 'offline' | 'busy' | 'network' | 'throttled'; message: string };

const SAL_FIELDS = [
  'code', 'product_name', 'product_name_it', 'generic_name', 'generic_name_it', 'brands', 'quantity', 'product_quantity', 'product_quantity_unit',
  'serving_size', 'serving_quantity', 'serving_quantity_unit', 'nutriments', 'image_front_url', 'image_front_small_url', 'image_url',
  'categories', 'categories_tags', 'nutriscore_grade', 'nova_group', 'countries_tags', 'lang',
].join(',');

export const searchUrls = (term: string, pageSize = 30) => ({
  searchalicious: `https://search.openfoodfacts.org/search?q=${encodeURIComponent(term)}&langs=it,en&page_size=${pageSize}&fields=${SAL_FIELDS}`,
  search_it: `https://it.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=${pageSize}&lc=it&fields=${OFF_FIELDS},countries_tags`,
  search_world: `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=${pageSize}&lc=it&fields=${OFF_FIELDS},countries_tags`,
});

/** Search-a-licious restituisce i campi tradotti come { it: '…', en: '…', main: '…' }: li riporta a testo. */
function flatten(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    // solo i dizionari di lingue (chiavi di 2 lettere o "main"), non i nutrienti
    if (keys.length && keys.every((k) => k === 'main' || /^[a-z]{2}$/.test(k))) {
      const pick = o.it ?? o.main ?? o.en ?? o[keys[0]];
      return Array.isArray(pick) ? pick.join(', ') : pick;
    }
  }
  return v;
}
export function normalizeHit(h: any): any {
  if (!h || typeof h !== 'object') return h;
  const out: any = {};
  for (const [k, v] of Object.entries(h)) out[k] = k === 'nutriments' ? v : flatten(v);
  return out;
}

/** Converte i risultati: i prodotti con calorie vengono prima, quelli venduti in Italia prima ancora. */
export function toFoods(products: any[]): Food[] {
  const seen = new Set<string>();
  const out: { f: Food; it: boolean }[] = [];
  for (const raw of products) {
    const p = normalizeHit(raw);
    const code = p?.code ? canonicalCode(String(p.code)) : '';
    if (!code || seen.has(code)) continue;
    const f = parseOffProduct(p, code);
    if (!f) continue;
    seen.add(code);
    const countries: string[] = Array.isArray(p.countries_tags) ? p.countries_tags : [];
    out.push({ f, it: countries.includes('en:italy') });
  }
  const rank = (x: { f: Food; it: boolean }) => ((x.f.missing ?? []).includes('kcal') ? 2 : 0) + (x.it ? 0 : 1);
  return out.map((x, i) => ({ ...x, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i).map((x) => x.f);
}

async function getJson(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ ok: true; data: any } | { ok: false; busy: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, busy: res.status === 429 || res.status === 503 };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, busy: false };
  } finally { clearTimeout(t); }
}

// limite prudente: Open Food Facts blocca chi supera 10 ricerche al minuto
const recent: number[] = [];
const cache = new Map<string, { at: number; r: OffSearchResult }>();
const CACHE_MS = 10 * 60000;
export const MAX_PER_MIN = 8;
export function _resetSearchState() { recent.length = 0; cache.clear(); }

export async function searchOffProducts(term: string, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<OffSearchResult> {
  const q = term.trim().replace(/\s+/g, ' ');
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.r;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'error', kind: 'offline', message: 'Sei offline: la ricerca online tornerà disponibile appena ti colleghi.' };
  const now = Date.now();
  while (recent.length && now - recent[0] > 60000) recent.shift();
  if (recent.length >= MAX_PER_MIN) return { status: 'error', kind: 'throttled', message: 'Hai fatto molte ricerche online in poco tempo: attendi qualche secondo e riprova.' };
  recent.push(now);

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 9000;
  const urls = searchUrls(q);
  let busy = false;
  let empty = false;
  for (const source of ['searchalicious', 'search_it', 'search_world'] as const) {
    const r = await getJson(urls[source], fetchImpl, timeoutMs);
    if (!r.ok) { busy ||= r.busy; continue; }
    const list: any[] = Array.isArray(r.data?.hits) ? r.data.hits : Array.isArray(r.data?.products) ? r.data.products : [];
    const foods = toFoods(list);
    if (foods.length) {
      const res: OffSearchResult = { status: 'ok', foods, source };
      cache.set(key, { at: Date.now(), r: res });
      return res;
    }
    empty = true;
  }
  if (empty) {
    const res: OffSearchResult = { status: 'ok', foods: [], source: 'search_world' };
    cache.set(key, { at: Date.now(), r: res });
    return res;
  }
  return busy
    ? { status: 'error', kind: 'busy', message: 'Open Food Facts è sovraccarico in questo momento. Riprova tra poco.' }
    : { status: 'error', kind: 'network', message: 'Impossibile contattare Open Food Facts. Controlla la connessione e riprova.' };
}
