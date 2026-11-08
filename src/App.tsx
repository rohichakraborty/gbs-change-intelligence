import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Settings2, GitBranch, Users, Grid3x3, CalendarRange, UserCheck, BookOpen, Mic2, MessageSquareText, Radio,
  Palette, ClipboardList, FileText, Download, SlidersHorizontal, Menu, Undo2, Redo2, CheckCircle2, AlertTriangle, Loader2, CircleDot, Plus,
} from 'lucide-react';
import { useApp, type ViewId } from './store/store';
import { derive } from './engine/derive';
import { Btn, Modal, Field, useConfirm } from './ui/kit';
import { InspectorPanel } from './ui/inspectors';
import { Overview } from './modules/Overview';
import { EngagementSetup } from './modules/EngagementSetup';
import { ChangeIdentification } from './modules/ChangeIdentification';
import { StakeholderRegister } from './modules/StakeholderRegister';
import { ImpactAssessment } from './modules/ImpactAssessment';
import { MilestonePlanner } from './modules/MilestonePlanner';
import { AudienceMatrix } from './modules/AudienceMatrix';
import { CommunicatorFramework } from './modules/CommunicatorFramework';
import { CommunicatorMatrix, ChannelMatrix } from './modules/CommMatrices';
import { MessagingStrategy } from './modules/MessagingStrategy';
import { ChannelLibrary } from './modules/ChannelLibrary';
import { CommunicationPlan } from './modules/CommunicationPlan';
import { ArtifactStudio } from './modules/ArtifactStudio';
import { Deliverables } from './modules/Deliverables';
import { AppSettings } from './modules/AppSettings';
import { fmtDateTime } from './domain/util';

interface NavItem { id: ViewId; label: string; icon: ReactNode; stage: 0 | 1 | 2 | 3 }
const NAV: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} />, stage: 0 },
  { id: 'engagement-setup', label: 'Engagement Setup', icon: <Settings2 size={15} />, stage: 1 },
  { id: 'change-identification', label: 'Change Identification', icon: <GitBranch size={15} />, stage: 1 },
  { id: 'stakeholder-register', label: 'Stakeholder Register', icon: <Users size={15} />, stage: 2 },
  { id: 'impact-assessment', label: 'Impact Assessment', icon: <Grid3x3 size={15} />, stage: 2 },
  { id: 'milestone-planner', label: 'Milestone Planner', icon: <CalendarRange size={15} />, stage: 3 },
  { id: 'audience-matrix', label: 'Audience Matrix', icon: <UserCheck size={15} />, stage: 3 },
  { id: 'communicator-framework', label: 'Communicator Framework', icon: <BookOpen size={15} />, stage: 3 },
  { id: 'communicator-matrix', label: 'Communicator Matrix', icon: <Mic2 size={15} />, stage: 3 },
  { id: 'messaging-strategy', label: 'Messaging Strategy', icon: <MessageSquareText size={15} />, stage: 3 },
  { id: 'communication-channels', label: 'Communication Channels', icon: <Radio size={15} />, stage: 3 },
  { id: 'channel-matrix', label: 'Channel Matrix', icon: <Palette size={15} />, stage: 3 },
  { id: 'communication-plan', label: 'Communication Plan', icon: <ClipboardList size={15} />, stage: 3 },
  { id: 'artifact-studio', label: 'Artifact Studio', icon: <FileText size={15} />, stage: 3 },
  { id: 'deliverables', label: 'Deliverables & Exports', icon: <Download size={15} />, stage: 0 },
  { id: 'app-settings', label: 'Settings', icon: <SlidersHorizontal size={15} />, stage: 0 },
];
const STAGES = ['', 'Stage 1 · Change Identification', 'Stage 2 · Change Assessment & Stakeholder Analysis', 'Stage 3 · Change Management Plan'];

const VIEWS: Record<ViewId, () => JSX.Element> = {
  overview: Overview, 'engagement-setup': EngagementSetup, 'change-identification': ChangeIdentification, 'stakeholder-register': StakeholderRegister,
  'impact-assessment': ImpactAssessment, 'milestone-planner': MilestonePlanner, 'audience-matrix': AudienceMatrix, 'communicator-framework': CommunicatorFramework,
  'communicator-matrix': CommunicatorMatrix, 'messaging-strategy': MessagingStrategy, 'communication-channels': ChannelLibrary, 'channel-matrix': ChannelMatrix,
  'communication-plan': CommunicationPlan, 'artifact-studio': ArtifactStudio, deliverables: Deliverables, 'app-settings': AppSettings,
};

