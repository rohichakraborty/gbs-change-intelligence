// ---------------------------------------------------------------------------
// Persistence adapters. When hosted as a claude.ai artifact the app stores
// engagements in the artifact's per-user private database (`db` capability).
// Running standalone it uses IndexedDB. If neither is available it falls back
// to memory and says so in the UI.
// ---------------------------------------------------------------------------
import type { EngagementState, EngagementSummary } from '../domain/types';

export interface Persistence {
  kind: 'cloud' | 'browser' | 'memory';
  label: string;
  list(): Promise<EngagementSummary[]>;
  load(id: string): Promise<EngagementState | null>;
  save(s: EngagementState): Promise<void>;
  remove(id: string): Promise<void>;
  /** Shared change-library edits (separate from engagement data). */
  loadCatalogue(): Promise<unknown>;
  saveCatalogue(overlay: unknown): Promise<void>;
}

const summary = (s: EngagementState): EngagementSummary => ({
  id: s.engagement.id, name: s.engagement.name, client: s.engagement.client, isDemo: s.engagement.isDemo, updatedAt: s.engagement.updatedAt,
});

// ----------------------------- Memory --------------------------------------

function memoryAdapter(): Persistence {
  const m = new Map<string, EngagementState>();
  let cat: unknown = null;
  return {
    async loadCatalogue() { return cat; },
    async saveCatalogue(o) { cat = o; },
    kind: 'memory', label: 'Not saved (memory only)',
    async list() { return [...m.values()].map(summary); },
    async load(id) { return m.get(id) ?? null; },
    async save(s) { m.set(s.engagement.id, s); },
    async remove(id) { m.delete(id); },
  };
}

// ----------------------------- IndexedDB -----------------------------------

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gbs-change-intelligence', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('engagements');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

async function idbAdapter(): Promise<Persistence> {
  const db = await idbOpen();
  const store = (mode: IDBTransactionMode) => db.transaction('engagements', mode).objectStore('engagements');
  // Probe write to detect blocked storage.
  await idbReq(store('readwrite').put('ok', '__probe__'));
  return {
    kind: 'browser', label: 'Saved in this browser',
    async list() {
      const all = (await idbReq(store('readonly').getAll())) as unknown[];
      return all.filter((x): x is EngagementState => typeof x === 'object' && !!x && 'engagement' in (x as object)).map(summary);
    },
    async load(id) { return ((await idbReq(store('readonly').get(id))) as EngagementState) ?? null; },
    async save(s) { await idbReq(store('readwrite').put(JSON.parse(JSON.stringify(s)), s.engagement.id)); },
    async remove(id) { await idbReq(store('readwrite').delete(id)); },
    async loadCatalogue() { return (await idbReq(store('readonly').get('__catalogue__'))) ?? null; },
    async saveCatalogue(o) { await idbReq(store('readwrite').put(JSON.parse(JSON.stringify(o)), '__catalogue__')); },
  };
}

// ----------------------------- Artifact db ---------------------------------

const CHUNK = 80_000;

interface DocRef { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
interface CollRef { doc(id: string): DocRef }
interface DbNs { collection(path: string): CollRef }

async function cloudAdapter(): Promise<Persistence | null> {
  const w = window as unknown as { claude?: { use(n: string): Promise<unknown> } };
  if (!w.claude?.use) return null;
  const [db, user] = (await Promise.all([w.claude.use('db'), w.claude.use('user')])) as [DbNs | null, { id(): Promise<string | null> } | null];
  if (!db || !user) return null;
  const id = await user.id();
  if (!id) return null;
  const col = db.collection(`data/users/${id}`);
  const readIndex = async (): Promise<EngagementSummary[]> => {
    const snap = await col.doc('index').get();
    return snap.exists ? ((snap.data()?.items as EngagementSummary[]) ?? []) : [];
  };
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const p = queue.then(fn, fn); queue = p.catch(() => undefined); return p; };
  return {
    kind: 'cloud', label: 'Saved to your private artifact storage',
    list: () => serial(readIndex),
    load: (eid) => serial(async () => {
      const meta = await col.doc(`e_${eid}_meta`).get();
      if (!meta.exists) return null;
      const n = Number(meta.data()?.chunks ?? 0);
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const c = await col.doc(`e_${eid}_c${i}`).get();
        parts.push(String(c.data()?.d ?? ''));
      }
      return JSON.parse(parts.join('')) as EngagementState;
    }),
    save: (s) => serial(async () => {
      const eid = s.engagement.id;
      const json = JSON.stringify(s);
      const chunks = Math.max(1, Math.ceil(json.length / CHUNK));
      const prev = await col.doc(`e_${eid}_meta`).get();
      const prevN = prev.exists ? Number(prev.data()?.chunks ?? 0) : 0;
      for (let i = 0; i < chunks; i++) await col.doc(`e_${eid}_c${i}`).set({ d: json.slice(i * CHUNK, (i + 1) * CHUNK) });
      await col.doc(`e_${eid}_meta`).set({ chunks, updatedAt: s.engagement.updatedAt });
      for (let i = chunks; i < prevN; i++) await col.doc(`e_${eid}_c${i}`).delete();
      const idx = (await readIndex()).filter((x) => x.id !== eid);
      idx.push(summary(s));
      await col.doc('index').set({ items: idx });
    }),
    loadCatalogue: () => serial(async () => {
      const snap = await col.doc('catalogue').get();
      return snap.exists ? JSON.parse(String(snap.data()?.d ?? 'null')) : null;
    }),
    saveCatalogue: (o) => serial(async () => { await col.doc('catalogue').set({ d: JSON.stringify(o) }); }),
    remove: (eid) => serial(async () => {
      const prev = await col.doc(`e_${eid}_meta`).get();
      const n = prev.exists ? Number(prev.data()?.chunks ?? 0) : 0;
      for (let i = 0; i < n; i++) await col.doc(`e_${eid}_c${i}`).delete();
      if (prev.exists) await col.doc(`e_${eid}_meta`).delete();
      await col.doc('index').set({ items: (await readIndex()).filter((x) => x.id !== eid) });
    }),
  };
}

export async function initPersistence(): Promise<Persistence> {
  try {
    const c = await cloudAdapter();
    if (c) return c;
  } catch { /* fall through */ }
  try {
    return await idbAdapter();
  } catch {
    return memoryAdapter();
  }
}
