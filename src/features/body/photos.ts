/**
 * Foto progressi private.
 * - Sempre salvate in locale (IndexedDB, ridimensionate).
 * - In modalità cloud caricate nel bucket privato Supabase sotto la cartella dell'utente (protetto da RLS).
 */
import { useEffect, useState } from 'react';
import { store } from '@/db/store';
import { PHOTO_BUCKET, supabase } from '@/db/supabase';
import { uid } from '@/lib/util';
import type { ProgressPhoto } from '@/lib/types';

async function downscale(file: Blob, max = 1280): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
  } catch { return file; }
}

export async function addPhoto(file: File, meta: { date: string; pose: ProgressPhoto['pose']; notes?: string }, cloudUserId?: string | null): Promise<ProgressPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Il file selezionato non è un’immagine');
  if (file.size > 25 * 1024 * 1024) throw new Error('Immagine troppo grande (max 25 MB)');
  const id = uid('ph_');
  const blob = await downscale(file);
  const localKey = `photo:${id}`;
  await store.putBlob(localKey, blob);
  const p: ProgressPhoto = { id, date: meta.date, pose: meta.pose, notes: meta.notes ?? '', localKey };
  if (cloudUserId && supabase) {
    const path = `${cloudUserId}/${id}.jpg`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (!error) p.storagePath = path;
  }
  await store.put('photos', id, p);
  return p;
}

export async function deletePhoto(p: ProgressPhoto) {
  if (p.localKey) await store.deleteBlob(p.localKey);
  if (p.storagePath && supabase) await supabase.storage.from(PHOTO_BUCKET).remove([p.storagePath]);
  await store.remove('photos', p.id);
}

/** URL visualizzabile: blob locale se presente, altrimenti URL firmato temporaneo dal cloud (scaricato e messo in cache). */
export function usePhotoUrl(p: ProgressPhoto | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; let obj: string | null = null;
    setUrl(null);
    if (!p) return;
    (async () => {
      let blob = p.localKey ? await store.getBlob(p.localKey) : undefined;
      if (!blob && p.storagePath && supabase) {
        const { data } = await supabase.storage.from(PHOTO_BUCKET).download(p.storagePath);
        if (data) { blob = data; if (p.localKey) await store.putBlob(p.localKey, data); }
      }
      if (blob && alive) { obj = URL.createObjectURL(blob); setUrl(obj); }
    })();
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [p?.id, p?.localKey, p?.storagePath]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}