export default function App() {
  const boot = useApp((s) => s.boot);
  const init = useApp((s) => s.init);
  useEffect(() => { void init(); }, [init]);
  if (boot !== 'ready') {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><div className="row muted"><Loader2 size={16} className="spin" /> Loading engagements…</div></div>;
  }
  return <Shell />;
}

function Shell() {
  const s = useApp((x) => x.current)!;
  const view = useApp((x) => x.view);
  const setView = useApp((x) => x.setView);
  const inspector = useApp((x) => x.inspector);
  const toasts = useApp((x) => x.toasts);
  const [railOpen, setRailOpen] = useState(false);
  const d = useMemo(() => derive(s), [s]);
  const View = VIEWS[view];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) useApp.getState().redo(); else useApp.getState().undo(); }
      if (e.key === 'Escape') { useApp.getState().inspect(null); useApp.getState().setFullscreen(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const counts: Partial<Record<ViewId, { n: number; warn?: boolean }>> = {
    'change-identification': { n: s.changes.length },
    'stakeholder-register': { n: d.selectedStakeholders.length },
    'impact-assessment': { n: [...d.impacts.values()].filter((x) => x.classification === 'review' || x.status === 'needs_review' || x.conflict).length, warn: true },
    'milestone-planner': { n: d.activeMilestones.length },
    'audience-matrix': { n: d.suggestions.length, warn: true },
    'communication-plan': { n: d.issues.filter((i) => i.severity !== 'info' && ['communication-plan', 'communicator-matrix', 'channel-matrix'].includes(i.view)).length, warn: true },
    'artifact-studio': { n: [...d.artifactStates.values()].filter((x) => x.outdated).length, warn: true },
  };

  return (
    <div className="app">
      <nav className={`rail ${railOpen ? 'open' : ''}`} aria-label="Modules">
        <div className="brand">
          <div className="brand-mark"><span className="brand-glyph">CI</span>GBS Change Intelligence</div>
          <div className="brand-sub">Change Management Studio</div>
        </div>
        {[0, 1, 2, 3].map((stage) => (
          <div key={stage}>
            {stage > 0 && <div className="rail-stage">{['', 'Stage 1 — Identify', 'Stage 2 — Assess', 'Stage 3 — Plan'][stage]}</div>}
            {stage === 0 && <div style={{ height: 8 }} />}
            {NAV.filter((n) => n.stage === stage && (stage !== 0 || n.id === 'overview')).map((n) => <NavBtn key={n.id} n={n} active={view === n.id} count={counts[n.id]} onClick={() => { setView(n.id); setRailOpen(false); }} />)}
          </div>
        ))}
        <div className="rail-stage">Outputs & settings</div>
        {NAV.filter((n) => n.id === 'deliverables' || n.id === 'app-settings').map((n) => <NavBtn key={n.id} n={n} active={view === n.id} onClick={() => { setView(n.id); setRailOpen(false); }} />)}
        <div className="rail-foot">From Change Assessment to Actionable Communication.</div>
      </nav>
      <div className="main">
        <TopBar d={d} onMenu={() => setRailOpen(!railOpen)} />
        <div className="workspace">
          <main className="content" onClick={() => railOpen && setRailOpen(false)}>
            {s.engagement.isDemo && view === 'overview' && (
              <div className="banner demo"><CircleDot size={16} /><div className="grow"><strong>Demonstration engagement.</strong> Project Atlas and all of its people, organisations, changes, and dates are fictional and have not been validated. Create a blank engagement from the engagement menu to start real work.</div></div>
            )}
            <View />
          </main>
          {inspector && <aside className="inspector" aria-label="Inspector"><InspectorPanel /></aside>}
        </div>
      </div>
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}</div>
    </div>
  );
}

