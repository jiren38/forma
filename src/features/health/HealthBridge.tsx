import { useEffect } from 'react';
import { useToast } from '@/components/ui';
import { isNativeApp } from '@/lib/native';
import { healthPayloadFromUrl, healthSummaryText, runShortcutUrl } from '@/lib/health';
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

// ---- aggiornamento automatico all'apertura (alternativa all'automazione di Comandi Rapidi)
const AUTO_KEY = 'forma.health.auto';
const AUTO_LAST = 'forma.health.autoLast';
/** al massimo un avvio automatico ogni ora: aprire Forma più volte non fa rimbalzare ogni volta su Comandi */
export const AUTO_EVERY_MS = 60 * 60 * 1000;
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } },
};
export const healthAutoEnabled = () => ls.get(AUTO_KEY) === '1';
export function setHealthAuto(on: boolean) { ls.set(AUTO_KEY, on ? '1' : null); if (on) ls.set(AUTO_LAST, null); }

/** Avvia il comando "Forma Salute" se è attivo l'aggiornamento automatico e l'ultimo avvio è di più di un'ora fa. */
function maybeAutoRun() {
  if (!healthAutoEnabled() || document.visibilityState !== 'visible') return;
  const last = Number(ls.get(AUTO_LAST) ?? 0);
  if (Date.now() - last < AUTO_EVERY_MS) return;
  ls.set(AUTO_LAST, String(Date.now()));
  window.location.href = runShortcutUrl();
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
        const st = await App.addListener('appStateChange', (e) => { if (e.isActive) setTimeout(maybeAutoRun, 600); });
        off = () => { void h.remove(); void st.remove(); };
        const launch = await App.getLaunchUrl();
        if (alive && launch?.url && healthPayloadFromUrl(launch.url) != null) await importHealthUrl(launch.url, toast);
        else if (alive) setTimeout(maybeAutoRun, 1200);
      } catch { /* plugin App non presente nell'.ipa installato */ }
    })();
    return () => { alive = false; off?.(); };
  }, [toast]);
  return null;
}
