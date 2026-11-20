import { describe, expect, it, beforeAll } from 'vitest';
import { canonicalCode, gtinCheckDigit, isValidGtin, lookupVariants, manualCodeProblem, upcEtoUpcA } from '@/lib/barcode';
import { parseOffProduct, parseQuantity, fetchOffProduct } from '@/lib/off';
import { per100Of, scaleNutrients, portionOptions, lookupProduct, addProductToDiary, saveCustomProduct, localProduct, recordScan, setInCatalog, addProductToShopping, saveOnlineProduct } from '@/features/nutrition/products';
import { store } from '@/db/store';
import type { Food } from '@/lib/types';
import { EanUpcReader, upcEDigitsToUpcA } from '@/features/nutrition/scanner/upce';
import ZF from '@zxing/library/esm/core/BarcodeFormat';
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer';
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource';

// Risposte nel formato reale dell'API v2 di Open Food Facts (campi ridotti con ?fields=)
const NUTELLA = {
  code: '3017620422003', product_name: 'Nutella', product_name_it: 'Nutella', brands: 'Ferrero,Nutella', quantity: '400 g', product_quantity: '400', product_quantity_unit: 'g',
  serving_size: '15 g', serving_quantity: '15', nutrition_data_per: '100g', image_front_url: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_it.jpg',
  categories: 'Spalmabili,Creme spalmabili dolci,Creme alle nocciole', categories_tags: ['en:spreads', 'en:hazelnut-spreads'], allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans'], traces_tags: [],
  ingredients_text_it: 'Zucchero, olio di palma, nocciole 13%, latte scremato in polvere 8,7%, cacao magro 7,4%, emulsionanti: lecitine (soia), vanillina.',
  nutriscore_grade: 'e', nova_group: 4,
  nutriments: { 'energy-kcal_100g': 539, 'energy-kj_100g': 2252, proteins_100g: 6.3, carbohydrates_100g: 57.5, sugars_100g: 56.3, fat_100g: 30.9, 'saturated-fat_100g': 10.6, fiber_100g: 0, salt_100g: 0.107, 'energy-kcal_serving': 80.9 },
};
const MILK = { // liquido: valori per 100 ml, energia solo in kJ, sodio invece del sale, fibre assenti
  code: '8000000000019', product_name: 'Latte parzialmente scremato', brands: 'Latteria', quantity: '1 l', product_quantity: 1000, product_quantity_unit: 'ml',
  serving_size: '250 ml', serving_quantity: 250, serving_quantity_unit: 'ml',
  nutriments: { energy_100g: 192, proteins_100g: 3.3, carbohydrates_100g: 5, sugars_100g: 5, fat_100g: 1.6, 'saturated-fat_100g': 1, sodium_100g: 0.044 },
};
const SPARSE = { code: '8000000000026', product_name: 'Biscotti misteriosi', brands: '', nutriments: { 'energy-kcal_100g': 450 } };

const fakeFetch = (db: Record<string, any>, calls: string[] = []) => (async (url: string) => {
  const code = /product\/(\d+)\.json/.exec(String(url))![1];
  calls.push(code);
  const p = db[code];
  return new Response(JSON.stringify(p ? { code, status: 1, status_verbose: 'product found', product: p } : { code, status: 0, status_verbose: 'product not found' }), { status: p ? 200 : 404, headers: { 'content-type': 'application/json' } });
}) as unknown as typeof fetch;

describe('codici a barre', () => {
  it('verifica la cifra di controllo', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1); // esempio classico EAN-13 4006381333931
    expect(isValidGtin('3017620422003')).toBe(true);
    expect(isValidGtin('3017620422004')).toBe(false);
    expect(isValidGtin('96385074')).toBe(true); // EAN-8
    expect(isValidGtin('036000291452')).toBe(true); // UPC-A
  });
  it('espande UPC-E e rende canonici UPC-A', () => {
    expect(upcEtoUpcA('01234565')).toBe('012345000065');
    expect(canonicalCode('012345000065')).toBe('0012345000065');
    expect(canonicalCode('01234565', 'upc_e')).toBe('0012345000065');
    expect(canonicalCode('96385074', 'ean_8')).toBe('96385074');
    expect(canonicalCode('3017620422003')).toBe('3017620422003');
    expect(lookupVariants('036000291452', 'upc_a')).toEqual(['0036000291452', '036000291452']);
  });
  it('controlla il codice digitato a mano', () => {
    expect(manualCodeProblem('3017620422003')).toBeNull();
    expect(manualCodeProblem('3017 6204 2200 3')).toBeNull();
    expect(manualCodeProblem('3017620422004')).toMatch(/controllo/);
    expect(manualCodeProblem('12345')).toMatch(/8, 12 o 13/);
  });
});

