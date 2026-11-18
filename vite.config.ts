import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

// `--mode phone` (npm run dev:phone / preview:phone): server raggiungibile in rete locale e in HTTPS,
// perché i browser concedono la fotocamera solo su https o su localhost.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'phone' ? [basicSsl({ name: 'forma-locale' })] : [])],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  build: { chunkSizeWarningLimit: 1500 },
  server: mode === 'phone' ? { host: true, port: 5173 } : undefined,
  preview: mode === 'phone' ? { host: true, port: 4443 } : undefined,
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
}) as any);
