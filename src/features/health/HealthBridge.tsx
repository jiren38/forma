import { useEffect } from 'react';
import { useToast } from '@/components/ui';
import { isNativeApp } from '@/lib/native';
import { healthPayloadFromUrl, healthSummaryText } from '@/lib/health';
import { applyHealthPayload } from './importer';

// stesso indirizzo ricevuto due volte di fila (avvio + evento, o ricarica della pagina): un solo messaggio
let lastUrl = '';
let lastAt = 0;

export async function importHealthUrl(url: string, toast: (t: string, k?: 'success' | 'error' | 'info') => void) {
  const payload = healthPayloadFromUrl(url);
  if (payload == null) return false;
  const repeated = url === lastUrl && Date.now() - lastAt < 15000;
  lastUrl = url; lastAt = Date.now();
  const res = await applyHealthPayload(payload);
  if (!repeated) {
    if (res.ok && res.summary) toast(`Apple Salute: ${healthSummaryText(res.summary)}`);
    else toast(res.error ?? 'Dati di Apple Salute non riconosciuti', 'error');
  }
  return true;
}

/**
 * Nell'app iPhone il comando rapido "Forma Salute" apre forma://salute?d=… con i dati letti da Salute.
 * Qui si ricevono sia l'apertura a freddo (getLaunchUrl) sia quella con l'app già aperta (appUrlOpen).
 * Sul web non fa nulla: lì il comando apre …/#/salute/importa?d=… (pagina HealthImportRoute).
 * Con un .ipa vecchio, senza il plugin App, le chiamate falliscono in silenzio.
 */
export function HealthBridge() {
  const toast = useToast();
  useEffect(() => {
    if (!isNativeApp()) return;
    let off: (() => void) | null = null;
    let alive = true;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const h = await App.addListener('appUrlOpen', (e) => { void importHealthUrl(e.url, toast); });
        if (!alive) { void h.remove(); return; }
        off = () => { void h.remove(); };
        const launch = await App.getLaunchUrl();
        if (alive && launch?.url) await importHealthUrl(launch.url, toast);
      } catch { /* plugin App non presente nell'.ipa installato */ }
    })();
    return () => { alive = false; off?.(); };
  }, [toast]);
  return null;
}
