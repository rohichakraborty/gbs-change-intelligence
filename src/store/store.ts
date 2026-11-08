import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { z } from 'zod';
import type { EngagementState, EngagementSummary } from '../domain/types';
import { createBlankState, SCHEMA_VERSION } from '../domain/factory';
import { createDemoState } from '../domain/demo';
import { nowIso, uid } from '../domain/util';
import { initPersistence, type Persistence } from '../services/persistence';

export type ViewId =
  | 'overview' | 'engagement-setup' | 'change-identification' | 'stakeholder-register' | 'impact-assessment'
  | 'milestone-planner' | 'audience-matrix' | 'communicator-framework' | 'communicator-matrix' | 'messaging-strategy'
  | 'communication-channels' | 'channel-matrix' | 'communication-plan' | 'artifact-studio' | 'deliverables' | 'app-settings';

export const VIEW_IDS: ViewId[] = ['overview', 'engagement-setup', 'change-identification', 'stakeholder-register', 'impact-assessment',
  'milestone-planner', 'audience-matrix', 'communicator-framework', 'communicator-matrix', 'messaging-strategy', 'communication-channels',
  'channel-matrix', 'communication-plan', 'artifact-studio', 'deliverables', 'app-settings'];

export type Inspector =
  | { kind: 'impact'; stakeholderId: string; dimensionId: string }
  | { kind: 'comm'; commId: string; tab?: 'audience' | 'communicator' | 'channel' | 'message' | 'plan' }
  | { kind: 'cell'; milestoneId: string; stakeholderId: string }
  | { kind: 'change'; changeId: string }
  | { kind: 'stakeholder'; stakeholderId: string }
  | { kind: 'milestone'; milestoneId: string };

export interface Toast { id: string; text: string; tone: 'ok' | 'warn' | 'error' }

interface AppState {
  boot: 'loading' | 'ready';
  persistence: Persistence | null;
  engagements: EngagementSummary[];
  current: EngagementState | null;
  saveState: 'saved' | 'saving' | 'unsaved' | 'error';
  lastSavedAt: string | null;
  view: ViewId;
  inspector: Inspector | null;
  fullscreen: boolean;
  toasts: Toast[];
  past: EngagementState[];
  future: EngagementState[];
  init(): Promise<void>;
  setView(v: ViewId): void;
  inspect(i: Inspector | null): void;
  setFullscreen(v: boolean): void;
  toast(text: string, tone?: Toast['tone']): void;
  mutate(fn: (d: Draft<EngagementState>) => void, audit?: { entityType: string; entityId: string; action: string; summary: string }): void;
  undo(): void;
  redo(): void;
  openEngagement(id: string): Promise<void>;
  createBlank(name: string): Promise<void>;
  createDemo(): Promise<void>;
  deleteEngagement(id: string): Promise<void>;
  importState(raw: unknown): Promise<{ ok: boolean; message: string }>;
  saveNow(): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const LAST_KEY = 'gbs-ci:last-engagement';
const safeLS = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

const importSchema = z.object({
  schemaVersion: z.number(),
  engagement: z.object({ id: z.string().min(1), name: z.string() }).passthrough(),
  waves: z.array(z.object({ id: z.string() }).passthrough()),
  dimensions: z.array(z.object({ id: z.string(), label: z.string() }).passthrough()),
  changes: z.array(z.object({ id: z.string(), dimensionId: z.string() }).passthrough()),
  groups: z.array(z.object({ id: z.string() }).passthrough()),
  stakeholders: z.array(z.object({ id: z.string(), groupId: z.string(), archetype: z.string() }).passthrough()),
  assessments: z.record(z.object({ stakeholderId: z.string(), dimensionId: z.string() }).passthrough()),
  phases: z.array(z.object({ id: z.string() }).passthrough()),
  milestones: z.array(z.object({ id: z.string(), phaseId: z.string() }).passthrough()),
  commTypes: z.array(z.object({ id: z.string() }).passthrough()),
  communicatorRoles: z.array(z.object({ id: z.string() }).passthrough()),
  framework: z.record(z.record(z.string())),
  channels: z.array(z.object({ id: z.string(), enabled: z.boolean() }).passthrough()),
  comms: z.array(z.object({ id: z.string(), milestoneId: z.string(), audienceId: z.string() }).passthrough()),
  artifacts: z.array(z.object({ id: z.string(), communicationRecordId: z.string() }).passthrough()),
  kt: z.array(z.object({ id: z.string() }).passthrough()),
  audit: z.array(z.object({ id: z.string() }).passthrough()),
  dismissedSuggestions: z.record(z.string()),
  counters: z.object({ change: z.number(), comm: z.number(), artifact: z.number() }),
});

export const useApp = create<AppState>((set, get) => ({
  boot: 'loading',
  persistence: null,
  engagements: [],
  current: null,
  saveState: 'saved',
  lastSavedAt: null,
  view: 'overview',
  inspector: null,
  fullscreen: false,
  toasts: [],
  past: [],
  future: [],

  async init() {
    const p = await initPersistence();
    let list = await p.list().catch(() => [] as EngagementSummary[]);
    if (!list.length) {
      const demo = createDemoState();
      await p.save(demo).catch(() => undefined);
      list = await p.list().catch(() => [{ id: demo.engagement.id, name: demo.engagement.name, client: demo.engagement.client, isDemo: true, updatedAt: demo.engagement.updatedAt }]);
      set({ current: demo });
    }
    set({ persistence: p, engagements: list });
    if (!get().current) {
      const last = safeLS.get(LAST_KEY);
      const id = list.find((x) => x.id === last)?.id ?? list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]?.id;
      const st = id ? await p.load(id).catch(() => null) : null;
      set({ current: st ?? createDemoState() });
    }
    const flush = () => { if (get().saveState === 'unsaved') { if (saveTimer) clearTimeout(saveTimer); void get().saveNow(); } };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    const hash = location.hash.replace('#', '') as ViewId;
    set({ boot: 'ready', view: VIEW_IDS.includes(hash) ? hash : 'overview' });
  },

  setView(v) {
    set({ view: v, inspector: null, fullscreen: false });
    try { history.replaceState(null, '', `#${v}`); } catch { /* sandboxed */ }
  },
  inspect(i) { set({ inspector: i }); },
  setFullscreen(v) { set({ fullscreen: v }); },
  toast(text, tone = 'ok') {
    const t = { id: uid('t'), text, tone };
    set({ toasts: [...get().toasts, t] });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), 4200);
  },

