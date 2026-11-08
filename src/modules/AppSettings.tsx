import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../store/store';
import { fmtDateTime } from '../domain/util';
import { Badge, Btn, Field, PageHeader, Section, TextIn, useConfirm, Prov } from '../ui/kit';

export function AppSettings() {
  const s = useApp((x) => x.current)!;
  const engagements = useApp((x) => x.engagements);
  const persistence = useApp((x) => x.persistence);
  const mutate = useApp((x) => x.mutate);
  const { openEngagement, deleteEngagement, createDemo } = useApp.getState();
  const { ask, node } = useConfirm();
  const [auditQ, setAuditQ] = useState('');
  const st = s.engagement.settings;
  const setW = (k: keyof typeof st.weights, v: number) => mutate((d) => { d.engagement.settings.weights[k] = Math.max(0, v); }, { entityType: 'settings', entityId: 'weights', action: 'update', summary: `Severity weight ${k} → ${v}` });
  const setT = (k: keyof typeof st.thresholds, v: number) => mutate((d) => { d.engagement.settings.thresholds[k] = v; }, { entityType: 'settings', entityId: 'thresholds', action: 'update', summary: `Threshold ${k} → ${v}` });

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" sub="Scoring model, intelligence configuration, storage, engagements, and audit trail." />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Section title="Impact severity model" hint="Weighted average of four 0–3 sub-scores">
          <div className="grid g2">
            {(Object.keys(st.weights) as (keyof typeof st.weights)[]).map((k) => <Field key={k} label={`Weight — ${k}`}><TextIn type="number" value={String(st.weights[k])} onCommit={(v) => setW(k, Number(v) || 0)} /></Field>)}
            <Field label="Medium band from (score ≥)"><TextIn type="number" value={String(st.thresholds.medium)} onCommit={(v) => setT('medium', Number(v) || 0)} /></Field>
            <Field label="High band from (score ≥)"><TextIn type="number" value={String(st.thresholds.high)} onCommit={(v) => setT('high', Number(v) || 0)} /></Field>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>No score is produced when change records lack As-Is/To-Be information. The executive ✓/× view is independent of this model.</p>
        </Section>
        <Section title="Intelligence engine">
          <div className="stack small">
            <div className="row"><Badge tone="ok">Active</Badge><strong>Layer 1 — Deterministic rules</strong></div>
            <p className="muted">Impact, audience, communicator, channel, messaging, artifact selection, approval safeguards, and consistency checks run locally and explain every recommendation (rule IDs, inputs, rationale, gaps).</p>
            <div className="row"><Badge tone="muted">Not configured</Badge><strong>Layer 2 — Contextual AI</strong> <Prov kind="ai" /></div>
            <p className="muted">No external AI model is connected, so no AI-generated suggestions are shown anywhere in the app. The integration boundary is the messaging and artifact engines (src/engine/messaging.ts, artifacts.ts): an AI service would receive a structured context and return schema-validated drafts marked “AI suggestion”, behind server-side credentials and explicit user permission.</p>
            <div className="row"><Badge tone="ok">Active</Badge><strong>Layer 3 — Consultant validation</strong></div>
            <p className="muted">Precedence: approved/locked decisions → consultant overrides → confirmed configuration → rules → (AI) → defaults. Overrides are never silently replaced; conflicts are flagged.</p>
          </div>
        </Section>
        <Section title="Storage">
          <div className="stack small">
            <div className="row"><Badge tone={persistence?.kind === 'memory' ? 'warn' : 'ok'}>{persistence?.kind}</Badge>{persistence?.label}</div>
            <p className="muted">{persistence?.kind === 'cloud' ? 'Engagements are saved to private per-user storage attached to this artifact. Other viewers cannot read them.' : persistence?.kind === 'browser' ? 'Engagements are saved in this browser (IndexedDB). Export JSON backups to move data between devices.' : 'Storage is unavailable in this view. Changes last only for this session — export a JSON backup.'}</p>
            <p className="muted">Engagement data is treated as confidential: nothing is sent to external services, and no emails or notifications are ever sent by the application.</p>
          </div>
        </Section>
        <Section title="Engagements" flush actions={<Btn size="sm" onClick={async () => { if (await ask('New demonstration engagement', 'Creates a fresh copy of the fictional Project Atlas engagement.', 'Create')) await createDemo(); }}>New demo copy</Btn>}>
          {engagements.map((e) => (
            <div key={e.id} className="issue">
              <div className="grow small"><strong>{e.name}</strong> {e.isDemo && <Badge tone="ai">demo</Badge>} {e.id === s.engagement.id && <Badge tone="info">open</Badge>}<div className="tiny muted">Updated {e.updatedAt ? fmtDateTime(e.updatedAt) : '—'}</div></div>
              {e.id !== s.engagement.id && <Btn size="sm" onClick={() => void openEngagement(e.id)}>Open</Btn>}
              <Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label={`Delete ${e.name}`} onClick={async () => { if (await ask(`Delete "${e.name}"`, 'The engagement and all of its records, artifacts, and audit history will be permanently deleted. Export a JSON backup first if you may need it.', 'Delete permanently', true)) await deleteEngagement(e.id); }} />
            </div>
          ))}
        </Section>
      </div>
      <Section title="Audit trail" hint={`${s.audit.length} event(s) — most recent first`} flush actions={<input className="input" style={{ width: 220 }} placeholder="Filter…" value={auditQ} onChange={(e) => setAuditQ(e.target.value)} aria-label="Filter audit" />}>
        <div className="tbl-wrap" style={{ maxHeight: 420 }}><table className="tbl">
          <thead><tr><th>When</th><th>Entity</th><th>Action</th><th>Summary</th></tr></thead>
          <tbody>{s.audit.filter((a) => !auditQ || `${a.summary} ${a.entityType} ${a.action}`.toLowerCase().includes(auditQ.toLowerCase())).slice(0, 300).map((a) => (
            <tr key={a.id}><td className="small num" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td><td className="small">{a.entityType}</td><td className="small">{a.action}</td><td className="small">{a.summary}</td></tr>
          ))}</tbody>
        </table></div>
      </Section>
      {node}
    </>
  );
}
