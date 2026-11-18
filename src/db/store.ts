/**
 * Data store local-first.
 *
 * - Ogni utente ha un proprio database IndexedDB (isolamento per account sullo stesso dispositivo).
 * - Tutti i documenti vengono caricati in memoria all'avvio: lettura istantanea e reattiva.
 * - Ogni scrittura aggiorna memoria + IndexedDB e marca il documento come "dirty".
 * - Il SyncEngine (sync.ts) invia i documenti dirty a Supabase e riceve le modifiche remote.
 */
import Dexie, { type Table } from 'dexie';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

export type CollectionName =
  | 'profile' | 'settings' | 'meta' | 'templates' | 'programs' | 'sessions' | 'foods' | 'diary'
  | 'recipes' | 'savedMeals' | 'mealPlans' | 'measurements' | 'photos' | 'cardio' | 'wellness'
  | 'chats' | 'suggestions' | 'notifications' | 'badges';

export const ALL_COLLECTIONS: CollectionName[] = [
  'profile', 'settings', 'meta', 'templates', 'programs', 'sessions', 'foods', 'diary', 'recipes',
  'savedMeals', 'mealPlans', 'measurements', 'photos', 'cardio', 'wellness', 'chats', 'suggestions',
  'notifications', 'badges',
];

export interface DocRow {
  collection: CollectionName;
  id: string;
  data: any;
  updatedAt: string;
  deleted: 0 | 1;
  dirty: 0 | 1;
}

interface BlobRow { key: string; blob: Blob; createdAt: string }
interface KvRow { key: string; value: any }

class FormaDB extends Dexie {
  docs!: Table<DocRow, [string, string]>;
  blobs!: Table<BlobRow, string>;
  kv!: Table<KvRow, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      docs: '[collection+id], collection, dirty, updatedAt',
      blobs: 'key',
      kv: 'key',
    });
  }
}

type Listener = () => void;

class Store {
  db: FormaDB | null = null;
  userKey: string | null = null;
  private mem = new Map<CollectionName, Map<string, DocRow>>();
  private listeners = new Map<CollectionName, Set<Listener>>();
  private snapshots = new Map<CollectionName, any[]>();
  private anyListeners = new Set<Listener>();
  ready = false;
  onLocalWrite: (() => void) | null = null;

  async open(userKey: string) {
    if (this.db && this.userKey === userKey) return;
    this.close();
    this.userKey = userKey;
    this.db = new FormaDB(`forma_${userKey}`);
    await this.db.open();
    const rows = await this.db.docs.toArray();
    this.mem.clear();
    for (const c of ALL_COLLECTIONS) this.mem.set(c, new Map());
    for (const r of rows) {
      if (!this.mem.has(r.collection)) this.mem.set(r.collection, new Map());
      this.mem.get(r.collection)!.set(r.id, r);
    }
    this.snapshots.clear();
    this.ready = true;
    ALL_COLLECTIONS.forEach((c) => this.emit(c));
  }

  close() {
    this.db?.close();
    this.db = null;
    this.userKey = null;
    this.ready = false;
    this.mem.clear();
    this.snapshots.clear();
  }

  private col(c: CollectionName) {
    let m = this.mem.get(c);
    if (!m) { m = new Map(); this.mem.set(c, m); }
    return m;
  }

  private emit(c: CollectionName) {
    this.snapshots.delete(c);
    this.listeners.get(c)?.forEach((l) => l());
    this.anyListeners.forEach((l) => l());
  }

  subscribe(c: CollectionName, l: Listener) {
    let s = this.listeners.get(c);
    if (!s) { s = new Set(); this.listeners.set(c, s); }
    s.add(l);
    return () => { s!.delete(l); };
  }
  subscribeAny(l: Listener) { this.anyListeners.add(l); return () => { this.anyListeners.delete(l); }; }

  list<T = any>(c: CollectionName): T[] {
    let snap = this.snapshots.get(c);
    if (!snap) {
      snap = [...this.col(c).values()].filter((r) => !r.deleted).map((r) => r.data);
      this.snapshots.set(c, snap);
    }
    return snap as T[];
  }

  get<T = any>(c: CollectionName, id: string): T | undefined {
    const r = this.col(c).get(id);
    return r && !r.deleted ? (r.data as T) : undefined;
  }

  async put<T = any>(c: CollectionName, id: string, data: T) {
    const row: DocRow = { collection: c, id, data: { ...data, id }, updatedAt: new Date().toISOString(), deleted: 0, dirty: 1 };
    this.col(c).set(id, row);
    this.emit(c);
    await this.db?.docs.put(row);
    this.onLocalWrite?.();
    return row.data as T;
  }

