/** Codici a barre dei prodotti alimentari: EAN-13, EAN-8, UPC-A, UPC-E. */

export type BarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'code_128' | 'unknown';

/** Cifra di controllo GTIN (EAN-8, UPC-A, EAN-13, GTIN-14): pesi 3/1 da destra. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Espande un UPC-E (8 cifre, sistema 0 o 1) nel corrispondente UPC-A (12 cifre). */
export function upcEtoUpcA(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const ns = upce[0], d = upce.slice(1, 7), check = upce[7];
  const last = d[5];
  let body: string;
  if ('012'.includes(last)) body = `${d[0]}${d[1]}${last}0000${d[2]}${d[3]}${d[4]}`;
  else if (last === '3') body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  else if (last === '4') body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${last}`;
  const upca = `${ns}${body}${check}`;
  return isValidGtin(upca) ? upca : null;
}

/** Ripulisce un codice digitato o letto (solo cifre). */
export function cleanCode(raw: string): string { return raw.replace(/\D/g, ''); }

/**
 * Chiave canonica usata nell'app: un UPC-A (12 cifre) diventa EAN-13 con lo zero iniziale,
 * un UPC-E viene espanso. Così lo stesso prodotto non viene salvato due volte.
 */
export function canonicalCode(raw: string, format?: BarcodeFormat): string {
  const c = cleanCode(raw);
  if (format === 'upc_e' || (c.length === 8 && format !== 'ean_8' && !isValidGtin(c) && upcEtoUpcA(c))) {
    const a = upcEtoUpcA(c); if (a) return `0${a}`;
  }
  if (c.length === 12) return `0${c}`;
  if (c.length === 14 && c.startsWith('0')) return c.slice(1);
  return c;
}

/** Varianti da provare sul database esterno, in ordine (al massimo 3 richieste). */
export function lookupVariants(raw: string, format?: BarcodeFormat): string[] {
  const c = cleanCode(raw);
  const out: string[] = [];
  const add = (x: string | null | undefined) => { if (x && !out.includes(x)) out.push(x); };
  add(canonicalCode(c, format));
  add(c);
  if (c.length === 8 && format !== 'ean_8') { const a = upcEtoUpcA(c); if (a) add(a); }
  if (c.length === 13 && c.startsWith('0')) add(c.slice(1));
  return out.slice(0, 3);
}

/** Formato per la visualizzazione: 8 076800 195057. */
export function formatCode(code: string): string {
  if (code.length === 13) return `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  if (code.length === 12) return `${code[0]} ${code.slice(1, 6)} ${code.slice(6, 11)} ${code[11]}`;
  return code;
}

/** Controllo di un codice inserito a mano: null se va bene, altrimenti il motivo. */
export function manualCodeProblem(raw: string): string | null {
  const c = cleanCode(raw);
  if (!c) return 'Inserisci le cifre sotto il codice a barre.';
  if (![8, 12, 13, 14].includes(c.length)) return 'Un codice alimentare ha 8, 12 o 13 cifre.';
  if (!isValidGtin(c) && !(c.length === 8 && upcEtoUpcA(c))) return 'La cifra di controllo non torna: ricontrolla il codice.';
  return null;
}
