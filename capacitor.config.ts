import type { CapacitorConfig } from '@capacitor/cli';

// App nativa iOS (Capacitor): impacchetta la stessa build web di `dist/` dentro un'app iPhone.
// Serve per avere il Bluetooth (Safari e le PWA su iPhone non hanno Web Bluetooth).
const config: CapacitorConfig = {
  appId: 'io.github.jiren38.forma',
  appName: 'Forma',
  webDir: 'dist',
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
