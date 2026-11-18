/**
 * Lettore EAN/UPC per ZXing con un UPC-E funzionante.
 * Il lettore UPC-E di @zxing/library 0.23 (porting JavaScript, marcato "experimental") non legge mai nulla:
 * perde le cifre lette, usa la guardia finale sbagliata e ha un valore errato nella tabella di parità.
 * Qui EAN-13, EAN-8 e UPC-A restano quelli di ZXing; UPC-E è riscritto seguendo la versione Java originale.
 */
import OneDReader from '@zxing/library/esm/core/oned/OneDReader';
import AbstractUPCEANReader from '@zxing/library/esm/core/oned/AbstractUPCEANReader';
import MultiFormatUPCEANReader from '@zxing/library/esm/core/oned/MultiFormatUPCEANReader';
import ZF from '@zxing/library/esm/core/BarcodeFormat';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import NotFoundException from '@zxing/library/esm/core/NotFoundException';
import Result from '@zxing/library/esm/core/Result';
import ResultPoint from '@zxing/library/esm/core/ResultPoint';
import type BitArray from '@zxing/library/esm/core/common/BitArray';

const R = AbstractUPCEANReader;
/** Guardia centrale+finale dell'UPC-E (010101). */
const MIDDLE_END = Int32Array.from([1, 1, 1, 1, 1, 1]);
/** Parità delle 6 cifre → sistema numerico (0/1) e cifra di controllo (tabella della versione Java). */
const NUMSYS_CHECK = [
  [0x38, 0x34, 0x32, 0x31, 0x2c, 0x26, 0x23, 0x2a, 0x29, 0x25],
  [0x07, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a],
];
/** Schemi L (dispari) 0-9 e G (pari, cioè L rovesciati) 10-19. */
const L_AND_G: Int32Array[] = [...R.L_PATTERNS.map((p) => Int32Array.from(p)), ...R.L_PATTERNS.map((p) => Int32Array.from(p).reverse())];

/** UPC-E (8 cifre) → UPC-A (12 cifre). */
export function upcEDigitsToUpcA(upce: string): string {
  const d = upce.slice(1, 7);
  const last = d[5];
  let body: string;
  if (last <= '2') body = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
  else if (last === '3') body = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === '4') body = d.slice(0, 4) + '00000' + d[4];
  else body = d.slice(0, 5) + '0000' + last;
  return upce[0] + body + (upce.length >= 8 ? upce[7] : '');
}

export function decodeUpcERow(rowNumber: number, row: BitArray): Result {
  const start = R.findStartGuardPattern(row);
  const counters = new Int32Array(4);
  const end = row.getSize();
  let offset = start[1];
  let digits = '';
  let parity = 0;
  for (let x = 0; x < 6 && offset < end; x++) {
    const best = R.decodeDigit(row, counters, offset, L_AND_G);
    digits += String(best % 10);
    for (const c of counters) offset += c;
    if (best >= 10) parity |= 1 << (5 - x);
  }
  let text: string | null = null;
  for (let sys = 0; sys <= 1 && !text; sys++) {
    const d = NUMSYS_CHECK[sys].indexOf(parity);
    if (d >= 0) text = `${sys}${digits}${d}`;
  }
  if (!text || text.length !== 8) throw new NotFoundException();
  const endRange = R.findGuardPattern(row, offset, true, MIDDLE_END, new Int32Array(MIDDLE_END.length));
  // zona di silenzio dopo il codice, come negli altri lettori EAN/UPC
  const stop = endRange[1];
  const quietEnd = stop + (stop - endRange[0]);
  if (quietEnd >= row.getSize() || !row.isRange(stop, quietEnd, false)) throw new NotFoundException();
  if (!R.checkStandardUPCEANChecksum(upcEDigitsToUpcA(text))) throw new NotFoundException();
  const points = [new ResultPoint((start[0] + start[1]) / 2, rowNumber), new ResultPoint((endRange[0] + endRange[1]) / 2, rowNumber)];
  return new Result(text, null as any, 0, points, ZF.UPC_E, Date.now());
}

/** EAN-13, UPC-A ed EAN-8 con ZXing, più il nostro UPC-E. */
export class EanUpcReader extends OneDReader {
  private readonly ean: MultiFormatUPCEANReader;
  constructor(private readonly upcE: boolean, hints: Map<DecodeHintType, any>) {
    super();
    const h = new Map(hints);
    h.set(DecodeHintType.POSSIBLE_FORMATS, ((hints.get(DecodeHintType.POSSIBLE_FORMATS) as ZF[]) ?? []).filter((f) => f !== ZF.UPC_E));
    this.ean = new MultiFormatUPCEANReader(h);
  }
  decodeRow(rowNumber: number, row: BitArray, hints?: Map<DecodeHintType, any>): Result {
    try {
      return this.ean.decodeRow(rowNumber, row, hints);
    } catch (e) {
      if (!this.upcE) throw e;
      return decodeUpcERow(rowNumber, row);
    }
  }
  reset() { this.ean.reset(); }
}