function NavBtn({ n, active, count, onClick }: { n: NavItem; active: boolean; count?: { n: number; warn?: boolean }; onClick: () => void }) {
  return (
    <button className={`rail-item ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      {n.icon}<span>{n.label}</span>
      {count && count.n > 0 && <span className={`count ${count.warn ? 'warn' : ''}`}>{count.n}</span>}
    </button>
  );
}

function TopBar({ d, onMenu }: { d: ReturnType<typeof derive>; onMenu: () => void }) {
  const s = useApp((x) => x.current)!;
  const engagements = useApp((x) => x.engagements);
  const saveState = useApp((x) => x.saveState);
  const lastSavedAt = useApp((x) => x.lastSavedAt);
  const persistence = useApp((x) => x.persistence);
  const view = useApp((x) => x.view);
  const past = useApp((x) => x.past.length);
  const future = useApp((x) => x.future.length);
  const { openEngagement, setView, undo, redo, createBlank, createDemo } = useApp.getState();
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const { ask, node } = useConfirm();
  const stage = NAV.find((n) => n.id === view)?.stage ?? 0;
  const review = d.issues.filter((i) => i.severity !== 'info').length;
  const critical = d.issues.filter((i) => i.severity === 'critical').length;
  const list = engagements.some((e) => e.id === s.engagement.id) ? engagements : [...engagements, { id: s.engagement.id, name: s.engagement.name, client: '', isDemo: s.engagement.isDemo, updatedAt: '' }];

  return (
    <header className="topbar">
      <Btn variant="ghost" className="menu-btn" icon={<Menu size={18} />} onClick={onMenu} aria-label="Open navigation" />
      <div className="eng">
        <select className="eng-select" aria-label="Active engagement" value={s.engagement.id} onChange={async (e) => {
          const v = e.target.value;
          if (v === '__new') setNewOpen(true);
          else if (v === '__demo') { if (await ask('Create demonstration engagement', 'A new copy of the fictional Project Atlas engagement will be created. Your existing engagements are kept.', 'Create demo')) await createDemo(); }
          else await openEngagement(v);
        }}>
          {list.map((e) => <option key={e.id} value={e.id}>{e.name}{e.isDemo ? ' (demo)' : ''}</option>)}
          <option value="__new">+ New blank engagement…</option>
          <option value="__demo">+ New demonstration engagement</option>
        </select>
      </div>
      <span className="sep hide-sm" />
      <span className="meta hide-sm" title="Current workflow stage">{STAGES[stage] || 'Engagement overview'}</span>
      <span className="spacer" />
      <span className="meta hide-sm" title={persistence?.label}>
        {saveState === 'saved' && <><CheckCircle2 size={14} color="var(--ok)" /> Saved{lastSavedAt ? ` ${fmtDateTime(lastSavedAt).slice(-5)}` : ''}</>}
        {saveState === 'saving' && <><Loader2 size={14} /> Saving…</>}
        {saveState === 'unsaved' && <><CircleDot size={14} color="var(--warn)" /> Unsaved changes</>}
        {saveState === 'error' && <><AlertTriangle size={14} color="var(--crit)" /> Save failed</>}
        {persistence?.kind === 'memory' && <span className="badge b-warn">Not persisted</span>}
      </span>
      <button className="btn sm" onClick={() => setView('overview')} title="Items requiring review (Action Centre)">
        {critical ? <AlertTriangle size={14} color="var(--crit)" /> : review ? <AlertTriangle size={14} color="var(--warn)" /> : <CheckCircle2 size={14} color="var(--ok)" />}
        <span className="hide-sm">{review ? `${review} to review` : 'No open issues'}</span>
      </button>
      <Btn size="sm" variant="ghost" className="hide-sm" icon={<Undo2 size={15} />} onClick={undo} disabled={!past} aria-label="Undo" title="Undo (Ctrl+Z)" />
      <Btn size="sm" variant="ghost" className="hide-sm" icon={<Redo2 size={15} />} onClick={redo} disabled={!future} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" />
      <Btn size="sm" variant="primary" icon={<Download size={14} />} onClick={() => setView('deliverables')}><span className="hide-sm">Export</span></Btn>
      {newOpen && (
        <Modal title="New blank engagement" onClose={() => setNewOpen(false)} footer={<><Btn onClick={() => setNewOpen(false)}>Cancel</Btn><Btn variant="primary" icon={<Plus size={14} />} onClick={async () => { setNewOpen(false); await createBlank(newName.trim()); setNewName(''); }}>Create engagement</Btn></>}>
          <Field label="Engagement name" htmlFor="new-eng-name"><input id="new-eng-name" className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Project Horizon — Finance GBS" /></Field>
          <p className="small muted" style={{ marginTop: 10 }}>The engagement starts empty: no stakeholders, changes, or milestones are selected. The full stakeholder, milestone, and channel libraries are available to choose from.</p>
        </Modal>
      )}
      {node}
    </header>
  );
}
