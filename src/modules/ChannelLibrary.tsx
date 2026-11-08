import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../store/store';
import type { Channel } from '../domain/types';
import { CHANNEL_COLOR_LABEL } from '../domain/library';
import { uid } from '../domain/util';
import { derive } from '../engine/derive';
import { Badge, Btn, PageHeader, Section, TextIn, Prov } from '../ui/kit';

const RULES = [
  ['CH-SENS', 'Sensitive employee impact', 'Authorised 1:1 (≤12 people) or small-group conversations, formal written follow-up (letter / HR notice), FAQ / office hours reinforcement.'],
  ['CH-CRISIS', 'Crisis / incident', 'Escalation notification or email/Teams under the approved protocol, leadership briefing, intranet and FAQ follow-up.'],
  ['CH-BOARD / CH-EXEC', 'Board or executive alignment / decision', 'Leadership briefing or in-person meeting; governance memorandum when a decision is recorded.'],
  ['CH-TRAIN', 'Training', 'Instructor-led (virtual first when distributed across geographies), demos, LMS and job aids, office hours.'],
  ['CH-SUP / CH-CUS', 'Supplier / customer change', 'Approved written notification for audit trail; relationship-owner conversation for key suppliers.'],
  ['CH-CADENCE', 'Recurring status', 'Steering committee report for decision makers; weekly status update and dashboard for programme teams.'],
  ['CH-HYPER', 'Hypercare', 'Hypercare updates, Teams, office hours / Q&A, knowledge base, pulse survey.'],
  ['CH-MASS', 'Large audience (≥50) — inform / announce', 'Town hall (webinar when distributed), email confirmation, intranet + FAQ, manager cascade.'],
  ['CH-MGR / CH-LEAD / CH-SUPPORT', 'Leaders and enabling functions', 'Briefing workshop or working session with email confirmation and cascade pack.'],
  ['Guardrail', 'Always', 'Only enabled channels are recommended; disabled preferences are skipped and noted in the rationale.'],
];

export function ChannelLibrary() {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const d = useMemo(() => derive(s), [s]);
  const [cat, setCat] = useState('');
  const use = (id: string) => d.activeComms.filter((c) => [c.channels.primary, ...c.channels.secondary, c.channels.reinforcement, c.channels.followUp].includes(id)).length;
  const upd = (id: string, fn: (c: Channel) => void, summary: string) => mutate((dd) => { fn(dd.channels.find((x) => x.id === id)! as Channel); }, { entityType: 'channel', entityId: id, action: 'update', summary });
  const cats = Array.from(new Set(s.channels.map((c) => c.category)));
  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="Communication Channel Framework"
        sub="Editable channel library. Disable channels the client does not use — they will never be recommended. Colour families drive the Channel Matrix; every channel also has a text label."
        actions={<Btn icon={<Plus size={13} />} onClick={() => { const id = uid('ch'); mutate((dd) => { dd.channels.push({ id, name: 'Custom channel', category: 'Custom', color: 'slate', enabled: true, isCustom: true, attrs: { twoWay: false, confidential: false, scale: 'group', auditTrail: false } }); }, { entityType: 'channel', entityId: id, action: 'add', summary: 'Custom channel added' }); }}>Add custom channel</Btn>} />
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="chips">
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>All ({s.channels.length})</button>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <span style={{ flex: 1 }} /><Badge tone="info">{s.channels.filter((c) => c.enabled).length} enabled</Badge>
      </div>
      <Section title="Channel library" flush>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>On</th><th>Channel</th><th>Category</th><th>Colour family</th><th>Scale</th><th>Two-way</th><th>Confidential</th><th>Audit trail</th><th>In plan</th></tr></thead>
          <tbody>{s.channels.filter((c) => !cat || c.category === cat).map((c) => (
            <tr key={c.id} style={{ opacity: c.enabled ? 1 : 0.55 }}>
              <td><input type="checkbox" checked={c.enabled} aria-label={`Enable ${c.name}`} onChange={() => upd(c.id, (x) => { x.enabled = !x.enabled; }, `${c.name} ${c.enabled ? 'disabled' : 'enabled'}`)} /></td>
              <td style={{ minWidth: 200 }}>{c.isCustom ? <TextIn value={c.name} onCommit={(v) => upd(c.id, (x) => { x.name = v; }, 'Channel renamed')} /> : <span className="strong">{c.name}</span>}</td>
              <td className="small">{c.isCustom ? <select className="select" value={c.category} onChange={(e) => upd(c.id, (x) => { x.category = e.target.value as Channel['category']; }, 'Category')}>{['In-Person / Leadership', 'Digital', 'Interactive', 'Training & Enablement', 'Formal', 'Operational', 'Awareness Materials', 'Custom'].map((x) => <option key={x}>{x}</option>)}</select> : c.category}</td>
              <td><div className="row"><span className={`swatch ch-${c.color}`} /><select className="select" style={{ width: 190 }} value={c.color} onChange={(e) => upd(c.id, (x) => { x.color = e.target.value as Channel['color']; }, 'Colour')} aria-label="Colour family">{Object.entries(CHANNEL_COLOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></td>
              <td><select className="select" style={{ width: 110 }} value={c.attrs.scale} onChange={(e) => upd(c.id, (x) => { x.attrs.scale = e.target.value as 'group'; }, 'Scale')} aria-label="Scale"><option value="individual">Individual</option><option value="group">Group</option><option value="mass">Mass</option></select></td>
              {(['twoWay', 'confidential', 'auditTrail'] as const).map((k) => <td key={k}><input type="checkbox" checked={c.attrs[k]} aria-label={k} onChange={() => upd(c.id, (x) => { x.attrs[k] = !x.attrs[k]; }, `${k} toggled`)} /></td>)}
              <td className="num small">{use(c.id) || ''}{!c.enabled && use(c.id) > 0 && <> <Badge tone="crit">disabled in use</Badge></>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Section>
      <Section title="Channel recommendation rules" hint={<><Prov kind="rule" /> Factors: audience size and seniority, sensitivity, confidentiality, two-way dialogue, urgency, audit trail, geographic distribution, objective, client tools.</>} flush>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Rule</th><th>Situation</th><th>Default channels (primary → secondary → reinforcement → follow-up)</th></tr></thead>
          <tbody>{RULES.map(([a, b, c]) => <tr key={a}><td className="mono">{a}</td><td className="small">{b}</td><td className="small">{c}</td></tr>)}</tbody></table></div>
      </Section>
    </>
  );
}
