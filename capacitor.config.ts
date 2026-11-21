import type { CapacitorConfig } from '@capacitor/cli';

// App nativa iOS (Capacitor): serve per avere il Bluetooth (Safari e le PWA su iPhone non hanno Web Bluetooth).
//
// Aggiornamenti automatici: l'app apre la versione web pubblicata su GitHub Pages (server.url),
// quindi ogni modifica unita su main arriva da sola, senza reinstallare il .ipa. I plugin nativi
// (Bluetooth, condivisione, barra di stato) restano disponibili anche sulla pagina remota.
// Senza internet si mostra offline.html, incluso nell'app (copiato da public/ in dist/).
// Il .ipa va reinstallato solo per cambiare la parte nativa (plugin, permessi, Info.plist).
const config: CapacitorConfig = {
  appId: 'io.github.jiren38.forma',
  appName: 'Forma',
  webDir: 'dist',
  server: {
    url: 'https://jiren38.github.io/forma/',
    errorPath: 'offline.html',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#07080a',
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Ricerca in corso…',
        cancel: 'Annulla',
        availableDevices: 'Dispositivi disponibili',
        noDeviceFound: 'Nessun dispositivo trovato',
      },
    },
  },
};

export default config;
