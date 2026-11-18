#!/usr/bin/env node
/**
 * Importa le animazioni acquistate (GIF, WebP, MP4) e genera public/media/exercises/manifest.json.
 *
 * Uso:
 *   node scripts/import-media.mjs <cartella-file> <mappa.csv>
 *
 * mappa.csv ha due colonne: id_esercizio,nome_file  (es. "bench_press_bb,0025-barbell-bench-press.gif").
 * Gli id sono quelli di src/data/exercises.ts. Lo script copia i file rinominandoli con l'id
 * e segnala gli id sconosciuti e i file mancanti. Gli esercizi senza file usano l'animazione SVG.
 *
 *   node scripts/import-media.mjs --modello
 * crea media-mappa.csv con tutti gli id e i nomi (italiano e inglese), da completare con il nome del file.
 */
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync('src/data/exercises.ts', 'utf8');
if (process.argv[2] === '--modello') {
  const rows = [...src.matchAll(/\bex\(\s*'([a-z0-9_]+)',\s*'([^']*)',\s*'([^']*)'/g)].map((m) => `${m[1]},,"${m[2]}","${m[3]}"`);
  fs.writeFileSync('media-mappa.csv', 'id_esercizio,nome_file,nome,nome_inglese\n' + rows.join('\n') + '\n');
  console.log(`media-mappa.csv creato con ${rows.length} esercizi`); process.exit(0);
}
const [srcDir, csvPath] = process.argv.slice(2);
if (!srcDir || !csvPath) { console.error('Uso: node scripts/import-media.mjs <cartella-file> <mappa.csv>'); process.exit(1); }
const outDir = path.resolve('public/media/exercises');
fs.mkdirSync(outDir, { recursive: true });
const known = new Set([...src.matchAll(/\bex\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
let ok = 0;
for (const line of fs.readFileSync(csvPath, 'utf8').split(/\r?\n/)) {
  const [id, file] = line.split(/[,;]/).map((x) => x?.trim().replace(/^"|"$/g, ''));
  if (!id || !file || id === 'id_esercizio') continue;
  if (known.size && !known.has(id)) { console.warn(`id sconosciuto: ${id}`); continue; }
  const from = path.join(srcDir, file);
  if (!fs.existsSync(from)) { console.warn(`file mancante: ${from}`); continue; }
  const ext = path.extname(file).toLowerCase();
  if (!['.gif', '.webp', '.mp4', '.webm', '.png'].includes(ext)) { console.warn(`formato non supportato: ${file}`); continue; }
  fs.copyFileSync(from, path.join(outDir, id + ext));
  manifest[id] = id + ext; ok++;
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${ok} file importati. Esercizi con media: ${Object.keys(manifest).length}/${known.size || '?'}`);