// Disegna un UPC-E (8 cifre) come immagine in scala di grigi, modulo per modulo
const L_CODE = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G_CODE = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const PARITY = [[0x38, 0x34, 0x32, 0x31, 0x2c, 0x26, 0x23, 0x2a, 0x29, 0x25], [0x07, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a]];
function upcEImage(code: string, scale = 3, h = 60) {
  const par = PARITY[Number(code[0])][Number(code[7])];
  const bits = '101' + [...code.slice(1, 7)].map((d, i) => ((par >> (5 - i)) & 1 ? G_CODE : L_CODE)[Number(d)]).join('') + '010101';
  const quiet = 12 * scale, w = bits.length * scale + 2 * quiet;
  const lum = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let i = 0; i < bits.length; i++) if (bits[i] === '1') lum.fill(0, y * w + quiet + i * scale, y * w + quiet + (i + 1) * scale);
  return { lum, w, h };
}
const readUpcE = (code: string) => {
  const hints = new Map<DecodeHintType, any>([[DecodeHintType.POSSIBLE_FORMATS, [ZF.EAN_13, ZF.EAN_8, ZF.UPC_A, ZF.UPC_E]], [DecodeHintType.TRY_HARDER, true]]);
  const { lum, w, h } = upcEImage(code);
  const r = new EanUpcReader(true, hints).decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, w, h))), hints);
  return [r.getText(), r.getBarcodeFormat() === ZF.UPC_E];
};

describe('lettore UPC-E', () => {
  it('legge i codici UPC-E che il lettore di ZXing non riconosce', () => {
    expect(readUpcE('01234565')).toEqual(['01234565', true]);
    expect(readUpcE('04252614')).toEqual(['04252614', true]); // ultima cifra 1: espansione 042100005264
    expect(readUpcE('11234562')).toEqual(['11234562', true]); // sistema numerico 1
  });
  it('espande come la libreria di utilità', () => {
    for (const c of ['01234565', '04252614', '00123457', '01234133']) expect(upcEDigitsToUpcA(c)).toBe(upcEtoUpcA(c));
  });
});

describe('Open Food Facts', () => {
  it('legge un prodotto completo', () => {
    const f = parseOffProduct(NUTELLA, '3017620422003')!;
    expect(f).toMatchObject({ name: 'Nutella', brand: 'Ferrero', unit: 'g', kcal: 539, protein: 6.3, carbs: 57.5, sugars: 56.3, fat: 30.9, satFat: 10.6, fiber: 0, salt: 0.11, packageQty: 400, servingQty: 15, nutriscore: 'e', nova: 4 });
    expect(f.missing).toEqual([]);
    expect(f.allergens).toEqual(['en:milk', 'en:nuts', 'en:soybeans']);
    expect(f.imageUrl).toContain('openfoodfacts');
  });
  it('per i liquidi usa i ml e segnala le conversioni, senza inventare dati', () => {
    const f = parseOffProduct(MILK, '8000000000019')!;
    expect(f.unit).toBe('ml');
    expect(f.kcal).toBe(46); // 192 kJ / 4,184
    expect(f.salt).toBe(0.11); // 0,044 g di sodio × 2,5
    expect(f.derived).toEqual(expect.arrayContaining(['kcal_from_kj', 'salt_from_sodium']));
    expect(f.missing).toEqual(['fiber']);
    expect(portionOptions(f).map((o) => [o.id, o.size])).toEqual([['base', 1], ['serving', 250], ['package', 1000]]);
  });
  it('i dati mancanti restano mancanti', () => {
    const f = parseOffProduct(SPARSE, '8000000000026')!;
    expect(f.missing).toEqual(['protein', 'carbs', 'sugars', 'fat', 'satFat', 'fiber', 'salt']);
    const n = scaleNutrients(per100Of(f), 50);
    expect(n.kcal).toBe(225);
    expect(n.protein).toBeNull();
  });
  it('quantità della confezione dal testo', () => {
    expect(parseQuantity('1,5 l')).toEqual({ qty: 1500, unit: 'ml' });
    expect(parseQuantity('6 x 125 g')).toEqual({ qty: 750, unit: 'g' });
    expect(parseQuantity('33 cl')).toEqual({ qty: 330, unit: 'ml' });
  });
  it('gestisce prodotto non trovato ed errori di rete', async () => {
    expect((await fetchOffProduct('8000000000999', fakeFetch({}))).status).toBe('not_found');
    const broken = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const r = await fetchOffProduct('8000000000999', broken);
    expect(r.status).toBe('error');
    const busy = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await fetchOffProduct('8000000000999', busy)).toMatchObject({ status: 'error', kind: 'busy' });
  });
});

describe('calcolo della quantità', () => {
  it('esempio dello yogurt greco: 150 g', () => {
    const yogurt: Food = { id: 'y', name: 'Yogurt greco', kcal: 120, protein: 10, carbs: 4, fat: 6, unit: 'g' };
    expect(scaleNutrients(per100Of(yogurt), 150)).toMatchObject({ kcal: 180, protein: 15, carbs: 6, fat: 9 });
  });
  it('porzioni e confezione in unità coerenti', () => {
    const f = parseOffProduct(NUTELLA, '3017620422003')!;
    const opts = portionOptions(f);
    expect(opts.map((o) => o.id)).toEqual(['base', 'serving', 'package']);
    expect(scaleNutrients(per100Of(f), 2 * opts[1].size).kcal).toBe(162); // 2 porzioni da 15 g
  });
});

