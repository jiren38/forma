import { describe, expect, it, beforeEach } from 'vitest';
import { FOODS } from '@/data/foods';
import { searchFoods } from '@/features/nutrition/common';
import { searchOffProducts, normalizeHit, _resetSearchState, MAX_PER_MIN } from '@/lib/off-search';

const top = (q: string, n = 5) => searchFoods(FOODS, q).slice(0, n).map((f) => f.name);

describe('database alimenti', () => {
  it('ha id unici e valori plausibili', () => {
    const ids = FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FOODS.length).toBeGreaterThan(600);
    for (const f of FOODS) {
      expect(f.kcal).toBeGreaterThanOrEqual(0);
      expect(f.protein + f.carbs + f.fat).toBeLessThanOrEqual(100.5);
    }
  });
});

describe('ricerca locale', () => {
  it('trova cibi pronti anche senza accenti, al plurale o con sinonimi', () => {
    expect(top('suppli')[0]).toMatch(/^Supplì/);
    expect(top('arancina').some((n) => /Arancino/.test(n))).toBe(true);
    expect(top('pizze diavola')[0]).toMatch(/diavola/);
    expect(top('panini porchetta')[0]).toMatch(/porchetta/);
    expect(top('cornetto crema')[0]).toMatch(/Cornetto alla crema/);
    expect(top('kebab').length).toBeGreaterThan(1);
  });
  it('tollera un errore di battitura nelle parole lunghe', () => {
    expect(top('carbonera').some((n) => /carbonara/i.test(n))).toBe(true);
    expect(top('margerita').some((n) => /margherita/i.test(n))).toBe(true);
  });
  it('mette prima i nomi che iniziano con la ricerca', () => {
    expect(top('pizza', 1)[0]).toMatch(/^Pizza/);
  });
});

const SAL_HIT = {
  code: '8001234567890', product_name: { it: 'Supplì surgelati', main: 'Supplì surgelati' }, brands: 'Marca',
  nutriments: { 'energy-kcal_100g': 230, proteins_100g: 7, carbohydrates_100g: 28, fat_100g: 10 }, countries_tags: ['en:italy'],
};
const mk = (routes: Record<string, () => Response | Promise<Response>>, calls: string[] = []) => (async (url: string) => {
  calls.push(url);
  for (const [k, fn] of Object.entries(routes)) if (url.includes(k)) return fn();
  throw new TypeError('Failed to fetch');
}) as unknown as typeof fetch;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

describe('ricerca online Open Food Facts', () => {
  beforeEach(() => _resetSearchState());
  it('riporta a testo i campi tradotti di Search-a-licious', () => {
    expect(normalizeHit(SAL_HIT).product_name).toBe('Supplì surgelati');
    expect(normalizeHit(SAL_HIT).nutriments['energy-kcal_100g']).toBe(230);
  });
  it('usa Search-a-licious quando risponde', async () => {
    const r = await searchOffProducts('suppli', { fetchImpl: mk({ 'search.openfoodfacts.org': () => json({ hits: [SAL_HIT] }) }) });
    expect(r).toMatchObject({ status: 'ok', source: 'searchalicious' });
    if (r.status === 'ok') expect(r.foods[0]).toMatchObject({ name: 'Supplì surgelati', kcal: 230, barcode: '8001234567890' });
  });
  it('se il nuovo servizio è giù passa alla vecchia ricerca italiana', async () => {
    const calls: string[] = [];
    const r = await searchOffProducts('suppli', { fetchImpl: mk({ 'search.openfoodfacts.org': () => json({}, 503), 'it.openfoodfacts.org': () => json({ products: [{ ...SAL_HIT, product_name: 'Supplì' }] }) }, calls) });
    expect(r).toMatchObject({ status: 'ok', source: 'search_it' });
    expect(calls).toHaveLength(2);
  });
  it('mette in fondo i prodotti senza calorie ma non li scarta', async () => {
    const noKcal = { code: '8000000000001', product_name: 'Senza valori' };
    const r = await searchOffProducts('x y', { fetchImpl: mk({ 'search.openfoodfacts.org': () => json({ hits: [noKcal, SAL_HIT] }) }) });
    if (r.status !== 'ok') throw new Error('atteso ok');
    expect(r.foods.map((f) => f.name)).toEqual(['Supplì surgelati', 'Senza valori']);
  });
  it('segnala servizio sovraccarico o rete assente', async () => {
    expect(await searchOffProducts('a1', { fetchImpl: mk({ openfoodfacts: () => json({}, 503) }) })).toMatchObject({ status: 'error', kind: 'busy' });
    expect(await searchOffProducts('a2', { fetchImpl: mk({}) })).toMatchObject({ status: 'error', kind: 'network' });
  });
  it('rispetta il limite di ricerche al minuto e usa la cache', async () => {
    const calls: string[] = [];
    const f = mk({ 'search.openfoodfacts.org': () => json({ hits: [SAL_HIT] }) }, calls);
    await searchOffProducts('uguale', { fetchImpl: f });
    await searchOffProducts('Uguale ', { fetchImpl: f });
    expect(calls).toHaveLength(1);
    for (let i = 1; i < MAX_PER_MIN; i++) await searchOffProducts(`t${i}`, { fetchImpl: f });
    expect(await searchOffProducts('troppo', { fetchImpl: f })).toMatchObject({ status: 'error', kind: 'throttled' });
  });
});