  async patch<T>(c: CollectionName, id: string, patch: Partial<T>) {
    const cur = this.get<T>(c, id) ?? ({} as T);
    return this.put(c, id, { ...(cur as any), ...patch });
  }

  async remove(c: CollectionName, id: string) {
    const cur = this.col(c).get(id);
    const row: DocRow = { collection: c, id, data: cur?.data ?? { id }, updatedAt: new Date().toISOString(), deleted: 1, dirty: 1 };
    this.col(c).set(id, row);
    this.emit(c);
    await this.db?.docs.put(row);
    this.onLocalWrite?.();
  }

  /** Applica una riga proveniente dal server (non la marca dirty). */
  async applyRemote(row: Omit<DocRow, 'dirty'>) {
    const cur = this.col(row.collection).get(row.id);
    if (cur && cur.dirty && cur.updatedAt > row.updatedAt) return false; // locale più recente: vince
    const r: DocRow = { ...row, dirty: 0 };
    this.col(row.collection).set(row.id, r);
    await this.db?.docs.put(r);
    this.emit(row.collection);
    return true;
  }

  async dirtyRows() {
    return (await this.db?.docs.where('dirty').equals(1).toArray()) ?? [];
  }

  async markClean(rows: DocRow[]) {
    for (const r of rows) {
      const cur = this.col(r.collection).get(r.id);
      if (cur && cur.updatedAt === r.updatedAt) {
        cur.dirty = 0;
        await this.db?.docs.put(cur);
      }
    }
  }

  allRows(): DocRow[] {
    const out: DocRow[] = [];
    this.mem.forEach((m) => m.forEach((r) => out.push(r)));
    return out;
  }

  async kvGet<T>(key: string): Promise<T | undefined> { return (await this.db?.kv.get(key))?.value; }
  async kvSet(key: string, value: any) { await this.db?.kv.put({ key, value }); }

  async putBlob(key: string, blob: Blob) { await this.db?.blobs.put({ key, blob, createdAt: new Date().toISOString() }); }
  async getBlob(key: string) { return (await this.db?.blobs.get(key))?.blob; }
  async deleteBlob(key: string) { await this.db?.blobs.delete(key); }

  /** Legge i documenti di un altro database locale (es. dati creati in modalità senza account). */
  async readOtherDb(userKey: string): Promise<{ rows: DocRow[]; blobs: BlobRow[] }> {
    const name = `forma_${userKey}`;
    if (!(await Dexie.exists(name))) return { rows: [], blobs: [] };
    const other = new FormaDB(name);
    try {
      await other.open();
      return { rows: (await other.docs.toArray()).filter((r) => !r.deleted), blobs: await other.blobs.toArray() };
    } finally { other.close(); }
  }

  /** Importa documenti (backup o altro database) sovrascrivendo solo se più recenti. */
  async importRows(rows: { collection: CollectionName; id: string; data: any; updatedAt?: string }[], blobs: { key: string; blob: Blob }[] = []) {
    let n = 0;
    for (const r of rows) {
      if (!ALL_COLLECTIONS.includes(r.collection) || typeof r.id !== 'string' || r.data == null) continue;
      const cur = this.col(r.collection).get(r.id);
      if (cur && !cur.deleted && r.updatedAt && cur.updatedAt >= r.updatedAt) continue;
      await this.put(r.collection, r.id, r.data);
      n++;
    }
    for (const b of blobs) await this.putBlob(b.key, b.blob);
    return n;
  }

  async wipeLocal() {
    const name = this.db?.name;
    this.close();
    if (name) await Dexie.delete(name);
  }
}

export const store = new Store();

// ---------- Hook React ----------
export function useCollection<T = any>(c: CollectionName): T[] {
  return useSyncExternalStore(
    (l) => store.subscribe(c, l),
    () => store.list<T>(c),
  );
}

export function useDoc<T = any>(c: CollectionName, id: string): T | undefined {
  const list = useCollection<any>(c);
  return useMemo(() => list.find((d) => d.id === id) as T | undefined, [list, id]);
}

export function useBlobUrl(key?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let u: string | null = null;
    if (!key) { setUrl(null); return; }
    store.getBlob(key).then((b) => { if (b && !revoked) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { revoked = true; if (u) URL.revokeObjectURL(u); };
  }, [key]);
  return url;
}
