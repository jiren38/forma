import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

// Identificativo della build: l'app lo confronta con version.json per accorgersi degli aggiornamenti
const BUILD_ID = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const versionFile = { name: 'forma-version', generateBundle(this: any) { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) }); } };

// `--mode phone` (npm run dev:phone / preview:phone): server raggiungibile in rete locale e in HTTPS,
// perché i browser concedono la fotocamera solo su https o su localhost.
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionFile, ...(mode === 'phone' ? [basicSsl({ name: 'forma-locale' })] : [])],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  build: { chunkSizeWarningLimit: 1500 },
  server: mode === 'phone' ? { host: true, port: 5173 } : undefined,
  preview: mode === 'phone' ? { host: true, port: 4443 } : undefined,
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
}) as any);
