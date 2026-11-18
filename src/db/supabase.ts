import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** true quando il backend cloud è configurato tramite variabili d'ambiente. */
export const cloudEnabled = Boolean(url && anon && !url.includes('xxxxxxxx'));

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, anon!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const PHOTO_BUCKET = 'progress-photos';
