import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// PWA: service worker solo in produzione e su origini che lo consentono
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then((r) => r.update()).catch(() => { /* ambiente senza SW */ }); });
}

// Aggiornamenti: un'app installata o lasciata aperta non ricarica da sola. All'avvio e ogni volta che torna
// in primo piano controlla version.json; se è uscita una build nuova ricarica la pagina (una volta sola per build).
if (import.meta.env.PROD) {
  const check = async () => {
    try {
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const { build } = await r.json() as { build?: string };
      if (!build || build === __BUILD_ID__) return;
      if (sessionStorage.getItem('forma-reloaded-for') === build) return;
      sessionStorage.setItem('forma-reloaded-for', build);
      location.reload();
    } catch { /* offline */ }
  };
  window.addEventListener('load', check);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