describe('ricerca, salvataggio e diario', () => {
  beforeAll(async () => { await store.open('scanner-test'); });

  it('cerca online una volta sola e poi usa la copia locale', async () => {
    const calls: string[] = [];
    const r = await lookupProduct('3017620422003', { format: 'ean_13', fetchImpl: fakeFetch({ '3017620422003': NUTELLA }, calls) });
    expect(r).toMatchObject({ status: 'found', from: 'online' });
    const again = await lookupProduct('3017620422003', { fetchImpl: fakeFetch({}, calls) });
    expect(again).toMatchObject({ status: 'found', from: 'local' });
    expect(calls).toEqual(['3017620422003']);
    await recordScan((r as any).food); await recordScan((r as any).food);
    const saved = store.list<Food>('foods').filter((f) => f.barcode === '3017620422003');
    expect(saved).toHaveLength(1); // nessun duplicato
    expect(saved[0].scanCount).toBe(2);
  });

  it('un UPC-A trovato come EAN-13 viene salvato una volta', async () => {
    const calls: string[] = [];
    const r = await lookupProduct('036000291452', { format: 'upc_a', fetchImpl: fakeFetch({ '036000291452': { ...SPARSE, product_name: 'Prodotto USA' } }, calls) });
    expect(r.status).toBe('found');
    expect(calls).toEqual(['0036000291452', '036000291452']);
    expect(localProduct('0036000291452')?.name).toBe('Prodotto USA');
  });

  it('prodotto non trovato, poi creato a mano e riconosciuto subito', async () => {
    const calls: string[] = [];
    const nf = await lookupProduct('8000000000033', { fetchImpl: fakeFetch({}, calls) });
    expect(nf.status).toBe('not_found');
    await saveCustomProduct({ id: 'tmp', name: 'Torta della nonna', brand: 'Forno Rossi', barcode: '8000000000033', kcal: 380, protein: 6, carbs: 52, fat: 16, unit: 'g', missing: ['sugars', 'satFat', 'fiber', 'salt'] });
    const r = await lookupProduct('8000000000033', { fetchImpl: fakeFetch({}, calls) });
    expect(r).toMatchObject({ status: 'found', from: 'local' });
    expect((r as any).food).toMatchObject({ id: 'bc_8000000000033', source: 'custom', name: 'Torta della nonna' });
    expect(calls).toHaveLength(1);
  });

  it('aggiunge al diario con i valori della quantità e l’unità giusta', async () => {
    const milk = (await lookupProduct('8000000000019', { fetchImpl: fakeFetch({ '8000000000019': MILK }) }) as any).food as Food;
    const e = await addProductToDiary('2026-11-18', 'breakfast', milk, 250);
    expect(e).toMatchObject({ grams: 250, unit: 'ml', kcal: 115, protein: 8.3, carbs: 12.5, fat: 4, slot: 'breakfast', foodId: 'off_8000000000019' });
    expect(store.get('diary', e.id)).toBeTruthy();
  });

  it('una correzione dell’utente prevale sui dati di Open Food Facts', async () => {
    const base = localProduct('3017620422003')!;
    await saveCustomProduct({ ...base, name: 'Nutella (corretta)' }, base);
    await lookupProduct('3017620422003', { force: true, fetchImpl: fakeFetch({ '3017620422003': NUTELLA }) });
    expect(localProduct('3017620422003')).toMatchObject({ name: 'Nutella (corretta)', editedFromOff: true, source: 'openfoodfacts' });
  });

  it('il diario prodotti non tocca il diario alimentare e sopravvive agli aggiornamenti', async () => {
    const diaryBefore = store.list('diary').length;
    const milk = localProduct('8000000000019')!;
    await setInCatalog(milk, true);
    expect(localProduct('8000000000019')?.savedAt).toBeTruthy();
    expect(store.list('diary')).toHaveLength(diaryBefore);
    await saveOnlineProduct({ ...milk, savedAt: undefined, name: 'Latte aggiornato' });
    expect(localProduct('8000000000019')).toMatchObject({ name: 'Latte aggiornato' });
    expect(localProduct('8000000000019')?.savedAt).toBeTruthy();
    await setInCatalog(localProduct('8000000000019')!, false);
    expect(localProduct('8000000000019')?.savedAt).toBeUndefined();
  });

  it('un prodotto inserito a mano finisce nel diario prodotti', () => {
    expect(localProduct('8000000000033')?.savedAt).toBeTruthy();
  });

  it('aggiunge un prodotto alla lista della spesa una sola volta', async () => {
    const milk = localProduct('8000000000019')!;
    expect(await addProductToShopping(milk)).toBe(true);
    expect(await addProductToShopping(milk)).toBe(false);
    const extras = (store.get<any>('meta', 'me')?.shoppingExtra ?? []).filter((x: any) => x.foodId === milk.id);
    expect(extras).toHaveLength(1);
    expect(extras[0]).toMatchObject({ name: milk.name, foodId: milk.id });
  });
});