  mutate(fn, audit) {
    const cur = get().current;
    if (!cur) return;
    const next = produce(cur, (d) => {
      fn(d);
      d.engagement.updatedAt = nowIso();
      if (audit) {
        d.audit.unshift({ id: uid('aud'), at: nowIso(), ...audit });
        if (d.audit.length > 600) d.audit.length = 600;
      }
    });
    set({ current: next, saveState: 'unsaved', past: [...get().past.slice(-29), cur], future: [] });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void get().saveNow(); }, 400);
  },

  undo() {
    const { past, current } = get();
    if (!past.length || !current) return;
    const prev = past[past.length - 1];
    set({ current: prev, past: past.slice(0, -1), future: [current, ...get().future].slice(0, 30), saveState: 'unsaved' });
    void get().saveNow();
    get().toast('Undid last change');
  },
  redo() {
    const { future, current } = get();
    if (!future.length || !current) return;
    set({ current: future[0], future: future.slice(1), past: [...get().past, current], saveState: 'unsaved' });
    void get().saveNow();
  },

  async saveNow() {
    const { persistence: p, current } = get();
    if (!p || !current) return;
    set({ saveState: 'saving' });
    try {
      await p.save(current);
      const list = await p.list();
      set({ saveState: get().current === current ? 'saved' : 'unsaved', lastSavedAt: nowIso(), engagements: list });
      safeLS.set(LAST_KEY, current.engagement.id);
    } catch {
      set({ saveState: 'error' });
      get().toast('Could not save. Export the engagement as JSON to keep a copy.', 'error');
    }
  },

  async openEngagement(id) {
    const p = get().persistence;
    if (!p) return;
    await get().saveNow();
    const st = await p.load(id);
    if (!st) { get().toast('Engagement could not be loaded.', 'error'); return; }
    set({ current: st, past: [], future: [], inspector: null, saveState: 'saved' });
    safeLS.set(LAST_KEY, id);
    get().setView('overview');
  },

  async createBlank(name) {
    await get().saveNow();
    const st = createBlankState(name || 'New engagement');
    set({ current: st, past: [], future: [], inspector: null });
    await get().saveNow();
    get().setView('engagement-setup');
    get().toast('Blank engagement created');
  },

  async createDemo() {
    await get().saveNow();
    const st = createDemoState();
    set({ current: st, past: [], future: [], inspector: null });
    await get().saveNow();
    get().setView('overview');
    get().toast('Demonstration engagement created');
  },

  async deleteEngagement(id) {
    const p = get().persistence;
    if (!p) return;
    await p.remove(id);
    const list = await p.list();
    set({ engagements: list });
    if (get().current?.engagement.id === id) {
      const next = list[0] ? await p.load(list[0].id) : null;
      set({ current: next ?? createDemoState(), past: [], future: [] });
      if (!next) await get().saveNow();
    }
    get().toast('Engagement deleted');
  },

  async importState(raw) {
    const r = importSchema.safeParse(raw);
    if (!r.success) return { ok: false, message: `File is not a valid engagement export: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}` };
    const st = raw as EngagementState;
    if (st.schemaVersion > SCHEMA_VERSION) return { ok: false, message: 'This export was created by a newer version of the app.' };
    const copy = JSON.parse(JSON.stringify(st)) as EngagementState;
    if (get().engagements.some((x) => x.id === copy.engagement.id)) {
      copy.engagement.id = uid('eng');
      copy.engagement.name = `${copy.engagement.name} (imported)`;
    }
    copy.audit.unshift({ id: uid('aud'), at: nowIso(), entityType: 'engagement', entityId: copy.engagement.id, action: 'import', summary: 'Engagement imported from JSON.' });
    await get().saveNow();
    set({ current: copy, past: [], future: [] });
    await get().saveNow();
    get().setView('overview');
    return { ok: true, message: `Imported "${copy.engagement.name}"` };
  },
}));

export const useEng = () => useApp((s) => s.current!);
