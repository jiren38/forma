/**
 * Media realistiche per esercizio (GIF, WebP, MP4) acquistate con licenza.
 * I file stanno in public/media/exercises/ e sono elencati in manifest.json
 * ({ "bench_press_bb": "bench_press_bb.gif", ... }), generato da scripts/import-media.mjs.
 * Se un esercizio non ha un file, si usa l'animazione stickman originale.
 */
import { useEffect, useState } from 'react';
import { ExerciseAnimation, type AnimProps } from './anim/render';

const BASE = './media/exercises/';
let manifest: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;
const listeners = new Set<() => void>();

function loadManifest() {
  if (manifest) return Promise.resolve(manifest);
  loading ??= fetch(BASE + 'manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((m: Record<string, string>) => { manifest = m && typeof m === 'object' ? m : {}; listeners.forEach((f) => f()); return manifest; });
  return loading;
}

export function useExerciseMedia(id: string | undefined): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (manifest) return;
    const f = () => force((n) => n + 1);
    listeners.add(f); void loadManifest();
    return () => { listeners.delete(f); };
  }, []);
  const file = id && manifest ? manifest[id] : undefined;
  return file ? BASE + file : null;
}

export function hasMediaManifest() { return !!manifest && Object.keys(manifest).length > 0; }

type Props = AnimProps & { exerciseId?: string; preferSchematic?: boolean };

/** Mostra il media realistico se disponibile, altrimenti l'animazione stickman. */
export function ExerciseVisual({ exerciseId, preferSchematic, ...anim }: Props) {
  const src = useExerciseMedia(exerciseId);
  const [failed, setFailed] = useState(false);
  if (preferSchematic || !src || failed) return <ExerciseAnimation {...anim} />;
  const cls = `ex-media ${anim.className ?? ''}`.trim();
  if (/\.(mp4|webm)$/i.test(src)) {
    return <video className={cls} src={src} autoPlay={anim.autoPlay !== false} loop muted playsInline aria-label={anim.label} onError={() => setFailed(true)} />;
  }
  return <img className={cls} src={src} alt={anim.label ? `Esecuzione: ${anim.label}` : ''} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
