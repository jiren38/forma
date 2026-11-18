/**
 * Lettura dei codici a barre da un fotogramma.
 * - Dove il browser offre BarcodeDetector (Chrome su Android, macOS) si usa quello: rapido e preciso.
 * - Altrimenti (iPhone, Firefox, Windows) si usa ZXing, libreria open source in JavaScript.
 */
// import mirati: solo i lettori di codici lineari (EAN/UPC), non QR e altri formati
import ZF from '@zxing/library/esm/core/BarcodeFormat';
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer';
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource';
import { EanUpcReader } from './upce';
import type { BarcodeFormat } from '@/lib/barcode';

export interface Detection { code: string; format: BarcodeFormat }
export interface Decoder { kind: 'native' | 'zxing'; detect(src: HTMLCanvasElement): Promise<Detection | null> }

const WANT = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

declare global {
  interface Window { BarcodeDetector?: any }
}

export function createZxingDecoder(): Decoder {
  const hints = new Map<DecodeHintType, any>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [ZF.EAN_13, ZF.EAN_8, ZF.UPC_A, ZF.UPC_E]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new EanUpcReader(true, hints);
  const map: Partial<Record<number, BarcodeFormat>> = { [ZF.EAN_13]: 'ean_13', [ZF.EAN_8]: 'ean_8', [ZF.UPC_A]: 'upc_a', [ZF.UPC_E]: 'upc_e' };
  let lum: Uint8ClampedArray | null = null;
  return {
    kind: 'zxing',
    async detect(canvas) {
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || !w || !h) return null;
      const { data } = ctx.getImageData(0, 0, w, h);
      if (!lum || lum.length !== w * h) lum = new Uint8ClampedArray(w * h);
      for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (data[j] * 306 + data[j + 1] * 601 + data[j + 2] * 117) >> 10;
      try {
        const res = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, w, h))), hints);
        return { code: res.getText(), format: map[res.getBarcodeFormat()] ?? 'unknown' };
      } catch { return null; } finally { reader.reset(); }
    },
  };
}

export async function createDecoder(): Promise<Decoder> {
  try {
    if (typeof window !== 'undefined' && window.BarcodeDetector) {
      const supported: string[] = await window.BarcodeDetector.getSupportedFormats();
      const formats = WANT.filter((f) => supported.includes(f));
      if (formats.includes('ean_13')) {
        const det = new window.BarcodeDetector({ formats });
        const fallback = createZxingDecoder();
        let broken = false;
        return {
          kind: 'native',
          async detect(canvas) {
            if (broken) return fallback.detect(canvas);
            try {
              const found = await det.detect(canvas);
              const b = found?.find((x: any) => WANT.includes(x.format));
              return b ? { code: String(b.rawValue), format: b.format as BarcodeFormat } : null;
            } catch { broken = true; return fallback.detect(canvas); }
          },
        };
      }
    }
  } catch { /* si usa ZXing */ }
  return createZxingDecoder();
}
