/**
 * Sincronizzazione bidirezionale con Supabase (tabella public.user_docs).
 * Strategia: local-first, last-write-wins per documento (updated_at client),
 * cursore di pull su server_updated_at (impostato da trigger lato DB),
 * realtime per aggiornamenti istantanei tra dispositivi.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { store, type DocRow, type CollectionName } from './store';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

type L = (s: SyncStatus, info?: { lastSync?: string; error?: string; pending?: number }) => void;

class SyncEngine {
  private userId: string | null = null;
  private timer: any = null;
  private interval: any = null;
  private channel: RealtimeChannel | null = null;
  private running = false;
  private again = false;
  status: SyncStatus = 'off';
  lastSync: string | undefined;
  lastError: string | undefined;
  private listeners = new Set<L>();

  subscribe(l: L) { this.listeners.add(l); l(this.status, { lastSync: this.lastSync }); return () => { this.listeners.delete(l); }; }
  private set(s: SyncStatus, extra?: { error?: string }) {
    this.status = s;
    if (extra?.error) this.lastError = extra.error;
    this.listeners.forEach((l) => l(s, { lastSync: this.lastSync, error: this.lastError }));
  }

  async start(userId: string) {
    if (!supabase) return;
    this.userId = userId;
    store.onLocalWrite = () => this.schedule(1200);
    this.lastSync = await store.kvGet<string>('lastSync');
    window.addEventListener('online', this.onOnline);
    window.addEventListener('focus', this.onFocus);
    this.interval = setInterval(() => this.sync(), 60_000);
    this.channel = supabase
      .channel(`docs-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_docs', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const r = payload.new;
          if (!r || !r.collection) return;
          store.applyRemote({ collection: r.collection, id: r.id, data: r.data, updatedAt: r.updated_at, deleted: r.deleted ? 1 : 0 });
        })
      .subscribe();
    await this.sync();
  }

  stop() {
    clearTimeout(this.timer); clearInterval(this.interval);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('focus', this.onFocus);
    if (this.channel && supabase) supabase.removeChannel(this.channel);
    this.channel = null; this.userId = null; store.onLocalWrite = null;
    this.set('off');
  }

  private onOnline = () => this.sync();
  private onFocus = () => this.schedule(300);

  schedule(ms = 1000) { clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), ms); }

  async sync(): Promise<void> {
    if (!supabase || !this.userId) return;
    if (!navigator.onLine) { this.set('offline'); return; }
    if (this.running) { this.again = true; return; }
    this.running = true; this.set('syncing');
    try {
      await this.push();
      await this.pull();
      this.lastSync = new Date().toISOString();
      await store.kvSet('lastSync', this.lastSync);
      this.set('idle');
    } catch (e: any) {
      console.warn('[sync]', e);
      this.set(navigator.onLine ? 'error' : 'offline', { error: e?.message ?? String(e) });
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.schedule(200); }
    }
  }

  private async push() {
    const rows = await store.dirtyRows();
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase!.from('user_docs').upsert(
        chunk.map((r) => ({ user_id: this.userId, collection: r.collection, id: r.id, data: r.data, updated_at: r.updatedAt, deleted: !!r.deleted })),
        { onConflict: 'user_id,collection,id' },
      );
      if (error) throw error;
      await store.markClean(chunk);
    }
  }

  private async pull() {
    const cursorKey = 'pullCursor';
    let cursor = (await store.kvGet<string>(cursorKey)) ?? '1970-01-01T00:00:00Z';
    for (;;) {
      const { data, error } = await supabase!
        .from('user_docs')
        .select('collection,id,data,updated_at,deleted,server_updated_at')
        .gt('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      if (!data?.length) break;
      for (const r of data as any[]) {
        await store.applyRemote({ collection: r.collection as CollectionName, id: r.id, data: r.data, updatedAt: r.updated_at, deleted: r.deleted ? 1 : 0 });
        cursor = r.server_updated_at;
      }
      await store.kvSet(cursorKey, cursor);
      if (data.length < 500) break;
    }
  }
}

export const syncEngine = new SyncEngine();
export type { DocRow };
