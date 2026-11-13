import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { useApp } from '../store/store';
import { derive } from '../engine/derive';
import { fmtDate, fmtDateTime } from '../domain/util';
import { Btn, PageHeader, Tabs, Chips } from '../ui/kit';
import { ChangeLibrary } from './change/ChangeLibrary';
import { ChangeRegister } from './change/ChangeRegister';
import { Clarifications } from './change/Clarifications';
import { ImportChanges } from './change/ImportChanges';
import { LibraryMaintenance } from './change/LibraryMaintenance';
import { AIGenerate } from './change/AIGenerate';
import { listLatestTemplates } from '../catalogue/registry';

type Tab = 'library' | 'ai' | 'register' | 'clarify' | 'import' | 'maintain';

export function ChangeIdentification() {
  const s = useApp((x) => x.current)!;
  const setView = useApp((x) => x.setView);
  const mutate = useApp((x) => x.mutate);
  const d = useMemo(() => derive(s), [s]);
  const [tab, setTab] = useState<Tab>('library');
  const [aiFn, setAiFn] = useState<string | undefined>(undefined);
  const e = s.engagement;
  const p = s.lastPropagation;
  const openQs = d.clarificationQueue.reduce((n, x) => n + x.changeIds.length, 0);
  const pendingImport = s.importQueue.filter((r) => r.status === 'pending').length;

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Change Identification" title="Change Identification"
        sub="Tick the changes that apply from the GBS Change Library, or generate candidate changes for any function with AI. Each selection creates a structured, traceable Change Register record that drives impact assessment and communication planning. Custom changes are available for anything the library does not cover."
        actions={<Btn onClick={() => setView('impact-assessment')}>Open Impact Assessment</Btn>} />
      <div className="ctx-strip" aria-label="Engagement context (from Engagement Setup)">
        <span><span className="k">Engagement</span><strong>{e.name}</strong></span>
        <span><span className="k">Transformation</span>{e.transformationTypes.join(', ') || '—'}</span>
        <span><span className="k">Functions</span>{e.functions.map((f) => f.name).join(', ') || 'None set'}</span>
        <span><span className="k">Transition waves</span>{s.waves.length} ({s.waves.map((w) => `${w.name}: ${fmtDate(w.goLiveDate, 'TBC')}`).join('; ')})</span>
        <span><span className="k">Library</span>{listLatestTemplates().filter((t) => t.active).length} templates</span>
      </div>
      {p && (
        <div className="banner info">
          <Activity size={16} />
          <div className="grow prop-banner">
            <span><strong>Last change:</strong> {p.action} · {fmtDateTime(p.at)}</span>
            <span><span className="n">{p.impactCellsChanged}</span> impact cell(s) changed</span>
            <span><span className="n">{p.newImpactRecommendations}</span> new impact recommendation(s)</span>
            <span><span className="n">{p.newAudienceSuggestions}</span> new audience suggestion(s)</span>
            <span><span className="n">{Math.max(0, p.communicationsFlagged)}</span> communication(s) flagged</span>
            <span><span className="n">{p.milestonesSuggested}</span> milestone(s) suggested</span>
          </div>
          <Btn size="sm" onClick={() => setView('impact-assessment')}>Impact matrix</Btn>
          <Btn size="sm" onClick={() => setView('audience-matrix')}>Audience matrix</Btn>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'library', label: 'Change Library' },
        { value: 'ai', label: `Generate with AI${s.aiGenerations.length ? ` (${s.aiGenerations.length})` : ''}` },
        { value: 'register', label: `Change Register (${s.changes.filter((c) => c.active).length})` },
        { value: 'clarify', label: `Clarifications${openQs ? ` (${openQs})` : ''}` },
        { value: 'import', label: `Import list${pendingImport ? ` (${pendingImport})` : ''}` },
        { value: 'maintain', label: 'Library maintenance' },
      ]} />
      {tab === 'library' && (
        <>
          <details style={{ marginBottom: 10 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>Change dimensions in the impact matrix ({d.selectedDims.length} of {s.dimensions.length})</summary>
            <div style={{ marginTop: 8 }}>
              <Chips options={s.dimensions.map((x) => ({ value: x.id, label: x.label }))} value={e.selectedDimensionIds}
                onChange={(v) => mutate((dd) => { dd.engagement.selectedDimensionIds = v; }, { entityType: 'dimension', entityId: 'selection', action: 'update', summary: 'Impact matrix dimensions changed' })} />
            </div>
          </details>
          <ChangeLibrary onReview={() => setTab('register')} onClarify={() => setTab('clarify')} onGenerate={(f) => { setAiFn(f); setTab('ai'); }} />
        </>
      )}
      {tab === 'ai' && <AIGenerate initialFunction={aiFn} onReview={() => setTab('register')} />}
      {tab === 'register' && <ChangeRegister />}
      {tab === 'clarify' && <Clarifications />}
      {tab === 'import' && <ImportChanges />}
      {tab === 'maintain' && <LibraryMaintenance />}
    </>
  );
}
